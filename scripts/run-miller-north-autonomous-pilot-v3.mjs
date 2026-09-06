import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { fetchSafeResearchDocument } from "../server/review/linkQuality.js"
import { buildMillerNorthAutonomousWork, MILLER_NORTH_AUTONOMOUS_CONTROLLER_VERSION, recordMillerNorthStrategyOutcome, selectMillerNorthAutonomousWork } from "../server/millerNorthResearchController.js"
import { acquireManifestLock, finishQuery, loadManifest, releaseManifestLock, saveManifest, saveSearch, startQuery } from "../server/millerNorthDiscoveryCheckpoint.js"
import { routeMillerNorthIncidentLead } from "../server/millerNorthLeadQueue.js"
import { planMillerNorthSourceObservation } from "../server/millerNorthListener.js"
import { caseFocusedEvidenceWindows, normalizeMillerNorthSource } from "../server/millerNorthSourceTextNormalization.js"
import { extractMillerNorthNamedCases } from "../server/millerNorthNamedCaseExtraction.js"

const path = "artifacts/miller-north/miller-north-autonomous-research-controller-v1.json"
const budget = Math.min(30, Math.max(0, Number(process.argv.find(arg => arg.startsWith("--budget="))?.split("=")[1] || 30)))
if (!process.env.TAVILY_API_KEY) throw new Error("miller_north_tavily_not_configured")
const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
if (!url || !key || new URL(url).hostname !== "wccagykzugrahwugefqt.supabase.co") throw new Error("miller_north_controller_refuses_unproven_target")
const supabase = createClient(new URL(url).origin, key, { auth: { persistSession: false, autoRefreshToken: false } })
const [{ data: socialLeads, error: socialError }, { data: incidentSources, error: sourceError }, { data: incidents, error: incidentError }] = await Promise.all([
  supabase.from("miller_north_social_leads").select("social_lead_id,lead_status,verification_state,province,facility,public_excerpt"),
  supabase.from("miller_north_incident_sources").select("source_url"),
  supabase.from("miller_north_incidents").select("id,working_title,facility,province,event_date,event_year,approximate_event_year"),
])
if (socialError || sourceError || incidentError) throw socialError || sourceError || incidentError

const clean = value => String(value || "").replace(/\s+/g, " ").trim()
const usableField = value => typeof value === "string" && value.trim() && !["null", "undefined"].includes(value.trim().toLowerCase())
const followupQueries = candidate => !usableField(candidate.person) || !usableField(candidate.facility) ? [] : [
  `"${candidate.person}" "${candidate.facility}"`,
  `"${candidate.person}" healthcare complaint`,
  `"${candidate.person}" hospital racism`,
]
const candidateEligible = candidate => candidate.classification === "named_case_strong" && !candidate.likely_existing_incident_id && candidate.expected_value_score >= 20 && usableField(candidate.person) && usableField(candidate.facility) && usableField(candidate.concrete_encounter)

