import test from "node:test"
import assert from "node:assert/strict"
import { createPlannerTaskExecutor, PLANNER_TASK_RESEARCH_BUDGET, validatePlannerTaskRequest } from "../server/plannerTaskExecutor.js"

const resourceId = "11111111-1111-4111-8111-111111111111", claimId = "22222222-2222-4222-8222-222222222222", actorId = "33333333-3333-4333-8333-333333333333"
const state = () => ({ resources: [{ id: resourceId, display_name: "Test Program", lifecycle_state: "active", editorial_status: "approved" }], claims: [{ id: claimId, resource_id: resourceId, field_name: "location_occupancy", proposed_value: "123 Main Street", status: "observed" }], evidence: [], locations: [], qc: [], researchItems: [], matchCandidates: [] })
const taskId = `${resourceId}:verify_programme_at_site:${claimId}`
function db(log, existing = null) { return { rpc: async (name, args) => { log.push({ name, args }); if (name === "begin_planner_task_execution_v1") return { data: existing || { status: "running", research_run_id: args.p_research_run_id } }; if (name === "persist_canonical_authoritative_location_evidence_v1") return { data: { evidence_id: "44444444-4444-4444-8444-444444444444" } }; return { data: {} } } } }

test("rejects invalid stable identifiers before any adapter call", async () => {
  assert.throws(() => validatePlannerTaskRequest({ task_id: "x", resource_id: "no" }), /invalid_task_identifiers/)
  let called = false
  const execute = createPlannerTaskExecutor({ db: db([]), research: async () => { called = true }, loadState: async () => state() })
  await assert.rejects(() => execute({ task_id: "x", resource_id: "no" }, actorId), /invalid_task_identifiers/)
  assert.equal(called, false)
})
test("allowed programme-at-site task is bounded, persists only through canonical RPCs, then resolves", async () => {
  const log = []; let loads = 0
  const execute = createPlannerTaskExecutor({ db: db(log), makeRunId: () => "55555555-5555-4555-8555-555555555555", loadState: async () => ++loads === 1 ? state() : { ...state(), evidence: [{ id: "e", claim_id: claimId, source_url: "https://fraserhealth.ca/program", source_authority: 95, stale: false }] }, research: async ({ budget }) => { assert.deepEqual(budget, PLANNER_TASK_RESEARCH_BUDGET); return [{ url: "https://fraserhealth.ca/program", text: "Test Program is at 123 Main Street" }] } })
  const result = await execute({ task_id: taskId, resource_id: resourceId, claim_id: claimId }, actorId)
  assert.equal(result.outcome, "resolved")
  assert.equal(log.filter((item) => item.name === "persist_canonical_authoritative_location_evidence_v1").length, 1)
  assert.equal(log.filter((item) => item.name === "reserve_canonical_authoritative_research_item").length, 1)
  assert.equal(log.some((item) => /geocode|publish/i.test(item.name)), false)
})
test("stale protected task does not call external research", async () => {
  let calls = 0
  const protectedState = { ...state(), resources: [{ ...state().resources[0], display_name: "Protected Transition House" }] }
  const execute = createPlannerTaskExecutor({ db: db([]), loadState: async () => protectedState, research: async () => { calls += 1; return [] } })
  const result = await execute({ task_id: taskId, resource_id: resourceId, claim_id: claimId }, actorId)
  assert.equal(result.outcome, "stale_task"); assert.equal(calls, 0)
})
test("duplicate execution is idempotent and does not research again", async () => {
  const log = [], existing = { status: "completed", outcome: "unchanged", research_run_id: "66666666-6666-4666-8666-666666666666" }; let calls = 0
  const execute = createPlannerTaskExecutor({ db: db(log, existing), loadState: async () => state(), research: async () => { calls += 1; return [] }, makeRunId: () => "77777777-7777-4777-8777-777777777777" })
  const result = await execute({ task_id: taskId, resource_id: resourceId, claim_id: claimId }, actorId)
  assert.equal(result.idempotent, true); assert.equal(calls, 0)
})
test("concurrent duplicate requests share one bounded external research attempt", async () => {
  const log = []; let calls = 0, release
  const waiting = new Promise((resolve) => { release = resolve })
  const execute = createPlannerTaskExecutor({ db: db(log), loadState: async () => state(), research: async () => { calls += 1; await waiting; return [] }, makeRunId: () => "88888888-8888-4888-8888-888888888888" })
  const first = execute({ task_id: taskId, resource_id: resourceId, claim_id: claimId }, actorId)
  const second = execute({ task_id: taskId, resource_id: resourceId, claim_id: claimId }, actorId)
  release(); await Promise.all([first, second])
  assert.equal(calls, 1)
})
