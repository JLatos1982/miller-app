import { createHash } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { createCapabilityExecutionObservation, createCapabilityIntelligenceStore, summarizeCapabilityPerformance } from "./samwiseCapabilityIntelligence.js"
import { createOwnerAdvisoryInbox, generateOwnerAdvisories } from "./samwiseOwnerAdvisories.js"
import { redactWorkObserverText, samwiseJobToWorkEvent } from "./samwiseWorkObserver.js"
import { createWorkflowEpisode, createWorkflowMemoryStore } from "./samwiseWorkflowMemory.js"

export const SAMWISE_AUTONOMY_POLICY_SCHEMA = "samwise-autonomy-policy-v1"
export const AUTONOMY_LEVELS = Object.freeze(["autonomous_allowed", "prepare_only", "owner_approval_required", "prohibited_autonomous"])
export const STEWARD_RUN_SCHEMA = "samwise-farm-steward-run-v1"
export const HARD_PROHIBITED_AUTONOMY = Object.freeze(["publish", "send_email", "outreach", "foi_submission", "production_database_mutation", "rls_change", "authentication_change", "credential_rotation", "credential_creation", "firewall_change", "network_exposure_change", "production_deploy", "merge_or_release", "purchase_service", "unrestricted_cloud_spend", "rewrite_autonomy_policy", "permission_increase", "register_mutation_capability", "remove_owner_review_gate"])

const COST_RANK = Object.freeze({ free_local: 0, low: 1, medium: 2, high: 3, unknown: 4 })
const clean = (value, maximum = 400) => redactWorkObserverText(String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim()).slice(0, maximum)
const id = value => clean(value, 120).toLowerCase().replace(/[^a-z0-9:_-]/g, "_")
const list = (value, maximum = 30) => Array.isArray(value) ? [...new Set(value.map(item => clean(item, 180)).filter(Boolean))].slice(0, maximum) : []
const hash = value => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")

function normalizedPolicyEntry(input = {}) {
  const entry = {
    task_type: id(input.task_type), capability_id: id(input.capability_id) || null, autonomy_level: AUTONOMY_LEVELS.includes(input.autonomy_level) ? input.autonomy_level : "prohibited_autonomous",
    allowed_environments: list(input.allowed_environments, 8).map(id), local_only: input.local_only === true, network_allowed: input.network_allowed === true,
    external_service_allowed: input.external_service_allowed === true, paid_service_allowed: input.paid_service_allowed === true, mutation_allowed: input.mutation_allowed === true,
    publication_allowed: input.publication_allowed === true, outreach_allowed: input.outreach_allowed === true, max_cost_class: COST_RANK[input.max_cost_class] !== undefined ? input.max_cost_class : "free_local",
    max_runtime_ms: Number.isInteger(input.max_runtime_ms) && input.max_runtime_ms > 0 ? input.max_runtime_ms : 30_000, max_items: Number.isInteger(input.max_items) && input.max_items > 0 ? input.max_items : 1,
    validation_required: input.validation_required === true, required_prior_success_count: Number.isInteger(input.required_prior_success_count) && input.required_prior_success_count >= 0 ? input.required_prior_success_count : 3,
    required_workflow_confidence: ["low", "moderate", "high"].includes(input.required_workflow_confidence) ? input.required_workflow_confidence : "moderate",
    owner_review_after_run: input.owner_review_after_run === true, owner_approved: input.owner_approved === true,
    stop_conditions: list(input.stop_conditions, 16), rationale: clean(input.rationale, 500), version: clean(input.version, 40) || "1.0.0",
  }
  if (!entry.task_type || !entry.rationale) throw new Error("samwise_autonomy_policy_entry_invalid")
  if (entry.publication_allowed || entry.outreach_allowed || entry.paid_service_allowed || entry.mutation_allowed) throw new Error("samwise_autonomy_policy_unsafe_grant")
  if (entry.autonomy_level === "autonomous_allowed" && !entry.owner_approved) throw new Error("samwise_autonomy_policy_autonomous_requires_owner_approval")
  return Object.freeze(entry)
}

export function createSamwiseAutonomyPolicy(input = {}) {
  if (input.schema_version !== SAMWISE_AUTONOMY_POLICY_SCHEMA || !Array.isArray(input.entries)) throw new Error("samwise_autonomy_policy_invalid")
  const entries = input.entries.map(normalizedPolicyEntry)
  const keys = entries.map(entry => `${entry.task_type}|${entry.capability_id || "*"}`)
  if (new Set(keys).size !== keys.length) throw new Error("samwise_autonomy_policy_duplicate_entry")
  return Object.freeze({ schema_version: SAMWISE_AUTONOMY_POLICY_SCHEMA, version: clean(input.version, 40) || "1.0.0", default_autonomy_level: "prohibited_autonomous", owner_can_activate_entries: true, self_modification: "prohibited_autonomous", entries })
}

