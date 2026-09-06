import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { fetchSafeResearchDocument } from "../server/review/linkQuality.js"
import { buildMillerNorthAutonomousWork, MILLER_NORTH_AUTONOMOUS_CONTROLLER_VERSION, recordMillerNorthStrategyOutcome, selectMillerNorthAutonomousWork } from "../server/millerNorthResearchController.js"
import { acquireManifestLock, finishQuery, loadManifest, releaseManifestLock, saveManifest, saveSearch, startQuery } from "../server/millerNorthDiscoveryCheckpoint.js"
import { routeMillerNorthIncidentLead } from "../server/millerNorthLeadQueue.js"
import { planMillerNorthSourceObservation } from "../server/millerNorthListener.js"

const path = "artifacts/miller-north/miller-north-autonomous-research-controller-v1.json"
const budget = Math.min(30, Math.max(0, Number(process.argv.find((arg) => arg.startsWith("--budget="))?.split("=")[1] || 30)))
if (!process.env.TAVILY_API_KEY) throw new Error("miller_north_tavily_not_configured")
const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
if (!url || !key || new URL(url).hostname !== "wccagykzugrahwugefqt.supabase.co") throw new Error("miller_north_controller_refuses_unproven_target")
const supabase = createClient(new URL(url).origin, key, { auth: { persistSession: false, autoRefreshToken: false } })
const [{ data: socialLeads, error: socialError }, { data: incidentSources, error: sourceError }] = await Promise.all([
  supabase.from("miller_north_social_leads").select("social_lead_id,lead_status,verification_state,province,facility,public_excerpt"),
  supabase.from("miller_north_incident_sources").select("source_url"),
])
if (socialError || sourceError) throw socialError || sourceError

