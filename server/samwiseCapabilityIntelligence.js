import { createHash } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { redactWorkObserverText } from "./samwiseWorkObserver.js"

export const SAMWISE_CAPABILITY_INTELLIGENCE_ID = "samwise_capability_intelligence"
export const CAPABILITY_IMPLEMENTATION_TYPES = Object.freeze(["deterministic", "local_model", "igor_worker", "cloud_research", "external_service", "human_owner_review"])
export const CAPABILITY_AVAILABILITY = Object.freeze(["operational", "configuration_dependent", "incomplete", "unavailable"])
export const CAPABILITY_COST_CLASSES = Object.freeze(["free_local", "low", "medium", "high", "unknown"])
export const CAPABILITY_LATENCY_CLASSES = Object.freeze(["interactive", "short", "batch", "long", "unknown"])
export const CAPABILITY_MUTATION_AUTHORITIES = Object.freeze(["none", "bounded", "owner_approval"])
export const CAPABILITY_EXECUTION_STATUSES = Object.freeze(["succeeded", "failed", "deferred", "incompatible", "observed"])

const clean = (value, limit = 500) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit)
const identifier = value => clean(value, 120).toLowerCase().replace(/[^a-z0-9:_-]/g, "_")
const digest = value => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")
const median = values => { const sorted = values.filter(Number.isFinite).sort((left, right) => left - right); if (!sorted.length) return null; const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2) }
const timestamp = value => typeof value === "string" && !Number.isNaN(Date.parse(value))
const array = (value, limit = 30) => Array.isArray(value) ? [...new Set(value.map(item => clean(item, 160)).filter(Boolean))].slice(0, limit) : []
const costRank = { free_local: 0, low: 1, medium: 2, high: 3, unknown: 4 }

export function validateSamwiseCapabilityIntelligenceRegistry(registry) {
  if (registry?.schema_version !== "samwise-capability-intelligence-registry-v1" || registry.capability_id !== SAMWISE_CAPABILITY_INTELLIGENCE_ID || !Array.isArray(registry.capabilities)) throw new Error("samwise_capability_intelligence_registry_invalid")
  const ids = new Set()
  for (const capability of registry.capabilities) {
    if (!identifier(capability.capability_id) || ids.has(capability.capability_id)) throw new Error("samwise_capability_intelligence_id_invalid")
    if (!clean(capability.name) || !clean(capability.description) || !CAPABILITY_IMPLEMENTATION_TYPES.includes(capability.implementation_type) || !CAPABILITY_AVAILABILITY.includes(capability.availability) || !CAPABILITY_COST_CLASSES.includes(capability.cost_class) || !CAPABILITY_LATENCY_CLASSES.includes(capability.latency_class) || !CAPABILITY_MUTATION_AUTHORITIES.includes(capability.mutation_authority)) throw new Error("samwise_capability_intelligence_metadata_invalid")
    if (!array(capability.domains).length || !array(capability.supported_task_types).length || !array(capability.outputs).length || !clean(capability.registration_source) || !clean(capability.version)) throw new Error("samwise_capability_intelligence_contract_incomplete")
    if (capability.publication_authority !== false || typeof capability.owner_review_required !== "boolean") throw new Error("samwise_capability_intelligence_authority_invalid")
    ids.add(capability.capability_id)
  }
  return { valid: true, capability_id: registry.capability_id, capabilities: ids.size }
}

export function normalizeCapabilityTask(input = {}) {
  const task = {
    task_type: clean(input.task_type, 120), domain: clean(input.domain, 120), required_output: clean(input.required_output, 120), sensitivity: clean(input.sensitivity, 80) || "owner_private_metadata",
    mutation_requirement: ["forbidden", "bounded", "owner_approval"].includes(input.mutation_requirement) ? input.mutation_requirement : "forbidden",
    local_only: input.local_only === true, allow_configuration_dependent: input.allow_configuration_dependent === true,
    cost_preference: CAPABILITY_COST_CLASSES.includes(input.cost_preference) ? input.cost_preference : null,
    latency_preference: CAPABILITY_LATENCY_CLASSES.includes(input.latency_preference) ? input.latency_preference : null,
    confidence_requirement: ["low", "moderate", "high"].includes(input.confidence_requirement) ? input.confidence_requirement : null,
  }
  if (!task.task_type || !task.domain || !task.required_output) throw new Error("samwise_capability_task_incomplete")
  return Object.freeze(task)
}

