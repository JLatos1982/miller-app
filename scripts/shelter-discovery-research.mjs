import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

const CACHE = path.resolve(".cache/shelter-discovery")
const broad = process.argv.includes("--broad")
const OUTPUT = path.resolve(`data/shelter-source-inventory-${broad ? "broad" : "pilot"}.json`)
const queries = broad ? [
  "site:bchousing.org emergency shelter British Columbia homeless shelter list",
  "site:bc.211.ca shelter emergency housing British Columbia",
  "site:sheltersafe.ca British Columbia shelter",
  "site:gov.bc.ca extreme weather response shelter community plan",
  "site:lookoutsociety.ca shelter British Columbia",
  "site:salvationarmy.ca British Columbia emergency shelter",
  "site:friendshipcentre.ca shelter British Columbia Indigenous",
  "British Columbia youth shelter official organization",
  "British Columbia newcomer refugee emergency accommodation official",
  "British Columbia managed alcohol program shelter official",
] : [
  "Olive Branch shelter Surrey Managed Alcohol Program official",
  "site:bchousing.org emergency shelter Surrey Vancouver Prince George Kelowna Victoria",
  "site:bc.211.ca emergency shelter Surrey Prince George Kelowna Victoria",
  "site:sheltersafe.ca British Columbia transition house",
]
const hash = (value) => createHash("sha256").update(value).digest("hex")
await fs.mkdir(CACHE, { recursive: true }); const searches = []; let requests = 0, cacheHits = 0
for (const query of queries) {
  const file = path.join(CACHE, `${hash(query)}.json`); let body
  try { body = JSON.parse(await fs.readFile(file, "utf8")); cacheHits++ } catch {
    const response = await fetch("https://api.tavily.com/search", { method: "POST", signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query, max_results: 10, topic: "general", search_depth: "advanced", include_answer: false }) })
    requests++; if (!response.ok) throw new Error(`Shelter discovery search failed (${response.status})`); body = await response.json(); await fs.writeFile(file, JSON.stringify(body))
  }
  searches.push({ query, results: (body.results || []).map((item) => ({ title: item.title, url: item.url, content: item.content, score: item.score })) })
}
const uniqueSources = [...new Map(searches.flatMap((search) => search.results).filter((item) => /^https:\/\//.test(item.url)).map((item) => [item.url, item])).values()]
const output = { version: "miller-shelter-research-v1.0.0", mode: broad ? "broad_source_discovery" : "pilot_source_discovery", generated_at: new Date().toISOString(), queries: queries.length, requests, cache_hits: cacheHits, sources_found: uniqueSources.length, notice: "Search results locate evidence only. Snippets are not approval evidence and no candidate is imported by this script.", searches, unique_sources: uniqueSources }
await fs.mkdir(path.dirname(OUTPUT), { recursive: true }); await fs.writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`); console.log(JSON.stringify({ mode: output.mode, queries: output.queries, requests, cache_hits: cacheHits, sources_found: uniqueSources.length }, null, 2))
