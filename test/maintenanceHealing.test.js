import test from "node:test"
import assert from "node:assert/strict"
import { HEALING_ACTIONS, recoverStaleMaintenanceCycle, staleCycleNeed } from "../server/maintenanceHealing.js"
const now = Date.parse("2026-08-23T12:00:00Z")
test("only a provably stale running cycle is eligible for the fixed Tier-1 recovery", async () => { const cycle = { id: "cycle", status: "running", started_at: new Date(now - 21 * 60 * 1000).toISOString() }; assert.equal(staleCycleNeed({ ...cycle, status: "completed" }, now), null); const result = await recoverStaleMaintenanceCycle({ cycle, now, store: { fail: async () => ({ status: "failed", completed_at: new Date(now).toISOString(), phase: "idle" }) } }); assert.equal(result.classification, "resolved"); assert.equal(HEALING_ACTIONS.recover_stale_maintenance_cycle.tier, 1) })
test("a lesson cannot alter the registry authority tier", () => { assert.equal(HEALING_ACTIONS.recover_stale_maintenance_cycle.tier, 1); assert.ok(!Object.values(HEALING_ACTIONS).some((item) => item.tier > 1)) })