export function matchSamwiseCapabilities({ registry, task } = {}) {
  validateSamwiseCapabilityIntelligenceRegistry(registry)
  const request = normalizeCapabilityTask(task)
  const candidates = registry.capabilities.flatMap(capability => {
    const constraints = []
    if (capability.availability === "configuration_dependent" && !request.allow_configuration_dependent) constraints.push("configuration_required")
    if (capability.availability === "incomplete" || capability.availability === "unavailable") constraints.push("not_operational")
    if (request.local_only && ["cloud_research", "external_service"].includes(capability.implementation_type)) constraints.push("local_only")
    if (request.mutation_requirement === "forbidden" && capability.mutation_authority !== "none") constraints.push("mutation_forbidden")
    if (request.mutation_requirement === "bounded" && capability.mutation_authority === "owner_approval") constraints.push("owner_approval_required_for_mutation")
    if (!capability.supported_task_types.includes(request.task_type)) constraints.push("task_type_unsupported")
    if (!capability.domains.includes(request.domain)) constraints.push("domain_unsupported")
    if (!capability.outputs.includes(request.required_output)) constraints.push("output_unsupported")
    if (constraints.length) return []
    let score = 40 + 20 + 20
    if (request.cost_preference && costRank[capability.cost_class] <= costRank[request.cost_preference]) score += 10
    if (request.latency_preference && capability.latency_class === request.latency_preference) score += 5
    if (request.confidence_requirement && capability.reliability?.confidence === request.confidence_requirement) score += 5
    return [{ capability_id: capability.capability_id, score, constraints: capability.owner_review_required ? ["owner_review_required"] : [], reasons: ["supports requested task type", "supports requested domain", "produces requested output"], capability }]
  })
  return candidates.sort((left, right) => right.score - left.score || left.capability_id.localeCompare(right.capability_id))
}

export function createCapabilityExecutionObservation(input = {}) {
  const occurred_at = input.occurred_at || new Date().toISOString()
  const core = {
    schema_version: "samwise-capability-execution-observation-v1", capability_id: identifier(input.capability_id), task_category: identifier(input.task_category), route: array(input.route, 8),
    occurred_at, duration_ms: input.duration_ms !== null && input.duration_ms !== undefined && Number.isFinite(Number(input.duration_ms)) && Number(input.duration_ms) >= 0 ? Math.round(Number(input.duration_ms)) : null,
    status: CAPABILITY_EXECUTION_STATUSES.includes(input.status) ? input.status : "observed",
    validation_result: ["passed", "failed", "unknown", "not_applicable"].includes(input.validation_result) ? input.validation_result : "unknown",
    useful_output: ["yes", "no", "unknown"].includes(input.useful_output) ? input.useful_output : "unknown",
    cost_class: CAPABILITY_COST_CLASSES.includes(input.cost_class) ? input.cost_class : "unknown",
    error_category: identifier(input.error_category) || null,
    fallback_used: input.fallback_used === true,
    owner_correction: input.owner_correction === true,
    confidence_signal: ["low", "moderate", "high", "unknown"].includes(input.confidence_signal) ? input.confidence_signal : "unknown",
    evidence_count: Number.isInteger(input.evidence_count) && input.evidence_count >= 0 ? input.evidence_count : 0,
    result_reference: redactWorkObserverText(input.result_reference).slice(0, 300) || null,
    notes: redactWorkObserverText(input.notes).slice(0, 600) || null,
    supersedes_observation_id: clean(input.supersedes_observation_id, 120) || null,
  }
  if (!core.capability_id || !core.task_category || !timestamp(core.occurred_at)) throw new Error("samwise_capability_execution_observation_invalid")
  const fingerprint = digest(core)
  return Object.freeze({ observation_id: `sci_${fingerprint.slice(0, 24)}`, ...core, fingerprint })
}

