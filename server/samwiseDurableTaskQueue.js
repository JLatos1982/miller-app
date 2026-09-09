import { createHash } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"

export const SAMWISE_DURABLE_TASK_SCHEMA = "samwise-durable-task-v1"
export const SAMWISE_DURABLE_QUEUE_SCHEMA = "samwise-durable-task-queue-v1"
export const DURABLE_TASK_STATES = Object.freeze(["queued", "claimed", "running", "completed", "failed", "blocked", "expired", "cancelled"])
export const DURABLE_TASK_TYPES = Object.freeze(["palantir_research_plan", "palantir_research_continuation", "farm_listener_run", "resource_verification_batch", "system_health_reconciliation", "owner_report_generation"])

const TERMINAL = new Set(["completed", "failed", "expired", "cancelled"])
const STATES = new Set(DURABLE_TASK_STATES)
const TYPES = new Set(DURABLE_TASK_TYPES)
const FORBIDDEN_KEYS = /(?:command|shell|sql|script|executable|credential|secret|token|password|service.?role)/i
const transitions = Object.freeze({
  queued: new Set(["claimed", "cancelled", "expired"]),
  claimed: new Set(["running", "blocked", "cancelled", "expired"]),
  running: new Set(["completed", "failed", "blocked", "cancelled"]),
  blocked: new Set(["queued", "cancelled", "expired"]),
  completed: new Set(), failed: new Set(), expired: new Set(), cancelled: new Set(),
})
const allowedPayloadKeys = Object.freeze({
  palantir_research_plan: new Set(["plan_id"]),
  palantir_research_continuation: new Set(["execution_id", "plan_id"]),
  farm_listener_run: new Set(["listener_id"]),
  resource_verification_batch: new Set(["batch_id", "resource_ids"]),
  system_health_reconciliation: new Set(["scope"]),
  owner_report_generation: new Set(["report_type", "period"]),
})

const clean = (value, limit = 240) => String(value ?? "").normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
const iso = value => value instanceof Date ? value.toISOString() : typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex")

function normalizePayload(taskType, payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("samwise_durable_task_payload_invalid")
  const allowed = allowedPayloadKeys[taskType]
  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN_KEYS.test(key) || !allowed.has(key)) throw new Error("samwise_durable_task_payload_not_typed")
    if (typeof value === "string" && value.length > 500) throw new Error("samwise_durable_task_payload_too_large")
    if (Array.isArray(value) && (value.length > 100 || value.some(item => typeof item !== "string" || item.length > 180))) throw new Error("samwise_durable_task_payload_too_large")
  }
  const normalized = Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, Array.isArray(value) ? [...new Set(value.map(item => clean(item, 180)).filter(Boolean))] : clean(value, 500)]))
  const required = taskType === "palantir_research_plan" ? "plan_id" : taskType === "palantir_research_continuation" ? "execution_id" : taskType === "farm_listener_run" ? "listener_id" : taskType === "resource_verification_batch" ? "batch_id" : taskType === "owner_report_generation" ? "report_type" : "scope"
  if (!normalized[required]) throw new Error("samwise_durable_task_payload_required")
  return Object.freeze(normalized)
}

export function createDurableTask(input = {}, { now = new Date() } = {}) {
  if (!TYPES.has(input.task_type)) throw new Error("samwise_durable_task_type_invalid")
  const createdAt = iso(now)
  const targetWorkspace = clean(input.target_workspace || input.target_project, 260)
  if (!targetWorkspace) throw new Error("samwise_durable_task_workspace_required")
  const payload = normalizePayload(input.task_type, input.payload)
  const ownerApprovalRequired = input.owner_approval_required !== false
  const ownerApprovedAt = input.owner_approved === true ? createdAt : null
  return Object.freeze({ schema_version: SAMWISE_DURABLE_TASK_SCHEMA, task_id: clean(input.task_id, 180) || `samwise-task:${hash({ task_type: input.task_type, targetWorkspace, payload, createdAt }).slice(0, 24)}`, task_type: input.task_type, target_workspace: targetWorkspace, payload, created_at: createdAt, claimed_at: null, started_at: null, heartbeat_at: null, terminal_at: null, state: "queued", blocker: null, result_reference: null, owner_approval_required: ownerApprovalRequired, owner_approved_at: ownerApprovedAt, retry_allowed: input.retry_allowed !== false, worker_id: null, attempts: 0, automatic_resume: false, mutation_authority: false, publication_authority: false })
}

