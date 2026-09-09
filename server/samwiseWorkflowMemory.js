import { createHash } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { redactWorkObserverText } from "./samwiseWorkObserver.js"

export const SAMWISE_WORKFLOW_MEMORY_ID = "samwise_workflow_memory"
export const WORKFLOW_OUTCOMES = Object.freeze(["succeeded", "failed", "incomplete", "deferred", "unknown"])
export const WORKFLOW_CONFIDENCE = Object.freeze(["low", "moderate", "high"])
export const FAILURE_CATEGORIES = Object.freeze(["unsupported_api", "compiler_configuration", "missing_developer_tool", "unavailable_local_dependency", "schema_mismatch", "contract_incompatibility", "network_service_unavailable", "authorization_failure", "validation_failure", "malformed_model_result", "unknown"])

const clean = (value, limit = 500) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit)
const identifier = value => clean(value, 120).toLowerCase().replace(/[^a-z0-9:_-]/g, "_")
const safeArray = (items, limit = 30) => Array.isArray(items) ? items.map(item => clean(item, 240)).filter(Boolean).slice(0, limit) : []
const validTime = value => typeof value === "string" && !Number.isNaN(Date.parse(value))
const canonical = value => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value)
  if (Number.isFinite(value)) return String(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && Object.getPrototypeOf(value) === Object.prototype) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
  throw new Error("samwise_workflow_memory_noncanonical_value")
}
const hash = value => createHash("sha256").update(canonical(value), "utf8").digest("hex")
const unique = values => [...new Set(values)]
const sourceId = value => clean(value, 160)

export function createFailureSignature(input = {}) {
  const category = FAILURE_CATEGORIES.includes(input.category) ? input.category : "unknown"
  const structure = { workflow_category: identifier(input.workflow_category), category, environment_class: identifier(input.environment_class) || "unknown" }
  if (!structure.workflow_category) throw new Error("samwise_workflow_failure_signature_invalid")
  return Object.freeze({ schema_version: "samwise-workflow-failure-signature-v1", failure_signature_id: `swf_${hash(structure).slice(0, 24)}`, ...structure, detail: redactWorkObserverText(input.detail).slice(0, 500) || null })
}

export function workflowSignature(input = {}) {
  const structure = {
    workflow_category: identifier(input.workflow_category), domain: identifier(input.domain), capabilities: unique((input.capabilities || []).map(identifier).filter(Boolean)).sort(),
    requested_outcome: identifier(input.requested_outcome), environment_class: identifier(input.environment_class) || "unknown",
  }
  if (!structure.workflow_category || !structure.domain || !structure.requested_outcome) throw new Error("samwise_workflow_signature_invalid")
  return Object.freeze({ schema_version: "samwise-workflow-signature-v1", signature_id: `sws_${hash(structure).slice(0, 24)}`, ...structure })
}

