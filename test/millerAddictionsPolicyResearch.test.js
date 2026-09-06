import assert from "node:assert/strict"
import test from "node:test"
import benchmark from "../artifacts/miller/miller-addictions-policy-law-government-benchmark-2026-09-05.json" with { type: "json" }
import {
  ADDICTIONS_COMMITMENT_TYPES,
  ADDICTIONS_INSTRUMENT_TYPES,
  MILLER_ADDICTIONS_DOMAIN,
  assertPrivateMillerAddictionsPayload,
  validateMillerAddictionsPolicyFixture,
} from "../server/millerAddictionsPolicyResearch.js"

test("73 addictions policy candidates remain private, official-source fixtures", () => {
  const result = validateMillerAddictionsPolicyFixture(benchmark)
  assert.deepEqual(result.counts, {
    total: 73,
    chains: 21,
    official_primary_source: 73,
    independently_corroborated: 0,
    owner_review_required: 6,
    commitments: 30,
    resource_links: 15,
  })
  assert.ok(result.records.every(item => item.instrument.research_domain === MILLER_ADDICTIONS_DOMAIN))
  assert.ok(result.records.every(item => ADDICTIONS_INSTRUMENT_TYPES.has(item.instrument.instrument_type)))
  assert.ok(result.records.every(item => item.instrument.publication_state !== "approved_for_publication"))
})

test("commitments preserve separate owners, statuses, and review gates", () => {
  const result = validateMillerAddictionsPolicyFixture(benchmark)
  assert.ok(result.commitments.every(item => ADDICTIONS_COMMITMENT_TYPES.has(item.commitment_type)))
  assert.ok(result.commitments.every(item => item.source_references.length >= 1))
  assert.ok(result.commitments.some(item => item.responsible_organizations.length > 1))
  assert.equal(result.commitments.filter(item => item.repeat_recommendation_flag).length, 7)
  assert.equal(result.commitments.filter(item => item.owner_review_flag).length, 9)
  assert.equal(result.commitments.filter(item => item.implementation_status === "implemented").length, 8)
  assert.equal(result.commitments.filter(item => item.implementation_status === "partially_implemented").length, 12)
  assert.equal(result.commitments.filter(item => item.implementation_status === "implementation_underway").length, 6)
  assert.equal(result.commitments.filter(item => item.implementation_status === "no_clear_evidence_found").length, 3)
})

test("policy-to-service links remain candidates until canonical IDs resolve", () => {
  const result = validateMillerAddictionsPolicyFixture(benchmark)
  assert.equal(result.resource_links.length, 15)
  assert.ok(result.resource_links.every(link => link.canonical_resource_id === null))
  assert.ok(result.resource_links.every(link => link.owner_review_flag && link.publication_state === "owner_review_required"))
  assert.ok(result.resource_links.some(link => link.resource_candidate_name === "Creekside Withdrawal Management Centre" && link.service_quantity === 10))
})

test("owner review blocks approval and domain separation is enforced", () => {
  const result = validateMillerAddictionsPolicyFixture(benchmark)
  const reviewItem = result.records.find(item => item.instrument.owner_review_flag).instrument
  assert.equal(assertPrivateMillerAddictionsPayload(reviewItem), true)
  assert.throws(() => assertPrivateMillerAddictionsPayload({ ...reviewItem, publication_state: "approved_for_publication" }), /owner_review_gate/)
  assert.throws(() => validateMillerAddictionsPolicyFixture({ ...benchmark, records: [{ ...benchmark.records[0], research_domain: "miller_north" }] }), /domain_invalid/)
})

test("duplicate instruments and unsafe personal fields are rejected", () => {
  assert.throws(() => validateMillerAddictionsPolicyFixture({ ...benchmark, records: [benchmark.records[0], benchmark.records[0]] }), /duplicate_instrument/)
  assert.throws(() => validateMillerAddictionsPolicyFixture({ ...benchmark, records: [{ ...benchmark.records[0], patient_name: "Do not store" }] }), /private_field/)
})

test("amendment and supersession histories are represented explicitly", () => {
  const result = validateMillerAddictionsPolicyFixture(benchmark)
  const relationships = result.records.flatMap(item => item.relationships)
  assert.ok(relationships.some(item => item.relationship_type === "amends"))
  assert.ok(relationships.some(item => item.relationship_type === "supersedes"))
  const decrim = result.records.filter(item => item.instrument.policy_chain_id === "mapc_decriminalization")
  assert.ok(decrim.length >= 5)
})
