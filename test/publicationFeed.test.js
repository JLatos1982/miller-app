import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { publicationFeedAssessment, rankPublicationFeedCandidates, synthesizeAuthoritativeOccupancyChain } from "../server/publicationFeed.js"

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

const inspected = ({ domain, type = "first_party", matched = "", operatorMatched = false, addressMatched = false, text = "", authoritative = true }) => ({
  source: { domain, type, authoritative }, identity: { matched, operatorMatched, addressMatched }, text,
  evidence: { sourceType: type, sourceAuthority: type === "established_directory" ? 60 : 95, url: `https://${domain}/page`, value: "unverified" }
})

test("synthesizes an official programme page and a same-publisher service location", () => {
  const result = synthesizeAuthoritativeOccupancyChain({ record: { submitted_address: "100 Main St, Surrey, BC" }, inspected: [
    inspected({ domain: "provider.org", matched: "Public Clinic" }),
    inspected({ domain: "provider.org", operatorMatched: true, addressMatched: true, text: "Public Clinic services at 100 Main St" })
  ] })
  assert.equal(result.supported, true)
  assert.equal(result.evidence.length, 2)
  assert.ok(result.evidence.every((item) => item.value === "100 Main St, Surrey, BC"))
})

test("allows an official programme source plus BC 211 corroboration, but not a head office", () => {
  const program = inspected({ domain: "provider.org", matched: "Public Clinic" })
  const directory = inspected({ domain: "bc.211.ca", type: "established_directory", operatorMatched: true, addressMatched: true, text: "Public Clinic at 100 Main St" })
  assert.equal(synthesizeAuthoritativeOccupancyChain({ record: { submitted_address: "100 Main St, Surrey, BC" }, inspected: [program, directory] }).supported, true)
  assert.equal(synthesizeAuthoritativeOccupancyChain({ record: { submitted_address: "100 Main St, Surrey, BC" }, inspected: [program, { ...directory, text: "Head office at 100 Main St" }] }).supported, false)
})

test("does not infer a programme location from an unrelated shared-building source", () => {
  const result = synthesizeAuthoritativeOccupancyChain({ record: { submitted_address: "100 Main St, Surrey, BC" }, inspected: [
    inspected({ domain: "provider.org", matched: "Public Clinic" }),
    inspected({ domain: "other.org", operatorMatched: true, addressMatched: true, text: "Operator services at 100 Main St" })
  ] })
  assert.equal(result.supported, false)
})

test("refreshed admin queue batches location contexts instead of querying once per resource", () => {
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  const route = server.slice(server.indexOf('app.get("/api/admin/refreshed-location-reviews"'), server.indexOf('app.post("/api/admin/refreshed-location-reviews"'))
  assert.match(server, /async function privateLocationContexts\(canonicalUuids\)/)
  assert.match(route, /privateLocationContexts\(ids\)/)
  assert.doesNotMatch(route, /Promise\.all\(ids\.map/)
})