export function createWorkflowEpisode(input = {}) {
  const started_at = input.started_at || null
  const ended_at = input.ended_at || null
  if (started_at && !validTime(started_at) || ended_at && !validTime(ended_at)) throw new Error("samwise_workflow_episode_timestamp_invalid")
  if (started_at && ended_at && Date.parse(ended_at) < Date.parse(started_at)) throw new Error("samwise_workflow_episode_duration_invalid")
  const signature = workflowSignature(input)
  const outcome = WORKFLOW_OUTCOMES.includes(input.final_outcome) ? input.final_outcome : "unknown"
  const actually_validated = input.actually_validated === true
  if (outcome === "succeeded" && !actually_validated) throw new Error("samwise_workflow_episode_success_requires_validation")
  const steps = (input.significant_steps || []).map(step => ({ stage: identifier(step.stage) || "observed_step", status: ["passed", "failed", "blocked", "observed", "fixed", "unknown"].includes(step.status) ? step.status : "unknown", summary: redactWorkObserverText(step.summary).slice(0, 400) })).filter(step => step.summary).slice(0, 30)
  const failures = (input.failures || []).map(failure => ({ ...createFailureSignature({ workflow_category: signature.workflow_category, environment_class: signature.environment_class, ...failure }), source_observation_id: sourceId(failure.source_observation_id) || null, resolved: failure.resolved === true })).slice(0, 20)
  const recoveries = (input.recoveries || []).map(recovery => ({ summary: redactWorkObserverText(recovery.summary).slice(0, 400), status: ["succeeded", "partial", "unknown"].includes(recovery.status) ? recovery.status : "unknown", related_failure_signature_id: sourceId(recovery.related_failure_signature_id) || null })).filter(item => item.summary).slice(0, 20)
  const validations = (input.validations || []).map(validation => ({ kind: identifier(validation.kind) || "unknown", status: ["passed", "failed", "not_run", "blocked", "unknown"].includes(validation.status) ? validation.status : "unknown", reference: redactWorkObserverText(validation.reference).slice(0, 240) || null })).slice(0, 20)
  const core = {
    schema_version: "samwise-workflow-episode-v1", project: identifier(input.project), workflow_category: signature.workflow_category, domain: signature.domain, goal: redactWorkObserverText(input.goal).slice(0, 500),
    started_at, ended_at, duration_ms: started_at && ended_at ? Math.max(0, Date.parse(ended_at) - Date.parse(started_at)) : null,
    capabilities: signature.capabilities, route_taken: safeArray(input.route_taken, 12), significant_steps: steps, failures, recoveries, validations, final_outcome: outcome,
    owner_intervention: input.owner_intervention === true, cost_class: ["free_local", "low", "medium", "high", "unknown"].includes(input.cost_class) ? input.cost_class : "unknown",
    artifact_references: safeArray(input.artifact_references, 12).map(item => path.basename(item)), source_observation_ids: unique((input.source_observation_ids || []).map(sourceId).filter(Boolean)).slice(0, 60),
    completion_confidence: WORKFLOW_CONFIDENCE.includes(input.completion_confidence) ? input.completion_confidence : "low", actually_validated,
    supersedes_episode_id: sourceId(input.supersedes_episode_id) || null,
    uncovered_requirements: (input.uncovered_requirements || []).map(item => ({ requirement: identifier(item.requirement), description: redactWorkObserverText(item.description).slice(0, 300), workaround: redactWorkObserverText(item.workaround).slice(0, 300) || null })).filter(item => item.requirement && item.description).slice(0, 12),
    requested_outcome: signature.requested_outcome, environment_class: signature.environment_class, workflow_signature_id: signature.signature_id,
  }
  if (!core.project || !core.goal || !core.capabilities.length || !core.source_observation_ids.length) throw new Error("samwise_workflow_episode_incomplete")
  const content_fingerprint = hash({ ...core, supersedes_episode_id: null })
  const fingerprint = hash(core)
  return Object.freeze({ episode_id: `swe_${fingerprint.slice(0, 24)}`, ...core, content_fingerprint, fingerprint })
}

const nativeFailureCategory = value => {
  if (/accessibility_live_region|unsupported.*api/i.test(value)) return "unsupported_api"
  if (/toolchain|developer_directory/i.test(value)) return "missing_developer_tool"
  if (/bundle|executable/i.test(value)) return "compiler_configuration"
  return "unknown"
}

