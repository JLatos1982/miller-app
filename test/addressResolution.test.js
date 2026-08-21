import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { buildAddressResolutionReport, confidenceRecommendation, runBoundedResolutionBatch } from "../server/addressResolution.js"

const evidence = { canonical_uuid: "a", resource_name: "Public clinic", proposed_address: "10 Main St", municipality: "Vancouver", authoritative: true, program_relationship_verified: true, sensitivity_flags: [], conflicts: [], retrieval_date: "2026-08-20", source_type: "first_party" }
const geocode = { canonical_uuid: "a", returned_address: "10 Main St, Vancouver, BC", score: 100, precision: "civic_number", location_descriptor: "parcelpoint", coordinates: { latitude: 49.2, longitude: -123.1 }, program_occupancy_confidence: "supported", tier: "A", warnings: [], shared_address_count: 1, public_map: false }

test("official occupancy plus exact geocoder evidence becomes a strong human-review recommendation", () => {
  assert.equal(confidenceRecommendation(evidence, geocode).confidence, "very_strong")
  assert.equal(confidenceRecommendation({ ...evidence, authoritative: false }, { ...geocode, program_occupancy_confidence: "unverified" }).recommendation, "do_not_publish")
})
test("conflicts, shared services, and private or non-fixed programs stay out of automatic publication", () => {
  assert.equal(confidenceRecommendation({ ...evidence, conflicts: ["official_sources_disagree"] }, geocode).confidence, "needs_review")
  assert.equal(confidenceRecommendation({ ...evidence, facility_type: "Confidential shelter", sensitivity_flags: ["confidential"] }, geocode).recommendation, "exclude_from_mapping")
  assert.equal(confidenceRecommendation({ ...evidence, facility_type: "Virtual counselling", proposed_address: "" }, null).recommendation, "exclude_from_mapping")
})
test("bounded batches are deterministic, concurrent, cached, and idempotent", async () => {
  const items = [{ ...evidence, canonical_uuid: "b" }, evidence], cache = new Map(); let calls = 0
  const resolve = async (item) => { calls++; return item.canonical_uuid }
  const first = await runBoundedResolutionBatch(items, { resolve, cache, concurrency: 2 })
  const second = await runBoundedResolutionBatch(items, { resolve, cache, concurrency: 2 })
  assert.deepEqual(first.results, ["a", "a"]); assert.deepEqual(second.results, first.results); assert.equal(calls, 1)
  assert.equal(first.publication_changed, false); assert.equal(first.writes_performed, false)
})
test("address-resolution reporting cannot create a public pin", () => {
  const report = buildAddressResolutionReport({ inventory: { canonical_total: 2, records: [evidence] }, geocoded: { records: [geocode] }, publicLocationCount: 0 })
  assert.equal(report.strong_administrator_review_candidates, 1); assert.equal(report.records[0].public_map, false); assert.equal(report.publication_changed, false); assert.equal(report.writes_performed, false)
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8"), section = server.slice(server.indexOf('app.get("/api/admin/address-resolution"'), server.indexOf('app.post("/api/admin/address-evidence'))
  assert.match(section, /requireAdmin/); assert.doesNotMatch(section, /\.insert\(|\.update\(|\.upsert\(|public_map:\s*true/)
})
