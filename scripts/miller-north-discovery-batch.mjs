import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { tavily } from "@tavily/core"
import { fetchSafeResearchDocument } from "../server/review/linkQuality.js"
import { loadReconstructedCorpus, MILLER_NORTH_RECONSTRUCTED_CORPUS_ID } from "../server/millerNorthCorpus.js"

const queries = [
  "Indigenous patient racism hospital British Columbia", "First Nations patient discrimination healthcare Alberta", "Indigenous racism emergency department Saskatchewan", "Indigenous patient racist treatment hospital BC", "Indigenous family alleges racism healthcare Alberta", "First Nations hospital complaint racism Saskatchewan", "Indigenous patient death racism healthcare British Columbia", "Indigenous patient discrimination hospital Saskatchewan",
]
const maxQueries = Math.max(1, Math.min(queries.length, Number(process.argv.find(arg => arg.startsWith("--queries="))?.split("=")[1] || queries.length)))
if (!process.env.TAVILY_API_KEY) throw new Error("TAVILY_API_KEY is required for the bounded Miller North discovery pass")
const { records } = loadReconstructedCorpus(), corpusUrls = new Set(records.map(record => record.source?.url).filter(Boolean))
const normalize = value => String(value || "").toLowerCase().replace(/https?:\/\//g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()
const fingerprint = value => createHash("sha256").update(normalize(value)).digest("hex").slice(0, 24)
const search = tavily({ apiKey: process.env.TAVILY_API_KEY }), discovered = new Map(), audit = []
for (const query of queries.slice(0, maxQueries)) {
  let response
  try { response = await search.search(query, { searchDepth: "advanced", maxResults: 6, includeAnswer: false }) } catch (error) { audit.push({ query, error: "tavily_unavailable" }); continue }
  const results = response?.results || []
  audit.push({ query, result_count: results.length })
  for (const result of results) if (result?.url && !discovered.has(result.url)) discovered.set(result.url, { query, title: result.title || "", url: result.url, tavily_excerpt: result.content || "" })
}
const inspected = []
for (const item of [...discovered.values()].slice(0, 40)) {
  let document = null
  try { document = await fetchSafeResearchDocument(item.url, { timeoutMs: 15000 }) } catch { /* bounded source failure remains a lead */ }
  const text = String(document?.text || item.tavily_excerpt || "").replace(/\s+/g, " ").trim()
  const haystack = `${item.title} ${text}`.toLowerCase()
  const incidentSignals = /(patient|woman|man|family|died|death|emergency|hospital|clinic|nurse|doctor)/.test(haystack) && /(racism|racist|discrimination|discriminatory|anti-indigenous)/.test(haystack)
  const province = /(british columbia|\bB\.C\.|\bBC\b)/i.test(`${item.query} ${text}`) ? "british_columbia" : /alberta/i.test(`${item.query} ${text}`) ? "alberta" : /saskatchewan/i.test(`${item.query} ${text}`) ? "saskatchewan" : "unknown"
  const existing = corpusUrls.has(item.url)
  inspected.push({ ...item, final_url: document?.url || item.url, source_fetch: document?.ok ? "fetched" : "not_fetched", province, incident_signals: incidentSignals, reconciliation_state: existing ? "existing_incident" : incidentSignals ? "new_incident_candidate" : "insufficient_incident_identity", evidence_excerpt: text.slice(0, 1200), incident_fingerprint: fingerprint(`${province}|${item.title}|${item.url}`) })
}
const staged = inspected.filter(item => item.reconciliation_state === "new_incident_candidate").map(item => ({ candidate_id: `mnc_${item.incident_fingerprint}`, proposal_state: "staged_private_review", corpus_id: MILLER_NORTH_RECONSTRUCTED_CORPUS_ID, province: item.province, approximate_location_or_facility: null, event_date: null, event_year: null, approximate_event_year: null, publication_date: null, source: { organization: null, title: item.title, url: item.final_url, source_type: "tavily_discovery_verified_source" }, evidence_status: "reported", duplicate_reconciliation_state: "new_incident_candidate", evidence_excerpt: item.evidence_excerpt, discovery_query: item.query, caution: "Automated bounded discovery identifies a review candidate only. Reviewer must confirm incident identity, date semantics, province, and whether the source supports the reported characterization." }))
const report = { generated_at: new Date().toISOString(), corpus_id: MILLER_NORTH_RECONSTRUCTED_CORPUS_ID, tavily_calls: audit.length, candidate_sources: discovered.size, sources_inspected: inspected.length, source_fetches_succeeded: inspected.filter(item => item.source_fetch === "fetched").length, existing_incidents_matched: inspected.filter(item => item.reconciliation_state === "existing_incident").length, probable_duplicates: 0, new_incident_candidates: staged.length, staged_private_review: staged.length, province_breakdown: Object.fromEntries(["british_columbia", "alberta", "saskatchewan", "unknown"].map(key => [key, staged.filter(item => item.province === key).length])), tavily_audit: audit, inspected }
mkdirSync("artifacts/miller-north", { recursive: true })
writeFileSync("artifacts/miller-north/reconstructed-corpus-v2-new-incident-proposals.json", `${JSON.stringify({ schema_version: "miller-north-new-incident-proposals-v2", corpus_id: MILLER_NORTH_RECONSTRUCTED_CORPUS_ID, candidates: staged }, null, 2)}\n`)
writeFileSync("artifacts/miller-north/reconstructed-corpus-v2-discovery-report.json", `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ ...report, inspected: inspected.map(({ evidence_excerpt, ...item }) => item) }, null, 2))
