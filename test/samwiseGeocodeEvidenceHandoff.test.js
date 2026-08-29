import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { classifySamwiseGeocodeEvidence, importSamwiseGeocodeEvidence, SAMWISE_MILLER_GEOCODE_EVIDENCE_V1, validateSamwiseGeocodeEvidence } from "../server/samwiseGeocodeEvidenceHandoff.js"

const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const observation = { returned_address: "323 Eighth St, New Westminster, BC", latitude: 49.206, longitude: -122.911, score: 100, precision_points: 100, precision: "civic_number", location_descriptor: "parcelpoint", civic_number: "323", street_name: "Eighth", street_type: "St", street_direction: "", locality: "New Westminster", province: "BC", postal_code: "", site_id: "last-door-site" }
const base = () => { const value = { contract: SAMWISE_MILLER_GEOCODE_EVIDENCE_V1, samwise_evidence_id: "farm_geocode_last_door", miller_resource_id: "2739fba4-51d8-5c57-b433-9e31cd99a01d", submitted_address: "323 8th Street", municipality: "New Westminster", source_address_fingerprint: "a".repeat(64), observed_at: "2026-08-29T02:07:22.685Z", provider: "bc_address_geocoder", provider_result: observation }; return { ...value, geocode_result_fingerprint: fingerprint({ submitted_address: value.submitted_address, municipality: value.municipality, provider: value.provider, provider_result: value.provider_result, observed_at: value.observed_at, source_address_fingerprint: value.source_address_fingerprint }) } }

test("strict v1 handoff accepts a complete observed provider result and Miller reruns exact-civic QC", () => {
  const result = classifySamwiseGeocodeEvidence(base())
  assert.equal(result.classified.classification, "exact_civic")
  assert.equal(result.classified.best.civic_number_match, true)
  assert.equal(result.classified.best.street_match, true)
  assert.equal(result.classified.best.municipality_match, true)
  assert.equal(result.classified.best.province_match, true)
})
test("handoff rejects unknown versions, secrets, invalid coordinates, and a forged result fingerprint", () => {
  assert.throws(() => validateSamwiseGeocodeEvidence({ ...base(), contract: "v2" }))
  assert.throws(() => validateSamwiseGeocodeEvidence({ ...base(), api_key: "nope" }))
  const bad = base(); bad.provider_result = { ...bad.provider_result, latitude: 0 }; assert.throws(() => validateSamwiseGeocodeEvidence(bad))
  assert.throws(() => validateSamwiseGeocodeEvidence({ ...base(), geocode_result_fingerprint: "0".repeat(64) }))
})
test("Miller import treats Samwise as an observer, rejects stale source evidence, and cannot publish", async () => {
  const calls = [], handoff = base(), db = { rpc: async (name, args) => { calls.push({ name, args }); return name.startsWith("persist") ? { data: { evidence_id: "evidence" } } : { data: { version: 1 } } } }
  const stale = await importSamwiseGeocodeEvidence({ db, handoff, runId: "run", occupancyClaimId: "claim", actorId: "actor", currentAddressFingerprint: "b".repeat(64) })
  assert.deepEqual(stale, { outcome: "source_address_changed", persisted: false, publication_attempted: false })
  const accepted = await importSamwiseGeocodeEvidence({ db, handoff, runId: "run", occupancyClaimId: "claim", actorId: "actor", currentAddressFingerprint: handoff.source_address_fingerprint })
  assert.equal(accepted.outcome, "exact_civic_staged_for_review")
  assert.equal(accepted.publication_attempted, false)
  assert.deepEqual(calls.map((item) => item.name), ["persist_canonical_bc_geocoder_evidence_v1", "create_machine_initial_location_qc_from_evidence"])
})
