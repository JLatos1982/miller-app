import "dotenv/config"
import { fetchSafeResearchDocument } from "../server/review/linkQuality.js"
import { buildMillerNorthRecentDiscoveryV1 } from "../server/millerNorthRecentDiscoveryCampaign.js"
import { acquireManifestLock, finishQuery, loadManifest, releaseManifestLock, saveManifest, saveSearch, startQuery } from "../server/millerNorthDiscoveryCheckpoint.js"

const campaign = buildMillerNorthRecentDiscoveryV1()
const path = "artifacts/miller-north/miller-north-recent-facility-discovery-v1.json"
const limit = Math.max(1, Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 10))
const province = process.argv.find((arg) => arg.startsWith("--province="))?.split("=")[1] || null
const assessLimit = Math.max(1, Number(process.argv.find((arg) => arg.startsWith("--assess-limit="))?.split("=")[1] || limit * 5))
if (!process.env.TAVILY_API_KEY) throw new Error("miller_north_tavily_not_configured")

const classify = ({ title = "", text = "" }) => {
  const value = `${title} ${text}`.toLowerCase()
  const care = /(hospital|emergency|clinic|health care|healthcare|nurse|doctor|treatment|care)/.test(value)
  const person = /(patient|woman|man|mother|father|elder|family|child|baby|person)/.test(value)
  const racism = /(racism|racist|discrimination|anti-indigenous|stereotyp)/.test(value)
  if (care && person && racism) return "individual_incident_source"
  if (care && /(accounts|patients|families|experiences|stories)/.test(value) && racism) return "multi_incident_source"
  if (care && /(health authority|health services|review|investigation|apology|commission|ombud)/.test(value)) return "institutional_response"
  if (/(human rights|complaint|tribunal|court|legal)/.test(value) && care && person) return "human_rights_or_complaint"
  if (/(study|survey|prevalence|statistics|systemic|report recommends|strategy|framework|policy)/.test(value)) return "background_context"
  return "insufficient_detail"
}

const lock = acquireManifestLock(path)
try {
  const manifest = loadManifest(path)
  manifest.version = campaign.version
  manifest.campaign ||= { campaign_id: campaign.campaign_id, created_at: new Date().toISOString(), planned_query_count: campaign.queries.length, purpose: "Private, facility-first recent discovery. Treaty context is a research geography lens, never person identity." }
  manifest.queries ||= {}; manifest.sources ||= {}
  for (const item of campaign.queries) {
    const checkpoint = startQuery(manifest, item.province, item.query, campaign.version)
    manifest.queries[checkpoint.id] = { ...manifest.queries[checkpoint.id], campaign_id: campaign.campaign_id, regional_context: item.regional_context, lane: item.lane, status: manifest.queries[checkpoint.id].status === "in_progress" ? "retryable_error" : (manifest.queries[checkpoint.id].status || "pending"), started_at: manifest.queries[checkpoint.id].started_at || null }
  }
  saveManifest(path, manifest)
  const pending = Object.values(manifest.queries).filter((item) => ["pending", "in_progress", "retryable_error"].includes(item.status) && (!province || item.province === province)).sort((a, b) => a.query.localeCompare(b.query)).slice(0, limit)
  let tavilyCalls = 0
  for (const item of pending) {
    const checkpoint = startQuery(manifest, item.province, item.query, campaign.version)
    saveManifest(path, manifest)
    if (checkpoint.reused) continue
    try {
      const response = await fetch("https://api.tavily.com/search", { method: "POST", signal: AbortSignal.timeout(20_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query: item.query, max_results: 5, topic: "general", search_depth: "advanced", include_answer: false }) })
      if (!response.ok) throw new Error(`tavily_status_${response.status}`)
      const results = (await response.json()).results || []; tavilyCalls += 1
      saveSearch(manifest, checkpoint.id, results)
      for (const result of results) if (result.url) {
        const source = manifest.sources[result.url] || { query_ids: [] }
        manifest.sources[result.url] = { ...source, query_ids: [...new Set([...(source.query_ids || []), checkpoint.id])], tavily_title: result.title || source.tavily_title || "", tavily_excerpt: result.content || source.tavily_excerpt || "", status: source.status || "pending" }
      }
      saveManifest(path, manifest)
    } catch (error) {
      manifest.queries[checkpoint.id] = { ...manifest.queries[checkpoint.id], status: "retryable_error", error: String(error?.message || error), completed_at: new Date().toISOString() }
      saveManifest(path, manifest)
    }
  }
  for (const [url, source] of Object.entries(manifest.sources).filter(([, row]) => !["assessed", "terminal"].includes(row.status)).slice(0, assessLimit)) {
    manifest.sources[url] = { ...source, status: "assessing", started_at: new Date().toISOString() }; saveManifest(path, manifest)
    let document = null
    try { document = await fetchSafeResearchDocument(url, { timeoutMs: 15_000 }) } catch { /* Tavily excerpt is retained as bounded fallback. */ }
    const text = String(document?.text || source.tavily_excerpt || "").replace(/\s+/g, " ").trim()
    manifest.sources[url] = { ...manifest.sources[url], status: "assessed", completed_at: new Date().toISOString(), final_url: document?.url || url, source_fetch: document?.ok ? "fetched" : "tavily_excerpt_only", classification: classify({ title: source.tavily_title, text }), bounded_excerpt: text.slice(0, 1500) }
    saveManifest(path, manifest)
  }
  for (const [id, query] of Object.entries(manifest.queries)) if (query.status === "search_complete" && (query.results || []).every((row) => !row.url || ["assessed", "terminal"].includes(manifest.sources[row.url]?.status))) finishQuery(manifest, id, (query.results || []).map((row) => manifest.sources[row.url]?.classification || null))
  saveManifest(path, manifest)
  const queries = Object.values(manifest.queries), sources = Object.values(manifest.sources), terminal = (query) => ["terminal", "sources_assessed"].includes(query.status)
  console.log(JSON.stringify({ campaign_id: campaign.campaign_id, tavily_calls_this_run: tavilyCalls, completed: queries.filter(terminal).length, remaining: queries.filter((query) => !terminal(query)).length, by_province: Object.fromEntries(["saskatchewan", "alberta", "british_columbia"].map((key) => [key, queries.filter((query) => query.province === key && terminal(query)).length])), sources_assessed: sources.filter((source) => source.status === "assessed").length, classifications: Object.fromEntries(["individual_incident_source", "multi_incident_source", "institutional_response", "human_rights_or_complaint", "background_context", "insufficient_detail"].map((kind) => [kind, sources.filter((source) => source.classification === kind).length])) }, null, 2))
} finally { releaseManifestLock(lock) }