export function extractNativeAppWorkflowEpisodes(memory = {}) {
  const attempts = Array.isArray(memory.attempts) ? memory.attempts : []
  if (attempts.length < 1) return []
  const episode = ({ entries, goal, requested_outcome, outcome, validated, confidence, artifact }) => {
    const failures = entries.filter(item => item.failure_class).map(item => ({ category: nativeFailureCategory(item.failure_class), detail: item.failure_class, source_observation_id: item.attempt_id, resolved: entries.some(candidate => candidate.install_result === "passed") }))
    const recoveries = entries.flatMap(item => (item.fixes_applied || []).map(summary => ({ summary, status: item.install_result === "passed" ? "succeeded" : "partial" })))
    if (entries.some(item => item.install_result === "passed") && !recoveries.length) recoveries.push({ summary: "A later simulator install and launch succeeded; the detailed repair was not retained in the source memory.", status: "unknown" })
    return createWorkflowEpisode({ project: memory.project_id || "native_app", workflow_category: "native_app_build_validation", domain: "app_development", goal, started_at: entries[0]?.started_at, ended_at: entries.at(-1)?.started_at,
      capabilities: ["native_app_build_validation"], route_taken: unique(entries.map(item => item.stage)), significant_steps: entries.map(item => ({ stage: item.stage, status: item.result === "failed" ? "failed" : item.result === "blocked" ? "blocked" : item.result === "observed" ? "observed" : "unknown", summary: item.failure_class || item.observations?.[0] || item.attempt_id })), failures, recoveries,
      validations: entries.map(item => ({ kind: item.stage === "test" ? "test" : "build_or_runtime", status: item.install_result === "failed" || item.result === "failed" ? "failed" : item.install_result === "passed" || item.build_result === "passed" ? "passed" : item.result === "blocked" ? "blocked" : "not_run", reference: item.attempt_id })), final_outcome: outcome, owner_intervention: entries.some(item => item.action_class === "human_runtime_observation"), cost_class: "free_local", artifact_references: [artifact], source_observation_ids: entries.map(item => item.attempt_id), completion_confidence: confidence, actually_validated: validated, requested_outcome, environment_class: "ios_xcode_simulator" })
  }
  const initial = attempts.slice(0, 3)
  const enhancement = attempts.slice(3)
  return [
    ...(initial.length === 3 ? [episode({ entries: initial, goal: "Produce and launch the Miller Navigator simulator application.", requested_outcome: "simulator_launch", outcome: initial.some(item => item.install_result === "passed") ? "succeeded" : "incomplete", validated: initial.some(item => item.install_result === "passed"), confidence: "high", artifact: "native-app-build-validation-miller-navigator-memory-2026-09-08.json" })] : []),
    ...(enhancement.length ? [episode({ entries: enhancement, goal: "Validate the enhanced Miller Navigator SwiftUI interface after a compatibility repair.", requested_outcome: "simulator_build", outcome: "incomplete", validated: false, confidence: "moderate", artifact: "native-app-build-validation-miller-navigator-memory-2026-09-08.json" })] : []),
  ]
}

export function extractWorkObserverEpisodes(events = []) {
  const groups = Object.groupBy(events.filter(item => item?.schema_version === "samwise-work-event-v1"), item => item.session_id)
  return Object.values(groups).flatMap(rows => {
    const ordered = [...rows].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp))
    const start = ordered.find(item => item.event_type === "job_started")
    const finish = ordered.find(item => item.event_type === "job_finished")
    if (!start || !finish) return []
    const failures = ordered.filter(item => item.status === "failed" || item.status === "blocked").map(item => ({ category: item.source === "supabase" ? "unavailable_local_dependency" : "validation_failure", detail: item.summary, source_observation_id: item.event_id, resolved: item.resolution_status === "resolved" }))
    const validationFailureSignature = createFailureSignature({ workflow_category: "samwise_implementation", category: "validation_failure", environment_class: "local_node" }).failure_signature_id
    return [createWorkflowEpisode({ project: start.project, workflow_category: "samwise_implementation", domain: "operations", goal: finish.summary, started_at: start.timestamp, ended_at: finish.timestamp, capabilities: ["samwise_work_observer"], route_taken: unique(ordered.map(item => item.source)), significant_steps: ordered.map(item => ({ stage: item.event_type, status: item.status === "passed" ? "passed" : item.status === "failed" ? "failed" : item.status === "blocked" ? "blocked" : "observed", summary: item.summary })), failures, recoveries: ordered.filter(item => item.event_type === "fix_applied").map(item => ({ summary: item.summary, status: item.resolution_status === "resolved" ? "succeeded" : "partial", related_failure_signature_id: validationFailureSignature })), validations: ordered.filter(item => item.event_type === "test_finished").map(item => ({ kind: "test", status: item.status === "passed" ? "passed" : "failed", reference: item.command_identifier || item.event_id })), final_outcome: finish.status === "passed" ? "succeeded" : "incomplete", owner_intervention: false, cost_class: "free_local", artifact_references: ["work-events-v1.ndjson"], source_observation_ids: ordered.map(item => item.event_id), completion_confidence: "high", actually_validated: ordered.some(item => item.event_type === "test_finished" && item.status === "passed"), requested_outcome: "validated_implementation", environment_class: "local_node" })]
  })
}

