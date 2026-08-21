import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { privateLocationEligibility, privateLocationValues, sameFixedAddress } from "../server/privateLocation.js"

const resource = { id: "11111111-1111-4111-8111-111111111111", lifecycle_state: "active", editorial_status: "approved" }
const qc = { decision: "pilot_eligible", version: 2, policy_version: "policy", classification_fingerprint: "fingerprint", review_snapshot: { submitted_address: "320 7155 Kingsway", returned_address: "Unit 320, 7155 Kingsway, Burnaby, BC", locality: "Burnaby", score: 100, location_descriptor: "parcelpoint", precision: "unit", coordinates: { latitude: 49.219, longitude: -122.951 }, program_occupancy_confidence: "supported", sensitivity_flags: [], conflicts: [] } }
const evidence = [{ source_url: "https://example.org/program", source_authority: 90, stale: false }]

test("only durable human-reviewed, exact, safe candidates can create a private location", () => {
  assert.equal(privateLocationEligibility({ resource, qc, evidence }).eligible, true)
  assert.equal(privateLocationEligibility({ resource, qc: { ...qc, decision: "manual_review" }, evidence }).eligible, false)
  assert.equal(privateLocationEligibility({ resource, qc: { ...qc, review_snapshot: { ...qc.review_snapshot, sensitivity_flags: ["confidential"] } }, evidence }).eligible, false)
  assert.equal(privateLocationEligibility({ resource, qc, evidence: [] }).eligible, false)
})
test("created private location is structurally unable to publish", () => {
  const values = privateLocationValues({ resourceId: resource.id, qc, actorId: "22222222-2222-4222-8222-222222222222" })
  assert.equal(values.public_map, false); assert.equal(values.review_status, "pending"); assert.equal(values.geocode_status, "matched")
  assert.equal(sameFixedAddress(values, { street_address: "320, 7155 Kingsway", city: "Burnaby" }), true)
  assert.equal(sameFixedAddress(values, { street_address: "7155 Kingsway", city: "Burnaby" }), false)
})
test("private creation route is protected, explicit, auditable, and has no public-map mutation", () => {
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  const section = server.slice(server.indexOf('app.get("/api/admin/private-location-candidates"'), server.indexOf('app.post("/api/admin/address-evidence/bounded-approve"'))
  assert.match(section, /requireAdmin/); assert.match(section, /confirmed_private_location/); assert.match(section, /resource_location_audit/); assert.match(section, /private_location_already_exists/)
  assert.doesNotMatch(section, /public_map:\s*true/); assert.doesNotMatch(section, /review_status:\s*["']approved/)
})
