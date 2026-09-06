import assert from "node:assert/strict"
import test from "node:test"
import benchmark from "../artifacts/miller-north/indigenous-healthcare-accountability-benchmark-2026-09-05.json" with { type: "json" }
import peopleReview from "../artifacts/miller-north/indigenous-healthcare-accountability-public-people-review-2026-09-05.json" with { type: "json" }
import { ACCOUNTABILITY_ACTION_TYPES, ACCOUNTABILITY_STAGES, ACTION_SOURCE_ROLES, assertPrivateAccountabilityPayload, buildAccountabilityFixtureBatch, normalizeBenchmarkAccountabilityRecord, validateAccountabilityFixtureBatch } from "../server/millerNorthAccountabilityActions.js"

test("all 37 accountability benchmark candidates fit the private action model", () => {
  const result = validateAccountabilityFixtureBatch({ records: benchmark.records })
  assert.equal(result.batch.length, 37)
  assert.equal(result.counts.rejected, 0)
  assert.equal(result.counts.ambiguous, 0)
  assert.equal(result.counts.requiring_owner_review, 6)
  assert.ok(result.counts.compatible_after_normalization > 0)
  assert.ok(result.chain_count < result.batch.length)
  assert.ok(result.multi_stage_chain_count >= 3)
})

test("normalization preserves conservative stages, source roles and private publication gates", () => {
  const lawsuit = normalizeBenchmarkAccountabilityRecord(benchmark.records.find(record => record.proposed_record_id === "iha_ab_011"))
  assert.equal(lawsuit.action.action_type, "legal_human_rights_process")
  assert.equal(lawsuit.action.accountability_stage, "allegation")
  assert.equal(lawsuit.action.implementation_status, "outcome_not_public")
  assert.equal(lawsuit.action.publication_state, "owner_review_required")
  assert.ok(lawsuit.sources.every(source => ACTION_SOURCE_ROLES.has(source.source_role)))
  assert.throws(() => assertPrivateAccountabilityPayload({ ...lawsuit.action, publication_state: "approved_for_publication" }), /owner_review_gate/)
})

test("action identifiers, normalized enums and deduplication are deterministic", () => {
  const [first] = buildAccountabilityFixtureBatch({ records: [benchmark.records[0]] })
  assert.match(first.action.accountability_action_id, /^maa_[a-f0-9]{24}$/)
  assert.ok(ACCOUNTABILITY_ACTION_TYPES.has(first.action.action_type))
  assert.ok(ACCOUNTABILITY_STAGES.has(first.action.accountability_stage))
  assert.throws(() => buildAccountabilityFixtureBatch({ records: [benchmark.records[0], benchmark.records[0]] }), /duplicate_action/)
})

test("anonymized accountability material never becomes a named person payload", () => {
  const anonymous = normalizeBenchmarkAccountabilityRecord(benchmark.records.find(record => record.proposed_record_id === "iha_sk_007"))
  assert.equal(anonymous.action.accountability_stage, "finding")
  assert.match(anonymous.action.triggering_incident_summary, /Indigenous patient/i)
  assert.equal(Object.hasOwn(anonymous.action, "public_case_name"), false)
  assert.equal(Object.hasOwn(anonymous.action, "patient_name"), false)
})

test("public-role people candidates are deduplicated and held outside production", () => {
  const names = peopleReview.candidates.map(person => person.public_name.toLowerCase())
  assert.equal(new Set(names).size, names.length)
  assert.equal(peopleReview.summary.newly_added, 0)
  assert.ok(peopleReview.candidates.every(person => person.decision === "owner_review_candidate" && /^https:\/\//.test(person.source_url)))
})
