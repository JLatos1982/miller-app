import { securityFinding } from "./securityCore.js"

const allowed = new Set(["aligned", "build_unknown", "schema_unknown", "schema_behind_build", "schema_ahead_of_build", "migration_gap", "compatibility_unknown"])
const sensor = { id: "deployment_consistency", category: "deployment", version: "v1", execution_class: "passive", environment_scope: "local_or_production_passive", timeout_ms: 250, expected_cost: "none" }
const environmentSensor = { id: "runtime_environment_posture", category: "configuration", version: "v1", execution_class: "passive", environment_scope: "local_or_production_passive", timeout_ms: 100, expected_cost: "none" }
const schedulerSensor = { id: "scheduler_posture", category: "operations", version: "v1", execution_class: "passive", environment_scope: "local_or_production_passive", timeout_ms: 100, expected_cost: "none" }
const safe = (value, max = 100) => typeof value === "string" && /^[A-Za-z0-9._:-]{1,120}$/.test(value) ? value.slice(0, max) : null

export function deploymentAlignment({ profile, version = {}, schema = {} } = {}) {
  const expected = profile?.deployment?.expectedSchemaHead || null
  const actual = safe(schema.migration_head, 40)
  const buildKnown = Boolean(version.git_sha || version.build_id)
  const capabilities = new Set((schema.capabilities || []).filter(Boolean))
  const missingCapabilities = (profile?.deployment?.requiredSchemaCapabilities || []).filter((item) => !capabilities.has(item))
  let state = "compatibility_unknown", reason_codes = []
  if (!buildKnown) { state = "build_unknown"; reason_codes = ["build_identity_unavailable"] }
  else if (!actual) { state = "schema_unknown"; reason_codes = ["schema_head_unavailable"] }
  else if (missingCapabilities.length) { state = "migration_gap"; reason_codes = ["required_schema_capability_missing", ...missingCapabilities.map((item) => `missing_${item}`)] }
  else if (actual === expected) { state = "aligned"; reason_codes = ["build_schema_contract_aligned"] }
  else if (Array.isArray(schema.compatible_heads) && schema.compatible_heads.includes(actual)) { state = "schema_ahead_of_build"; reason_codes = ["compatible_schema_contract_newer_than_profile"] }
  else if (expected && actual < expected) { state = "schema_behind_build"; reason_codes = ["schema_contract_behind_profile"] }
  else if (expected && actual > expected) { state = "schema_ahead_of_build"; reason_codes = ["schema_contract_newer_than_profile"] }
  return { state: allowed.has(state) ? state : "compatibility_unknown", expected_schema_head: expected, observed_schema_head: actual, schema_contract: safe(schema.contract, 80), missing_capabilities: missingCapabilities, reason_codes, build_known: buildKnown }
}

export function inspectDeploymentConsistency({ profile, version, schema } = {}) {
  const alignment = deploymentAlignment({ profile, version, schema })
  const severity = alignment.state === "migration_gap" ? "high" : ["schema_behind_build", "build_unknown", "schema_unknown"].includes(alignment.state) ? "medium" : "informational"
  const findings = alignment.state === "aligned" ? [] : [securityFinding({ target: profile, sensor, reasonCode: alignment.reason_codes[0] || "deployment_compatibility_unknown", severity, description: `Deployment/build alignment is ${alignment.state.replaceAll("_", " ")}.`, recommendation: "Review build identity and explicit schema contract before deployment; no migration or deployment was attempted.", evidence: { alignment_state: alignment.state, expected_schema_head: alignment.expected_schema_head || "unknown", observed_schema_head: alignment.observed_schema_head || "unknown", missing_capabilities: alignment.missing_capabilities.join(",") || "none" } })]
  return { instrument_id: sensor.id, completeness: alignment.build_known && alignment.observed_schema_head ? "complete" : "partial", state: alignment.state === "aligned" ? "verified" : "unavailable", findings, alignment }
}

export function inspectRuntimeEnvironment({ profile, environment = {} } = {}) {
  const required = profile?.deployment?.requiredEnvironmentFlags || [], forbidden = profile?.deployment?.forbiddenEnvironmentFlags || []
  const missing = required.filter((key) => environment[key] !== true), unsafe = forbidden.filter((key) => environment[key] === true)
  const findings = [...missing.map((key) => securityFinding({ target: profile, sensor: environmentSensor, reasonCode: `required_${key}_missing`, severity: "high", description: `A required runtime configuration category is unavailable: ${key}.`, recommendation: "Restore the required server-side configuration category before deployment.", evidence: { configuration_category: key } })), ...unsafe.map((key) => securityFinding({ target: profile, sensor: environmentSensor, reasonCode: `forbidden_${key}_enabled`, severity: "high", description: `A development-only runtime configuration category is enabled: ${key}.`, recommendation: "Disable development/test-only configuration before deployment.", evidence: { configuration_category: key } }))]
  return { instrument_id: environmentSensor.id, completeness: "complete", state: findings.length ? "failed" : "verified", findings, posture: { missing, unsafe } }
}

export function inspectSchedulerPosture({ profile, scheduler = {} } = {}) {
  const expected = profile?.securityPolicy?.scheduler || "unknown", enabled = scheduler.enabled === true, schemaAvailable = scheduler.schema_available === true
  const codes = []
  if (enabled && !schemaAvailable) codes.push("scheduler_enabled_without_schema")
  if (expected === "disabled_by_design" && enabled) codes.push("scheduler_enabled_against_profile")
  if (scheduler.heartbeat_freshness === "stale") codes.push("scheduler_heartbeat_stale")
  const findings = codes.map((code) => securityFinding({ target: profile, sensor: schedulerSensor, reasonCode: code, severity: code.includes("without_schema") ? "high" : "medium", description: `Scheduler posture requires review: ${code.replaceAll("_", " ")}.`, recommendation: "Review scheduler configuration and heartbeat evidence. No scheduler change was made.", evidence: { expected_scheduler_policy: expected, scheduler_enabled: String(enabled), schema_available: String(schemaAvailable) } }))
  return { instrument_id: schedulerSensor.id, completeness: "complete", state: findings.length ? "failed" : "verified", findings, posture: { expected, enabled, schema_available: schemaAvailable, heartbeat_freshness: scheduler.heartbeat_freshness || "unknown" } }
}

export function deploymentObservation({ profile, version, alignment, observedAt = new Date().toISOString() } = {}) {
  return { target_id: profile.targetId, observed_at: observedAt, build_identity: version.git_sha || version.build_id || null, schema_head: alignment.observed_schema_head || null, schema_contract: alignment.schema_contract || null, profile_version: profile.version, alignment_state: alignment.state, reason_codes: alignment.reason_codes, evidence_summary: { aggregate_only: true, build_known: alignment.build_known, missing_capability_count: alignment.missing_capabilities.length } }
}
