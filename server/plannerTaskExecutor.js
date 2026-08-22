import { randomUUID } from "node:crypto"
import { buildOccupancyResearchPlan, evaluateOccupancyDocument } from "./intelligence/research.js"
import { buildPlannerDiagnostic, loadPlannerDiagnosticState } from "./plannerDiagnostics.js"

export const EXECUTABLE_PLANNER_TASK_TYPES = Object.freeze(new Set([
  "resolve_authoritative_address_conflict",
  "verify_programme_at_site",
  "reconfirm_stale_authoritative_evidence",
]))
export const PLANNER_TASK_RESEARCH_BUDGET = Object.freeze({ maxSearchRequests: 2, maxFetchedSources: 2, timeoutMs: 15_000 })
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function validatePlannerTaskRequest(input = {}) {
  if (!uuid.test(String(input.resource_id || "")) || typeof input.task_id !== "string" || input.task_id.length < 1 || input.task_id.length > 500 || input.claim_id != null && !uuid.test(String(input.claim_id))) throw new Error("invalid_task_identifiers")
  return { task_id: input.task_id, resource_id: input.resource_id, claim_id: input.claim_id || null }
}

function currentTask(state, input) {
  const report = buildPlannerDiagnostic(state)
  return { report, task: report.tasks.find((task) => task.task_id === input.task_id && task.resource_id === input.resource_id && task.claim_id === input.claim_id) || null }
}
function taskResult(outcome, report, extra = {}) { return { outcome, report, ...extra } }
function addressOf(claim) { const value = claim?.proposed_value; return typeof value === "string" ? value : typeof value === "object" && value ? value.address || value.value || "" : "" }

// `research` is injected: tests use deterministic fixtures.  The production
// adapter may discover and fetch at most the stated budget; this executor never
// accepts documents, confidence, or evidence text from the browser.
export function createPlannerTaskExecutor({ db, research, loadState = loadPlannerDiagnosticState, now = () => Date.now(), makeRunId = randomUUID } = {}) {
  if (!db || typeof research !== "function") throw new Error("planner_task_executor_dependencies_required")
  const inFlight = new Map()
  return async function executePlannerTask(input, actorId) {
    const request = validatePlannerTaskRequest(input)
    if (!uuid.test(String(actorId || ""))) throw new Error("invalid_actor")
    if (inFlight.has(request.task_id)) return inFlight.get(request.task_id)
    const run = async () => {
      const before = await loadState(db, { resourceId: request.resource_id, limit: 1 })
      const initial = currentTask(before, request)
      if (!initial.task) return taskResult("stale_task", initial.report, { reason: "planner_task_not_current" })
      const task = initial.task
      if (!task.actionable || task.blockers?.length || !EXECUTABLE_PLANNER_TASK_TYPES.has(task.task_type)) return taskResult("stale_task", initial.report, { reason: "planner_task_not_executable" })
      const resource = before.resources.find((item) => item.id === request.resource_id)
      const claim = before.claims.find((item) => item.id === request.claim_id)
      if (!resource || !claim) return taskResult("stale_task", initial.report, { reason: "planner_task_binding_not_current" })
      const runId = makeRunId()
      const begun = await db.rpc("begin_planner_task_execution_v1", { p_task_id: task.task_id, p_resource_id: task.resource_id, p_claim_id: task.claim_id, p_task_type: task.task_type, p_actor_id: actorId, p_research_run_id: runId })
      if (begun.error) throw begun.error
      if (begun.data?.status !== "running" || begun.data?.research_run_id !== runId) return taskResult(begun.data?.outcome || "unchanged", initial.report, { idempotent: true, execution: begun.data })
      const start = now()
      try {
        await rpc(db, "begin_canonical_authoritative_research_run", { p_run_id: runId, p_authorized_max_attempts: 1, p_actor_id: actorId })
        await rpc(db, "reserve_canonical_authoritative_research_item", { p_run_id: runId, p_resource_id: task.resource_id, p_actor_id: actorId })
        const record = { canonical_uuid: task.resource_id, resource_name: resource.display_name, submitted_address: addressOf(claim), municipality: "", aliases: [] }
        const plan = buildOccupancyResearchPlan(record, { maxQueriesPerClaim: PLANNER_TASK_RESEARCH_BUDGET.maxSearchRequests, maxPagesPerClaim: PLANNER_TASK_RESEARCH_BUDGET.maxFetchedSources, maxElapsedMs: PLANNER_TASK_RESEARCH_BUDGET.timeoutMs, initialQueries: PLANNER_TASK_RESEARCH_BUDGET.maxSearchRequests, initialPages: PLANNER_TASK_RESEARCH_BUDGET.maxFetchedSources })
        const documents = await research({ task, record, plan, budget: PLANNER_TASK_RESEARCH_BUDGET })
        const inspected = (Array.isArray(documents) ? documents : []).slice(0, PLANNER_TASK_RESEARCH_BUDGET.maxFetchedSources).map((document) => evaluateOccupancyDocument(record, document))
        const accepted = inspected.find((item) => item.source.authoritative && item.classification.program_relationship_verified)
        let persisted = null, forcedHumanReview = false
        if (accepted) {
          try { persisted = await rpc(db, "persist_canonical_authoritative_location_evidence_v1", { p_run_id: runId, p_resource_id: task.resource_id, p_source_url: accepted.evidence.url, p_source_reference: accepted.source.domain, p_source_excerpt: accepted.evidence.excerpt, p_candidate_address: record.submitted_address, p_actor_id: actorId }) }
          catch (error) {
            if (!/conflict|exact programme-at-site/i.test(String(error?.message || ""))) throw error
            forcedHumanReview = true
            await rpc(db, "finish_canonical_authoritative_research_item", { p_run_id: runId, p_resource_id: task.resource_id, p_outcome: "conflict", p_reason_code: "authoritative_research_requires_human_review", p_claim_id: task.claim_id, p_evidence_id: null, p_actor_id: actorId })
          }
        } else await rpc(db, "finish_canonical_authoritative_research_item", { p_run_id: runId, p_resource_id: task.resource_id, p_outcome: "insufficient", p_reason_code: "bounded_authoritative_evidence_not_found", p_claim_id: task.claim_id, p_evidence_id: null, p_actor_id: actorId })
        await rpc(db, "complete_canonical_authoritative_research_run", { p_run_id: runId, p_actor_id: actorId })
        const after = await loadState(db, { resourceId: request.resource_id, limit: 1 }), next = currentTask(after, request)
        const outcome = forcedHumanReview ? "human_review" : !next.task ? "resolved" : !next.task.actionable ? "human_review" : next.task.task_type !== task.task_type ? "reduced" : "unchanged"
        const status = outcome === "human_review" ? "human_review" : "completed"
        const urls = inspected.map((item) => item.evidence.url).filter(Boolean)
        const execution = await rpc(db, "finish_planner_task_execution_v1", { p_task_id: task.task_id, p_status: status, p_outcome: outcome, p_source_urls: urls, p_evidence_id: persisted?.evidence_id || null })
        return taskResult(outcome, next.report, { execution, sources_considered: urls.length, elapsed_ms: now() - start })
      } catch (error) {
        await db.rpc("finish_planner_task_execution_v1", { p_task_id: task.task_id, p_status: "failed", p_outcome: "failed", p_source_urls: [], p_evidence_id: null }).catch(() => {})
        throw error
      }
    }
    const promise = run().finally(() => inFlight.delete(request.task_id))
    inFlight.set(request.task_id, promise)
    return promise
  }
}

async function rpc(db, fn, args) { const result = await db.rpc(fn, args); if (result.error) throw result.error; return result.data }
