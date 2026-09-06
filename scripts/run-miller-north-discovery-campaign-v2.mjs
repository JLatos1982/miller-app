import "dotenv/config"
import { existsSync, readFileSync } from "node:fs"
import { fetchSafeResearchDocument } from "../server/review/linkQuality.js"
import { buildMillerNorthDiscoveryCampaignV2, normalizeCampaignQuery } from "../server/millerNorthDiscoveryCampaign.js"
import { acquireManifestLock, finishQuery, loadManifest, releaseManifestLock, saveManifest, saveSearch, startQuery } from "../server/millerNorthDiscoveryCheckpoint.js"

const campaign = buildMillerNorthDiscoveryCampaignV2()
const manifestPath = "artifacts/miller-north/miller-north-incident-discovery-campaign-v2.json"
const limit = Math.max(1, Number(process.argv.find(arg => arg.startsWith("--limit="))?.split("=")[1] || 20))
const assessLimit = Math.max(1, Number(process.argv.find(arg => arg.startsWith("--assess-limit="))?.split("=")[1] || limit * 3))
const provinceFilter = process.argv.find(arg => arg.startsWith("--province="))?.split("=")[1] || null
const adaptiveQuery = process.argv.find(arg => arg.startsWith("--adaptive-query="))?.slice("--adaptive-query=".length) || null
const adaptiveContext = process.argv.find(arg => arg.startsWith("--regional-context="))?.slice("--regional-context=".length) || "Adaptive source follow-up"
if (!process.env.TAVILY_API_KEY) throw new Error("miller_north_tavily_not_configured")

const priorPaths = [
  "artifacts/miller-north/reconstructed-corpus-v2-british_columbia-discovery.json",
  "artifacts/miller-north/reconstructed-corpus-v2-alberta-discovery.json",
  "artifacts/miller-north/reconstructed-corpus-v2-saskatchewan-discovery.json",
  "artifacts/miller-north/reconstructed-corpus-v2-british_columbia-query-checkpoint.json",
  "artifacts/miller-north/reconstructed-corpus-v2-alberta-query-checkpoint.json",
  "artifacts/miller-north/reconstructed-corpus-v2-saskatchewan-query-checkpoint.json",
]
const previousQueries = new Set()
for (const path of priorPaths) if (existsSync(path)) {
  const prior = JSON.parse(readFileSync(path, "utf8"))
  for (const item of prior.searches || []) previousQueries.add(normalizeCampaignQuery(item.query))
  for (const item of Object.values(prior.queries || {})) previousQueries.add(normalizeCampaignQuery(item.query))
}