export function nativeAppBuildMemoryToCapabilityObservations(memory = {}) {
  return (memory.attempts || []).map(attempt => createCapabilityExecutionObservation({
    capability_id: "native_app_build_validation", task_category: "native_app_build_validation", route: ["native_app_build_validation"], occurred_at: attempt.started_at,
    status: attempt.result === "passed" || attempt.install_result === "passed" ? "succeeded" : attempt.result === "failed" ? "failed" : ["blocked", "deferred"].includes(attempt.result) ? "deferred" : "observed",
    validation_result: attempt.result === "failed" || attempt.install_result === "failed" ? "failed" : attempt.build_result === "passed" || attempt.install_result === "passed" ? "passed" : "unknown",
    useful_output: attempt.result === "passed" || attempt.install_result === "passed" || attempt.result === "observed" ? "yes" : "unknown", cost_class: "free_local", error_category: attempt.failure_class,
    confidence_signal: attempt.action_class === "human_runtime_observation" ? "moderate" : "low", evidence_count: (attempt.evidence || []).length,
    result_reference: attempt.attempt_id, notes: [...(attempt.observations || []), ...(attempt.unresolved_blockers || [])].join(" "),
  }))
}

export function createCapabilityIntelligenceStore(root) {
  const directory = path.resolve(root, "artifacts/samwise/runtime/capability-intelligence")
  const ledgerPath = path.join(directory, "execution-observations-v1.ndjson")
  mkdirSync(directory, { recursive: true })
  const observations = () => { try { return readFileSync(ledgerPath, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) } catch { return [] } }
  return {
    paths: { directory, ledgerPath },
    append(input) { const observation = createCapabilityExecutionObservation(input); const prior = observations(); if (prior.some(item => item.fingerprint === observation.fingerprint)) return { observation, duplicate: true }; appendFileSync(ledgerPath, `${JSON.stringify(observation)}\n`, { mode: 0o600 }); return { observation, duplicate: false } },
    list(limit = 100) { return observations().slice(-Math.min(Math.max(Number(limit) || 100, 1), 500)).reverse() },
    status() { return { observation_count: observations().length, local_ledger_exists: existsSync(ledgerPath), external_persistence: "not_configured" } },
  }
}

export function summarizeCapabilityPerformance({ registry, observations = [] } = {}) {
  validateSamwiseCapabilityIntelligenceRegistry(registry)
  const superseded = new Set(observations.map(item => item.supersedes_observation_id).filter(Boolean))
  const effective = observations.filter(item => !superseded.has(item.observation_id))
  return registry.capabilities.map(capability => {
    const rows = effective.filter(item => item.capability_id === capability.capability_id).sort((left, right) => Date.parse(left.occurred_at) - Date.parse(right.occurred_at))
    const successes = rows.filter(item => item.status === "succeeded").length
    const failures = rows.filter(item => item.status === "failed").length
    const deferred = rows.filter(item => ["deferred", "incompatible"].includes(item.status)).length
    const validated = rows.filter(item => ["passed", "failed"].includes(item.validation_result))
    const recent = rows.slice(-3)
    const recentSuccesses = recent.filter(item => item.status === "succeeded").length
    const recurring_failure_categories = [...new Set(rows.filter(item => item.status === "failed" && item.error_category).map(item => item.error_category).filter(category => rows.filter(item => item.status === "failed" && item.error_category === category).length >= 2))]
    return {
      capability_id: capability.capability_id, executions: rows.length, successes, failures, deferred_or_incompatible: deferred,
      validation_pass_rate: validated.length ? Number((validated.filter(item => item.validation_result === "passed").length / validated.length).toFixed(3)) : null,
      average_latency_ms: rows.some(item => item.duration_ms !== null) ? Math.round(rows.reduce((sum, item) => sum + (item.duration_ms || 0), 0) / rows.filter(item => item.duration_ms !== null).length) : null,
      median_latency_ms: median(rows.map(item => item.duration_ms).filter(item => item !== null)), fallback_frequency: rows.filter(item => item.fallback_used).length,
      owner_correction_frequency: rows.filter(item => item.owner_correction).length, last_successful_use: rows.filter(item => item.status === "succeeded").at(-1)?.occurred_at || null,
      recent_reliability_trend: rows.length < 3 ? "insufficient_evidence" : recentSuccesses === recent.length ? "recent_successes" : recentSuccesses === 0 ? "recent_failures" : "mixed",
      recurring_failure_categories, evidence_level: rows.length < 3 ? "insufficient_evidence" : "observed",
    }
  })
}

