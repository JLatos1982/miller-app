import { createPalantirResearchPlan, cancelPalantirExecution, executePalantirResearch, pausePalantirExecution, transitionPalantirResearchPlan } from "./palantirResearchExecutor.js"
import { persistPalantirExecution, persistPalantirPlan, readPalantirExecutionStore } from "./palantirExecutionStore.js"
import { continueSamwiseResearch, planSamwiseUniversalResearch } from "./samwiseResearchWorkflow.js"

const CONTROL_TYPES = new Set(["research_public_records", "continue_research", "approve_research_plan", "pause_research", "cancel_research"])

export async function processPalantirOwnerRequest({ request, sourceCatalog, executionStorePath, researchMemory = null, adapters = {}, igorManifestValidator = null, executeApproved = true, now = new Date() } = {}) {
  if (request?.schema_version !== "farm-owner-request-v1" || request.target_id !== "samwise_public_records_intelligence" || !CONTROL_TYPES.has(request.request_type)) throw new Error("palantir_owner_request_invalid")
  if (!executionStorePath) throw new Error("palantir_execution_store_required")
  if (["research_public_records", "continue_research"].includes(request.request_type)) {
    const base = request.request_type === "continue_research"
      ? continueSamwiseResearch({ request, memory: researchMemory, sourceCatalog })
      : planSamwiseUniversalResearch(request, sourceCatalog)
    const plan = createPalantirResearchPlan(base, { now, requestedBy: "owner" })
    persistPalantirPlan(executionStorePath, plan, { now })
    return { status: plan.state === "draft" ? "owner_review" : "failed", plan, execution: null, publication_actions: 0, production_data_mutations: 0 }
  }
  const store = readPalantirExecutionStore(executionStorePath)
  const plan = store.plans.find(item => item.plan_id === request.parameters.plan_id)
  if (!plan) throw new Error("palantir_plan_not_found")
  const execution = [...store.executions].reverse().find(item => item.plan_id === plan.plan_id && !["completed", "cancelled", "failed"].includes(item.state)) || null
  if (request.request_type === "approve_research_plan") {
    const approved = transitionPalantirResearchPlan(plan, "approved", { actor: "owner", reason: request.parameters.reason, now })
    persistPalantirPlan(executionStorePath, approved, { now })
    if (!executeApproved) return { status: "approved", plan: approved, execution: null, publication_actions: 0, production_data_mutations: 0 }
    const completed = await executePalantirResearch({ plan: approved, adapters, igorManifestValidator, persistCheckpoint: async state => { persistPalantirExecution(executionStorePath, state) } })
    return { status: completed.state, plan: approved, execution: completed, publication_actions: 0, production_data_mutations: 0 }
  }
  if (request.request_type === "pause_research") {
    if (!execution) return { status: "no_running_execution", plan, execution: null, publication_actions: 0, production_data_mutations: 0 }
    const paused = pausePalantirExecution(execution, { now }); persistPalantirExecution(executionStorePath, paused, { now })
    return { status: "paused", plan, execution: paused, publication_actions: 0, production_data_mutations: 0 }
  }
  if (execution) {
    const cancelled = cancelPalantirExecution(execution, { now }); persistPalantirExecution(executionStorePath, cancelled, { now })
    return { status: "cancelled", plan, execution: cancelled, publication_actions: 0, production_data_mutations: 0 }
  }
  const cancelledPlan = transitionPalantirResearchPlan(plan, "cancelled", { actor: "owner", reason: request.parameters.reason, now }); persistPalantirPlan(executionStorePath, cancelledPlan, { now })
  return { status: "cancelled", plan: cancelledPlan, execution: null, publication_actions: 0, production_data_mutations: 0 }
}
