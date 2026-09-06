import assert from "node:assert/strict"
import test from "node:test"
import benchmark from "../artifacts/miller-north/indigenous-healthcare-accountability-benchmark-2026-09-05.json" with { type: "json" }
import tracking from "../artifacts/miller-north/indigenous-healthcare-accountability-implementation-tracking-2026-09-05.json" with { type: "json" }
import { buildAccountabilityFixtureBatch } from "../server/millerNorthAccountabilityActions.js"

test("implementation tracker covers every accountability chain without importing fixtures", () => {
  const sourceChains = new Set(benchmark.records.map(record => record.accountability_chain_id))
  const trackedChains = new Set(tracking.chain_inspection.map(item => item.accountability_chain_id))
  assert.deepEqual(trackedChains, sourceChains)
  assert.equal(tracking.chain_inspection.length, 17)
  assert.equal(tracking.tracked_items.length, 27)
  assert.ok(tracking.chain_inspection.every(item => Number.isInteger(item.tracked_item_count) && item.tracked_item_count >= 0))
  assert.match(tracking.scope, /no accountability action, incident, cohort, source, or person records? were imported or published/i)
})

test("implementation items retain normalized action identity, evidence, and conservative statuses", () => {
  const actionIds = new Set(buildAccountabilityFixtureBatch({ records: benchmark.records }).map(item => item.action.accountability_action_id))
  assert.ok(tracking.tracked_items.every(item => actionIds.has(item.originating_action_id)))
  assert.ok(tracking.tracked_items.every(item => tracking.status_vocabulary.includes(item.implementation_status)))
  assert.ok(tracking.tracked_items.every(item => item.status_sources.length > 0 && item.status_sources.every(source => /^https:\/\//.test(source.url))))
  assert.equal(tracking.tracked_items.filter(item => item.implementation_status === "implemented").length, 6)
  assert.equal(tracking.tracked_items.filter(item => item.implementation_status === "partially_implemented").length, 11)
  assert.equal(tracking.tracked_items.filter(item => item.implementation_status === "implementation_disputed").length, 0)
})

test("unresolved and anonymous material remains review-gated and non-identifying", () => {
  const reviewItems = tracking.tracked_items.filter(item => item.owner_review_flag)
  assert.equal(reviewItems.length, 7)
  assert.ok(reviewItems.every(item => item.owner_review_reason))
  const anonymous = tracking.tracked_items.find(item => item.tracking_id === "mit_sk_hrc_mediation_remedies")
  assert.ok(anonymous)
  assert.match(anonymous.responsible_organization, /unidentified/i)
  assert.doesNotMatch(JSON.stringify(anonymous), /patient_name|public_case_name|facility_name/i)
})

test("multi-recommendation action tracking proposes a private child model without a deployment", () => {
  assert.equal(tracking.proposed_model_extension.needed, true)
  assert.match(tracking.proposed_model_extension.proposal, /miller_north_accountability_commitments/)
  assert.equal(tracking.proposed_model_extension.deployment, "proposal only; no migration was created or applied in this pass")
})