const lockPath = acquireManifestLock(manifestPath)
try {
const manifest = loadManifest(manifestPath)
manifest.version = campaign.version
manifest.campaign ||= { campaign_id: campaign.campaign_id, created_at: new Date().toISOString(), planned_query_count: campaign.queries.length, purpose: "Private incident-level discovery; Treaty context is research geography only, never person identity." }
manifest.queries ||= {}
manifest.sources ||= {}
const register = item => {
  const existing = Object.values(manifest.queries).find(query => query.province === item.province && normalizeCampaignQuery(query.query) === normalizeCampaignQuery(item.query))
  if (!existing) {
    const checkpoint = startQuery(manifest, item.province, item.query, campaign.version)
    manifest.queries[checkpoint.id] = { ...manifest.queries[checkpoint.id], campaign_id: campaign.campaign_id, regional_context: item.regional_context, adaptive: Boolean(item.adaptive), status: "pending", started_at: null }
  }
}
for (const item of campaign.queries) register(item)
if (adaptiveQuery && provinceFilter) {
  register({ campaign_id: campaign.campaign_id, province: provinceFilter, regional_context: adaptiveContext, query: adaptiveQuery, adaptive: true })
  manifest.campaign.adaptive_query_count = Object.values(manifest.queries).filter(query => query.adaptive).length
}
saveManifest(manifestPath, manifest)

const sourceClass = ({ title, text }) => {
  const haystack = `${title} ${text}`.toLowerCase()
  const racism = /(racism|racist|discrimination|anti-indigenous|stereotyp)/.test(haystack)
  const patient = /(patient|woman|man|mother|father|elder|family|child|baby|person)/.test(haystack)
  const care = /(hospital|emergency|clinic|health care|healthcare|nurse|doctor|treatment|care)/.test(haystack)
  if (racism && patient && care) return "individual_incident_source"
  if (racism && /(accounts|patients|families|experiences|stories)/.test(haystack) && care) return "multi_incident_source"
  if (/(health authority|health services|review|investigation|apology|commission|ombud)/.test(haystack) && racism) return "institutional_response"
  if (/(human rights|complaint|tribunal|court|legal)/.test(haystack) && patient && care) return "human_rights_or_complaint"
  if (/(study|survey|prevalence|statistics|systemic|report recommends)/.test(haystack)) return "policy_or_prevalence"
  if (/(policy|framework|strategy|recommendation)/.test(haystack)) return "background_context"
  return "insufficient_detail"
}

const terminal = status => ["terminal", "sources_assessed"].includes(status)
const pending = Object.values(manifest.queries)
  .filter(item => ["pending", "in_progress", "retryable_error"].includes(item.status) && !previousQueries.has(normalizeCampaignQuery(item.query)) && (!provinceFilter || item.province === provinceFilter))
  .sort((a, b) => Number(Boolean(b.adaptive)) - Number(Boolean(a.adaptive)) || a.province.localeCompare(b.province) || String(a.query).localeCompare(String(b.query)))
  .slice(0, limit)

let tavilyCalls = 0
for (const query of pending) {
  const checkpoint = startQuery(manifest, query.province, query.query, campaign.version)
  manifest.queries[checkpoint.id] = { ...manifest.queries[checkpoint.id], campaign_id: campaign.campaign_id, regional_context: query.regional_context }
  saveManifest(manifestPath, manifest)
  if (checkpoint.reused) continue
  try {
    const response = await fetch("https://api.tavily.com/search", { method: "POST", signal: AbortSignal.timeout(20_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query: query.query, max_results: 5, topic: "general", search_depth: "advanced", include_answer: false }) })
    if (!response.ok) throw new Error(`tavily_status_${response.status}`)
    const body = await response.json(), results = body.results || []
    tavilyCalls += 1
    saveSearch(manifest, checkpoint.id, results)
    for (const row of results) if (row.url) {
      const current = manifest.sources[row.url] || { query_ids: [], source_urls: [] }
      manifest.sources[row.url] = { ...current, query_ids: [...new Set([...(current.query_ids || []), checkpoint.id])], tavily_title: row.title || current.tavily_title || "", tavily_excerpt: row.content || current.tavily_excerpt || "", status: current.status || "pending" }
    }
    saveManifest(manifestPath, manifest)
  } catch (error) {
    manifest.queries[checkpoint.id] = { ...manifest.queries[checkpoint.id], status: "retryable_error", error: String(error?.message || error), completed_at: new Date().toISOString() }
    saveManifest(manifestPath, manifest)
  }
}

const assessable = Object.entries(manifest.sources).filter(([, source]) => !["assessed", "terminal"].includes(source.status)).slice(0, assessLimit)
for (const [url, source] of assessable) {
  manifest.sources[url] = { ...source, status: "assessing", started_at: new Date().toISOString() }
  saveManifest(manifestPath, manifest)
  let document = null
  try { document = await fetchSafeResearchDocument(url, { timeoutMs: 15_000 }) } catch { /* Tavily excerpt remains bounded fallback evidence */ }
  const text = String(document?.text || source.tavily_excerpt || "").replace(/\s+/g, " ").trim()
  manifest.sources[url] = { ...manifest.sources[url], status: "assessed", completed_at: new Date().toISOString(), final_url: document?.url || url, source_fetch: document?.ok ? "fetched" : "tavily_excerpt_only", classification: sourceClass({ title: source.tavily_title || "", text }), bounded_excerpt: text.slice(0, 1500) }
  saveManifest(manifestPath, manifest)
}

for (const [id, query] of Object.entries(manifest.queries)) if (query.status === "search_complete" && (query.results || []).every(row => !row.url || ["assessed", "terminal"].includes(manifest.sources[row.url]?.status))) finishQuery(manifest, id, (query.results || []).map(row => manifest.sources[row.url]?.classification || null))
saveManifest(manifestPath, manifest)

const queries = Object.values(manifest.queries)
const sources = Object.values(manifest.sources)
console.log(JSON.stringify({ campaign_id: campaign.campaign_id, planned: queries.length, tavily_calls_this_run: tavilyCalls, completed: queries.filter(query => terminal(query.status)).length, search_complete_pending_assessment: queries.filter(query => query.status === "search_complete").length, retryable_errors: queries.filter(query => query.status === "retryable_error").length, remaining: queries.filter(query => !terminal(query.status)).length, by_province: Object.fromEntries(["british_columbia", "alberta", "saskatchewan"].map(province => [province, queries.filter(query => query.province === province && terminal(query.status)).length])), sources_assessed: sources.filter(source => source.status === "assessed").length, classifications: Object.fromEntries(["individual_incident_source", "multi_incident_source", "institutional_response", "human_rights_or_complaint", "background_context", "policy_or_prevalence", "insufficient_detail"].map(kind => [kind, sources.filter(source => source.classification === kind).length])) }, null, 2))
} finally {
  releaseManifestLock(lockPath)
}