export function autonomyPolicyDecision({ policy, task = {}, prior_success_count = 0, workflow_confidence = "low" } = {}) {
  const normalized = { task_type: id(task.task_type), capability_id: id(task.capability_id) || null, environment: id(task.environment) || "unknown", cost_class: COST_RANK[task.cost_class] !== undefined ? task.cost_class : "unknown", network: task.network === true, external_service: task.external_service === true, mutation: task.mutation === true, publication: task.publication === true, outreach: task.outreach === true, items: Number(task.items || 1), estimated_runtime_ms: Number(task.estimated_runtime_ms || 0) }
  if (!normalized.task_type) throw new Error("samwise_autonomy_task_invalid")
  if (HARD_PROHIBITED_AUTONOMY.includes(normalized.task_type) || normalized.publication || normalized.outreach || normalized.mutation) return Object.freeze({ eligible: false, outcome: "prohibited", reason: "hard_prohibition", policy_entry: null })
  const entry = policy.entries.find(candidate => candidate.task_type === normalized.task_type && (!candidate.capability_id || candidate.capability_id === normalized.capability_id))
  if (!entry) return Object.freeze({ eligible: false, outcome: "prohibited", reason: "restrictive_default", policy_entry: null })
  if (entry.autonomy_level !== "autonomous_allowed") return Object.freeze({ eligible: false, outcome: entry.autonomy_level === "prepare_only" ? "prepare_only" : "owner_approval_required", reason: "policy_level", policy_entry: entry })
  if (!entry.owner_approved) return Object.freeze({ eligible: false, outcome: "owner_approval_required", reason: "policy_entry_not_owner_approved", policy_entry: entry })
  if (entry.allowed_environments.length && !entry.allowed_environments.includes(normalized.environment)) return Object.freeze({ eligible: false, outcome: "deferred", reason: "environment_not_allowed", policy_entry: entry })
  if (normalized.network && !entry.network_allowed || normalized.external_service && !entry.external_service_allowed) return Object.freeze({ eligible: false, outcome: "deferred", reason: "network_or_external_service_not_allowed", policy_entry: entry })
  if (COST_RANK[normalized.cost_class] > COST_RANK[entry.max_cost_class]) return Object.freeze({ eligible: false, outcome: "deferred", reason: "cost_exceeds_policy", policy_entry: entry })
  if (normalized.items > entry.max_items || normalized.estimated_runtime_ms > entry.max_runtime_ms) return Object.freeze({ eligible: false, outcome: "deferred", reason: "bounded_limit_exceeded", policy_entry: entry })
  const confidenceRank = { low: 0, moderate: 1, high: 2 }
  if (prior_success_count < entry.required_prior_success_count || confidenceRank[workflow_confidence] < confidenceRank[entry.required_workflow_confidence]) return Object.freeze({ eligible: false, outcome: "prepare_only", reason: "earned_autonomy_not_established", policy_entry: entry })
  return Object.freeze({ eligible: true, outcome: "autonomous_allowed", reason: "policy_and_history_satisfied", policy_entry: entry })
}

export function deriveAutonomyPromotionProposals({ episodes = [], registry = { capabilities: [] }, required_success_count = 3 } = {}) {
  const groups = Object.groupBy(episodes, episode => episode.workflow_signature_id)
  const capabilities = new Map((registry.capabilities || []).map(item => [item.capability_id, item]))
  return Object.values(groups).flatMap(rows => {
    const successful = rows.filter(row => row.final_outcome === "succeeded" && row.actually_validated)
    const failures = rows.filter(row => row.final_outcome !== "succeeded" || (row.failures || []).length)
    const required = [...new Set(rows.flatMap(row => row.capabilities || []))]
    const safe = required.every(capability => capabilities.get(capability)?.mutation_authority === "none" && capabilities.get(capability)?.publication_authority === false)
    const hasOwnerIntervention = rows.some(row => row.owner_intervention)
    if (successful.length < required_success_count || !safe || hasOwnerIntervention || failures.length) return []
    const signature = rows[0].workflow_signature_id
    return [Object.freeze({ schema_version: "samwise-autonomy-promotion-proposal-v1", proposal_id: `sap_${hash({ signature, episodes: rows.map(row => row.episode_id).sort() }).slice(0, 24)}`, workflow_signature: signature, supporting_episode_count: rows.length, validated_success_count: successful.length, failure_count: failures.length, recent_reliability: successful.length === rows.length ? "stable_validated_success" : "mixed", capabilities_required: required, risk_class: "low", estimated_cost: "free_local", proposed_autonomy_boundary: "local deterministic task only; no network, mutation, publication or outreach", proposed_validation: [...new Set(successful.flatMap(row => (row.validations || []).filter(item => item.status === "passed").map(item => item.kind)))], rationale: "Repeated validated, no-failure local workflow meets the proposal threshold; activation still needs a policy entry approved by the owner.", owner_approval_required: true, automatic_activation: false })]
  }).sort((left, right) => left.proposal_id.localeCompare(right.proposal_id))
}

