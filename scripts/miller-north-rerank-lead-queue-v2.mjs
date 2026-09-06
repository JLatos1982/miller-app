import { readFileSync } from "node:fs"
import { routeMillerNorthIncidentLead } from "../server/millerNorthLeadQueue.js"
import { saveManifest } from "../server/millerNorthDiscoveryCheckpoint.js"

const queuePath = "artifacts/miller-north/miller-north-incident-discovery-campaign-v2-lead-queue.json"
const proposalsPath = "artifacts/miller-north/reconstructed-corpus-v2-new-incident-proposals.json"
const queue = JSON.parse(readFileSync(queuePath, "utf8"))
const candidates = JSON.parse(readFileSync(proposalsPath, "utf8")).candidates || []
const knownUrls = new Set()
const knownTerms = new Set()
for (const candidate of candidates) {
  for (const source of [{ url: candidate.source_url }, ...(candidate.supporting_sources || [])]) if (source.url) knownUrls.add(source.url.toLowerCase())
  // Candidate IDs are private structured metadata.  Retaining name pairs here
  // avoids spending high-priority review time on a headline already tied to a
  // known incident; it does not assert that a name match alone is a duplicate.
  const parts = String(candidate.candidate_id || "").replace(/^mnc_/, "").split("-")
  if (parts.length >= 3) knownTerms.add(parts.slice(0, 2).join(" "))
}
for (const lead of queue.leads) {
  if (lead.status === "reviewed") continue
  const text = `${lead.title || ""} ${lead.automated_excerpt || ""}`.toLowerCase()
  const knownCaseMatch = [...knownTerms].some(term => term.length > 5 && text.includes(term))
  const knownIncidentSource = Boolean(lead.known_incident_source || knownUrls.has(String(lead.url || "").toLowerCase()) || knownUrls.has(String(lead.final_url || "").toLowerCase()))
  const routing = routeMillerNorthIncidentLead({ title: lead.title, excerpt: lead.automated_excerpt, province: lead.province, regionalContext: lead.regional_context, knownIncidentSource, knownCaseMatch })
  lead.known_incident_source = knownIncidentSource
  lead.rerank_v3 = { ...routing, known_case_match: knownCaseMatch, ranked_at: new Date().toISOString(), rationale: knownIncidentSource || knownCaseMatch ? "known source/case signal: route to corroboration lane" : routing.route === "likely_new_incident" ? "concrete encounter signals without current incident match" : "context or insufficient incident signals" }
}
queue.leads.sort((a, b) => (b.rerank_v3?.priority ?? a.score) - (a.rerank_v3?.priority ?? b.score) || a.lead_id.localeCompare(b.lead_id))
const remaining = queue.leads.filter(lead => lead.status !== "reviewed")
queue.rerank_v3_summary = {
  version: "miller-north-lead-rerank-v3-distinct-incident",
  generated_at: new Date().toISOString(),
  remaining: remaining.length,
  routes: Object.fromEntries(["likely_new_incident", "likely_existing_incident_support", "systemic_or_context", "insufficient"].map(route => [route, remaining.filter(lead => lead.rerank_v3?.route === route).length])),
  recent_2024_2026: remaining.filter(lead => lead.rerank_v3?.recent).length,
}
saveManifest(queuePath, queue)
console.log(JSON.stringify({ ...queue.rerank_v3_summary, top_new: remaining.filter(lead => lead.rerank_v3?.route === "likely_new_incident").slice(0, 40).map(lead => ({ lead_id: lead.lead_id, priority: lead.rerank_v3.priority, province: lead.province, regional_context: lead.regional_context, title: lead.title })) }, null, 2))
