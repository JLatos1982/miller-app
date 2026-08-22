import test from "node:test"
import assert from "node:assert/strict"
import { EVIDENCE_GAP_TASK_TYPES, planEvidenceGapWork } from "../server/evidenceGapPlanner.js"

const resource = (id, display_name = id) => ({ id, display_name, lifecycle_state: "active", editorial_status: "approved" })
test("planner prioritizes protected ambiguity and address conflict, without creating a geocode task", () => {
  const tasks = planEvidenceGapWork({ resources: [resource("protected", "Protected Transition House"), resource("conflict")], claims: [{ id: "a", resource_id: "conflict", field_name: "location_occupancy", proposed_value: "1 Main", status: "observed" }, { id: "b", resource_id: "conflict", field_name: "location_occupancy", proposed_value: "2 Main", status: "observed" }], evidence: [{ claim_id: "a", source_url: "https://a.example", source_authority: 95, stale: false }, { claim_id: "b", source_url: "https://b.example", source_authority: 95, stale: false }], auditFindings: [{ resource_id: "protected", recommended_next_action: "find_authoritative_programme_at_site", reason_codes: [] }, { resource_id: "conflict", recommended_next_action: "resolve_authoritative_address_conflict", reason_codes: ["multiple_current_authoritative_occupancy_addresses"] }] })
  assert.equal(tasks[0].task_type, EVIDENCE_GAP_TASK_TYPES.SAFETY_REVIEW)
  assert.equal(tasks[0].actionable, false)
  assert.equal(tasks[1].task_type, EVIDENCE_GAP_TASK_TYPES.ADDRESS_CONFLICT)
})
test("programme gaps, stale evidence, and repeated no-gain work remain bounded and explainable", () => {
  const tasks = planEvidenceGapWork({ resources: [resource("programme"), resource("stale"), resource("retry")], claims: [{ id: "p", resource_id: "programme", field_name: "location_occupancy", status: "observed" }, { id: "s", resource_id: "stale", field_name: "location_occupancy", status: "observed" }], evidence: [{ id: "e", claim_id: "s", stale: true }], auditFindings: [{ resource_id: "programme", recommended_next_action: "find_authoritative_programme_at_site", reason_codes: ["parent_only"] }, { resource_id: "stale", recommended_next_action: "reconfirm_stale_evidence", reason_codes: ["stale_evidence_present"] }, { resource_id: "retry", recommended_next_action: "stop_retrying_no_new_evidence", reason_codes: ["repeated_unsuccessful_research"], current_state: { prior_failed_attempts: 2 } }] })
  const byId = new Map(tasks.map((task) => [task.resource_id, task]))
  assert.equal(byId.get("programme").task_type, EVIDENCE_GAP_TASK_TYPES.PROGRAMME_SITE)
  assert.match(byId.get("programme").recommended_next_investigation, /Do not geocode parent-only/)
  assert.equal(byId.get("stale").task_type, EVIDENCE_GAP_TASK_TYPES.STALE_EVIDENCE)
  assert.equal(byId.get("retry").actionable, false)
})
test("superseded conflicts and clean resources receive no task, and ordering is deterministic without writes", () => {
  const data = { resources: [resource("clean"), resource("old")], claims: [{ id: "old", resource_id: "old", field_name: "location_occupancy", status: "superseded" }], auditFindings: [{ resource_id: "clean", recommended_next_action: "no_action_needed", reason_codes: [] }, { resource_id: "old", recommended_next_action: "no_action_needed", reason_codes: [] }] }
  assert.deepEqual(planEvidenceGapWork(data), [])
  assert.deepEqual(planEvidenceGapWork(data), planEvidenceGapWork(data))
})