function transition(task, nextState, { now = new Date(), workerId = null, blocker = null, resultReference = null, ownerApproved = false } = {}) {
  if (task?.schema_version !== SAMWISE_DURABLE_TASK_SCHEMA || !STATES.has(task.state) || !transitions[task.state]?.has(nextState)) throw new Error("samwise_durable_task_transition_invalid")
  if (nextState === "claimed" && task.owner_approval_required && !task.owner_approved_at && !ownerApproved) throw new Error("samwise_durable_task_owner_approval_required")
  if (task.state === "blocked" && nextState === "queued" && (!task.retry_allowed || !ownerApproved)) throw new Error("samwise_durable_task_resume_approval_required")
  const at = iso(now)
  const recordsBlocker = ["blocked", "failed", "expired", "cancelled"].includes(nextState)
  return Object.freeze({ ...task, state: nextState, owner_approved_at: task.owner_approved_at || (ownerApproved ? at : null), claimed_at: nextState === "claimed" ? at : task.claimed_at, started_at: nextState === "running" ? task.started_at || at : task.started_at, heartbeat_at: ["claimed", "running"].includes(nextState) ? at : task.heartbeat_at, terminal_at: TERMINAL.has(nextState) ? at : null, blocker: recordsBlocker ? clean(blocker, 300) || (nextState === "blocked" ? "worker_attention_required" : task.blocker) : null, result_reference: TERMINAL.has(nextState) ? clean(resultReference, 500) || task.result_reference : task.result_reference, worker_id: nextState === "claimed" ? clean(workerId, 180) || "unknown-worker" : task.worker_id, attempts: nextState === "claimed" ? Number(task.attempts || 0) + 1 : task.attempts, automatic_resume: false })
}

export const claimDurableTask = (task, options = {}) => transition(task, "claimed", options)
export const startDurableTask = (task, options = {}) => transition(task, "running", options)
export const completeDurableTask = (task, options = {}) => transition(task, "completed", options)
export const failDurableTask = (task, options = {}) => transition(task, "failed", options)
export const cancelDurableTask = (task, options = {}) => transition(task, "cancelled", options)
export const resumeDurableTask = (task, options = {}) => transition(task, "queued", options)

export function heartbeatDurableTask(task, { now = new Date(), workerId = null } = {}) {
  if (task?.schema_version !== SAMWISE_DURABLE_TASK_SCHEMA || !["claimed", "running"].includes(task.state)) throw new Error("samwise_durable_task_not_heartbeat_eligible")
  if (workerId && task.worker_id && clean(workerId, 180) !== task.worker_id) throw new Error("samwise_durable_task_worker_mismatch")
  return Object.freeze({ ...task, heartbeat_at: iso(now) })
}

export function reconcileDurableTask(task, { now = new Date(), hostAvailable = true, staleAfterMs = 15 * 60 * 1000, expiresAfterMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
  if (task?.schema_version !== SAMWISE_DURABLE_TASK_SCHEMA || !STATES.has(task.state)) throw new Error("samwise_durable_task_invalid")
  if (TERMINAL.has(task.state)) return Object.freeze({ task, availability: "terminal", resumable: false, changed: false })
  const nowMs = new Date(now).getTime()
  const createdMs = Date.parse(task.created_at)
  if (["queued", "blocked"].includes(task.state) && Number.isFinite(createdMs) && nowMs - createdMs > expiresAfterMs) {
    const expired = transition(task, "expired", { now, blocker: "task_expired", resultReference: task.result_reference })
    return Object.freeze({ task: expired, availability: "expired", resumable: false, changed: true })
  }
  if (task.state === "queued" && !hostAvailable) return Object.freeze({ task, availability: "durable_pending_host_unavailable", resumable: true, changed: false })
  if (["claimed", "running"].includes(task.state)) {
    const heartbeatMs = Date.parse(task.heartbeat_at || task.claimed_at || task.started_at || "")
    if (!hostAvailable || !Number.isFinite(heartbeatMs) || nowMs - heartbeatMs > staleAfterMs) {
      const blocked = transition(task, "blocked", { now, blocker: !hostAvailable ? "worker_host_unavailable" : "stale_worker_heartbeat" })
      return Object.freeze({ task: blocked, availability: "blocked_stale_worker", resumable: task.retry_allowed, changed: true })
    }
  }
  return Object.freeze({ task, availability: task.state, resumable: task.state === "blocked" && task.retry_allowed, changed: false })
}

const emptyQueue = () => ({ schema_version: SAMWISE_DURABLE_QUEUE_SCHEMA, tasks: [], updated_at: null, automatic_execution: false, arbitrary_commands_allowed: false })

export function readDurableTaskQueue(snapshotPath) {
  if (!existsSync(snapshotPath)) return emptyQueue()
  const parsed = JSON.parse(readFileSync(snapshotPath, "utf8"))
  if (parsed?.schema_version !== SAMWISE_DURABLE_QUEUE_SCHEMA || !Array.isArray(parsed.tasks)) throw new Error("samwise_durable_task_queue_invalid")
  return parsed
}

export function persistDurableTask(snapshotPath, eventPath, task, { event = "upsert", now = new Date() } = {}) {
  if (task?.schema_version !== SAMWISE_DURABLE_TASK_SCHEMA) throw new Error("samwise_durable_task_invalid")
  const queue = readDurableTaskQueue(snapshotPath)
  const next = { ...queue, tasks: [...queue.tasks.filter(item => item.task_id !== task.task_id), task], updated_at: iso(now) }
  mkdirSync(path.dirname(snapshotPath), { recursive: true })
  const temporary = `${snapshotPath}.tmp`
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, snapshotPath)
  mkdirSync(path.dirname(eventPath), { recursive: true })
  appendFileSync(eventPath, `${JSON.stringify({ schema_version: "samwise-durable-task-event-v1", event_id: hash({ task_id: task.task_id, event, at: iso(now), state: task.state }), task_id: task.task_id, task_type: task.task_type, event: clean(event, 80), state: task.state, at: iso(now), blocker: task.blocker, result_reference: task.result_reference })}\n`, { mode: 0o600 })
  return next
}
