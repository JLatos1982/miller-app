import test from "node:test"
import assert from "node:assert/strict"
import { normalizeSchedulerConfig, nextExpectedWake, runScheduledMaintenanceCycle, weeklyMaintenanceSummary } from "../server/maintenanceScheduler.js"

const persistence = () => ({ recordOutcome: async (item) => ({ verification: item.verified ? "passed" : "failed" }), updateLesson: async () => null, observeGrowth: async (item) => item, observeCapabilityGap: async (item) => item })
const cycleStore = () => ({ start: async (_mode, trigger_type) => ({ cycle: { id: "cycle", trigger_type } }), finish: async (_cycle, values) => ({ id: "cycle", ...values }), fail: async () => ({ status: "failed" }) })
const journal = (events = []) => ({ start: async (value) => { events.push(["start", value]); return { id: "journal" } }, finish: async (_id, value) => { events.push(["finish", value]); return value }, fail: async (_id, value) => { events.push(["fail", value]) }, updateSchedule: async (value) => { events.push(["schedule", value]) } })

test("day 1 disabled scheduled wake does not open a cycle", async () => {
  const result = await runScheduledMaintenanceCycle({ config: { enabled: false }, store: cycleStore(), journal: journal(), persistence: persistence() })
  assert.equal(result.status, "disabled")
})
test("day 1 dry run observes no safe work and completes as a no-op", async () => {
  const events = [], result = await runScheduledMaintenanceCycle({ config: { enabled: true, execution_mode: "dry_run" }, store: cycleStore(), journal: journal(events), persistence: persistence(), snapshot: async () => ({ healing_needs: [] }) })
  assert.equal(result.status, "completed"); assert.equal(result.outcomes.length, 0); assert.equal(events[1][1].verification.status, "not_applicable")
})
test("day 2 active cycle performs one eligible repair and records verification", async () => {
  const calls = [], result = await runScheduledMaintenanceCycle({ trigger: "manual_admin", config: { execution_mode: "active" }, store: cycleStore(), journal: journal(calls), persistence: persistence(), snapshot: async () => ({ healing_needs: [{ id: "security", action_id: "recover_stale_security_pulse_run", domain: "security", target_type: "security_pulse_run", target_id: "run", value: 90, context: { id: "run", status: "running", started_at: "2020-01-01T00:00:00Z" } }] }), securityStore: { fail: async () => {}, inspectRun: async () => ({ status: "failed", completeness: "failed", completed_at: "2026-01-01T00:00:00Z" }) } })
  assert.equal(result.outcomes.length, 1); assert.equal(calls[1][1].verification.status, "passed")
})
test("day 3 multiple needs still selects only one action", async () => {
  const result = await runScheduledMaintenanceCycle({ trigger: "manual_admin", config: { execution_mode: "active" }, store: cycleStore(), journal: journal(), persistence: persistence(), snapshot: async () => ({ healing_needs: [{ id: "a", action_id: "recover_stale_security_pulse_run", domain: "security", target_type: "security_pulse_run", target_id: "a", value: 90, context: { id: "a", status: "running", started_at: "2020-01-01T00:00:00Z" } }, { id: "b", action_id: "recover_stale_security_pulse_run", domain: "security", target_type: "security_pulse_run", target_id: "b", value: 80, context: { id: "b", status: "running", started_at: "2020-01-01T00:00:00Z" } }] }), securityStore: { fail: async () => {}, inspectRun: async () => ({ status: "failed", completeness: "failed", completed_at: "2026-01-01T00:00:00Z" }) } })
  assert.equal(result.outcomes.length, 1)
})
test("failed independent verification is journaled as degraded and creates no positive lesson", async () => {
  const events = [], result = await runScheduledMaintenanceCycle({ trigger: "manual_admin", config: { execution_mode: "active" }, store: cycleStore(), journal: journal(events), persistence: persistence(), snapshot: async () => ({ healing_needs: [{ id: "security", action_id: "recover_stale_security_pulse_run", domain: "security", target_type: "security_pulse_run", target_id: "run", value: 90, context: { id: "run", status: "running", started_at: "2020-01-01T00:00:00Z" } }] }), securityStore: { fail: async () => {}, inspectRun: async () => ({ status: "running", completeness: "partial", completed_at: null }) } })
  assert.equal(result.status, "degraded"); assert.equal(events[1][1].verification.status, "failed")
})
test("day 4 unsafe work is journaled as refused, day 5 gaps are persisted", async () => {
  const gaps = [], events = [], result = await runScheduledMaintenanceCycle({
    trigger: "manual_admin", config: { execution_mode: "dry_run" }, store: cycleStore(), journal: journal(events),
    persistence: { ...persistence(), observeCapabilityGap: async (item) => { gaps.push(item); return item } },
    snapshot: async () => ({ healing_needs: [], capability_gaps: [{ gap_fingerprint: "g", subsystem: "mapping", problem_class: "missing_geocoder", target_key: "resource:r" }], heartbeat: { status: "review_required" } }),
  })
  assert.equal(result.outcomes.length, 0); assert.equal(gaps.length, 1); assert.ok(events[1][1].refused.length > 0)
})
test("day 6 human-only security attention remains unacted and day 7 summary is deterministic", () => {
  const now = Date.parse("2026-08-22T12:00:00Z"), journals = [{ started_at: "2026-08-21T12:00:00Z", status: "completed", selected_action: {}, verification: { status: "not_applicable" } }, { started_at: "2026-08-20T12:00:00Z", status: "completed", selected_action: { action_id: "recover_stale_security_pulse_run" }, verification: { status: "passed" }, refused: [{ reason_code: "review_manual_security_pulse" }] }]
  assert.deepEqual(weeklyMaintenanceSummary(journals, now), { period_days: 7, cycles_attempted: 2, cycles_completed: 2, no_op_cycles: 1, tier1_actions_performed: 1, successful_verifications: 1, failed_verifications: 0, failures: 0, actions: ["recover_stale_security_pulse_run"], most_common_refusals: ["review_manual_security_pulse"] })
})
test("concurrent delivery sees the existing durable cycle and does not duplicate work", async () => {
  const result = await runScheduledMaintenanceCycle({ config: { enabled: true }, store: { inspectActive: async () => ({ id: "active", started_at: new Date().toISOString() }) }, journal: journal(), persistence: persistence() })
  assert.equal(result.status, "already_running")
})
test("failed orientation journals failure and dry-run never executes an action", async () => {
  const events = []; await assert.rejects(() => runScheduledMaintenanceCycle({ trigger: "manual_admin", config: { execution_mode: "dry_run" }, store: cycleStore(), journal: journal(events), persistence: persistence(), snapshot: async () => { throw new Error("orientation_unavailable") } }), /orientation_unavailable/)
  assert.equal(events.at(-1)[0], "fail")
})
test("config normalizes to disabled daily dry-run and timestamps are DST-safe UTC", () => {
  assert.deepEqual(normalizeSchedulerConfig({ cadence_hours: 1 }), { enabled: false, execution_mode: "dry_run", cadence_hours: 24, display_timezone: "America/Vancouver" })
  assert.equal(nextExpectedWake("2026-03-08T08:00:00Z", 24), "2026-03-09T08:00:00.000Z")
})
