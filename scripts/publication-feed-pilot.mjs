import { createClient } from "@supabase/supabase-js"
import { tavily } from "@tavily/core"
import { requestBcAddressGeocode } from "../server/bcAddressGeocoder.js"
import { processPublicationFeedItem, rankPublicationFeedCandidates } from "../server/publicationFeed.js"
import { fetchSafeResearchDocument } from "../server/review/linkQuality.js"
import { buildOccupancyResearchPlan, evaluateOccupancyDocument, finishOccupancyResearch } from "../server/intelligence/research.js"
import { createShadowPersistence } from "../server/intelligence/shadowPersistence.js"

const apply = process.argv.includes("--apply"), limit = Math.max(1, Math.min(20, Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 10))), requestedIds = new Set(String(process.argv.find((arg) => arg.startsWith("--ids="))?.split("=")[1] || "").split(",").filter(Boolean))
if (!process.env.SUPABASE_URL?.includes("wccagykzugrahwugefqt") || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.TAVILY_API_KEY) throw new Error("Unexpected production target or missing server research credentials")
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const search = tavily({ apiKey: process.env.TAVILY_API_KEY }), shadow = createShadowPersistence({ supabase: db })
const query = async (builder) => { const result = await builder; if (result.error) throw result.error; return result.data || [] }
const [resources, claims, evidence, qc, locations] = await Promise.all([query(db.from("resource_registry").select("id,display_name,lifecycle_state,editorial_status").eq("lifecycle_state", "active")), query(db.from("resource_fact_claims").select("*").eq("decision_category", "location_occupancy")), query(db.from("resource_fact_evidence").select("*")), query(db.from("location_qc_reviews").select("*")), query(db.from("resource_locations").select("*"))])
const evidenceByClaim = new Map(); for (const item of evidence) evidenceByClaim.set(item.claim_id, [...(evidenceByClaim.get(item.claim_id) || []), item])
const contexts = resources.map((resource) => { const linkedClaims = claims.filter((item) => item.resource_id === resource.id); return { resource, claims: linkedClaims, evidence: linkedClaims.flatMap((item) => evidenceByClaim.get(item.id) || []), qc: qc.find((item) => item.canonical_resource_id === resource.id) || null, locations: locations.filter((item) => item.resource_id === resource.id), community: "" } })
const priorItems = await query(db.from("publication_feed_run_items").select("resource_id,outcome"))
const completed = new Set(priorItems.filter((item) => item.outcome !== "pending").map((item) => item.resource_id))
const candidateContexts = requestedIds.size ? contexts.filter((item) => requestedIds.has(item.resource.id)) : contexts.filter((item) => !completed.has(item.resource.id))
const selected = rankPublicationFeedCandidates(candidateContexts, limit)
if (!apply) { console.log(JSON.stringify({ mode: "dry_run", selected: selected.map(({ context, assessment }, index) => ({ rank: index + 1, id: context.resource.id, name: context.resource.display_name, distance: assessment.distance, blockers: assessment.reasons })) }, null, 2)); process.exit(0) }
const users = await db.auth.admin.listUsers({ perPage: 1000 }), actor = users.data.users.find((item) => item.email); if (!actor) throw new Error("No administrator audit actor is available")
const run = await db.from("publication_feed_runs").insert({ requested_limit: limit }).select().single(); if (run.error) throw run.error
const rows = selected.map(({ context }, index) => ({ run_id: run.data.id, resource_id: context.resource.id, selection_rank: index + 1, stage: "selected" })); const inserted = await db.from("publication_feed_run_items").insert(rows); if (inserted.error) throw inserted.error
const results = []
async function research(context, assessment) {
  if (!assessment.completeAddress) return null
  const record = { canonical_uuid: context.resource.id, resource_name: context.resource.display_name, submitted_address: assessment.address, municipality: assessment.address.split(",").map((item) => item.trim()).filter(Boolean).at(-2) || "", operator: "", aliases: [] }
  const plan = buildOccupancyResearchPlan(record, { maxQueriesPerClaim: 3, maxPagesPerClaim: 3, maxElapsedMs: 25_000 }), inspected = [], seen = new Set(), started = Date.now()
  for (const queryText of plan.queries) {
    if (inspected.length >= plan.budget.maxPagesPerClaim || Date.now() - started >= plan.budget.maxElapsedMs) break
    let discovery; try { discovery = await search.search(queryText, { searchDepth: "basic", maxResults: 4, includeAnswer: false }) } catch { continue }
    for (const result of discovery.results || []) {
      if (seen.has(result.url) || inspected.length >= plan.budget.maxPagesPerClaim) continue
      seen.add(result.url)
      try { const document = await fetchSafeResearchDocument(result.url); if (document.ok && document.text) inspected.push(evaluateOccupancyDocument(record, { url: document.url, title: result.title, text: document.text })) } catch { /* bounded source failure */ }
    }
    if (inspected.some((item) => item.classification.program_relationship_verified && item.source.authoritative)) break
  }
  const result = finishOccupancyResearch(record, inspected, { queriesUsed: plan.queries.length, elapsedMs: Date.now() - started })
  if (!result.occupancySupported) return null
  await shadow.persistObservation({ resourceId: record.canonical_uuid, field: "location_occupancy", category: "location_occupancy", currentValue: null, proposedValue: record.submitted_address, risk: "medium", recommendation: "auto_accept", confidence: "high", reasonCodes: result.claim.reasonCodes, engineVersion: plan.version, summary: "Bounded publication-feed research found authoritative program-specific occupancy evidence.", evidence: inspected.filter((item) => item.classification.program_relationship_verified).map((item) => item.evidence) })
  const refreshedClaims = await query(db.from("resource_fact_claims").select("*").eq("resource_id", record.canonical_uuid).eq("decision_category", "location_occupancy")), claimIds = refreshedClaims.map((item) => item.id)
  const refreshedEvidence = claimIds.length ? await query(db.from("resource_fact_evidence").select("*").in("claim_id", claimIds)) : []
  return { claims: refreshedClaims, evidence: refreshedEvidence }
}
for (const { context } of selected) results.push({ id: context.resource.id, name: context.resource.display_name, result: await processPublicationFeedItem({ runId: run.data.id, context, db, geocode: requestBcAddressGeocode, research, actorId: actor.id }) })
await db.from("publication_feed_runs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", run.data.id)
console.log(JSON.stringify({ mode: "production_private_publication_feed", run_id: run.data.id, processed: results.length, results, human_qc_created: 0, locations_created: 0, pins_published: 0 }, null, 2))
