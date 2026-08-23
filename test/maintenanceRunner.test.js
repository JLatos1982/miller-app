import test from "node:test"
import assert from "node:assert/strict"
import { runMaintenanceCycle, MAX_TIER1_HEALING_ACTIONS_PER_CYCLE, selectHealingNeed } from "../server/maintenanceRunner.js"

const persistence = (calls = []) => ({ recordOutcome: async (item) => { calls.push(item); return { verification: item.verified ? "passed" : "failed" } }, updateLesson: async () => null, observeGrowth: async (item) => item })
const store = (now) => ({ start: async () => ({ cycle: { id: "new" } }), finish: async (_cycle, values) => ({ id: "new", ...values }), fail: async (cycle) => ({ id: cycle.id, status: "failed", phase: "idle", completed_at: new Date(now).toISOString() }) })

test("maintain persists one independently verified stale-cycle outcome", async () => {
  const calls = [], now = Date.parse("2026-08-23T12:00:00Z")
  const result = await runMaintenanceCycle({ mode: "maintain", now: () => now, store: store(now), snapshot: async () => ({}), findStaleCycle: async () => ({ id: "old", status: "running", started_at: "2026-08-23T11:30:00Z" }), persistence: persistence(calls) })
  assert.equal(result.outcomes[0].classification, "resolved")
  assert.equal(calls.length, MAX_TIER1_HEALING_ACTIONS_PER_CYCLE)
})

test("selection considers verified lessons without allowing them to create eligibility", () => {
  const needs = [{ id: "qc", action_id: "create_initial_machine_location_qc", target_type: "canonical_resource", value: 80 }, { id: "stale", action_id: "recover_stale_maintenance_cycle", target_type: "maintenance_cycle", value: 75 }, { id: "fake", action_id: "publish_anything", value: 1000 }]
  assert.equal(selectHealingNeed(needs, [{ scope: { action_id: "recover_stale_maintenance_cycle", target_type: "maintenance_cycle" }, status: "supported" }]).id, "stale")
  assert.notEqual(selectHealingNeed(needs, []).id, "fake")
})

test("one cycle sees healable and research-only map needs but executes at most one", async () => {
  const calls = [], now = Date.parse("2026-08-23T12:00:00Z"), item = { resource: { id: "r", display_name: "Service", lifecycle_state: "active", editorial_status: "approved" }, occupancyClaim: { id: "claim" }, geocoderEvidence: { id: "geo" }, locations: [] }
  let read = 0
  const result = await runMaintenanceCycle({ mode: "maintain", now: () => now, store: store(now), persistence: persistence(calls), snapshot: async () => ({ healing_needs: [{ id: "machine_location_qc:r", action_id: "create_initial_machine_location_qc", domain: "resource_data", target_type: "canonical_resource", target_id: "r", value: 80, expected: {}, context: item }], growth_opportunities: [{ opportunity_fingerprint: "x", domain: "resource_data", gap_type: "mapping_missing_geocoder_evidence", target_key: "resource:other", reason: "Needs research.", priority: 90, state: "candidate" }] }), db: { rpc: async () => ({ data: {}, error: null }) }, actorId: "actor", loadMachineQcState: async () => ++read === 1 ? { qc: null, location_count: 0, public_map: false } : { qc: { origin: "machine_initial", decision: "manual_review" }, location_count: 0, public_map: false } })
  assert.equal(result.outcomes.length, 1)
  assert.equal(result.growth.length, 1)
  assert.equal(calls[0].action_id, "create_initial_machine_location_qc")
})

test("preview growth persists recommendations but executes no healing", async () => {
  const now = Date.now(), result = await runMaintenanceCycle({ mode: "preview_growth", store: store(now), persistence: persistence(), snapshot: async () => ({ healing_needs: [{ id: "x", action_id: "create_initial_machine_location_qc" }], growth_opportunities: [{ opportunity_fingerprint: "g", domain: "resource_data", gap_type: "stale_website_evidence", target_key: "resource:r", reason: "Old enough to check.", priority: 60, state: "candidate" }] }) })
  assert.equal(result.outcomes.length, 0)
  assert.equal(result.growth.length, 1)
})

test("real-store ordering repairs stale ownership before opening and auditing a new cycle", async () => {
  const now = Date.parse("2026-08-23T12:00:00Z"), order = [], calls = [], stale = { id: "old", status: "running", started_at: "2026-08-23T11:30:00Z" }
  const result = await runMaintenanceCycle({ mode: "maintain", now: () => now, store: { inspectActive: async () => stale, fail: async () => { order.push("recover"); return { status: "failed", phase: "idle", completed_at: new Date(now).toISOString() } }, start: async () => { order.push("start"); return { cycle: { id: "new" } } }, finish: async (_cycle, values) => ({ id: "new", ...values }) }, persistence: persistence(calls) })
  assert.deepEqual(order, ["recover", "start"])
  assert.equal(result.outcomes[0].action_id, "recover_stale_maintenance_cycle")
  assert.equal(calls.length, 1)
})

test("security stale-run repair is selected only as one registered Tier-1 action", async () => {
  const now = Date.parse("2026-08-23T12:00:00Z"), calls = [], pulse = { id: "pulse", status: "running", started_at: "2026-08-23T11:40:00Z" }
  const result = await runMaintenanceCycle({ mode: "maintain", now: () => now, store: store(now), persistence: persistence(calls), snapshot: async () => ({ healing_needs: [{ id: "stale_security_pulse:pulse", action_id: "recover_stale_security_pulse_run", domain: "security", target_type: "security_pulse_run", target_id: "pulse", value: 90, expected: {}, context: pulse }] }), securityStore: { fail: async () => {}, inspectRun: async () => ({ id: "pulse", status: "failed", completeness: "failed", completed_at: new Date(now).toISOString() }) } })
  assert.equal(result.outcomes.length, 1)
  assert.equal(result.outcomes[0].action_id, "recover_stale_security_pulse_run")
  assert.equal(calls.length, 1)
})

test("capability gaps are persisted separately from executable work", async () => {
  const seen = [], result = await runMaintenanceCycle({ mode: "observe", store: store(Date.now()), persistence: { ...persistence(), observeCapabilityGap: async (item) => { seen.push(item); return item } }, snapshot: async () => ({ capability_gaps: [{ gap_fingerprint: "gap", subsystem: "mapping", problem_class: "missing_geocoder", target_key: "resource:r" }] }) })
  assert.equal(result.outcomes.length, 0)
  assert.equal(result.capability_gaps.length, 1)
  assert.equal(seen.length, 1)
})
