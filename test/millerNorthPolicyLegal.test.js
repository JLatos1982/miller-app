import assert from "node:assert/strict"
import test from "node:test"
import benchmark from "../artifacts/miller-north/indigenous-healthcare-policy-legal-government-benchmark-2026-09-05.json" with { type: "json" }
import tracking from "../artifacts/miller-north/indigenous-healthcare-accountability-implementation-tracking-2026-09-05.json" with { type: "json" }
import {
  BINDING_STATUSES,
  COMMITMENT_IMPLEMENTATION_STATUSES,
  POLICY_LEGAL_INSTRUMENT_TYPES,
  assertPrivatePolicyLegalPayload,
  buildCommitmentFixtureBatch,
  validateCommitmentFixtureBatch,
  validatePolicyLegalFixture,
} from "../server/millerNorthPolicyLegal.js"

test("all 27 implementation-tracking items normalize as private commitments", () => {
  const result = validateCommitmentFixtureBatch({ trackedItems: tracking.tracked_items })
  assert.equal(result.batch.length, 27)
  assert.equal(result.counts.rejected, 0)
  assert.equal(result.counts.ambiguous, 0)
  assert.equal(result.counts.owner_review_required, 7)
  assert.equal(result.repeat_recommendation_count, 4)
  assert.ok(result.batch.every(item => COMMITMENT_IMPLEMENTATION_STATUSES.has(item.commitment.implementation_status)))
  assert.ok(result.batch.every(item => item.commitment.publication_state !== "approved_for_publication"))
  assert.ok(result.batch.every(item => item.sources.length >= 2))
})

test("commitments support multiple owners, implementation sources, and bounded privacy", () => {
  const batch = buildCommitmentFixtureBatch({ trackedItems: tracking.tracked_items })
  assert.ok(batch.some(item => item.commitment.responsible_organizations.length > 1))
  assert.ok(batch.some(item => item.sources.filter(source => ["implementation", "repeat_signal"].includes(source.source_role)).length > 1))
  const anonymous = batch.find(item => item.commitment.provenance.tracking_id === "mit_sk_hrc_mediation_remedies")
  assert.ok(anonymous)
  assert.match(JSON.stringify(anonymous), /unidentified/i)
  assert.doesNotMatch(JSON.stringify(anonymous), /patient_name|complainant_name|private_address|personal_email/i)
})

test("52 policy/legal fixtures preserve instrument and binding distinctions", () => {
  const result = validatePolicyLegalFixture({ records: benchmark.records })
  assert.deepEqual(result.counts, { total: 52, official_primary_source: 52, independently_corroborated: 1, owner_review_required: 8 })
  assert.ok(result.batch.every(item => POLICY_LEGAL_INSTRUMENT_TYPES.has(item.instrument.instrument_type)))
  assert.ok(result.batch.every(item => BINDING_STATUSES.has(item.instrument.binding_status)))
  assert.ok(result.batch.every(item => item.instrument.publication_state !== "approved_for_publication"))
  assert.ok(result.batch.some(item => item.instrument.binding_status === "binding"))
  assert.ok(result.batch.some(item => item.instrument.binding_status === "non_binding"))
  assert.ok(result.batch.some(item => item.instrument.binding_status === "mixed"))
  assert.ok(result.batch.some(item => item.instrument.binding_status === "unknown"))
})

test("owner review blocks policy/legal publication approval", () => {
  const { batch } = validatePolicyLegalFixture({ records: benchmark.records })
  const reviewItem = batch.find(item => item.instrument.owner_review_flag).instrument
  assert.equal(assertPrivatePolicyLegalPayload(reviewItem), true)
  assert.throws(() => assertPrivatePolicyLegalPayload({ ...reviewItem, publication_state: "approved_for_publication" }), /owner_review_gate/)
})

test("deterministic duplicate prevention rejects duplicate policy candidates", () => {
  assert.throws(() => validatePolicyLegalFixture({ records: [benchmark.records[0], benchmark.records[0]] }), /duplicate/)
})
