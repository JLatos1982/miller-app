import { createHash } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { redactWorkObserverText } from "./samwiseWorkObserver.js"

export const SAMWISE_OWNER_ADVISORY_ID = "samwise_owner_advisory_inbox"
export const ADVISORY_TYPES = Object.freeze(["learning_signal", "repeated_failure", "capability_gap", "cost_opportunity", "reliability_change", "successful_new_workflow", "degraded_capability", "configuration_problem", "research_opportunity", "owner_review_needed", "architecture_opportunity", "security_change", "listener_change", "miller_change"])
export const ADVISORY_STATUSES = Object.freeze(["new", "seen", "acknowledged", "dismissed", "resolved"])
export const ADVISORY_SIGNIFICANCE = Object.freeze(["notice", "meaningful", "important"])
export const ADVISORY_CONFIDENCE = Object.freeze(["low", "moderate", "high"])
export const ADVISORY_URGENCY = Object.freeze(["low", "normal", "high"])

const clean = (value, limit = 500) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit)
const identifier = value => clean(value, 160).toLowerCase().replace(/[^a-z0-9:_-]/g, "_")
const safeArray = (items, limit = 30) => Array.isArray(items) ? [...new Set(items.map(item => clean(item, 240)).filter(Boolean))].slice(0, limit) : []
const timestamp = value => typeof value === "string" && !Number.isNaN(Date.parse(value))
const canonical = value => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value)
  if (Number.isFinite(value)) return String(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && Object.getPrototypeOf(value) === Object.prototype) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
  throw new Error("samwise_owner_advisory_noncanonical_value")
}
const hash = value => createHash("sha256").update(canonical(value), "utf8").digest("hex")

export function createOwnerAdvisory(input = {}) {
  const created_at = input.created_at || new Date().toISOString()
  const core = {
    schema_version: "samwise-owner-advisory-v1", created_at, project: identifier(input.project) || "samwise", advisory_type: input.advisory_type,
    title: redactWorkObserverText(input.title).slice(0, 180), concise_summary: redactWorkObserverText(input.concise_summary).slice(0, 700),
    significance: ADVISORY_SIGNIFICANCE.includes(input.significance) ? input.significance : "notice", confidence: ADVISORY_CONFIDENCE.includes(input.confidence) ? input.confidence : "low",
    evidence_count: Number.isInteger(input.evidence_count) && input.evidence_count >= 0 ? input.evidence_count : 0, source_system: identifier(input.source_system),
    source_ids: safeArray(input.source_ids, 40), affected_capabilities: safeArray(input.affected_capabilities, 20).map(identifier).filter(Boolean),
    suggested_action: redactWorkObserverText(input.suggested_action).slice(0, 500) || null, owner_decision_required: input.owner_decision_required === true,
    urgency: ADVISORY_URGENCY.includes(input.urgency) ? input.urgency : "low", status: ADVISORY_STATUSES.includes(input.status) ? input.status : "new",
    supersedes_advisory_id: identifier(input.supersedes_advisory_id) || null, safe_artifact_references: safeArray(input.safe_artifact_references, 12).map(item => path.basename(item)),
  }
  if (!timestamp(core.created_at) || !ADVISORY_TYPES.includes(core.advisory_type) || !core.title || !core.concise_summary || !core.source_system || !core.source_ids.length) throw new Error("samwise_owner_advisory_invalid")
  const novelty_fingerprint = hash({ project: core.project, advisory_type: core.advisory_type, title: core.title, source_system: core.source_system, source_ids: [...core.source_ids].sort(), affected_capabilities: [...core.affected_capabilities].sort() })
  return Object.freeze({ advisory_id: `soa_${novelty_fingerprint.slice(0, 24)}`, ...core, novelty_fingerprint, fingerprint: hash(core) })
}

export function meaningfulOwnerAdvisory(candidate = {}) {
  if (!candidate || !ADVISORY_TYPES.includes(candidate.advisory_type)) return { meaningful: false, reason: "invalid_candidate" }
  if (!candidate.source_ids?.length) return { meaningful: false, reason: "missing_evidence_reference" }
  if (candidate.advisory_type === "successful_new_workflow" && candidate.provisional === true) return { meaningful: false, reason: "provisional_workflow" }
  if (["repeated_failure", "learning_signal", "capability_gap"].includes(candidate.advisory_type) && Number(candidate.evidence_count) < 2) return { meaningful: false, reason: "insufficient_pattern_evidence" }
  if (candidate.advisory_type === "configuration_problem" && candidate.blocked !== true) return { meaningful: false, reason: "not_currently_blocked" }
  return { meaningful: true, reason: "meaningful_change" }
}

