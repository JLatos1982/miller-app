import { createClient } from "@supabase/supabase-js"
import { tavily } from "@tavily/core"
import { fetchSafeResearchDocument } from "../server/review/linkQuality.js"
import { classifySource } from "../server/addressEvidence.js"
import { createShelterCandidateResearchPersistence } from "../server/shelterCandidateResearch.js"
import { classifyShelterCandidate } from "../server/shelterAutomation.js"

const limit = Math.max(1, Math.min(100, Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 30)))
const apply = process.argv.includes("--apply")
if (!process.env.SUPABASE_URL?.includes("wccagykzugrahwugefqt") || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.TAVILY_API_KEY) throw new Error("Unexpected production target or missing server-side research configuration")
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const search = tavily({ apiKey: process.env.TAVILY_API_KEY })
const candidates = await db.from("resource_discovery_candidates").select("*").eq("review_status", "pending").order("id").limit(1000)
if (candidates.error) throw candidates.error
const prior = await db.from("shelter_candidate_research_claims").select("candidate_id")
if (prior.error) throw prior.error
const researched = new Set((prior.data || []).map((item) => item.candidate_id))
const chosen = (candidates.data || []).filter((candidate) => classifyShelterCandidate(candidate).category === "needs_more_research").filter((candidate) => !researched.has(candidate.id)).slice(0, limit)
const persistence = createShelterCandidateResearchPersistence({ supabase: db }), results = []
for (const candidate of chosen) {
  const tokens = String(candidate.name).toLowerCase().split(/\W+/).filter((token) => token.length > 4), urls = candidate.source_url ? [candidate.source_url] : [], inspected = []
  try {
    const discovery = await search.search(`"${candidate.name}" ${candidate.community || "British Columbia"} shelter`, { searchDepth: "basic", maxResults: 3, includeAnswer: false })
    for (const result of discovery.results || []) if (result.url && !urls.includes(result.url)) urls.push(result.url)
  } catch { /* bounded discovery failure remains a research result */ }
  for (const url of urls.slice(0, 4)) {
    try {
      const document = await fetchSafeResearchDocument(url), text = String(document?.text || "").toLowerCase()
      if (!document?.ok || !text) continue
      const source = classifySource(document.url, candidate.operator || candidate.name), identity = tokens.some((token) => text.includes(token))
      inspected.push({ document, source, identity })
      if (identity && source.authoritative) break
    } catch { /* bounded page failure */ }
  }
  const strongest = inspected.find((item) => item.identity && item.source.authoritative) || inspected.find((item) => item.identity) || null
  const identity = Boolean(strongest), source = strongest?.source || classifySource(candidate.source_url, candidate.operator || candidate.name), safety = /confidential|undisclosed/.test(candidate.location_disclosure_status || ""), recommendation = safety && identity ? "safety_sensitive_ready" : identity && source.authoritative ? "ready_to_approve" : identity ? "brief_review" : "needs_research"
  const evidence = strongest ? [{ sourceUrl: strongest.document.url, sourceTitle: "Bounded authoritative candidate research", sourceType: source.type, sourceAuthority: source.authoritative ? 90 : 40, retrievedAt: new Date().toISOString(), extractionMethod: "bounded_discovery_identity_match", extractedValue: { identity_matched: true, candidate_name: candidate.name } }] : []
  const input = { candidateId: candidate.id, recommendation, proposedValue: { name: candidate.name, operator: candidate.operator, community: candidate.community }, confidence: identity && source.authoritative ? "high" : identity ? "medium" : "unknown", reasonCodes: [identity ? "candidate_identity_found_on_source" : "candidate_identity_not_found_on_source", source.authoritative ? "authoritative_source" : "non_authoritative_source"], researchVersion: "miller-shelter-candidate-batch-v1", summary: identity ? "Bounded source research found current candidate identity evidence." : "Bounded source research did not establish candidate identity.", evidence }
  const saved = apply ? await persistence.persist(input) : { created: false, evidenceCreated: 0 }
  results.push({ id: candidate.id, recommendation, pagesOpened: inspected.length, evidence: evidence.length, persisted: apply, created: saved.created, evidenceCreated: saved.evidenceCreated })
}
console.log(JSON.stringify({ mode: apply ? "production_private_research" : "dry_run", selected: chosen.length, results, human_decisions_changed: 0, locations_created: 0, map_pins_created: 0 }, null, 2))
