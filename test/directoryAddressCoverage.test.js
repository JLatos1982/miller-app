import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { buildDirectoryCoverageReport, rankAdministratorQueue, reconcileAddressEvidence, triageDirectory } from "../server/directoryAddressCoverage.js"

const registry = [
  { id: "a", display_name: "Exact Clinic", lifecycle_state: "active", editorial_status: "approved" },
  { id: "b", display_name: "Changed Clinic", lifecycle_state: "active", editorial_status: "approved" },
  { id: "c", display_name: "Virtual Support", lifecycle_state: "active", editorial_status: "approved" },
  { id: "d", display_name: "New Counselling Centre", lifecycle_state: "active", editorial_status: "approved" },
]
const aliases = registry.map((item, index) => ({ resource_id: item.id, source_type: "curated_bundle", source_native_id: `curated:${index}` }))
const curatedResources = [
  { id: "curated:0", name: "Exact Clinic", address: "10 Main St", city: "Vancouver", serviceType: "Outpatient clinic", website: "https://clinic.example/a" },
  { id: "curated:1", name: "Changed Clinic", address: "20 New Rd", city: "Surrey", serviceType: "Clinic", website: "https://clinic.example/b" },
  { id: "curated:2", name: "Virtual Support", address: "", city: "BC", serviceType: "Virtual counselling", accessType: "online" },
  { id: "curated:3", name: "New Counselling Centre", address: "", city: "Burnaby", serviceType: "Counselling centre" },
]
const inventory = { records: [
  { canonical_uuid: "a", resource_name: "Exact Clinic", proposed_address: "10 Main St", municipality: "Vancouver", source_url: "https://clinic.example/a", authoritative: true, program_relationship_verified: true, sensitivity_flags: [], conflicts: [], retrieval_date: "2026-08-20" },
  { canonical_uuid: "b", resource_name: "Changed Clinic", proposed_address: "20 Old Rd", municipality: "Surrey", source_url: "https://clinic.example/b", authoritative: true, program_relationship_verified: true, sensitivity_flags: [], conflicts: [], retrieval_date: "2026-08-20" },
] }
const geocoded = { records: [{ canonical_uuid: "a", returned_address: "10 Main St, Vancouver, BC", score: 100, precision: "civic_number", location_descriptor: "parcelpoint", coordinates: { latitude: 49.2, longitude: -123.1 }, program_occupancy_confidence: "supported", tier: "A", warnings: [], shared_address_count: 1 }] }

test("old evidence is reused only when canonical address and source inputs are unchanged", () => {
  const result = reconcileAddressEvidence({ registry, aliases, curatedResources, inventory, geocoded })
  assert.equal(result.oldEvidenceActive, 2); assert.equal(result.reused, 1); assert.equal(result.changed, 1); assert.equal(result.newlyExamined, 2)
  assert.equal(result.active.find((item) => item.canonical_uuid === "b").changed.address, true)
})
test("triage excludes virtual resources, identifies no-address research leads, and preserves changed evidence", () => {
  const reconciliation = reconcileAddressEvidence({ registry, aliases, curatedResources, inventory, geocoded })
  const triage = triageDirectory(reconciliation)
  assert.equal(triage.records.find((item) => item.canonical_uuid === "c").category, "virtual_mobile_service_area")
  assert.equal(triage.records.find((item) => item.canonical_uuid === "d").category, "probable_fixed_address_candidate")
  assert.equal(triage.records.find((item) => item.canonical_uuid === "b").needs_reevaluation, true)
})
test("ranking is deterministic and penalizes shared or headquarters ambiguity", () => {
  const records = [{ canonical_uuid: "b", resource_name: "B", recommendation: "administrator_review", geocoder: { precision: "civic_number", score: 100 }, occupancy_supported: true, occupancy_evidence: [{ source_authority: 95 }], old_evidence: {}, geocode: { shared_address_count: 2 } }, { canonical_uuid: "a", resource_name: "A", recommendation: "administrator_review", geocoder: { precision: "civic_number", score: 100 }, occupancy_supported: true, occupancy_evidence: [{ source_authority: 95 }], old_evidence: {}, geocode: { shared_address_count: 1 } }]
  assert.deepEqual(rankAdministratorQueue(records).map((item) => item.canonical_uuid), ["a", "b"])
  assert.deepEqual(rankAdministratorQueue(records), rankAdministratorQueue(records))
})
test("research reconciliation and ranking cannot create or publish a location", () => {
  const report = buildDirectoryCoverageReport({ registry, aliases, curatedResources, inventory, geocoded })
  assert.equal(report.public_location_changes, 0); assert.equal(report.shadow_writes, 0)
  assert.equal(report.records.some((item) => item.public_map && item.category !== "already_public_mapped"), false)
  const script = fs.readFileSync(new URL("../scripts/directory-address-coverage.mjs", import.meta.url), "utf8"), server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8"), ui = fs.readFileSync(new URL("../src/map/AddressEvidenceReview.jsx", import.meta.url), "utf8")
  assert.doesNotMatch(script, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/); assert.match(script, /read-only/)
  const route = server.slice(server.indexOf('app.get("/api/admin/address-resolution"'), server.indexOf('app.post("/api/admin/address-evidence'))
  assert.match(route, /requireAdmin/); assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|public_map:\s*true/)
  assert.match(ui, /pageSize = 25/); assert.match(ui, /Previous/); assert.match(ui, /Next/); assert.match(ui, /Not public from this workflow/)
})
