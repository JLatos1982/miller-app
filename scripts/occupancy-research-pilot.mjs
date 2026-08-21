import fs from "node:fs"
import { tavily } from "@tavily/core"
import { fetchSafeResearchDocument } from "../server/review/linkQuality.js"
import { buildOccupancyResearchPlan, evaluateOccupancyDocument, extractBarrierEvidence, finishOccupancyResearch } from "../server/intelligence/research.js"
import { classifyLocationCandidate } from "../server/intelligence/locationAutomation.js"

const requested = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 12), limit = Math.max(1, Math.min(15, requested))
if (!process.env.TAVILY_API_KEY) throw new Error("Tavily is not configured")
const inventory = JSON.parse(fs.readFileSync(new URL("../data/location-automation-v1.2.1-review.json", import.meta.url), "utf8")), unresolved = inventory.records.filter((record) => classifyLocationCandidate(record).decision === "needs_review" && record.program_occupancy_confidence !== "supported").slice(0, limit), client = tavily({ apiKey: process.env.TAVILY_API_KEY })
const output = [], globalStarted = Date.now()
for (const record of unresolved) {
  const plan = buildOccupancyResearchPlan(record), started = Date.now(), inspected = [], seenUrls = new Set(), queries = []
  for (const query of plan.queries) {
    if (Date.now() - started >= plan.budget.maxElapsedMs || inspected.length >= plan.budget.maxPagesPerClaim) break
    queries.push(query)
    let discovery
    try { discovery = await client.search(query, { searchDepth: "basic", maxResults: 3, includeAnswer: false }) } catch { break }
    for (const result of discovery.results || []) {
      if (inspected.length >= plan.budget.maxPagesPerClaim || Date.now() - started >= plan.budget.maxElapsedMs || seenUrls.has(result.url)) continue
      seenUrls.add(result.url)
      try { const document = await fetchSafeResearchDocument(result.url); if (document.ok && document.text) inspected.push(evaluateOccupancyDocument(record, { url: document.url, title: result.title, text: document.text })) } catch { /* bounded provider/page failure */ }
    }
    if (inspected.some((item) => item.classification.tier === "E1")) break
  }
  const result = finishOccupancyResearch(record, inspected, { queriesUsed: queries.length, elapsedMs: Date.now() - started })
  const barrierFacts = inspected.flatMap((item) => extractBarrierEvidence({ url: item.evidence.url, text: item.evidence.excerpt }, item.evidence.sourceType))
  output.push({ canonical_uuid: record.canonical_uuid, resource_name: record.resource_name, prior: classifyLocationCandidate(record).decision, research: result, discoveredUrls: [...seenUrls], verifiedSources: inspected.filter((item) => item.classification.program_relationship_verified).map((item) => ({ url: item.evidence.url, sourceType: item.source.type, tier: item.classification.tier, injectionIgnored: item.security.promptInjectionIgnored })), barrierFacts })
}
const supported = output.filter((item) => item.research.occupancySupported).length
console.log(JSON.stringify({ mode: "read_only_bounded_pilot", requested: limit, examined: output.length, queriesUsed: output.reduce((sum, item) => sum + item.research.queriesUsed, 0), pagesInspected: output.reduce((sum, item) => sum + item.research.inspectedSources, 0), occupancyGapsResolved: supported, remainUnresolved: output.length - supported, barrierFactsFound: output.reduce((sum, item) => sum + item.barrierFacts.length, 0), elapsedMs: Date.now() - globalStarted, productionWrites: 0, results: output }, null, 2))