export function createWorkflowMemoryStore(root) {
  const directory = path.resolve(root, "artifacts/samwise/runtime/workflow-memory")
  const episodePath = path.join(directory, "episodes-v1.ndjson")
  mkdirSync(directory, { recursive: true })
  const episodes = () => { try { return readFileSync(episodePath, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) } catch { return [] } }
  const effective = rows => { const superseded = new Set(rows.map(item => item.supersedes_episode_id).filter(Boolean)); return rows.filter(item => !superseded.has(item.episode_id)) }
  return {
    paths: { directory, episodePath },
    append(input) { const episode = createWorkflowEpisode(input); const prior = episodes(); if (prior.some(item => item.fingerprint === episode.fingerprint)) return { episode, duplicate: true }; appendFileSync(episodePath, `${JSON.stringify(episode)}\n`, { mode: 0o600 }); return { episode, duplicate: false } },
    list(limit = 100) { return effective(episodes()).slice(-Math.min(Math.max(Number(limit) || 100, 1), 500)).reverse() },
    auditList(limit = 100) { return episodes().slice(-Math.min(Math.max(Number(limit) || 100, 1), 500)).reverse() },
    status() { const rows = episodes(); const current = effective(rows); return { episode_count: current.length, audit_episode_count: rows.length, local_index_exists: existsSync(episodePath), validated_episodes: current.filter(item => item.actually_validated).length, external_persistence: "not_configured" } },
  }
}

export function deriveWorkflowStrategies(episodes = []) {
  const groups = Object.groupBy(episodes, item => item.workflow_signature_id)
  return Object.values(groups).flatMap(rows => {
    const successful = rows.filter(item => item.final_outcome === "succeeded" && item.actually_validated)
    if (!successful.length) return []
    const sample_size = rows.length
    const provisional = successful.length < 2
    const failurePatterns = unique(rows.flatMap(item => item.failures.map(failure => failure.category))).filter(category => new Set(rows.filter(item => item.failures.some(failure => failure.category === category)).map(item => item.episode_id)).size >= 2)
    return [Object.freeze({ schema_version: "samwise-workflow-strategy-v1", strategy_id: `sws_${hash({ signature: rows[0].workflow_signature_id, episode_ids: rows.map(item => item.episode_id).sort() }).slice(0, 24)}`, workflow_signature_id: rows[0].workflow_signature_id, supporting_episode_ids: rows.map(item => item.episode_id), sample_size, successful_episode_count: successful.length, historical_success_rate: sample_size >= 3 ? Number((successful.length / sample_size).toFixed(3)) : null, provisional, successful_route: unique(successful.flatMap(item => item.route_taken)), frequent_failure_patterns: failurePatterns, successful_recovery_patterns: unique(successful.flatMap(item => item.recoveries.filter(recovery => recovery.status === "succeeded").map(recovery => recovery.summary))), required_capabilities: unique(rows.flatMap(item => item.capabilities)).sort(), required_permissions: unique(rows.flatMap(item => item.owner_intervention ? ["owner_intervention_or_runtime_observation"] : [])), expected_validation: unique(successful.flatMap(item => item.validations.filter(validation => validation.status === "passed").map(validation => validation.kind))), confidence: successful.length >= 3 ? "moderate" : "low", known_limitations: provisional ? ["Provisional: fewer than two validated successful episodes."] : [], owner_review_required: true, automatic_execution: false })]
  }).sort((left, right) => left.strategy_id.localeCompare(right.strategy_id))
}

export function summarizeWorkflowFailures(episodes = []) {
  const grouped = new Map()
  for (const episode of episodes) for (const failure of episode.failures || []) {
    const key = failure.failure_signature_id
    grouped.set(key, [...(grouped.get(key) || []), { episode, failure }])
  }
  return [...grouped.entries()].map(([failure_signature_id, rows]) => {
    const affected_episode_ids = unique(rows.map(item => item.episode.episode_id))
    const recoveries = rows.flatMap(item => item.episode.recoveries.filter(recovery => recovery.related_failure_signature_id === failure_signature_id))
    return { failure_signature_id, category: rows[0].failure.category, environment_class: rows[0].failure.environment_class, occurrences: rows.length, episode_count: affected_episode_ids.length, affected_episode_ids, successful_recovery_observed: recoveries.some(recovery => recovery.status === "succeeded"), recovery_notes: unique(recoveries.filter(recovery => recovery.status !== "unknown").map(recovery => recovery.summary)), evidence_level: affected_episode_ids.length < 2 ? "insufficient_evidence" : "observed" }
  }).sort((left, right) => right.occurrences - left.occurrences || left.failure_signature_id.localeCompare(right.failure_signature_id))
}

