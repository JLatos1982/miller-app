import { SECURITY_INSTRUMENTS, configurationDrift } from "./securityInstruments.js"
import { normalizeSecurityFindings } from "./operationsDefense.js"
import { inspectRepositoryHygiene } from "./securityRepositoryHygiene.js"
import { runDependencyAdvisoryAudit } from "./securityDependencyAudit.js"
import { MILLER_SECURITY_PROFILE } from "./millerSecurityProfile.js"
import { capabilityGaps, capabilityRegistry } from "./securityCore.js"
import { inspectAuthorizedHttpPosture, inspectRuntimeAnomalies } from "./securityHttpSensors.js"
import { inspectAuthorizedSurface } from "./securitySurface.js"
import { securityVersionContext } from "./securityVersion.js"
import { deploymentObservation, inspectDeploymentConsistency, inspectRuntimeEnvironment, inspectSchedulerPosture } from "./securityDeployment.js"

export const SECURITY_RHYTHMS = Object.freeze([{ id: "heartbeat", purpose: "cheap present-state check", cadence: "15_minutes", scheduler: "local_allowlisted" }, { id: "security_pulse", purpose: "bounded defensive inspection", cadence: "6_hours", scheduler: "local_allowlisted" }, { id: "daily_security_review", purpose: "consolidate lifecycle changes", cadence: "daily", scheduler: "disabled" }, { id: "deep_security_review", purpose: "security maintenance posture", cadence: "weekly", scheduler: "disabled" }])
export const SECURITY_PULSE_MODES = Object.freeze({ local: { external_requests: 0, instruments: ["configuration_drift", "repository_hygiene", "http_header_posture", "auth_boundary", "request_boundary", "response_hygiene", "runtime_anomaly", "public_surface", "auth_boundary_variants", "response_contract", "deployment_consistency", "runtime_environment_posture", "scheduler_posture"] }, advisories: { external_requests: 1, instruments: ["configuration_drift", "repository_hygiene", "dependency_posture", "deployment_consistency", "runtime_environment_posture", "scheduler_posture"] }, deep_local: { external_requests: 0, instruments: ["configuration_drift", "repository_hygiene", "static_analysis", "container_posture", "deployment_consistency", "runtime_environment_posture", "scheduler_posture"] } })
export function pulseFreshness(lastCompletedAt, now = Date.now()) { return !lastCompletedAt ? "never_run" : now - new Date(lastCompletedAt).getTime() > 21600000 ? "stale" : "current" }
export function reconcileInstrumentFindings({ instrumentId, completeness, findings = [], previous = [] } = {}) { if (!instrumentId) throw new Error("instrument_required"); const current = new Set(findings.map((item) => item.finding_fingerprint)), known = new Map(previous.map((item) => [item.finding_fingerprint, item])), open = previous.filter((item) => item.instrument_id === instrumentId && !["resolved", "false_positive"].includes(item.lifecycle)); return { new: findings.filter((item) => !known.has(item.finding_fingerprint)), recurring: findings.filter((item) => known.has(item.finding_fingerprint) && known.get(item.finding_fingerprint).lifecycle !== "resolved"), reappeared: findings.filter((item) => known.get(item.finding_fingerprint)?.lifecycle === "resolved"), resolved: completeness === "complete" ? open.filter((item) => !current.has(item.finding_fingerprint)) : [], preserved: completeness !== "complete" } }

function configurationFindings(serverSource, clientSource) { return normalizeSecurityFindings({ findings: configurationDrift({ serverSource, clientSource }).filter((item) => !item.passed).map((item) => ({ finding_key: `configuration:${item.id}`, subsystem: "configuration", severity: item.severity, defensive_result: "protection_uncertain", observation: item.summary, recommended_action: "Review the deterministic invariant before deployment." })) }).map((item) => ({ ...item, instrument_id: "configuration_drift" })) }

