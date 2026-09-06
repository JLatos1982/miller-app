import fs from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { tavily } from "@tavily/core"
import { publishPracticalPublicLocations, semanticResourceIdentityOverlap } from "../server/practicalPublicLocationPublication.js"

const PROJECT = "wccagykzugrahwugefqt"
const MANIFEST = new URL("../data/miller-practical-discovery-cohort-v1.json", import.meta.url)
const INVENTORY = new URL("../data/directory-address-coverage-current.json", import.meta.url)
const OWNER_EXCLUDED = "93383129-5c39-576c-99b3-f49372ac3a48"
const limit = Math.max(1, Math.min(10, Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 5)))
const classifyOnly = process.argv.includes("--classify-only")
if (!process.env.SUPABASE_URL || new URL(process.env.SUPABASE_URL).hostname.split(".")[0] !== PROJECT || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.TAVILY_API_KEY) throw new Error("production_discovery_configuration_required")
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const search = tavily({ apiKey: process.env.TAVILY_API_KEY })
const save = async (value) => fs.writeFile(MANIFEST, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"))
if (manifest.version !== "miller-practical-discovery-cohort-v1" || manifest.selected?.length !== 87) throw new Error("existing_discovery_cohort_required")
const inventory = JSON.parse(await fs.readFile(INVENTORY, "utf8"))
const inventoryById = new Map(inventory.records.map((item) => [item.canonical_uuid, item]))

const genericTitle = /\b(?:agency details|review of|study|report|directory|meetings?|resource map|information and publications|where can i find|get help with|we(?:'|’)re here to help|free or low-cost services in bc|building better mental health|one-year anniversary|youth substance use beds)\b/i
const exactGeneric = /^(?:HelpStartsHere|Treatment Centres|Resources - BCCSU)$/i
const facilitySignal = /\b(?:clinic|facility|health cent(?:re|er)|treatment cent(?:re|er)|sobering cent(?:re|er)|recovery cent(?:re|er)|hospice|house|safepoint|consumption site)\b/i
const programSignal = /\b(?:program|counsell?ing|substance use services|mental health support|bereavement support|RAAC|OAT|opioid agonist|withdrawal management|detox|harm reduction|service navigator)\b/i
const providerSignal = /\b(?:society|association|community services|health authority|health|FNHA|CMHA|VCH|PHS)\b/i
const multiSignal = /\b(?:sites|clinics|locations|multiple|all cities|vancouver island|north and west|services clinics)\b/i

function identityFor(item) {
  const source = inventoryById.get(item.id) || {}
  const text = `${item.name} ${source.organization || ""} ${source.service_type || ""} ${item.locality || ""}`
  if (item.id === OWNER_EXCLUDED) return { classification: "commercial_referral_intermediary", reason: "owner_excluded_commercial_referral_intermediary", confidence: "owner_confirmed", later_action: "editorial_review_and_possible_resource_retirement" }
  if (source.non_fixed || source.confidential_private) return { classification: "protected_or_nonphysical", reason: "existing_nonphysical_or_safety_exclusion", confidence: "high", later_action: "retain_exclusion" }
  if (genericTitle.test(item.name) || exactGeneric.test(item.name)) return { classification: "generic_directory_or_information", reason: "title_represents_directory_report_topic_or_search_artifact_not_a_named_service", confidence: "high", later_action: "editorial_review_for_first_class_resource_status" }
  if (/recovery\.com/i.test(item.known_source || "")) return { classification: "identity_review_needed", reason: "third_party_treatment_listing_does_not_by_itself_establish_direct_provider_identity", confidence: "medium", later_action: "verify_direct_provider_source_before_location_research" }
  if (facilitySignal.test(text) && !multiSignal.test(text)) return { classification: "facility_specific", reason: "named_location_bearing_facility_or_clinic", confidence: "high", later_action: "location_recovery" }
  if (programSignal.test(text) && !multiSignal.test(text)) return { classification: "program_specific", reason: "named_provider_program_or_service", confidence: "medium_high", later_action: "program_location_recovery" }
  if (providerSignal.test(text) && multiSignal.test(text)) return { classification: "provider_multi_site", reason: "provider_or_program_explicitly_spans_multiple_sites", confidence: "medium", later_action: "discover_only_provider_operated_sites" }
  if (providerSignal.test(text)) return { classification: "provider_umbrella", reason: "legitimate_provider_identity_without_one_specific_site", confidence: "medium", later_action: "discover_owned_programs_and_reconcile_existing_resources" }
  return { classification: "identity_review_needed", reason: "insufficient_deterministic_evidence_of_direct_service_delivery", confidence: "low", later_action: "identity_review_before_location_research" }
}

const terminalExclusions = new Set(["commercial_referral_intermediary", "generic_directory_or_information", "protected_or_nonphysical"])
const classRank = { facility_specific: 1, program_specific: 2, provider_multi_site: 4, provider_umbrella: 5, identity_review_needed: 6 }
for (const item of manifest.selected) {
  const identity = identityFor(item)
  Object.assign(item, { identity_class: identity.classification, identity_reason: identity.reason, identity_confidence: identity.confidence, recommended_later_action: identity.later_action })
  const knownLocality = item.locality && !/^(?:all cities|multiple|bc)$/i.test(item.locality)
  item.research_priority = (classRank[item.identity_class] || 90) * 100 + (knownLocality ? 0 : 20) + (item.known_source ? -10 : 0) + (item.category === "strong_location_candidate" ? -20 : 0)
  if (terminalExclusions.has(item.identity_class) && item.state !== "published_or_idempotent") {
    if (!String(item.state).startsWith("excluded_") && !item.pre_identity_state) item.pre_identity_state = item.state
    item.state = item.id === OWNER_EXCLUDED ? "owner_excluded_commercial_referral_intermediary" : item.identity_class === "generic_directory_or_information" ? "selector_excluded_non_program" : "protected_do_not_map"
    item.completed_at ||= new Date().toISOString()
  }
}
manifest.identity_classifier_version = "miller-resource-identity-v1"
manifest.editorial_cleanup = manifest.selected.filter((item) => ["commercial_referral_intermediary", "generic_directory_or_information"].includes(item.identity_class)).map((item) => ({ uuid: item.id, name: item.name, proposed_classification: item.identity_class, reason: item.identity_reason, confidence: item.identity_confidence, recommended_later_action: item.recommended_later_action }))
const grouped = new Map()
for (const item of manifest.selected) grouped.set(item.identity_class, [...(grouped.get(item.identity_class) || []), item])
manifest.identity_summary = [...grouped].map(([classification, items]) => ({ classification, count: items.length })).sort((a, b) => a.classification.localeCompare(b.classification))
await save(manifest)
if (classifyOnly) {
  console.log(JSON.stringify({ selected: manifest.selected.length, identity_summary: manifest.identity_summary, editorial_cleanup: manifest.editorial_cleanup, total_terminal: manifest.selected.filter((item) => item.state !== "pending").length, remaining: manifest.selected.filter((item) => item.state === "pending").length }, null, 2))
  process.exit(0)
}

const urlScore = (candidate) => {
  let score = candidate.known ? 30 : 0
  const text = `${candidate.title || ""} ${candidate.url}`.toLowerCase()
  if (/bc\.211\.ca\/result\//.test(text)) score += 60
  if (/\b(location|contact|clinic|centre|center|program|treatment|branch|directions)\b/.test(text)) score += 25
  if (/\b(news|career|jobs|donat|press|policy|research|review|report)\b|\.pdf(?:$|\?)/.test(text)) score -= 60
  if (/recovery\.com|rehabs?\.com|addictioncenter\.com|wikipedia\.org|linkedin\.com|facebook\.com/.test(text)) score -= 80
  try { if (new URL(candidate.url).pathname === "/") score -= 15 } catch { score -= 100 }
  return score
}
const dedupeRank = (items) => [...new Map(items.filter((item) => /^https:\/\//.test(item.url)).map((item) => [item.url.replace(/\/$/, ""), item])).values()].sort((a, b) => urlScore(b) - urlScore(a))
async function existingResourceForSpecificSource(item, candidate) {
  let path = ""
  try { path = new URL(candidate.url).pathname } catch { return null }
  if (!/\/(?:result|location-service|locations?|clinics?)\//i.test(path)) return null
  const base = candidate.url.replace(/\/$/, "")
  const { data: locations, error } = await db.from("resource_locations").select("resource_id,street_address").in("public_location_source_url", [base, `${base}/`]).eq("public_map", true).neq("resource_id", item.id).limit(10)
  if (error) throw error
  if (!locations?.length) return null
  const { data: resources, error: resourceError } = await db.from("resource_registry").select("id,display_name").in("id", [...new Set(locations.map((entry) => entry.resource_id))])
  if (resourceError) throw resourceError
  const match = (resources || []).map((resource) => ({ ...resource, score: semanticResourceIdentityOverlap(item.name, resource.display_name) })).sort((a, b) => b.score - a.score)[0]
  return match?.score >= 0.6 ? { classification: match.score === 1 ? "existing_resource_match" : "probable_existing_match", resource_id: match.id, display_name: match.display_name, score: match.score, source_url: candidate.url, locations: locations.filter((entry) => entry.resource_id === match.id).map((entry) => entry.street_address) } : null
}
const actor = (await db.auth.admin.listUsers({ perPage: 1 })).data?.users?.[0]?.id
if (!actor) throw new Error("trusted_actor_unavailable")
const pending = manifest.selected.filter((item) => item.state === "pending").sort((a, b) => a.research_priority - b.research_priority || a.name.localeCompare(b.name)).slice(0, limit)
const runStats = { tavily_calls: 0, candidate_urls: 0, trusted_fetches: 0, usable_civic_records: 0, civic_candidates: 0, supported_candidates: 0, geocoded_candidates: 0, publications: 0, idempotent: 0, existing_resource_matches: 0, probable_existing_matches: 0 }

for (const item of pending) {
  const candidates = item.known_source ? [{ url: item.known_source, title: item.name, known: true }] : []
  const queries = ["provider_multi_site", "provider_umbrella"].includes(item.identity_class)
    ? [`"${item.name}" programs locations BC`, `"${item.name}" "${item.locality}" contact`]
    : [`"${item.name}" "${item.locality}" address`, `"${item.name}" BC 211`]
  for (const query of queries) {
    try {
      const found = await search.search(query, { searchDepth: "basic", maxResults: 5, includeAnswer: false })
      runStats.tavily_calls++; manifest.stats.tavily_calls++
      for (const hit of found.results || []) candidates.push({ url: hit.url, title: hit.title || "", known: false })
    } catch (error) { item.discovery_errors = [...(item.discovery_errors || []), String(error?.message || "tavily_unavailable").slice(0, 200)] }
  }
  const ranked = dedupeRank(candidates).filter((candidate) => urlScore(candidate) >= 0).slice(0, 5)
  runStats.candidate_urls += ranked.length; manifest.stats.candidate_urls += ranked.length
  item.discovery_candidates = ranked.map((candidate) => ({ url: candidate.url, title: candidate.title, score: urlScore(candidate) }))
  let finalState = ranked.length ? "source_unavailable" : "source_not_found"
  let sawCivic = false
  for (const candidate of ranked) {
    const existing = await existingResourceForSpecificSource(item, candidate)
    if (existing) {
      item.reconciliation = existing
      finalState = existing.classification
      runStats[existing.classification === "existing_resource_match" ? "existing_resource_matches" : "probable_existing_matches"]++
      break
    }
    runStats.trusted_fetches++; manifest.stats.trusted_fetches++
    const output = await publishPracticalPublicLocations({ db, resourceId: item.id, source: { url: candidate.url, locality: item.locality, title: candidate.title || item.name }, actorId: actor })
    const civic = output.candidates?.length || 0
    const supported = output.candidates?.filter((entry) => entry.program_site_disposition === "program_site_supported").length || 0
    const publications = output.publications || []
    const successful = publications.filter((entry) => entry.publication_attempted && ["published", "idempotent"].includes(entry.outcome))
    runStats.civic_candidates += civic; runStats.supported_candidates += supported
    if (civic && !sawCivic) { runStats.usable_civic_records++; sawCivic = true }
    runStats.geocoded_candidates += publications.filter((entry) => entry.package?.geocoder).length
    runStats.publications += successful.filter((entry) => entry.outcome === "published").length
    runStats.idempotent += successful.filter((entry) => entry.outcome === "idempotent").length
    item.attempts.push({ url: candidate.url, title: candidate.title, outcome: output.outcome, candidate_count: civic, supported_count: supported, publication_outcomes: publications.map((entry) => entry.outcome), at: new Date().toISOString() })
    if (successful.length) { finalState = successful.some((entry) => entry.outcome === "published") ? "published" : "idempotent_confirmation"; break }
    if (publications.length) { finalState = publications.map((entry) => entry.outcome).join("+"); break }
    if (["multi_site_ambiguous", "civic_address_missing"].includes(output.outcome)) finalState = output.outcome
  }
  item.state = finalState
  item.completed_at = new Date().toISOString()
  await save(manifest)
}
manifest.last_run = { completed_at: new Date().toISOString(), processed: pending.length, ...runStats }
await save(manifest)
console.log(JSON.stringify({ selected: manifest.selected.length, identity_summary: manifest.identity_summary, editorial_cleanup: manifest.editorial_cleanup.length, processed_this_run: pending.length, total_terminal: manifest.selected.filter((item) => item.state !== "pending").length, remaining: manifest.selected.filter((item) => item.state === "pending").length, run: runStats, results: pending.map((item) => ({ id: item.id, name: item.name, identity_class: item.identity_class, state: item.state, attempts: item.attempts.slice(-5) })) }, null, 2))
