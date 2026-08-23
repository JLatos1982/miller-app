import { createHash } from "node:crypto"

const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/
const safe = (value, max = 180) => String(value || "").replace(/[\r\n\t]/g, " ").slice(0, max)
const fingerprint = (parts) => createHash("sha256").update(parts.join("|")).digest("hex")

// Code defines sensors. Profiles only select them; neither profiles nor stored
// capability rows can introduce code, commands, URLs, or new authority.
export function defineSecurityProfile(profile = {}) {
  const targetId = safe(profile.targetId, 80)
  if (!SAFE_ID.test(targetId) || !SAFE_ID.test(safe(profile.version, 80))) throw new Error("security_profile_invalid")
  const routes = Object.freeze({ public: [...new Set(profile.expectedPublicRoutes || [])], protected: [...new Set(profile.protectedRoutes || [])] })
  return Object.freeze({ targetId, targetKind: safe(profile.targetKind || "application", 80), environment: safe(profile.environment, 40), version: safe(profile.version, 80), authorization: safe(profile.authorization, 80), expectedHeaders: Object.freeze({ ...(profile.expectedHeaders || {}) }), expectedPublicRoutes: routes.public, protectedRoutes: routes.protected, attackSurface: Object.freeze({ ...(profile.attackSurface || {}) }), expectedWorkers: Object.freeze([...(profile.expectedWorkers || [])]), expectedCapabilities: Object.freeze([...(profile.expectedCapabilities || [])]), securityPolicy: Object.freeze({ ...(profile.securityPolicy || {}) }) })
}

export function securityFinding({ target, sensor, reasonCode, severity = "medium", description, recommendation, evidence = {} } = {}) {
  if (!target?.targetId || !sensor?.id || !SAFE_ID.test(safe(reasonCode, 80))) throw new Error("security_finding_invalid")
  return {
    finding_fingerprint: fingerprint([target.targetId, target.version, sensor.id, sensor.version, reasonCode]),
    finding_type: safe(reasonCode, 120), subsystem: safe(sensor.category || "security", 120), severity: ["informational", "low", "medium", "high", "critical"].includes(severity) ? severity : "medium", confidence: "verified",
    description: safe(description, 700), defensive_result: "protection_uncertain", recommended_action: safe(recommendation, 500), instrument_id: sensor.id,
    evidence_metadata: { aggregate_only: true, raw_request_retained: false, target_id: target.targetId, profile_version: target.version, sensor_version: sensor.version, reason_code: safe(reasonCode, 80), evidence: Object.fromEntries(Object.entries(evidence).map(([key, value]) => [safe(key, 80), safe(value, 180)])) },
  }
}

export function capabilityRegistry({ profile, instruments = {}, outcomes = [] } = {}) {
  const bySensor = new Map(outcomes.map((item) => [item.instrument_id, item]))
  return Object.values(instruments).map((sensor) => {
    const last = bySensor.get(sensor.id)
    return { target_id: profile.targetId, capability_id: sensor.id, capability_version: sensor.version, category: sensor.category, execution_class: sensor.execution_class || "passive", environment_scope: sensor.environment_scope || "local_only", enabled: sensor.enabled !== false, mutation_ability: "none", timeout_ms: sensor.timeout_ms, expected_cost: sensor.expected_cost || "low", status: last?.state || sensor.availability || "available_not_run", last_success_at: last?.state === "verified" ? last.finished_at || null : null, last_failure_at: ["failed", "unavailable"].includes(last?.state) ? last.finished_at || null : null, disabled_reason: sensor.enabled === false ? sensor.disabled_reason || "code_disabled" : null }
  }).sort((a, b) => a.capability_id.localeCompare(b.capability_id))
}

export function capabilityGaps({ profile, instruments = {}, outcomes = [], now = Date.now() } = {}) {
  const current = new Map(outcomes.map((item) => [item.instrument_id, item])), staleMs = Number(profile.securityPolicy?.sensorStaleMs || 24 * 60 * 60 * 1000)
  return profile.expectedCapabilities.flatMap((id) => {
    const sensor = instruments[id], outcome = current.get(id)
    if (!sensor) return [{ subsystem: "security", problem_class: "expected_sensor_not_registered", target_key: `${profile.targetId}:${id}`, reason: "An expected security capability is not code-registered.", safety_category: "security_review" }]
    if (!outcome) return [{ subsystem: "security", problem_class: "expected_sensor_never_run", target_key: `${profile.targetId}:${id}`, reason: "An expected security capability has no recorded outcome.", safety_category: "security_review" }]
    if (["failed", "unavailable"].includes(outcome.state) || (outcome.finished_at && now - new Date(outcome.finished_at).getTime() > staleMs)) return [{ subsystem: "security", problem_class: "expected_sensor_unhealthy", target_key: `${profile.targetId}:${id}`, reason: "An expected security capability is failed, unavailable, or stale.", safety_category: "security_review" }]
    return []
  })
}