export function deriveListenerOpportunities({ observations = [], existing_listener_source_families = [] } = {}) {
  const existing = new Set(existing_listener_source_families.map(id))
  const grouped = new Map()
  for (const observation of observations) {
    const source = id(observation.source_family || observation.candidate_source)
    if (!source || existing.has(source) || observation.approved_source !== true) continue
    grouped.set(source, [...(grouped.get(source) || []), observation])
  }
  return [...grouped.entries()].filter(([, rows]) => rows.length >= 3).map(([source, rows]) => Object.freeze({ schema_version: "samwise-listener-opportunity-v1", opportunity_id: `slo_${hash({ source, workflows: rows.map(row => row.workflow_signature).sort() }).slice(0, 24)}`, candidate_source: source, candidate_domain: id(rows[0].domain) || "unknown", supporting_workflows: [...new Set(rows.map(row => id(row.workflow_signature)).filter(Boolean))], evidence_count: rows.length, expected_value: "Repeated approved-source manual checking suggests bounded change detection could reduce routine work.", estimated_polling_cost: "free_local_or_known_source_network_only", suggested_frequency: "weekly", sensitivity_risk: "public_source_owner_review", source_already_approved: true, owner_approval_required: true, automatic_activation: false }))
}

export function stewardMaintenanceOpportunities({ registry, root } = {}) {
  const capabilityStore = createCapabilityIntelligenceStore(root)
  const workflowStore = createWorkflowMemoryStore(root)
  return Object.freeze([
    { task_id: "capability_performance_summary_refresh", task_type: "capability_performance_summary_refresh", capability_id: "samwise_capability_intelligence", environment: "local", cost_class: "free_local", network: false, external_service: false, mutation: false, publication: false, outreach: false, items: 1, estimated_runtime_ms: 5_000, prior_success_count: 0, workflow_confidence: "low", validation: () => summarizeCapabilityPerformance({ registry, observations: capabilityStore.list(500) }).length === registry.capabilities.length },
    { task_id: "workflow_memory_integrity_check", task_type: "workflow_memory_integrity_check", capability_id: "samwise_workflow_memory", environment: "local", cost_class: "free_local", network: false, external_service: false, mutation: false, publication: false, outreach: false, items: 1, estimated_runtime_ms: 5_000, prior_success_count: 0, workflow_confidence: "low", validation: () => workflowStore.status().episode_count >= 0 },
  ])
}

export function createFarmStewardStore(root) {
  const directory = path.resolve(root, "artifacts/samwise/runtime/farm-steward")
  const runPath = path.join(directory, "runs-v1.ndjson")
  mkdirSync(directory, { recursive: true })
  const runs = () => { try { return readFileSync(runPath, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) } catch { return [] } }
  return {
    paths: { directory, runPath },
    append(run) { const safe = { ...run, summary: clean(run.summary, 600), task_results: (run.task_results || []).map(row => ({ task_id: id(row.task_id), outcome: id(row.outcome), reason: id(row.reason) || null, validation: id(row.validation) || null, cost_class: row.cost_class || "unknown" })).slice(0, 8) }; safe.run_id = safe.run_id || `sfs_${hash(safe).slice(0, 24)}`; appendFileSync(runPath, `${JSON.stringify(safe)}\n`, { mode: 0o600 }); return safe },
    history(limit = 50) { return runs().slice(-Math.min(Math.max(Number(limit) || 50, 1), 200)).reverse() },
    status() { return { run_count: runs().length, local_audit_exists: existsSync(runPath), scheduler_integration: "manual_or_existing_heartbeat_only", external_persistence: "not_configured" } },
  }
}

