import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { buildAutoPublicationPreview, buildLocationReconciliation, isVirtualOrMobileResource } from "../server/mapPopulation.js"

const resource = { id: "00000000-0000-0000-0000-000000000001", display_name: "Public Clinic", lifecycle_state: "active", editorial_status: "approved" }
const location = { id: "00000000-0000-0000-0000-000000000002", resource_id: resource.id, location_type: "fixed", street_address: "100 Main St", city: "Vancouver", latitude: 49.28, longitude: -123.1, geocode_status: "verified", review_status: "approved", public_map: true }

test("approved public locations reconcile to one address pin", () => {
  const rows = buildLocationReconciliation({ locations: [location], registry: [resource], aliases: [{ resource_id: resource.id, source_type: "curated_bundle", source_native_id: "curated:test" }], curatedIds: new Set(["curated:test"]) })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].appears_in_public_map_query, true)
  assert.equal(rows[0].shared_address_service_count, 1)
})

test("multiple independently approved services can share one numbered pin", () => {
  const other = { ...resource, id: "00000000-0000-0000-0000-000000000003", display_name: "Second Program" }
  const rows = buildLocationReconciliation({ locations: [location, { ...location, id: "00000000-0000-0000-0000-000000000004", resource_id: other.id }], registry: [resource, other], aliases: [{ resource_id: resource.id, source_type: "curated_bundle", source_native_id: "curated:a" }, { resource_id: other.id, source_type: "curated_bundle", source_native_id: "curated:b" }], curatedIds: new Set(["curated:a", "curated:b"]) })
  assert.equal(new Set(rows.map((item) => item.shared_address_group)).size, 1)
  assert.equal(rows.every((item) => item.shared_address_service_count === 2), true)
})

test("preview is read-only, repeatable, and honors manual exclusion", () => {
  const candidate = { canonical_uuid: resource.id, resource_name: resource.display_name, submitted_address: "100 Main St", returned_address: "100 Main Street", coordinates: { latitude: 49.28, longitude: -123.1 }, tier: "A", score: 100, program_occupancy_confidence: "supported", public_map: false, policy_version: "test", sensitivity_flags: [], conflicts: [], failed_hard_gates: [], warnings: [], provider: "bc", precision: "civic_number", location_descriptor: "parcelpoint" }
  const first = buildAutoPublicationPreview({ automationRecords: [candidate], registry: [resource] })
  const second = buildAutoPublicationPreview({ automationRecords: [candidate], registry: [resource] })
  assert.deepEqual(first, second)
  assert.equal(first.writes_performed, false)
  assert.equal(first.counts.eligible, 1)
  const excludedLocation = { ...location, review_status: "excluded", public_map: false }
  const excluded = buildAutoPublicationPreview({ automationRecords: [candidate], registry: [resource], locations: [excludedLocation] })
  assert.equal(excluded.items[0].outcome, "excluded")
  assert.match(excluded.items[0].reasons.join(" "), /human_decision/)
})

test("confidential and virtual or mobile services are never eligible", () => {
  assert.equal(isVirtualOrMobileResource({ description: "Telephone and mobile outreach" }), true)
  const candidate = { canonical_uuid: resource.id, resource_name: "Confidential Shelter", tier: "A", score: 100, program_occupancy_confidence: "supported", coordinates: { latitude: 49.2, longitude: -123.1 }, public_map: false, sensitivity_flags: ["confidential"], conflicts: [] }
  const preview = buildAutoPublicationPreview({ automationRecords: [candidate], registry: [resource] })
  assert.equal(preview.items[0].outcome, "excluded")
})

test("admin preview endpoints are protected and expose no execution route", () => {
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  assert.match(server, /app\.get\("\/api\/admin\/map-population", requireAdmin/)
  assert.match(server, /app\.post\("\/api\/admin\/map-population\/preview", requireAdmin/)
  assert.doesNotMatch(server, /app\.post\("\/api\/admin\/map-population\/(?:execute|publish)/)
})
