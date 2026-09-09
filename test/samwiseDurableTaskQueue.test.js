import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { checkpointDurableTask, claimDurableTask, completeDurableTask, createDurableTask, heartbeatDurableTask, persistDurableTask, readDurableTaskQueue, reconcileDurableTask, resumeDurableTask, startDurableTask } from "../server/samwiseDurableTaskQueue.js"

const now = new Date("2026-09-09T12:00:00.000Z")
const task = overrides => createDurableTask({ task_type: "palantir_research_plan", target_workspace: "/Users/admin/miller-app", payload: { plan_id: "palantir-plan:structural-v2" }, owner_approved: true, ...overrides }, { now })

test("an approved typed task follows the claimed, running and completed lifecycle", () => {
  const claimed = claimDurableTask(task(), { now: new Date("2026-09-09T12:01:00Z"), workerId: "farm-local" })
  const running = startDurableTask(claimed, { now: new Date("2026-09-09T12:02:00Z") })
  const alive = heartbeatDurableTask(running, { now: new Date("2026-09-09T12:05:00Z"), workerId: "farm-local" })
  const completed = completeDurableTask(alive, { now: new Date("2026-09-09T12:10:00Z"), resultReference: "artifacts/samwise/result.json" })
  assert.equal(completed.state, "completed")
  assert.equal(completed.attempts, 1)
  assert.match(completed.result_reference, /result\.json$/)
  assert.equal(completed.publication_authority, false)
})

test("missing-evidence acquisition checkpoints before completion without gaining request authority", () => {
  const acquisition = createDurableTask({ task_type: "palantir_missing_evidence_acquisition", target_workspace: "/Users/admin/miller-app", payload: { acquisition_id: "sk:v5" }, owner_approved: true }, { now })
  const running = startDurableTask(claimDurableTask(acquisition, { now, workerId: "farm-local" }), { now })
  const checkpointed = checkpointDurableTask(running, { now: new Date("2026-09-09T12:03:00Z") })
  const completed = completeDurableTask(checkpointed, { now: new Date("2026-09-09T12:04:00Z"), resultReference: "artifacts/samwise/v5.json" })
  assert.equal(checkpointed.state, "checkpointed")
  assert.equal(completed.state, "completed")
  assert.equal(completed.mutation_authority, false)
  assert.equal(completed.publication_authority, false)
})

test("queued work remains durably pending while its host is unavailable", () => {
  const result = reconcileDurableTask(task(), { now: new Date("2026-09-09T12:10:00Z"), hostAvailable: false })
  assert.equal(result.task.state, "queued")
  assert.equal(result.availability, "durable_pending_host_unavailable")
  assert.equal(result.changed, false)
})

test("expired work retains its derived blocker for owner-facing reconciliation", () => {
  const result = reconcileDurableTask(task(), { now: new Date("2026-09-20T12:00:00Z"), expiresAfterMs: 7 * 24 * 60 * 60 * 1000 })
  assert.equal(result.task.state, "expired")
  assert.equal(result.task.blocker, "task_expired")
  assert.equal(result.task.terminal_at, "2026-09-20T12:00:00.000Z")
})

test("a stale running heartbeat becomes blocked and requires owner-approved resume", () => {
  const running = startDurableTask(claimDurableTask(task(), { now, workerId: "farm-local" }), { now })
  const result = reconcileDurableTask(running, { now: new Date("2026-09-09T13:00:00Z"), staleAfterMs: 15 * 60 * 1000 })
  assert.equal(result.task.state, "blocked")
  assert.equal(result.task.blocker, "stale_worker_heartbeat")
  assert.equal(result.resumable, true)
  assert.throws(() => resumeDurableTask(result.task), /resume_approval_required/)
  assert.equal(resumeDurableTask(result.task, { ownerApproved: true }).state, "queued")
})

test("unapproved and arbitrary command-like tasks fail closed", () => {
  const unapproved = createDurableTask({ task_type: "farm_listener_run", target_workspace: "miller", payload: { listener_id: "source:one" } }, { now })
  assert.throws(() => claimDurableTask(unapproved, { workerId: "farm-local" }), /owner_approval_required/)
  assert.throws(() => createDurableTask({ task_type: "farm_listener_run", target_workspace: "miller", payload: { listener_id: "source:one", shell_command: "rm -rf anything" } }, { now }), /payload_not_typed/)
  assert.throws(() => createDurableTask({ task_type: "arbitrary_command", target_workspace: "miller", payload: { scope: "anything" } }, { now }), /type_invalid/)
})

test("snapshot persistence is atomic and lifecycle events are append-only", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "samwise-durable-task-"))
  const snapshot = path.join(dir, "queue.json")
  const events = path.join(dir, "events.ndjson")
  const queued = task()
  persistDurableTask(snapshot, events, queued, { event: "queued", now })
  const claimed = claimDurableTask(queued, { now: new Date("2026-09-09T12:01:00Z"), workerId: "farm-local" })
  persistDurableTask(snapshot, events, claimed, { event: "claimed", now: new Date("2026-09-09T12:01:00Z") })
  assert.equal(readDurableTaskQueue(snapshot).tasks[0].state, "claimed")
  assert.equal(readFileSync(events, "utf8").trim().split("\n").length, 2)
})
