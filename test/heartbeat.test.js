import test from "node:test"
import assert from "node:assert/strict"
import { HEARTBEAT_MODES, planGrowthOpportunities, researchEffectiveness, runHeartbeatCycle, selectHeartbeatTasks } from "../server/heartbeat.js"

const task = (id, priority = 75) => ({ task_id: id, resource_id: "r", claim_id: "c", task_type: "verify_programme_at_site", priority, actionable: true, blockers: [], previous_attempts: 0 })
const inspection = (tasks = [], findings = []) => ({ planner: { tasks }, health: { findings, summary: { knowledge_findings: 1, security_findings: findings.length } } })
test("inspection-only is deterministic and performs no work", async () => {
  let executed = 0
  const result = await runHeartbeatCycle({ mode: HEARTBEAT_MODES.INSPECT_ONLY, actorId: "actor", inspect: async () => inspection([task("b"), task("a")]), executeTask: async () => { executed += 1 } })
  assert.equal(executed, 0); assert.equal(result.stop_reason, "inspect_only"); assert.deepEqual(result.selected_task_ids, ["a", "b"])
})
test("maintenance respects two-task budget and never recursively starts a cycle", async () => {
  let executed = 0
  const result = await runHeartbeatCycle({ mode: HEARTBEAT_MODES.MAINTENANCE, actorId: "actor", inspect: async () => inspection([task("a", 90), task("b", 80), task("c", 70)]), executeTask: async () => ({ outcome: ++executed === 1 ? "resolved" : "unchanged", sources_considered: 1 }) })
  assert.equal(executed, 2); assert.equal(result.tasks_considered, 3); assert.equal(result.stop_reason, "maintenance_budget_exhausted")
})
test("human, protected, no-gain, stale, and critical-security work fail closed", async () => {
  const blocked = [{ ...task("human"), actionable: false }, { ...task("blocked"), blockers: ["sensitive_or_protected_location"] }, { ...task("no-gain"), previous_attempts: 2 }, { ...task("entity"), task_type: "investigate_entity_relationship" }]
  assert.deepEqual(selectHeartbeatTasks(blocked), [])
  let executed = 0
  const result = await runHeartbeatCycle({ mode: HEARTBEAT_MODES.MAINTENANCE, actorId: "actor", inspect: async () => inspection([task("a")], [{ domain: "system", severity: "critical" }]), executeTask: async () => { executed += 1 } })
  assert.equal(result.stop_reason, "security_halt"); assert.equal(executed, 0)
})
test("growth planning is read-only and research observations cannot alter policy", () => {
  const growth = planGrowthOpportunities({ resources: [{ id: "r" }], candidates: [{ id: "x", review_status: "pending", location_disclosure_status: "public", community: "Surrey" }] })
  assert.equal(growth[0].requires_human_authorization, true); assert.equal(growth[0].read_only, true)
  assert.match(researchEffectiveness([{ task_type: "verify_programme_at_site", outcome: "unchanged" }, { task_type: "verify_programme_at_site", outcome: "unchanged" }, { task_type: "verify_programme_at_site", outcome: "unchanged" }])[0].recommendation, /human review/)
})
