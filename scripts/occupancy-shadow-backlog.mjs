import fs from "node:fs"
import { tavily } from "@tavily/core"
import { createClient } from "@supabase/supabase-js"
import { fetchSafeResearchDocument } from "../server/review/linkQuality.js"
import { buildOccupancyResearchPlan, evaluateOccupancyDocument, finishOccupancyResearch } from "../server/intelligence/research.js"
import { classifyLocationCandidate } from "../server/intelligence/locationAutomation.js"
import { createShadowPersistence } from "../server/intelligence/shadowPersistence.js"

const apply = process.argv.includes("--apply-shadow"), requested = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 100), limit = Math.max(1, Math.min(100, requested)), requestedIds = new Set(String(process.argv.find((arg) => arg.startsWith("--ids="))?.split("=")[1] || "").split(",").map((item) => item.trim()).filter(Boolean))
if (!process.env.TAVILY_API_KEY || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Server-side research configuration is incomplete")
if (new URL(process.env.SUPABASE_URL).hostname.split(".")[0] !== "wccagykzugrahwugefqt") throw new Error("Refusing to run against an unexpected Supabase project")
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }), persistence = createShadowPersistence({ supabase: db }), search = tavily({ apiKey: process.env.TAVILY_API_KEY })
await persistence.assertObserveOnly()
const inventory = JSON.parse(fs.readFileSync(new URL("../data/location-automation-v1.2.1-review.json", import.meta.url), "utf8")), baseline = inventory.records.map((record) => ({ record, result: classifyLocationCandidate(record) })), unresolved = (requestedIds.size ? baseline.filter(({ record }) => requestedIds.has(record.canonical_uuid)) : baseline.filter(({ record, result }) => result.decision === "needs_review" && record.program_occupancy_confidence !== "supported")).slice(0, limit)
if (requestedIds.size && unresolved.length !== requestedIds.size) throw new Error("One or more requested IDs are not available in the reviewed inventory")
const ids = unresolved.map(({ record }) => record.canonical_uuid), [registry, aliases] = await Promise.all([db.from("resource_registry").select("id,display_name").in("id", ids), db.from("resource_source_aliases").select("resource_id,source_native_id,source_url,provenance").in("resource_id", ids)])
if (registry.error || aliases.error) throw registry.error || aliases.error
const registryNames = new Map((registry.data || []).map((item) => [item.id, item.display_name])), aliasMap = new Map()
for (const alias of aliases.data || []) {
  const names = [alias.provenance?.name, alias.provenance?.resource_name, alias.provenance?.title].filter(Boolean)
  aliasMap.set(alias.resource_id, [...new Set([...(aliasMap.get(alias.resource_id) || []), ...names])])
}
const results = [], startedAll = Date.now()
for (const { record } of unresolved) {
  const enriched = { ...record, resource_name: registryNames.get(record.canonical_uuid) || record.resource_name, aliases: aliasMap.get(record.canonical_uuid) || [] }, plan = buildOccupancyResearchPlan(enriched), started = Date.now(), inspected = [], seenUrls = new Set(), queries = []
  for (let queryIndex = 0; queryIndex < plan.queries.length; queryIndex += 1) {
    if (Date.now() - started >= plan.budget.maxElapsedMs || inspected.length >= plan.budget.maxPagesPerClaim) break
    if (queryIndex >= plan.budget.initialQueries && inspected.length >= plan.budget.initialPages && !inspected.some((item) => item.source.authoritative || item.identity?.matched)) break
    const query = plan.queries[queryIndex]; queries.push(query)
    const pageCeiling = Math.min(plan.budget.maxPagesPerClaim, plan.budget.initialPages + queryIndex)
    let discovery
    try { discovery = await search.search(query, { searchDepth: "basic", maxResults: 4, includeAnswer: false }) } catch { break }
    for (const result of discovery.results || []) {
      if (inspected.length >= pageCeiling || Date.now() - started >= plan.budget.maxElapsedMs || seenUrls.has(result.url)) continue
      seenUrls.add(result.url)
      try { const document = await fetchSafeResearchDocument(result.url); if (document.ok && document.text) inspected.push(evaluateOccupancyDocument(enriched, { url: document.url, title: result.title, text: document.text })) } catch { /* bounded page failure */ }
    }
    if (inspected.some((item) => item.classification.tier === "E1" && item.classification.program_relationship_verified)) break
  }
  const research = finishOccupancyResearch(enriched, inspected, { queriesUsed: queries.length, elapsedMs: Date.now() - started }), verified = inspected.filter((item) => item.classification.program_relationship_verified), recommendation = research.occupancySupported ? "auto_accept" : "human_review", reasonCodes = [...new Set(verified.length ? research.claim.reasonCodes : inspected.flatMap((item) => item.classification.reasons || []))]
  let persisted = null
  if (apply) persisted = await persistence.persistObservation({ resourceId: record.canonical_uuid, field: "location_occupancy", category: "location_occupancy", currentValue: null, proposedValue: research.occupancySupported ? record.returned_address || record.submitted_address : record.submitted_address, risk: "medium", recommendation, confidence: research.occupancySupported ? "high" : inspected.length ? "bounded" : "unknown", reasonCodes: reasonCodes.length ? reasonCodes : ["authoritative_evidence_not_found"], engineVersion: plan.version, summary: research.occupancySupported ? `Miller found authoritative program-specific evidence associating ${enriched.resource_name} with the proposed address.` : inspected.length ? `Miller opened ${inspected.length} source page(s) but could not safely establish the exact program/address relationship.` : "Miller completed bounded searches but found no safely usable source page.", evidence: inspected.map((item) => item.evidence) })
  results.push({ canonical_uuid: record.canonical_uuid, resource_name: enriched.resource_name, aliases: enriched.aliases, recommendation, occupancySupported: research.occupancySupported, stoppedBecause: research.stoppedBecause, queriesUsed: queries.length, pagesOpened: inspected.length, firstPartyPages: inspected.filter((item) => ["first_party", "health_authority", "government", "municipal"].includes(item.source.type)).length, evidencePages: verified.length, persisted: Boolean(persisted), created: persisted?.created || false })
}
const handled = results.filter((item) => item.recommendation === "auto_accept").length, externalResearch = results.filter((item) => item.pagesOpened === 0).length
console.log(JSON.stringify({ mode: apply ? "production_durable_shadow" : "dry_run", baseline: { total: baseline.length, auto_validatable: baseline.filter((item) => item.result.decision === "auto_validatable").length, human_review: baseline.filter((item) => item.result.decision === "needs_review").length, do_not_map: baseline.filter((item) => item.result.decision === "do_not_map").length }, examined: results.length, handledByMiller: handled, humanJudgmentRequired: results.length - handled, administratorExternalResearchRequired: externalResearch, queriesUsed: results.reduce((sum, item) => sum + item.queriesUsed, 0), pagesOpened: results.reduce((sum, item) => sum + item.pagesOpened, 0), firstPartyPages: results.reduce((sum, item) => sum + item.firstPartyPages, 0), authoritativeEvidenceRate: results.length ? results.filter((item) => item.evidencePages > 0).length / results.length : 0, averageResearchSteps: results.length ? results.reduce((sum, item) => sum + item.queriesUsed + item.pagesOpened, 0) / results.length : 0, maximumResearchSteps: Math.max(0, ...results.map((item) => item.queriesUsed + item.pagesOpened)), elapsedMs: Date.now() - startedAll, trustedDataWrites: 0, publicationWrites: 0, results }, null, 2))
