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

test("orientation keeps healing, growth, and research handoffs separate", () => {
  const result = orientMaintenanceCycle({ healing_needs: [{ id: "heal", action_id: "create_initial_machine_location_qc", domain: "resource_data", severity: "medium" }], growth_opportunities: [{ opportunity_fingerprint: "gap", domain: "resource_data", reason: "Needs evidence.", priority: 80 }], research_handoffs: [{ recommendation_id: "handoff", automatic_execution: false }] })
  assert.equal(result.safe_work.length, 1)
  assert.equal(result.growth.length, 1)
  assert.equal(result.research_handoffs[0].automatic_execution, false)
  assert.ok(result.human_review.some((item) => item.id === "growth:gap"))
})