const lock = acquireManifestLock(path)
try {
  const manifest = loadManifest(path)
  manifest.version = MILLER_NORTH_AUTONOMOUS_CONTROLLER_VERSION
  manifest.runs ||= []
  manifest.work_items ||= {}
  manifest.queries ||= {}
  manifest.sources ||= {}
  manifest.strategy_metrics ||= {}
  const knownQueries = new Set(Object.values(manifest.work_items).filter((item) => item.status === "terminal").map((item) => item.query.trim().toLowerCase()))
  const candidates = buildMillerNorthAutonomousWork({ manifest, knownQueries, socialLeads: socialLeads || [] })
  const selected = selectMillerNorthAutonomousWork({ candidates, budget })
  const run = { run_id: `mnar_${Date.now().toString(36)}`, started_at: new Date().toISOString(), tavily_ceiling: budget, considered: candidates.length, selected_work_ids: selected.map((item) => item.work_id), selected_without_bespoke_cloud_routing: true, local_light_calls: 0, cloud_ai_per_source_decisions: 0 }
  manifest.runs.push(run)
  for (const item of selected) manifest.work_items[item.work_id] = { ...(manifest.work_items[item.work_id] || {}), ...item, status: "pending", run_id: run.run_id }
  saveManifest(path, manifest)

  let calls = 0, deterministic = 0
  const knownUrls = new Set((incidentSources || []).map((source) => source.source_url))
  for (const item of selected) {
    const work = manifest.work_items[item.work_id]
    if (work.status === "terminal") continue
    work.status = "in_progress"; work.started_at = new Date().toISOString(); saveManifest(path, manifest)
    const checkpoint = startQuery(manifest, item.province, item.query, MILLER_NORTH_AUTONOMOUS_CONTROLLER_VERSION)
    if (!checkpoint.reused) {
      try {
        const response = await fetch("https://api.tavily.com/search", { method: "POST", signal: AbortSignal.timeout(20_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query: item.query, max_results: 5, topic: "general", search_depth: "advanced", include_answer: false }) })
        if (!response.ok) throw new Error(`tavily_status_${response.status}`)
        const results = (await response.json()).results || []; calls += 1; saveSearch(manifest, checkpoint.id, results)
        for (const result of results) if (result.url) {
          const source = manifest.sources[result.url] || { query_ids: [] }
          manifest.sources[result.url] = { ...source, query_ids: [...new Set([...(source.query_ids || []), checkpoint.id])], work_ids: [...new Set([...(source.work_ids || []), item.work_id])], tavily_title: result.title || source.tavily_title || "", tavily_excerpt: result.content || source.tavily_excerpt || "", status: source.status || "pending" }
        }
        saveManifest(path, manifest)
      } catch (error) {
        work.status = "retryable_error"; work.error = String(error?.message || error); manifest.queries[checkpoint.id] = { ...manifest.queries[checkpoint.id], status: "retryable_error", error: work.error }; saveManifest(path, manifest); continue
      }
    }
    const results = manifest.queries[checkpoint.id]?.results || []
    let useful = 0, noise = 0, duplicates = 0, named = 0
    for (const result of results) {
      if (!result.url) continue
      const source = manifest.sources[result.url]
      if (source?.status === "assessed") continue
      manifest.sources[result.url] = { ...source, status: "assessing", started_at: new Date().toISOString() }; saveManifest(path, manifest)
      let document = null
      try { document = await fetchSafeResearchDocument(result.url, { timeoutMs: 15_000 }) } catch { /* Bounded Tavily excerpt remains the fallback. */ }
      const text = String(document?.text || source.tavily_excerpt || "").replace(/\s+/g, " ").trim()
      const observation = planMillerNorthSourceObservation({ source: { url: result.url, title: source.tavily_title, text }, previous: source.source_fingerprint ? { source_fingerprint: source.source_fingerprint } : null })
      const route = routeMillerNorthIncidentLead({ title: source.tavily_title, excerpt: text, province: item.province, regionalContext: item.treaty6 ? "Treaty 6 research geography" : "", knownIncidentSource: knownUrls.has(result.url) })
      const namedSignal = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(`${source.tavily_title} ${text.slice(0, 800)}`)
      const classification = route.route === "likely_new_incident" ? "candidate_needs_evidence_review" : route.route
      if (classification === "candidate_needs_evidence_review") useful += 1; else noise += 1
      if (route.route === "likely_existing_incident_support") duplicates += 1
      if (namedSignal) named += 1
      deterministic += 1
      manifest.sources[result.url] = { ...manifest.sources[result.url], status: "assessed", completed_at: new Date().toISOString(), source_fetch: document?.ok ? "fetched" : "tavily_excerpt_only", bounded_excerpt: text.slice(0, 1500), source_fingerprint: observation.source_fingerprint, change_decision: observation.decision, route, classification, named_signal: namedSignal, needs_evidence_review: classification === "candidate_needs_evidence_review" }
      saveManifest(path, manifest)
    }
    work.status = "terminal"; work.completed_at = new Date().toISOString(); work.query_id = checkpoint.id
    finishQuery(manifest, checkpoint.id, results.map((result) => manifest.sources[result.url]?.classification || null))
    recordMillerNorthStrategyOutcome(manifest, item.strategy, { calls: checkpoint.reused ? 0 : 1, useful_sources: useful, named_cases: named, duplicates, noise })
    saveManifest(path, manifest)
  }
  run.completed_at = new Date().toISOString(); run.tavily_calls = calls; run.deterministic_operations = deterministic
  const sources = Object.values(manifest.sources)
  run.summary = { candidate_needs_evidence_review: sources.filter((source) => source.needs_evidence_review).length, duplicate_or_existing: sources.filter((source) => source.route?.route === "likely_existing_incident_support").length, context_or_insufficient: sources.filter((source) => ["systemic_or_context", "insufficient"].includes(source.route?.route)).length }
  saveManifest(path, manifest)
  console.log(JSON.stringify({ controller: manifest.version, run: run.run_id, considered: run.considered, selected: selected.length, tavily_calls: calls, tavily_ceiling: budget, deterministic_operations: deterministic, summary: run.summary, strategy_metrics: manifest.strategy_metrics }, null, 2))
} finally { releaseManifestLock(lock) }
