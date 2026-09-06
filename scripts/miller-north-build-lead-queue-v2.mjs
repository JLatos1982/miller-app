import "dotenv/config"
import { existsSync, readFileSync } from "node:fs"
import { fetchSafeResearchDocument } from "../server/review/linkQuality.js"
import { millerNorthLeadId, rankMillerNorthIncidentLead } from "../server/millerNorthLeadQueue.js"
import { loadManifest, saveManifest } from "../server/millerNorthDiscoveryCheckpoint.js"

const campaignPath = "artifacts/miller-north/miller-north-incident-discovery-campaign-v2.json"
const queuePath = "artifacts/miller-north/miller-north-incident-discovery-campaign-v2-lead-queue.json"
const reviewLimit = Math.max(1, Number(process.argv.find(arg => arg.startsWith("--review-limit="))?.split("=")[1] || 30))
const campaign = JSON.parse(readFileSync(campaignPath, "utf8"))
const prior = loadManifest(queuePath)
const priorById = new Map((prior.leads || []).map(lead => [lead.lead_id, lead]))
const queryById = campaign.queries || {}
const candidateSources = new Set()
if (existsSync("artifacts/miller-north/reconstructed-corpus-v2-new-incident-proposals.json")) {
  const proposals = JSON.parse(readFileSync("artifacts/miller-north/reconstructed-corpus-v2-new-incident-proposals.json", "utf8")).candidates || []
  for (const proposal of proposals) {
    candidateSources.add(proposal.source_url)
    for (const source of proposal.supporting_sources || []) candidateSources.add(source.url)
  }
}
const leads = Object.entries(campaign.sources || {})
  .filter(([, source]) => source.classification === "individual_incident_source")
  .map(([url, source]) => {
    const origin = (source.query_ids || []).map(id => queryById[id]).filter(Boolean).sort((a, b) => (b.province === "saskatchewan") - (a.province === "saskatchewan") || (b.regional_context === "Treaty 6 research geography") - (a.regional_context === "Treaty 6 research geography"))[0] || {}
    const lead_id = millerNorthLeadId(url), previous = priorById.get(lead_id)
    const base = { lead_id, url, final_url: source.final_url || url, title: source.tavily_title || "", province: origin.province || "unknown", regional_context: origin.regional_context || "unknown", source_classification: source.classification, campaign_query_ids: source.query_ids || [], automated_excerpt: source.bounded_excerpt || source.tavily_excerpt || "", source_fetch: source.source_fetch || "tavily_excerpt_only", known_incident_source: candidateSources.has(url) || candidateSources.has(source.final_url || url) }
    return { ...base, score: rankMillerNorthIncidentLead({ title: base.title, excerpt: base.automated_excerpt, province: base.province, regionalContext: base.regional_context, sourceClassification: base.source_classification }), status: previous?.status || "pending", local_light: previous?.local_light || null, manual_retrieval: previous?.manual_retrieval || null, manual_classification: previous?.manual_classification || null, reviewed_at: previous?.reviewed_at || null }
  })
  .sort((a, b) => b.score - a.score || a.lead_id.localeCompare(b.lead_id))

const possibleMultiIncidentSources = Object.entries(campaign.sources || {}).filter(([, source]) => source.classification === "multi_incident_source").map(([url, source]) => ({ url, title: source.tavily_title || "", query_ids: source.query_ids || [], bounded_excerpt: source.bounded_excerpt || source.tavily_excerpt || "" }))
const queue = { version: "miller-north-incident-lead-queue-v2", campaign_id: campaign.campaign?.campaign_id, generated_at: new Date().toISOString(), lead_count: leads.length, possible_multi_incident_sources: possibleMultiIncidentSources, leads }
saveManifest(queuePath, queue)

const schema = { type: "object", additionalProperties: false, required: ["classification", "reason", "evidence_phrase"], properties: { classification: { type: "string", enum: ["likely_individual_incident", "likely_multi_incident", "systemic_context", "insufficient_evidence"] }, reason: { type: "string", maxLength: 240 }, evidence_phrase: { type: "string", maxLength: 240 } } }
const endpoint = new URL("http://127.0.0.1:11434/api/chat"), model = "qwen2.5:1.5b"
let localLightReviews = 0
for (const lead of queue.leads.filter(item => item.status === "pending").slice(0, reviewLimit)) {
  let document = null
  try { document = await fetchSafeResearchDocument(lead.url, { timeoutMs: 12_000 }) } catch { /* use stored bounded material */ }
  const bounded = String(document?.text || lead.automated_excerpt || "").replace(/\s+/g, " ").trim().slice(0, 5000)
  lead.manual_retrieval = { at: new Date().toISOString(), source_fetch: document?.ok ? "fetched" : "stored_excerpt", bounded_excerpt: bounded.slice(0, 1800) }
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(endpoint, { method: "POST", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ model, stream: false, keep_alive: "5m", format: schema, options: { temperature: 0, num_ctx: 4096, num_predict: 180 }, messages: [{ role: "system", content: "You are an advisory evidence classifier. Use only the supplied source material. Never browse or invent a person, facility, date, Indigenous identity, racism finding, or event fact. Classify whether the material likely contains a separable reported healthcare incident, multiple incidents, systemic context, or insufficient evidence. Return JSON only." }, { role: "user", content: JSON.stringify({ title: lead.title, province: lead.province, source_type: lead.source_classification, bounded_source_material: bounded }) }] }) })
    if (!response.ok) throw new Error(`ollama_http_${response.status}`)
    const parsed = JSON.parse((await response.json())?.message?.content || "")
    if (!schema.properties.classification.enum.includes(parsed.classification) || typeof parsed.reason !== "string" || typeof parsed.evidence_phrase !== "string" || (parsed.evidence_phrase && !bounded.toLowerCase().includes(parsed.evidence_phrase.toLowerCase()))) throw new Error("local_light_schema_invalid")
    lead.local_light = { ...parsed, model, advisory_only: true, mutation_authority: false }
  } catch (error) {
    lead.local_light = { classification: "insufficient_evidence", reason: String(error?.message || error).slice(0, 240), evidence_phrase: "", model, advisory_only: true, mutation_authority: false, unavailable: true }
  } finally { clearTimeout(timer) }
  lead.status = "ready_for_manual_decision"
  localLightReviews += 1
  saveManifest(queuePath, queue)
}
console.log(JSON.stringify({ campaign_id: queue.campaign_id, leads: queue.lead_count, ready_for_manual_decision: queue.leads.filter(lead => lead.status === "ready_for_manual_decision").length, pending: queue.leads.filter(lead => lead.status === "pending").length, local_light_reviews: localLightReviews, top: queue.leads.slice(0, 10).map(lead => ({ lead_id: lead.lead_id, score: lead.score, province: lead.province, title: lead.title, known_incident_source: lead.known_incident_source })) }, null, 2))
