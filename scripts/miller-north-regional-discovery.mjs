import "dotenv/config"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { fetchSafeResearchDocument } from "../server/review/linkQuality.js"
import { finishQuery, loadManifest, saveManifest, saveSearch, startQuery } from "../server/millerNorthDiscoveryCheckpoint.js"

const region = process.argv.find(arg => arg.startsWith("--region="))?.split("=")[1]
const querySet = {
  british_columbia: ["Indigenous patient racism Vancouver Coastal Health hospital", "Indigenous patient complaint Fraser Health Surrey racism", "Indigenous patient racism Island Health Victoria hospital", "Indigenous patient discrimination Interior Health hospital", "Indigenous patient racism Northern Health Terrace hospital", "First Nations patient denied treatment Vancouver hospital", "Indigenous family alleges racism BC emergency department", "Indigenous pregnancy racism British Columbia hospital", "Indigenous patient death racism BC hospital", "Indigenous patient human rights complaint hospital BC", "Indigenous patient undertreated pain BC hospital", "Indigenous patient stereotyping substance use BC healthcare", "Indigenous patient racism Nanaimo hospital complaint", "First Nations patient racism Prince George hospital", "Indigenous patient discrimination Kamloops hospital", "Indigenous patient racism Kelowna hospital", "Indigenous patient mental health racism BC hospital", "Indigenous patient maternity discrimination BC health authority", "Indigenous family hospital apology racism BC", "Indigenous patient human rights tribunal healthcare BC"],
  alberta: ["Indigenous patient racism hospital Alberta", "First Nations patient discrimination Alberta healthcare", "Indigenous racism emergency department Alberta", "Indigenous patient hospital complaint racism Alberta", "First Nations healthcare racist treatment Alberta", "Indigenous family racism Alberta hospital", "Indigenous patient racism Calgary hospital complaint", "First Nations patient discrimination Edmonton emergency department", "Indigenous patient racism Red Deer hospital", "Indigenous patient racism Lethbridge hospital", "Indigenous patient death discrimination Alberta hospital", "Indigenous human rights complaint Alberta hospital patient", "Indigenous patient racism Grande Prairie hospital", "First Nations patient delayed treatment Alberta hospital", "Indigenous maternity racism Alberta hospital", "Indigenous mental health racism Alberta healthcare", "Alberta Health Services Indigenous patient apology racism", "Indigenous patient undertreated pain Alberta hospital", "Indigenous family complaint racism rural Alberta hospital", "Indigenous patient human rights tribunal Alberta healthcare"],
  saskatchewan: ["Indigenous patient racism hospital Saskatchewan", "First Nations patient discrimination Saskatchewan healthcare", "Indigenous racism emergency department Saskatchewan", "Indigenous patient hospital complaint racism Saskatchewan", "First Nations healthcare racist treatment Saskatchewan", "Indigenous family racism Saskatchewan hospital", "Indigenous patient racism Regina hospital complaint", "First Nations patient discrimination Saskatoon emergency department", "Indigenous patient racism Prince Albert hospital", "Indigenous patient racism North Battleford hospital", "Indigenous patient death discrimination Saskatchewan hospital", "Indigenous human rights complaint Saskatchewan hospital patient", "Indigenous patient delayed treatment Saskatchewan hospital", "Indigenous maternity racism Saskatchewan hospital", "Indigenous mental health racism Saskatchewan healthcare", "Saskatchewan Health Authority Indigenous patient apology racism", "Indigenous patient undertreated pain Saskatchewan hospital", "Indigenous family complaint racism northern Saskatchewan hospital", "First Nations patient racism rural Saskatchewan hospital", "Indigenous patient human rights tribunal Saskatchewan healthcare"],
}[region]
if (!querySet || !process.env.TAVILY_API_KEY) throw new Error("region_and_tavily_configuration_required")
const outputPath = `artifacts/miller-north/reconstructed-corpus-v2-${region}-discovery.json`, checkpointPath=`artifacts/miller-north/reconstructed-corpus-v2-${region}-query-checkpoint.json`, manifest=loadManifest(checkpointPath), prior = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, "utf8")) : null, legacyCompleted = new Set((prior?.searches || []).map(item => item.query)), requested = Number(process.argv.find(arg => arg.startsWith("--limit="))?.split("=")[1] || querySet.length)
manifest.sources ||= {}
const checkpointedQueries = new Set(Object.values(manifest.queries).filter(item => ["search_complete", "sources_assessed", "terminal"].includes(item.status)).map(item => item.query))
const pending = querySet.filter(query => !legacyCompleted.has(query) && !checkpointedQueries.has(query)).slice(0, requested)
const results = new Map((prior?.inspected || []).map(item => [item.url, { ...item, query_ids: item.query_ids || [] }])), searches = [...(prior?.searches || [])], assessLimit = Number(process.argv.find(arg => arg.startsWith("--assess-limit="))?.split("=")[1] || 12)
for (const item of Object.values(manifest.queries)) if (!searches.some(existing => existing.query === item.query)) searches.push({ query: item.query, result_count: (item.results || []).length, checkpointed: true })
for (const item of prior?.inspected || []) if (!manifest.sources[item.url]) manifest.sources[item.url] = { status: "assessed", completed_at: prior.generated_at, query_ids: item.query_ids || [], assessment: item }
for (const item of Object.values(manifest.queries)) for (const row of item.results || []) if (row.url) {
  const existing = results.get(row.url) || { title: row.title || "", url: row.url, tavily_excerpt: row.content || "", query_ids: [] }
  existing.query_ids = [...new Set([...(existing.query_ids || []), item.query_id])]
  results.set(row.url, existing)
}
for (const query of pending) {
  const checkpoint=startQuery(manifest,region,query); saveManifest(checkpointPath,manifest); if(checkpoint.reused) continue
  const response = await fetch("https://api.tavily.com/search", { method: "POST", signal: AbortSignal.timeout(20_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query, max_results: 5, topic: "general", search_depth: "advanced", include_answer: false }) })
  if (!response.ok) throw new Error(`tavily_status_${response.status}`)
  const body = await response.json(), rows = body.results || []
  saveSearch(manifest,checkpoint.id,rows); saveManifest(checkpointPath,manifest)
  searches.push({ query, result_count: rows.length })
  for (const item of rows) if (item?.url) {
    const existing = results.get(item.url) || { query, title: item.title || "", url: item.url, tavily_excerpt: item.content || "", query_ids: [] }
    existing.query_ids = [...new Set([...(existing.query_ids || []), checkpoint.id])]
    results.set(item.url, existing)
  }
}
const inspected = []
for (const item of [...results.values()].filter(item => manifest.sources[item.url]?.status !== "assessed").slice(0, assessLimit)) {
  const saved = manifest.sources[item.url]
  if (saved?.status === "assessed") { inspected.push(saved.assessment); continue }
  if (saved?.status === "assessing") manifest.sources[item.url] = { ...saved, status: "retryable" }
  manifest.sources[item.url] = { status: "assessing", started_at: new Date().toISOString(), query_ids: item.query_ids || [] }; saveManifest(checkpointPath,manifest)
  let document = null
  try { document = await fetchSafeResearchDocument(item.url, { timeoutMs: 15_000 }) } catch { /* keep discovery evidence bounded */ }
  const text = String(document?.text || item.tavily_excerpt || "").replace(/\s+/g, " ").trim()
  const all = `${item.title} ${text}`.toLowerCase()
  const individual = /(patient|woman|man|family|mother|elder|died|death)/.test(all) && /(racism|racist|discrimination|anti-indigenous)/.test(all)
  const category = individual ? "individual_incident_candidate" : /(study|survey|prevalence|systemic|report found|statistics)/.test(all) ? "background_prevalence_source" : /(review|policy|recommendation|investigation)/.test(all) ? "policy_or_review_source" : "insufficient_incident_detail"
  const assessment = { ...item, final_url: document?.url || item.url, source_fetch: document?.ok ? "fetched" : "tavily_excerpt_only", category, evidence_excerpt: text.slice(0, 1000) }
  manifest.sources[item.url] = { status: "assessed", completed_at: new Date().toISOString(), query_ids: item.query_ids || [], assessment }; saveManifest(checkpointPath,manifest)
  inspected.push(assessment)
}
for (const [id, query] of Object.entries(manifest.queries)) if (query.province === region && query.status === "search_complete" && (query.results || []).every(row => manifest.sources[row.url]?.status === "assessed")) finishQuery(manifest, id, (query.results || []).map(row => manifest.sources[row.url]?.assessment).filter(Boolean))
saveManifest(checkpointPath,manifest)
const output = { generated_at: new Date().toISOString(), region, tavily_calls: searches.length, searches, candidate_sources: inspected.length, categories: Object.fromEntries(["individual_incident_candidate", "multi_incident_source", "background_prevalence_source", "policy_or_review_source", "insufficient_incident_detail"].map(category => [category, inspected.filter(item => item.category === category).length])), inspected }
mkdirSync("artifacts/miller-north", { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({ region, tavily_calls: output.tavily_calls, candidate_sources: output.candidate_sources, categories: output.categories, candidates: inspected.filter(item => item.category === "individual_incident_candidate").map(item => ({ title: item.title, url: item.final_url, fetched: item.source_fetch === "fetched" })) }, null, 2))