const lock = acquireManifestLock(path)
try {
  const manifest = loadManifest(path)
  manifest.version = MILLER_NORTH_AUTONOMOUS_CONTROLLER_VERSION
  manifest.runs ||= []; manifest.work_items ||= {}; manifest.queries ||= {}; manifest.sources ||= {}; manifest.strategy_metrics ||= {}
  // A malformed candidate must never spend paid search. This terminalizes the
  // one interrupted invalid follow-up without touching its source evidence.
  for (const item of Object.values(manifest.work_items)) if (item.work_type === "named_case_followup" && /"(?:null|undefined)"/i.test(item.query || "") && item.status !== "terminal") {
    item.status = "terminal"; item.completed_at = new Date().toISOString(); item.terminal_reason = "invalid_missing_case_field"
  }
  const pilot3RunIds = new Set(manifest.runs.filter(item => item.generation === "pilot3_recent_named").map(item => item.run_id))
  const pilot3CallsUsed = Object.values(manifest.work_items).filter(item => pilot3RunIds.has(item.run_id) && item.status === "terminal" && item.query_id).length
  const remainingPilotBudget = Math.max(0, budget - pilot3CallsUsed)
  const knownQueries = new Set(Object.values(manifest.work_items).filter(item => item.status === "terminal").map(item => item.query.trim().toLowerCase()))
  const candidates = buildMillerNorthAutonomousWork({ manifest, knownQueries, socialLeads: socialLeads || [], generation: "pilot3_recent_named" })
  const selected = selectMillerNorthAutonomousWork({ candidates, budget: remainingPilotBudget })
  const run = { run_id: `mnar3_${Date.now().toString(36)}`, generation: "pilot3_recent_named", started_at: new Date().toISOString(), tavily_ceiling: budget, tavily_calls_previously_used: pilot3CallsUsed, considered: candidates.length, selected_work_ids: selected.map(item => item.work_id), selected_without_bespoke_cloud_routing: true, local_light_calls: 0, cloud_ai_per_source_decisions: 0, normalized_sources: 0, named_case_candidates: 0, named_case_followups: 0 }
  manifest.runs.push(run)
  for (const item of selected) manifest.work_items[item.work_id] = { ...(manifest.work_items[item.work_id] || {}), ...item, status: "pending", run_id: run.run_id }
  saveManifest(path, manifest)

  let calls = 0, deterministic = 0, usefulSources = 0, noiseSources = 0, duplicateSources = 0, namedCases = 0
  const knownUrls = new Set((incidentSources || []).map(source => source.source_url))
  const assessResult = async ({ result, item, checkpointId }) => {
    if (!result.url) return []
    const prior = manifest.sources[result.url]
    if (prior?.status === "assessed") return prior.named_case_candidates || []
    manifest.sources[result.url] = { ...(prior || { query_ids: [] }), status: "assessing", started_at: new Date().toISOString() }; saveManifest(path, manifest)
    const metadataText = clean(`${result.title || ""} ${result.content || ""}`)
    const plausibleName = /\b[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?\s+[A-Z][a-z]+\b/.test(metadataText)
    const plausibleEncounter = /\b(?:hospital|emergency|patient|treated|denied|complaint|family|health centre|health center)\b/i.test(metadataText)
    const scopeSignal = /\b(?:Indigenous|First Nations|Métis|Cree|Dene|Inuit)\b/i.test(metadataText)
    // A full source read is reserved for a concrete, scoped lead. Everything
    // else is normalized as metadata-only and can never fabricate body facts.
    const shouldFetchBody = plausibleName && plausibleEncounter && scopeSignal
    let document = null
    if (shouldFetchBody) try { document = await fetchSafeResearchDocument(result.url, { timeoutMs: 7_000 }) } catch { /* Search metadata is explicitly kept as metadata-only. */ }
    let sourceOrganization = null, normalized, extraction
    try {
      sourceOrganization = new URL(result.url).hostname.replace(/^www\./, "")
      normalized = normalizeMillerNorthSource({ url: result.url, trustedDocument: document, sourceOrganization, searchMetadata: { title: result.title, excerpt: result.content } })
      extraction = extractMillerNorthNamedCases({ normalizedSource: normalized, title: result.title, excerpt: result.content, sourceUrl: result.url, sourceOrganization, province: item.province, existingIncidents: incidents || [] })
    } catch (error) {
      manifest.sources[result.url] = { ...(manifest.sources[result.url] || {}), status: "assessed", completed_at: new Date().toISOString(), source_fetch: document?.ok ? "fetched_assessment_error" : "metadata_assessment_error", classification: "insufficient", assessment_error: String(error?.message || error) }
      saveManifest(path, manifest)
      return []
    }
    const ranked = [...extraction].sort((a, b) => b.expected_value_score - a.expected_value_score)
    const strong = ranked.filter(candidateEligible)
    const primary = ranked[0]
    const sourceText = normalized.evidence_segments.map(segment => segment.text).join(" ") || result.content || ""
    const observation = planMillerNorthSourceObservation({ source: { url: result.url, title: normalized.title || result.title, text: sourceText }, previous: prior?.source_fingerprint ? { source_fingerprint: prior.source_fingerprint } : null })
    const route = routeMillerNorthIncidentLead({ title: normalized.title || result.title, excerpt: sourceText, province: item.province, regionalContext: item.treaty6 ? "Treaty 6 research geography" : "", knownIncidentSource: knownUrls.has(result.url), knownCaseMatch: Boolean(primary?.likely_existing_incident_id) })
    const windows = ranked.filter(candidate => candidate.person).map(candidate => ({ person: candidate.person, evidence_segments: caseFocusedEvidenceWindows(normalized, { terms: [candidate.person, candidate.facility].filter(Boolean) }) }))
    const useful = strong.length > 0 || primary?.classification === "existing_case_likely"
    if (useful) usefulSources += 1; else noiseSources += 1
    if (primary?.classification === "existing_case_likely" || route.route === "likely_existing_incident_support") duplicateSources += 1
    namedCases += ranked.filter(candidate => ["named_case_strong", "named_case_partial", "existing_case_likely"].includes(candidate.classification)).length
    deterministic += shouldFetchBody ? 3 : 2
    manifest.sources[result.url] = { ...(manifest.sources[result.url] || {}), query_ids: [...new Set([...(manifest.sources[result.url]?.query_ids || []), checkpointId])], work_ids: [...new Set([...(manifest.sources[result.url]?.work_ids || []), item.work_id])], tavily_title: result.title || manifest.sources[result.url]?.tavily_title || "", tavily_excerpt: result.content || manifest.sources[result.url]?.tavily_excerpt || "", status: "assessed", completed_at: new Date().toISOString(), source_fetch: document?.ok ? "fetched" : "metadata_only", body_fetch_considered: true, body_fetch_attempted: shouldFetchBody, bounded_excerpt: sourceText.slice(0, 1500), source_fingerprint: observation.source_fingerprint, change_decision: observation.decision, normalization: normalized, named_case_candidates: ranked, named_case_windows: windows, needs_evidence_review: strong.length > 0, route, classification: primary?.classification || route.route }
    saveManifest(path, manifest)
    return strong
  }
  const runQuery = async item => {
    if (calls >= remainingPilotBudget) return []
    const work = manifest.work_items[item.work_id] || { ...item, run_id: run.run_id }
    manifest.work_items[item.work_id] = work
    work.status = "in_progress"; work.started_at = new Date().toISOString(); saveManifest(path, manifest)
    const checkpoint = startQuery(manifest, item.province, item.query, MILLER_NORTH_AUTONOMOUS_CONTROLLER_VERSION)
    if (!checkpoint.reused) {
      try {
        const response = await fetch("https://api.tavily.com/search", { method: "POST", signal: AbortSignal.timeout(20_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query: item.query, max_results: 5, topic: "general", search_depth: "advanced", include_answer: false }) })
        if (!response.ok) throw new Error(`tavily_status_${response.status}`)
        const results = (await response.json()).results || []
        calls += 1; saveSearch(manifest, checkpoint.id, results)
        for (const result of results) if (result.url) {
          const previous = manifest.sources[result.url] || { query_ids: [], work_ids: [] }
          manifest.sources[result.url] = { ...previous, query_ids: [...new Set([...(previous.query_ids || []), checkpoint.id])], work_ids: [...new Set([...(previous.work_ids || []), item.work_id])], tavily_title: result.title || previous.tavily_title || "", tavily_excerpt: result.content || previous.tavily_excerpt || "", status: previous.status || "pending" }
        }
        saveManifest(path, manifest)
      } catch (error) {
        work.status = "retryable_error"; work.error = String(error?.message || error); manifest.queries[checkpoint.id] = { ...manifest.queries[checkpoint.id], status: "retryable_error", error: work.error }; saveManifest(path, manifest); return []
      }
    }
    const strong = []
    for (const result of manifest.queries[checkpoint.id]?.results || []) strong.push(...await assessResult({ result, item, checkpointId: checkpoint.id }))
    work.status = "terminal"; work.completed_at = new Date().toISOString(); work.query_id = checkpoint.id
    finishQuery(manifest, checkpoint.id, (manifest.queries[checkpoint.id]?.results || []).map(result => manifest.sources[result.url]?.classification || null))
    recordMillerNorthStrategyOutcome(manifest, item.strategy, { calls: checkpoint.reused ? 0 : 1, useful_sources: strong.length ? 1 : 0, named_cases: strong.length, duplicates: 0, noise: strong.length ? 0 : 1 })
    saveManifest(path, manifest)
    return strong
  }

  const followups = []
  const followupKeys = new Set()
  // Re-extract only this pilot's fresh sources after a normalizer revision.
  // The earlier 34 terminal held signals have different run IDs and are never
  // selected here. This costs no Tavily call and allows a real body-backed
  // case to receive the same deterministic gate as new work.
  const priorPilot3Sources = Object.entries(manifest.sources).filter(([, source]) => source.status === "assessed" && source.work_ids?.some(id => pilot3RunIds.has(manifest.work_items[id]?.run_id)))
  for (const [sourceUrl, source] of priorPilot3Sources) {
    if (!source.normalization) continue
    const sourceWork = manifest.work_items[source.work_ids.find(id => pilot3RunIds.has(manifest.work_items[id]?.run_id))] || {}
    const reextracted = extractMillerNorthNamedCases({ normalizedSource: source.normalization, title: source.tavily_title, excerpt: source.tavily_excerpt, sourceUrl, sourceOrganization: source.normalization.source_organization, province: sourceWork.province, existingIncidents: incidents || [] }).sort((a, b) => b.expected_value_score - a.expected_value_score)
    source.named_case_candidates = reextracted
    source.named_case_reextracted_at = new Date().toISOString()
    saveManifest(path, manifest)
    for (const candidate of reextracted.filter(candidateEligible)) for (const query of followupQueries(candidate)) {
      const key = query.trim().toLowerCase()
      if (followupKeys.has(key) || knownQueries.has(key) || followups.length >= remainingPilotBudget) continue
      followupKeys.add(key)
      followups.push({ work_type: "named_case_followup", strategy: "named_case_followup", province: candidate.province || sourceWork.province, treaty6: sourceWork.treaty6, source_family: "named-case follow-up", query, reason: "normalization re-extraction supplied a public person, facility, and concrete encounter", expected_value: candidate.expected_value_score, eligible_for_tavily: true })
    }
  }
  for (const item of selected) {
    const strong = await runQuery(item)
    for (const candidate of strong) for (const query of followupQueries(candidate)) {
      if (calls + followups.length >= remainingPilotBudget) break
      const followup = { work_type: "named_case_followup", strategy: "named_case_followup", province: candidate.province || item.province, treaty6: item.treaty6, source_family: "named-case follow-up", query, reason: "normalized source supplied a public person, facility, and concrete encounter", expected_value: candidate.expected_value_score, eligible_for_tavily: true }
      followup.work_id = `${item.work_id}_${followups.length + 1}`
      if (!knownQueries.has(query.trim().toLowerCase()) && !followupKeys.has(query.trim().toLowerCase())) { followupKeys.add(query.trim().toLowerCase()); followups.push(followup) }
    }
  }
  for (const [followupIndex, followup] of followups.entries()) {
    if (calls >= remainingPilotBudget) break
    followup.work_id ||= `${run.run_id}_followup_${followupIndex + 1}`
    manifest.work_items[followup.work_id] = { ...followup, status: "pending", run_id: run.run_id }
    run.named_case_followups += 1
    await runQuery(followup)
  }
  run.completed_at = new Date().toISOString(); run.tavily_calls = calls; run.deterministic_operations = deterministic; run.useful_sources = usefulSources; run.noise_sources = noiseSources; run.duplicate_sources = duplicateSources; run.named_case_candidates = namedCases
  saveManifest(path, manifest)
  console.log(JSON.stringify({ controller: manifest.version, run: run.run_id, considered: run.considered, selected: selected.length, named_case_followups: run.named_case_followups, tavily_calls: calls, tavily_calls_total_pilot3: pilot3CallsUsed + calls, tavily_ceiling: budget, deterministic_operations: deterministic, useful_sources: usefulSources, named_case_candidates: namedCases, source_status: Object.values(manifest.sources).filter(source => source.work_ids?.some(id => manifest.work_items[id]?.run_id === run.run_id)).reduce((counts, source) => ({ ...counts, [source.classification || "unknown"]: (counts[source.classification || "unknown"] || 0) + 1 }), {}) }, null, 2))
} finally { releaseManifestLock(lock) }
