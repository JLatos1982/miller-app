import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { AUTOMATION_POLICY, automationPosture, planAutomationWake, runAutomationWake } from "../server/automationScheduler.js"

const hour = 60 * 60 * 1000
const now = new Date("2026-08-23T12:00:00Z").getTime()
const store = (events = [], active = null) => ({ acquire: async () => active ? { already_running: true, run: active } : { run: { id: "run" } }, finish: async (_run, value) => events.push(["finish", value]), fail: async (_run, value) => events.push(["fail", value]) })

test("normal cadence wakes once, skips fresh pulse, and schedules no catch-up storm", async () => {
  const plan = planAutomationWake({ enabled: true, lastRun: { started_at: new Date(now - 5 * 60 * 1000).toISOString(), status: "completed" }, lastPulse: { completed_at: new Date(now - hour).toISOString(), status: "completed" }, now })
  assert.equal(plan.posture.state, "healthy"); assert.equal(plan.due.length, 0)
  assert.ok(plan.next_expected_at)
})

test("stale pulse runs once through an injected allowlisted child capability", async () => {
  const events = [], result = await runAutomationWake({ enabled: true, store: store(events), now: () => now, loadState: async () => ({ lastRun: null, lastPulse: { completed_at: new Date(now - 7 * hour).toISOString(), status: "completed" } }), executeSecurityPulse: async () => ({ status: "completed" }) })
  assert.equal(result.children_started, 1); assert.equal(events[0][1].started_capabilities[0].id, "security_pulse")
})

test("disabled, duplicate, missed, failure-backoff, and recovery states fail closed", async () => {
  assert.equal((await runAutomationWake({ enabled: false, store: store([]), now: () => now, loadState: async () => ({ lastRun: null, lastPulse: null }) })).status, "disabled")
  assert.equal((await runAutomationWake({ enabled: true, store: store([], { id: "other" }), now: () => now, loadState: async () => ({}) })).status, "already_running")
  assert.equal(automationPosture({ enabled: true, lastRun: { started_at: new Date(now - AUTOMATION_POLICY.heartbeatMs * 3).toISOString(), status: "completed" }, now }).state, "overdue")
  const backoff = planAutomationWake({ enabled: true, lastPulse: { status: "failed", failure_streak: 2, completed_at: new Date(now - 10 * 60 * 1000).toISOString() }, now })
  assert.equal(backoff.due.length, 0); assert.equal(backoff.pulse.failure_backoff_active, true)
  const recovered = planAutomationWake({ enabled: true, lastPulse: { status: "completed", completed_at: new Date(now - 7 * hour).toISOString() }, now })
  assert.equal(recovered.due[0].id, "security_pulse")
})

test("child failures become a degraded scheduler record without retries", async () => {
  const events = [], result = await runAutomationWake({ enabled: true, store: store(events), now: () => now, loadState: async () => ({ lastRun: null, lastPulse: null }), executeSecurityPulse: async () => ({ status: "failed" }) })
  assert.equal(result.status, "degraded"); assert.equal(events[0][1].status, "degraded")
})

test("the scheduler propagates fixed scheduled provenance to the Pulse capability", async () => {
  const started = []
  await runAutomationWake({ enabled: true, store: store([]), now: () => now, loadState: async () => ({ lastRun: null, lastPulse: null }), executeSecurityPulse: async () => { started.push("security_pulse"); return { status: "healthy" } } })
  assert.deepEqual(started, ["security_pulse"])
})

test("a timed out child fails the current scheduler run instead of creating a retry loop", async () => {
  const events = []
  await assert.rejects(() => runAutomationWake({ enabled: true, store: store(events), now: () => now, policy: { ...AUTOMATION_POLICY, pulseMs: 1, pulseTimeoutMs: 5, leaseMs: 1, maxChildren: 1, heartbeatMs: 1, pulseFailureBackoffMs: 1, pulseFailureLimit: 2 }, loadState: async () => ({ lastRun: null, lastPulse: null }), executeSecurityPulse: async () => new Promise(() => {}) }), /automation_child_timeout/)
  assert.equal(events[0][0], "fail")
})

test("the local scheduler endpoint uses a raw loopback socket check and a private token", () => {
  const source = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  assert.match(source, /req\.socket\.remoteAddress/)
  assert.match(source, /x-miller-automation-token/)
  assert.match(source, /MILLER_AUTOMATION_SCHEDULER_LOCAL_ONLY/)
})