export function generateOwnerAdvisories({ project = "miller-app", routing_signals = [], workflow_failures = [], workflow_episodes = [], workflow_strategies = [], capability_gaps = [], normalized_signals = [] } = {}) {
  const proposals = []
  const suppressed = []
  const consider = candidate => {
    const gate = meaningfulOwnerAdvisory(candidate)
    if (!gate.meaningful) { suppressed.push({ source_id: candidate.source_ids?.[0] || "unknown", reason: gate.reason }); return }
    proposals.push(createOwnerAdvisory({ project, ...candidate }))
  }
  for (const signal of routing_signals) if (signal.signal_type === "repeated_failure") consider({ advisory_type: "repeated_failure", title: `${clean(signal.affected_capabilities?.[0]).replaceAll("_", " ")} has repeated observed failures`, concise_summary: `${signal.observed_pattern} Causes remain distinct unless separately evidenced; this is not an automatic routing change.`, significance: "meaningful", confidence: signal.confidence === "moderate" ? "moderate" : "low", evidence_count: signal.evidence_count, source_system: "capability_intelligence", source_ids: [signal.signal_id, ...(signal.supporting_observation_ids || [])], affected_capabilities: signal.affected_capabilities, suggested_action: signal.recommended_change, owner_decision_required: true, urgency: "normal" })
  for (const gap of capability_gaps) consider({ advisory_type: "capability_gap", title: `Consider a capability for ${gap.missing_repeated_task.replaceAll("_", " ")}`, concise_summary: `${gap.evidence_count} workflow episodes used the same uncovered requirement. ${gap.suggested_capability_description}`, significance: "meaningful", confidence: gap.evidence_count >= 4 ? "moderate" : "low", evidence_count: gap.evidence_count, source_system: "workflow_memory", source_ids: [gap.signal_id, ...(gap.workflow_signatures_affected || [])], affected_capabilities: [], suggested_action: "Review the proposed capability before registering or building anything.", owner_decision_required: true, urgency: "normal" })
  for (const strategy of workflow_strategies) consider({ advisory_type: "successful_new_workflow", title: "A workflow now has repeated validated success", concise_summary: `${strategy.successful_episode_count} validated successful episodes support one workflow strategy.`, significance: "meaningful", confidence: strategy.confidence, evidence_count: strategy.successful_episode_count, source_system: "workflow_memory", source_ids: [strategy.strategy_id, ...(strategy.supporting_episode_ids || [])], affected_capabilities: strategy.required_capabilities, suggested_action: "Review the strategy before adopting it as routing policy.", owner_decision_required: true, urgency: "low", provisional: strategy.provisional })
  for (const failure of workflow_failures) {
    if (failure.episode_count >= 2) consider({ advisory_type: "repeated_failure", title: `${failure.category.replaceAll("_", " ")} recurs across workflows`, concise_summary: `${failure.episode_count} distinct workflow episodes contain this failure category.`, significance: "meaningful", confidence: "low", evidence_count: failure.episode_count, source_system: "workflow_memory", source_ids: [failure.failure_signature_id, ...(failure.affected_episode_ids || [])], affected_capabilities: [], suggested_action: "Review the failure evidence and any linked recoveries before changing a workflow.", owner_decision_required: true, urgency: "normal" })
  }
  for (const episode of workflow_episodes) {
    const blocked = episode.final_outcome === "incomplete" && episode.failures?.some(item => item.category === "missing_developer_tool")
    if (blocked) consider({ advisory_type: "configuration_problem", title: "Native-app validation remains blocked by the local developer toolchain", concise_summary: "The enhanced Miller Navigator workflow remains incomplete because local xcodebuild did not reach project compilation. The compatibility repair is not treated as a verified simulator build.", significance: "meaningful", confidence: "low", evidence_count: 1, source_system: "workflow_memory", source_ids: [episode.episode_id, ...episode.source_observation_ids], affected_capabilities: episode.capabilities, suggested_action: "Use the installed Xcode developer directory or rebuild manually in Xcode, then record the simulator result before relying on the repair.", owner_decision_required: true, urgency: "normal", blocked: true, safe_artifact_references: episode.artifact_references })
  }
  for (const signal of normalized_signals) consider({
    advisory_type: signal.advisory_type,
    title: signal.title,
    concise_summary: signal.concise_summary,
    significance: signal.significance,
    confidence: signal.confidence,
    evidence_count: signal.evidence_count,
    source_system: signal.source_system,
    source_ids: signal.source_ids,
    affected_capabilities: signal.affected_capabilities,
    suggested_action: signal.suggested_action,
    owner_decision_required: signal.owner_decision_required,
    urgency: signal.urgency,
    safe_artifact_references: signal.safe_artifact_references,
    blocked: signal.blocked,
  })
  return Object.freeze({ schema_version: "samwise-owner-advisory-generation-v1", advisories: proposals.sort((left, right) => left.advisory_id.localeCompare(right.advisory_id)), suppressed: suppressed.sort((left, right) => `${left.reason}|${left.source_id}`.localeCompare(`${right.reason}|${right.source_id}`)) })
}

