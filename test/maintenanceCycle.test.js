import test from "node:test"
import assert from "node:assert/strict"
import { MAINTENANCE_RHYTHM, orientMaintenanceCycle, reflectMaintenanceCycle } from "../server/maintenanceCycle.js"

test("maintenance orientation is bounded, deterministic, and cannot execute work", () => {
  const result = orientMaintenanceCycle({ heartbeat: { status: "review_required" }, guidance: { pulse: { freshness: "stale" }, domains: { security: "stale", public_health: "stale" } }, sensors: [{ id: "health", status: "stale" }], planner: { audit_findings: [{ resource_id: "r1", issue_type: "authoritative_address_conflict", recommended_next_action: "human_review" }] } })
  assert.equal(result.phase, "orienting")
  assert.equal(result.scheduling, "not_enabled")
  assert.ok(result.needs.every((item) => item.executable === false))
  assert.equal(result.needs[0].severity, "high")
})

test("reflection retains only verified outcome lessons and never claims repair on failure", () => {
  const reflection = reflectMaintenanceCycle({ orientation: { needs: [{ id: "a" }] }, outcomes: [{ operation_id: "a", verification: "passed" }, { operation_id: "b", verification: "failed" }] })
  assert.equal(reflection.status, "partial")
  assert.equal(reflection.outcomes.verified, 1)
  assert.match(reflection.lessons[1].lesson, /do not infer repair/)
  assert.equal(MAINTENANCE_RHYTHM.working.mutation, "policy_controlled")
})