export async function runFarmStewardOnce({ root, policy, registry, opportunities = null, now = () => new Date(), max_tasks = 2 } = {}) {
  const active = opportunities || stewardMaintenanceOpportunities({ registry, root })
  const decisions = active.map(task => ({ task, decision: autonomyPolicyDecision({ policy, task, prior_success_count: task.prior_success_count, workflow_confidence: task.workflow_confidence }) }))
  const eligible = decisions.filter(item => item.decision.eligible).slice(0, Math.min(Math.max(Number(max_tasks) || 2, 1), 2))
  const results = []
  for (const item of eligible) {
    const passed = item.task.validation?.() === true
    results.push({ task_id: item.task.task_id, outcome: passed ? "completed" : "deferred", reason: passed ? "validated_local_maintenance" : "validation_failed", validation: passed ? "passed" : "failed", cost_class: item.task.cost_class })
  }
  const deferred = decisions.filter(item => !item.decision.eligible).map(item => ({ task_id: item.task.task_id, outcome: item.decision.outcome, reason: item.decision.reason, validation: "not_run", cost_class: item.task.cost_class }))
  const record = { schema_version: STEWARD_RUN_SCHEMA, run_id: `sfs_${hash({ at: now().toISOString(), tasks: results.map(item => item.task_id) }).slice(0, 24)}`, started_at: now().toISOString(), completed_at: now().toISOString(), selected_task_ids: results.map(item => item.task_id), task_results: [...results, ...deferred], status: results.length ? "completed" : "no_eligible_work", summary: results.length ? `${results.length} bounded local maintenance task(s) completed.` : "No autonomous maintenance opportunity met the restrictive policy and earned-autonomy gates.", cost: { paid_cloud_requests: 0, external_service_requests: 0, cost_class: "free_local" }, mutation_authority: false, publication_authority: false }
  return { record, decisions, work_observer_event: samwiseJobToWorkEvent({ session_id: "owner_started_session_required", project: "miller-app", job: { capability_id: "samwise_farm_steward", status: results.length ? "passed" : "observed", summary: record.summary } }) }
}

export function stewardAdvisoryCandidates({ run, promotion_proposals = [], listener_opportunities = [] } = {}) {
  const signals = []
  for (const proposal of promotion_proposals) signals.push({ kind: "learning", material: true, source_system: "farm_steward", source_ids: [proposal.proposal_id], title: "A workflow is eligible for an autonomy-promotion review", concise_summary: proposal.rationale, confidence: "moderate", evidence_count: proposal.validated_success_count, suggested_action: "Review and explicitly approve a policy entry before any activation.", owner_decision_required: true })
  for (const result of run?.task_results || []) if (result.reason === "cost_exceeds_policy") signals.push({ kind: "learning", material: true, source_system: "farm_steward", source_ids: [run.run_id, result.task_id], title: "Bounded autonomous work was deferred by the cost governor", concise_summary: "No paid-cloud escalation occurred.", confidence: "high", evidence_count: 1, suggested_action: "Review the task policy if this work is important enough to authorize separately.", owner_decision_required: true })
  return { normalized_signals: signals, listener_opportunities }
}

export function recordStewardLearning({ root, run, policy, promotion_proposals = [], listener_opportunities = [] } = {}) {
  const store = createFarmStewardStore(root)
  const recorded = store.append(run)
  const capabilityStore = createCapabilityIntelligenceStore(root)
  for (const result of run.task_results.filter(item => item.outcome === "completed")) capabilityStore.append(createCapabilityExecutionObservation({ capability_id: "samwise_capability_intelligence", task_category: "farm_steward_maintenance", status: "succeeded", validation_result: result.validation === "passed" ? "passed" : "unknown", useful_output: "yes", cost_class: result.cost_class, result_reference: recorded.run_id, notes: result.task_id }))
  // Work Observer retains its explicit-session rule. This is a prepared sanitized
  // event only; it is not persisted unless an owner has started a matching session.
  const workflowStore = createWorkflowMemoryStore(root)
  for (const result of run.task_results.filter(item => item.outcome === "completed")) workflowStore.append(createWorkflowEpisode({ project: "miller-app", workflow_category: "farm_steward_maintenance", domain: "operations", goal: `Validate ${result.task_id}.`, started_at: run.started_at, ended_at: run.completed_at, capabilities: ["samwise_capability_intelligence"], route_taken: ["samwise_farm_steward"], significant_steps: [{ stage: "execute", status: "passed", summary: result.task_id }], validations: [{ kind: "local_integrity", status: "passed", reference: recorded.run_id }], final_outcome: "succeeded", owner_intervention: false, cost_class: result.cost_class, artifact_references: ["runs-v1.ndjson"], source_observation_ids: [recorded.run_id, result.task_id], completion_confidence: "low", actually_validated: true, requested_outcome: "local_maintenance", environment_class: "local" }))
  const advisories = generateOwnerAdvisories({ normalized_signals: stewardAdvisoryCandidates({ run: recorded, promotion_proposals, listener_opportunities }).normalized_signals })
  const inbox = createOwnerAdvisoryInbox(root)
  const writes = advisories.advisories.map(advisory => inbox.append(advisory))
  return { record: recorded, capability_observations_recorded: run.task_results.filter(item => item.outcome === "completed").length, work_observer_event: samwiseJobToWorkEvent({ session_id: "owner_started_session_required", project: "miller-app", job: { capability_id: "samwise_farm_steward", status: run.status === "completed" ? "passed" : "observed", summary: run.summary } }), work_observer_persistence: "requires_explicit_owner_started_matching_session", workflow_episodes_recorded: run.task_results.filter(item => item.outcome === "completed").length, advisory_writes: writes.filter(item => !item.duplicate).length, policy_version: policy.version }
}