export function createOwnerAdvisoryInbox(root) {
  const directory = path.resolve(root, "artifacts/samwise/runtime/owner-advisories")
  const advisoryPath = path.join(directory, "advisories-v1.ndjson")
  const eventPath = path.join(directory, "advisory-events-v1.ndjson")
  mkdirSync(directory, { recursive: true })
  const read = file => { try { return readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) } catch { return [] } }
  const hydrated = () => {
    const events = read(eventPath)
    const latest = new Map()
    for (const event of events) latest.set(event.advisory_id, event)
    return read(advisoryPath).map(advisory => ({ ...advisory, status: latest.get(advisory.advisory_id)?.status || advisory.status, status_updated_at: latest.get(advisory.advisory_id)?.updated_at || advisory.created_at }))
  }
  return {
    paths: { directory, advisoryPath, eventPath },
    append(input) { const advisory = createOwnerAdvisory(input); const prior = read(advisoryPath); if (prior.some(item => item.novelty_fingerprint === advisory.novelty_fingerprint)) return { advisory, duplicate: true }; appendFileSync(advisoryPath, `${JSON.stringify(advisory)}\n`, { mode: 0o600 }); return { advisory, duplicate: false } },
    list({ status = null, limit = 100 } = {}) { return hydrated().filter(item => !status || item.status === status).sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at)).slice(0, Math.min(Math.max(Number(limit) || 100, 1), 500)) },
    show(advisoryId) { const advisory = hydrated().find(item => item.advisory_id === advisoryId); if (!advisory) throw new Error("samwise_owner_advisory_missing"); return advisory },
    transition(advisoryId, status, now = () => new Date()) { if (!ADVISORY_STATUSES.includes(status) || status === "new") throw new Error("samwise_owner_advisory_status_invalid"); this.show(advisoryId); const updated_at = now().toISOString(); const event = { schema_version: "samwise-owner-advisory-event-v1", event_id: `soe_${hash({ advisoryId, status, updated_at }).slice(0, 24)}`, advisory_id: advisoryId, status, updated_at }; appendFileSync(eventPath, `${JSON.stringify(event)}\n`, { mode: 0o600 }); return this.show(advisoryId) },
    summary() { const rows = hydrated(); const counts = Object.fromEntries(ADVISORY_STATUSES.map(status => [status, rows.filter(item => item.status === status).length])); return { status: rows.length ? "meaningful_changes_available" : "no_meaningful_changes", counts, local_inbox_exists: existsSync(advisoryPath), external_persistence: "not_configured" } },
  }
}

export function buildSamwiseBrief(advisories = []) {
  const active = advisories.filter(item => ["new", "seen"].includes(item.status))
  if (!active.length) return Object.freeze({ schema_version: "samwise-brief-v1", status: "no_meaningful_changes", items: [] })
  const select = type => active.filter(item => item.advisory_type === type).map(item => ({ advisory_id: item.advisory_id, title: item.title, confidence: item.confidence, suggested_action: item.suggested_action, owner_decision_required: item.owner_decision_required }))
  return Object.freeze({ schema_version: "samwise-brief-v1", status: "meaningful_changes_available", new_things_learned: select("learning_signal"), problems_detected: [...select("repeated_failure"), ...select("configuration_problem"), ...select("degraded_capability")], workflows_improving: select("successful_new_workflow"), capability_gaps: select("capability_gap"), suggested_next_work: active.filter(item => item.suggested_action).map(item => ({ advisory_id: item.advisory_id, suggested_action: item.suggested_action })), owner_decisions_needed: active.filter(item => item.owner_decision_required).map(item => item.advisory_id) })
}

export function compactOwnerAdvisoryRetrieval(advisories = [], { limit = 20 } = {}) {
  return advisories.filter(item => ["new", "seen", "acknowledged"].includes(item.status)).slice(0, Math.min(Math.max(Number(limit) || 20, 1), 50)).map(item => ({ advisory_id: item.advisory_id, created_at: item.created_at, advisory_type: item.advisory_type, title: item.title, concise_summary: item.concise_summary, significance: item.significance, confidence: item.confidence, evidence_count: item.evidence_count, suggested_action: item.suggested_action, owner_decision_required: item.owner_decision_required, urgency: item.urgency, status: item.status, source_system: item.source_system, source_ids: item.source_ids, safe_artifact_references: item.safe_artifact_references }))
}

export function privateOwnerAdvisoryPersistencePlan() {
  return Object.freeze({ mode: "proposal_only_not_applied", schema: "private", authenticated_owner_access_only: true, anon_access: false, raw_logs_uploaded: false, credential_storage: false, required_before_activation: ["owner_approval", "CLI_generated_migration", "RLS_and_grant_tests", "authorized_server_retrieval_adapter"] })
}
