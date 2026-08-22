import test from "node:test"
import assert from "node:assert/strict"
import { NEXT_BEST_ACTIONS, selfAuditNextActions } from "../server/selfAudit.js"

test("Moving Forward-style uncertain identity is retained separately and asks for relationship evidence, not geocoding", () => {
  const report = selfAuditNextActions({ resources: [{ id: "surrey", lifecycle_state: "active", editorial_status: "approved" }, { id: "other", lifecycle_state: "active", editorial_status: "approved" }], claims: [{ id: "c", resource_id: "surrey", field_name: "location_occupancy", proposed_value: "100 Main", status: "observed" }], evidence: [{ claim_id: "c", source_url: "https://mffs.example", source_authority: 95, stale: false }], qc: [{ canonical_resource_id: "surrey" }], matchCandidates: [{ left_resource_id: "surrey", right_resource_id: "other", classification: "possible", decision: "pending" }] })
  const surrey = report.find((item) => item.resource_id === "surrey")
  assert.equal(surrey.recommended_next_action, NEXT_BEST_ACTIONS.INVESTIGATE_ENTITY_RELATIONSHIP)
  assert.equal(surrey.current_state.has_qc, true)
  assert.equal(surrey.read_only, true)
})
test("conflicts, missing authoritative programme evidence, stale evidence, and wasteful retries have explainable actions", () => {
  const resources = ["conflict", "missing", "stale", "retry"].map((id) => ({ id, lifecycle_state: "active", editorial_status: "approved" }))
  const claims = ["a", "b"].map((id, index) => ({ id, resource_id: "conflict", field_name: "location_occupancy", proposed_value: `${index + 1} Main`, status: "observed" })).concat([{ id: "m", resource_id: "missing", field_name: "location_occupancy", proposed_value: "3 Main", status: "observed" }, { id: "s", resource_id: "stale", field_name: "location_occupancy", proposed_value: "4 Main", status: "observed" }])
  const evidence = [{ claim_id: "a", source_url: "https://a.example", source_authority: 95, stale: false }, { claim_id: "b", source_url: "https://b.example", source_authority: 95, stale: false }, { claim_id: "s", source_url: "https://s.example", source_authority: 95, stale: true }]
  const actions = new Map(selfAuditNextActions({ resources, claims, evidence, researchItems: [{ resource_id: "retry", outcome: "failed" }, { resource_id: "retry", outcome: "insufficient" }] }).map((item) => [item.resource_id, item.recommended_next_action]))
  assert.equal(actions.get("conflict"), NEXT_BEST_ACTIONS.RESOLVE_ADDRESS_CONFLICT)
  assert.equal(actions.get("missing"), NEXT_BEST_ACTIONS.FIND_PROGRAMME_AT_SITE)
  assert.equal(actions.get("stale"), NEXT_BEST_ACTIONS.RECONFIRM_STALE_EVIDENCE)
  assert.equal(actions.get("retry"), NEXT_BEST_ACTIONS.STOP_RETRYING)
})