export async function runSecurityPulse({ environment = "local", mode = "local", triggerType = "manual_admin", profile = MILLER_SECURITY_PROFILE, repositoryRoot = process.cwd(), serverSource = "", clientSource = "", runtime = {}, schema = {}, environmentPosture = {}, scheduler = {}, versionContext = null, startRun = async () => ({ id: "ephemeral" }), finalizeRun = async () => {}, failRun = async () => {}, loadPrevious = async () => [], persist = async () => {}, resolve = async () => {}, reopen = async () => {}, persistOutcome = async () => {}, persistCapabilities = async () => {}, persistDeploymentObservation = async () => {}, repositoryHygiene = inspectRepositoryHygiene, dependencyAudit = runDependencyAdvisoryAudit, httpProbe = null } = {}) {
  if (environment !== "local" || !SECURITY_PULSE_MODES[mode]) throw new Error("security_pulse_environment_denied")
  const schedulerState = triggerType === "scheduled_automation" ? "local_allowlisted" : "disabled_manual", beganAt = Date.now(), started = await startRun({ triggerType, mode: "local_manual" })
  if (started?.already_running) return { run_id: started.run?.id || null, status: "already_running", completeness: "partial", scheduler: "disabled_manual", external_requests: 0, mutations: 0, instruments: [], findings: [], delta: {}, rhythms: SECURITY_RHYTHMS }
  const run = started?.run || started
  try {
    const selected = SECURITY_PULSE_MODES[mode].instruments, observations = []
    if (selected.includes("configuration_drift")) observations.push({ instrument_id: "configuration_drift", completeness: "complete", findings: configurationFindings(serverSource, clientSource), state: "verified" })
    if (selected.includes("repository_hygiene")) { const hygiene = await repositoryHygiene({ root: repositoryRoot }); observations.push({ ...hygiene, state: "verified" }) }
    if (selected.includes("dependency_posture")) { const audit = await dependencyAudit({ root: repositoryRoot }); observations.push({ ...audit, state: audit.completeness === "complete" ? "verified" : "unavailable" }) }
    if (selected.includes("runtime_anomaly")) observations.push(inspectRuntimeAnomalies({ profile, runtime }))
    const version = versionContext || securityVersionContext({ profile })
    if (selected.includes("deployment_consistency")) observations.push(inspectDeploymentConsistency({ profile, version, schema }))
    if (selected.includes("runtime_environment_posture")) observations.push(inspectRuntimeEnvironment({ profile, environment: environmentPosture }))
    if (selected.includes("scheduler_posture")) observations.push(inspectSchedulerPosture({ profile, scheduler }))
    if (httpProbe && selected.some((id) => ["http_header_posture", "auth_boundary", "request_boundary", "response_hygiene"].includes(id))) observations.push(...await inspectAuthorizedHttpPosture({ profile, request: httpProbe }))
    if (httpProbe && selected.some((id) => ["public_surface", "auth_boundary_variants", "response_contract"].includes(id))) observations.push(...await inspectAuthorizedSurface({ profile, request: httpProbe }))
    for (const instrumentId of selected.filter((id) => !observations.some((item) => item.instrument_id === id))) observations.push({ instrument_id: instrumentId, completeness: "unavailable", findings: [], state: "unavailable" })
    const summary = { findings_observed: 0, findings_new: 0, findings_recurring: 0, findings_reappeared: 0, findings_resolved: 0, findings_preserved: 0 }
    for (const observation of observations) {
      const delta = reconcileInstrumentFindings({ instrumentId: observation.instrument_id, completeness: observation.completeness, findings: observation.findings, previous: await loadPrevious(observation.instrument_id) })
      for (const item of [...delta.new, ...delta.recurring]) await persist(item)
      for (const item of delta.reappeared) await reopen(item)
      for (const item of delta.resolved) await resolve(item)
      summary.findings_observed += observation.findings.length; summary.findings_new += delta.new.length; summary.findings_recurring += delta.recurring.length; summary.findings_reappeared += delta.reappeared.length; summary.findings_resolved += delta.resolved.length; summary.findings_preserved += delta.preserved ? 1 : 0
      await persistOutcome({ run_id: run.id, target_id: profile.targetId, profile_version: profile.version, instrument_id: observation.instrument_id, instrument_version: SECURITY_INSTRUMENTS[observation.instrument_id]?.version || "v1", state: observation.state, completeness: observation.completeness, finding_count: observation.findings.length, finished_at: new Date().toISOString() })
    }
    const unavailable = observations.filter((item) => item.state === "unavailable").length, attention = observations.flatMap((item) => item.findings).filter((item) => ["critical", "high", "medium"].includes(item.severity)).length, status = unavailable ? "degraded" : "completed"
    const runSummary = { ...summary, instruments_attempted: observations.length, instruments_succeeded: observations.length - unavailable, instruments_degraded: unavailable, instruments_unavailable: unavailable, attention_worthy: attention, duration_ms: Date.now() - beganAt, summary: { scheduler: schedulerState, external_requests: SECURITY_PULSE_MODES[mode].external_requests, mode, version } }
    await finalizeRun(run, { status, completeness: unavailable ? "partial" : "complete", ...runSummary })
    const byId = new Map(observations.map((item) => [item.instrument_id, item]))
    const instruments = Object.values(SECURITY_INSTRUMENTS).map((instrument) => ({ ...instrument, executed: byId.has(instrument.id) && byId.get(instrument.id).state !== "unavailable", state: byId.get(instrument.id)?.state || "available_not_run" }))
    const capabilities = capabilityRegistry({ profile, instruments: SECURITY_INSTRUMENTS, outcomes: observations })
    await persistCapabilities(capabilities)
    const deployment = observations.find((item) => item.instrument_id === "deployment_consistency")
    if (deployment) await persistDeploymentObservation(deploymentObservation({ profile, version, alignment: deployment.alignment }))
    return { run_id: run.id, target: { id: profile.targetId, profile_version: profile.version }, version, status: status === "completed" ? "healthy" : "review_required", completeness: unavailable ? "partial" : "complete", scheduler: schedulerState, external_requests: SECURITY_PULSE_MODES[mode].external_requests, mutations: 0, instruments, capabilities, capability_gaps: capabilityGaps({ profile, instruments: SECURITY_INSTRUMENTS, outcomes: observations }), findings: observations.flatMap((item) => item.findings), delta: runSummary, rhythms: SECURITY_RHYTHMS }
  } catch (error) { await failRun(run, { status: "failed", completeness: "failed", summary: { failure_code: "security_pulse_failed" } }); throw error }
}