export function deriveRoutingLearningSignals(observations = []) {
  const superseded = new Set(observations.map(item => item.supersedes_observation_id).filter(Boolean))
  const groups = new Map()
  for (const observation of observations.filter(item => !superseded.has(item.observation_id))) {
    const key = `${observation.capability_id}|${observation.task_category}`
    groups.set(key, [...(groups.get(key) || []), observation])
  }
  const signals = []
  for (const [key, rows] of groups) {
    const [capability_id, task_category] = key.split("|")
    const failures = rows.filter(item => item.status === "failed")
    const successes = rows.filter(item => item.status === "succeeded")
    const corrections = rows.filter(item => item.owner_correction)
    const signal = (signal_type, evidence, pattern, recommendation) => signals.push(Object.freeze({ schema_version: "samwise-routing-learning-signal-v1", signal_id: `srl_${digest({ signal_type, capability_id, task_category, ids: evidence.map(item => item.observation_id) }).slice(0, 24)}`, signal_type, task_category, affected_capabilities: [capability_id], evidence_count: evidence.length, observed_pattern: pattern, confidence: evidence.length >= 4 ? "moderate" : "low", recommended_change: recommendation, requires_owner_approval: true, supporting_observation_ids: evidence.map(item => item.observation_id), automatic_policy_change: false }))
    if (failures.length >= 2) signal("repeated_failure", failures, `Observed ${failures.length} failed executions for this task category.`, "Review constraints or choose a validated fallback; do not auto-change routing.")
    if (successes.length >= 3) signal("repeated_success", successes, `Observed ${successes.length} successful executions for this task category.`, "Consider this capability as a preferred candidate after owner review.")
    if (corrections.length >= 2) signal("repeated_owner_correction", corrections, `Observed ${corrections.length} owner corrections for this task category.`, "Review output contract and keep owner review in the route.")
  }
  return signals.sort((left, right) => left.signal_id.localeCompare(right.signal_id))
}

export function recommendCapabilityRoute({ registry, task, observations = [] } = {}) {
  const candidates = matchSamwiseCapabilities({ registry, task })
  const performance = new Map(summarizeCapabilityPerformance({ registry, observations }).map(item => [item.capability_id, item]))
  const signals = deriveRoutingLearningSignals(observations)
  const capabilityById = new Map(registry.capabilities.map(capability => [capability.capability_id, capability]))
  const decorate = candidate => { const capability = capabilityById.get(candidate.capability_id); return { ...candidate, estimated_cost_class: capability.cost_class, owner_review_required: capability.owner_review_required, historical_evidence: performance.get(candidate.capability_id), relevant_signals: signals.filter(signal => signal.affected_capabilities.includes(candidate.capability_id) && signal.task_category === identifier(task.task_type)) } }
  const [preferred, ...fallbacks] = candidates.map(decorate)
  return Object.freeze({ schema_version: "samwise-capability-routing-recommendation-v1", advisory_only: true, mutation_authority_granted: false, task: normalizeCapabilityTask(task), preferred_capability: preferred || null, fallback_capabilities: fallbacks.slice(0, 3), no_candidate_reason: preferred ? null : "No operational capability satisfies every hard constraint." })
}

export function ownerCapabilityInventory({ registry, observations = [] } = {}) {
  const performance = new Map(summarizeCapabilityPerformance({ registry, observations }).map(item => [item.capability_id, item]))
  const capabilities = registry.capabilities.map(capability => ({ ...capability, recent_usage: performance.get(capability.capability_id) }))
  return Object.freeze({ schema_version: "samwise-capability-owner-inventory-v1", advisory_only: true, grouped_by_implementation: Object.groupBy(capabilities, capability => capability.implementation_type), learning_signals: deriveRoutingLearningSignals(observations) })
}
