import { randomUUID } from "node:crypto"
import { EXECUTABLE_PLANNER_TASK_TYPES } from "./plannerTaskExecutor.js"

export const HEARTBEAT_MODES = Object.freeze({ INSPECT_ONLY: "inspect_only", MAINTENANCE: "maintenance" })
export const HEARTBEAT_LIMITS = Object.freeze({ maxConsidered: 3, maxExecutions: 2, maxRuntimeMs: 45_000 })
const clamp = (value, fallback, max) => Math.max(1, Math.min(max, Number(value) || fallback))
const rank = (task) => [-Number(task.priority || 0), String(task.task_id)]
const critical = (finding) => finding.domain === "system" && finding.severity === "critical"

export function selectHeartbeatTasks(tasks = [], { maxConsidered = HEARTBEAT_LIMITS.maxConsidered } = {}) {
  return tasks.filter((task) => task.actionable && !task.blockers?.length && task.previous_attempts < 2 && EXECUTABLE_PLANNER_TASK_TYPES.has(task.task_type)).sort((a, b) => { const [ap, ai] = rank(a), [bp, bi] = rank(b); return ap - bp || ai.localeCompare(bi) }).slice(0, clamp(maxConsidered, HEARTBEAT_LIMITS.maxConsidered, HEARTBEAT_LIMITS.maxConsidered))
}

export function planGrowthOpportunities({ resources = [], candidates = [] } = {}) {
  const opportunities = candidates.filter((item) => ["pending", "needs_review"].includes(item.review_status) && item.location_disclosure_status !== "confidential").slice(0, 20).map((item) => ({ opportunity_id: `candidate:${item.id}`, opportunity_type: "existing_candidate_review", candidate_id: item.id, resource_id: item.matched_resource_id || null, city: item.community || null, confidence: "bounded", readiness: "human_review", blockers: ["human_authorization_required"], reason: "An existing private candidate remains pending review.", recommended_next_investigation: "Review existing evidence and identity linkage before any external research.", requires_human_authorization: true, read_only: true }))
  if (!opportunities.length && resources.length) opportunities.push({ opportunity_id: "coverage:insufficient_local_signal", opportunity_type: "coverage_review", confidence: "unknown", readiness: "planning_only", blockers: ["insufficient_city_coverage_data"], reason: "Current compact canonical data does not support a reliable geographic expansion recommendation.", recommended_next_investigation: "Use existing private candidate queues before external discovery.", requires_human_authorization: true, read_only: true })
  return opportunities.sort((a, b) => a.opportunity_id.localeCompare(b.opportunity_id))
}

export function researchEffectiveness(executions = []) {
  const completed = executions.filter((item) => item.outcome), groups = new Map()
  for (const item of completed) { const group = groups.get(item.task_type) || { task_type: item.task_type, attempts: 0, useful: 0, human_review: 0 }; group.attempts += 1; if (["resolved", "reduced"].includes(item.outcome)) group.useful += 1; if (item.outcome === "human_review") group.human_review += 1; groups.set(item.task_type, group) }
  return [...groups.values()].sort((a, b) => a.task_type.localeCompare(b.task_type)).map((item) => ({ ...item, useful_rate: item.attempts ? item.useful / item.attempts : 0, recommendation: item.attempts >= 3 && item.useful === 0 ? "Consider human review of this task type before increasing automation." : "Observation only; no policy changes are made." }))
}

export async function runHeartbeatCycle({ mode = HEARTBEAT_MODES.INSPECT_ONLY, actorId, inspect, executeTask, persist, now = () => Date.now(), makeId = randomUUID, limits = {} } = {}) {
  if (!Object.values(HEARTBEAT_MODES).includes(mode) || !actorId || typeof inspect !== "function") throw new Error("invalid_heartbeat_cycle")
  const budget = { maxConsidered: clamp(limits.maxConsidered, HEARTBEAT_LIMITS.maxConsidered, HEARTBEAT_LIMITS.maxConsidered), maxExecutions: clamp(limits.maxExecutions, HEARTBEAT_LIMITS.maxExecutions, HEARTBEAT_LIMITS.maxExecutions), maxRuntimeMs: clamp(limits.maxRuntimeMs, HEARTBEAT_LIMITS.maxRuntimeMs, HEARTBEAT_LIMITS.maxRuntimeMs) }
  const id = makeId(), started = now(), initial = await inspect(), selected = selectHeartbeatTasks(initial.planner.tasks, budget), base = { id, mode, actor_id: actorId, started_at: new Date().toISOString(), tasks_considered: selected.length, tasks_executed: 0, useful_evidence_gained: 0, external_call_count: 0, knowledge_finding_count: initial.health.summary.knowledge_findings, security_finding_count: initial.health.summary.security_findings, selected_task_ids: selected.map((item) => item.task_id), items: [] }
  if (persist) await persist.begin(base)
  if (initial.health.findings.some(critical)) return finish(base, "security_halt", initial, persist)
  if (mode === HEARTBEAT_MODES.INSPECT_ONLY) return finish(base, selected.length ? "inspect_only" : "no_eligible_work", initial, persist)
  if (typeof executeTask !== "function") throw new Error("heartbeat_maintenance_executor_required")
  for (const task of selected) {
    if (now() - started >= budget.maxRuntimeMs) return finish(base, "time_budget_reached", await inspect(), persist)
    if (base.tasks_executed >= budget.maxExecutions) return finish(base, "maintenance_budget_exhausted", await inspect(), persist)
    const result = await executeTask(task)
    base.tasks_executed += 1; base.external_call_count += Number(result.sources_considered || 0); if (["resolved", "reduced"].includes(result.outcome)) base.useful_evidence_gained += 1
    base.items.push({ task_id: task.task_id, resource_id: task.resource_id, outcome: result.outcome || "failed" })
    if (result.outcome === "human_review" || result.outcome === "failed") return finish(base, result.outcome === "human_review" ? "human_review_required" : "execution_failure", await inspect(), persist)
  }
  return finish(base, selected.length ? "maintenance_budget_exhausted" : "no_eligible_work", await inspect(), persist)
}
async function finish(base, stop_reason, inspected, persist) { const summary = { ...base, status: "completed", stop_reason, completed_at: new Date().toISOString(), knowledge_finding_count: inspected.health.summary.knowledge_findings, security_finding_count: inspected.health.summary.security_findings }; if (persist) await persist.finish(summary); return summary }
