import test from "node:test"
import assert from "node:assert/strict"
import { classifySecurityMaintenance, recoverStaleSecurityPulseRun, staleSecurityPulseNeed } from "../server/maintenanceSecurity.js"

const now = Date.parse("2026-08-23T12:00:00Z")
test("only a stale private Security Pulse ledger is Tier-1 repairable", async () => {
  const run = { id: "pulse", status: "running", started_at: "2026-08-23T11:40:00Z" }
  assert.equal(staleSecurityPulseNeed({ ...run, status: "completed" }, now), null)
  const result = await recoverStaleSecurityPulseRun({ run, now, store: { fail: async () => {}, inspectRun: async () => ({ id: "pulse", status: "failed", completeness: "failed", completed_at: new Date(now).toISOString() }) } })
  assert.equal(result.verified, true)
  assert.equal(classifySecurityMaintenance({ pulse: run, now }).healing_needs[0].action_id, "recover_stale_security_pulse_run")
})

test("security findings stay recommendation or human action, never autonomous remediation", () => {
  const result = classifySecurityMaintenance({ pulse: { id: "done", status: "completed", started_at: new Date(now).toISOString() }, findings: [{ id: "high", severity: "high", lifecycle: "recurring", recommended_action: "Review authentication policy." }, { id: "expected", severity: "low", lifecycle: "expected_behavior" }], now })
  assert.equal(result.healing_needs.length, 0)
  assert.equal(result.items.find((item) => item.id === "security_finding:high").classification, "human_action_required")
  assert.equal(result.items.find((item) => item.id === "security_finding:expected").classification, "informational")
})