export function deriveCapabilityGapSignals({ episodes = [], registered_capability_ids = [], threshold = 3 } = {}) {
  const registered = new Set(registered_capability_ids)
  const groups = new Map()
  for (const episode of episodes) for (const gap of episode.uncovered_requirements || []) {
    if (registered.has(gap.requirement)) continue
    groups.set(gap.requirement, [...(groups.get(gap.requirement) || []), { episode, gap }])
  }
  return [...groups.entries()].filter(([, rows]) => rows.length >= threshold).map(([requirement, rows]) => Object.freeze({ schema_version: "samwise-capability-gap-signal-v1", signal_id: `scg_${hash({ requirement, episode_ids: rows.map(item => item.episode.episode_id).sort() }).slice(0, 24)}`, missing_repeated_task: requirement, workflow_signatures_affected: unique(rows.map(item => item.episode.workflow_signature_id)), evidence_count: rows.length, current_workaround: unique(rows.map(item => item.gap.workaround).filter(Boolean)), estimated_benefit: "Review repeated manual workaround and validation burden.", suggested_capability_description: unique(rows.map(item => item.gap.description)).join(" "), owner_review_required: true, automatic_registration: false })).sort((left, right) => left.signal_id.localeCompare(right.signal_id))
}

export function recommendPriorWorkflowExperience({ episodes = [], task = {} } = {}) {
  const requested = { workflow_category: identifier(task.workflow_category), domain: identifier(task.domain), requested_outcome: identifier(task.requested_outcome), environment_class: identifier(task.environment_class) || "unknown", capabilities: (task.capabilities || []).map(identifier).filter(Boolean) }
  if (!requested.workflow_category || !requested.domain || !requested.requested_outcome) throw new Error("samwise_workflow_recommendation_task_incomplete")
  const matches = episodes.map(episode => {
    const score =
      (episode.workflow_category === requested.workflow_category ? 40 : 0) +
      (episode.domain === requested.domain ? 25 : 0) +
      (episode.requested_outcome === requested.requested_outcome ? 20 : 0) +
      (episode.environment_class === requested.environment_class ? 10 : 0) +
      (requested.capabilities.length && requested.capabilities.every(capability => episode.capabilities.includes(capability)) ? 5 : 0)
    return { episode, score }
  }).filter(item => item.score >= 85).sort((left, right) => right.score - left.score || Number(right.episode.actually_validated) - Number(left.episode.actually_validated) || Date.parse(right.episode.ended_at || 0) - Date.parse(left.episode.ended_at || 0))
  const strategies = deriveWorkflowStrategies(matches.map(item => item.episode))
  const validated = matches.filter(item => item.episode.actually_validated && item.episode.final_outcome === "succeeded")
  return Object.freeze({ schema_version: "samwise-prior-workflow-recommendation-v1", advisory_only: true, automatic_execution: false, task: requested, matching_episodes: matches.map(item => ({ episode_id: item.episode.episode_id, score: item.score, outcome: item.episode.final_outcome, actually_validated: item.episode.actually_validated })), strongest_relevant_episode: matches[0]?.episode || null, known_successful_strategy: strategies.find(item => !item.provisional) || strategies[0] || null, known_failure_traps: unique(matches.flatMap(item => item.episode.failures.map(failure => failure.category))), capabilities_likely_required: unique(matches.flatMap(item => item.episode.capabilities)), expected_validation_steps: unique(validated.flatMap(item => item.episode.validations.filter(validation => validation.status === "passed").map(validation => validation.kind))), confidence: validated.length >= 2 ? "moderate" : validated.length ? "low" : "insufficient_evidence", evidence_insufficient: validated.length < 2, reasons: matches.length ? ["Matched bounded workflow structure, not raw task contents.", validated.length < 2 ? "Fewer than two validated successes; any strategy remains provisional." : "Multiple validated episodes support an advisory strategy."] : ["No sufficiently similar prior workflow episode was found."] })
}
