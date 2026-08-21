import test from "node:test"
import assert from "node:assert/strict"
import { publicationFeedAssessment, rankPublicationFeedCandidates } from "../server/publicationFeed.js"

const resource = (overrides = {}) => ({ id: "00000000-0000-0000-0000-000000000001", display_name: "Public Clinic", lifecycle_state: "active", editorial_status: "approved", ...overrides })
const claim = { id: "c1", proposed_value: "100 Main St, Surrey, BC", recommendation: "auto_accept", confidence: "high", last_observed_at: "2026-08-01" }
const evidence = [{ claim_id: "c1", source_url: "https://example.gov.bc.ca/clinic", source_authority: 95, stale: false }]
const snapshot = { submitted_address: claim.proposed_value, returned_address: claim.proposed_value, locality: "Surrey", score: 100, location_descriptor: "parcelpoint", coordinates: { latitude: 49.1, longitude: -122.8 }, program_occupancy_confidence: "supported", sensitivity_flags: [], conflicts: [] }

test("blocker distance prioritizes complete safe packages and routes human QC", () => {
  const context = { resource: resource(), claims: [claim], evidence, qc: { decision: "manual_review", review_snapshot: snapshot }, locations: [] }
  assert.equal(publicationFeedAssessment(context).outcome, "one_confirmation_away")
  assert.equal(rankPublicationFeedCandidates([context], 10).length, 1)
})

test("already published and confidential resources fail closed", () => {
  assert.equal(publicationFeedAssessment({ resource: resource(), claims: [claim], evidence, locations: [{ location_type: "fixed", public_map: true }] }).outcome, "already_published")
  assert.equal(publicationFeedAssessment({ resource: resource({ display_name: "Confidential safe home" }), claims: [claim], evidence, locations: [] }).outcome, "not_map_eligible")
})

test("complete evidence without geocoder or QC reports both machine blockers", () => {
  const result = publicationFeedAssessment({ resource: resource(), claims: [claim], evidence, locations: [] })
  assert.deepEqual(result.reasons, ["bc_geocoder_package_required", "machine_qc_required"])
})
