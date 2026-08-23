export const HEARTBEAT_POLICY = Object.freeze({ queryBudget: 6, targetRuntimeMs: 250, scheduling: "not_enabled", version: "operations-heartbeat-v1" })

export const DEFENSIVE_TOOLS = Object.freeze([
  { id: "request_validation", protects: "malformed public input", active: true, class: "deterministic_protect", result: "rejected_by_validation" },
  { id: "admin_authorization", protects: "protected routes", active: true, class: "deterministic_protect", result: "authorization_denied" },
  { id: "rate_limiting", protects: "availability", active: true, class: "deterministic_protect", result: "rate_limited" },
  { id: "security_headers", protects: "browser isolation", active: true, class: "deterministic_protect", result: "blocked_as_expected" },
  { id: "attachment_quarantine", protects: "unscanned uploads", active: true, class: "deterministic_protect", result: "quarantined" },
  { id: "source_allowlisting", protects: "server-side external fetches", active: true, class: "deterministic_protect", result: "failed_closed" },
  { id: "security_review", protects: "Miller operational state", active: true, class: "observe_analyze_recommend", result: "human_review_required" },
])

export function evaluateOperationalHeartbeat({ databaseReachable = false, security = {}, quietMaintenanceEnabled = false, workingMemory = 0, sensors = [] } = {}) {
  const checks = [
    { id: "application", status: "pass", detail: "Application process evaluated its local heartbeat." },
    { id: "database", status: databaseReachable ? "pass" : "review_needed", detail: databaseReachable ? "Required lightweight database queries succeeded." : "A required lightweight database query failed." },
    { id: "security_posture", status: security.status === "healthy" ? "pass" : "review_needed", detail: security.status === "healthy" ? "Expected defensive controls are present." : "A defensive posture check needs review." },
    { id: "privacy", status: "pass", detail: "Operations telemetry is aggregate-only and does not retain visitor identity." },
    { id: "maintenance", status: quietMaintenanceEnabled ? "pass" : "disabled_by_design", detail: quietMaintenanceEnabled ? "Local manual maintenance is enabled." : "Scheduling is not enabled." },
    { id: "working_memory", status: workingMemory <= 10 ? "pass" : "review_needed", detail: workingMemory <= 10 ? "Working-memory cap is respected." : "Working-memory cap needs review." },
    { id: "sensors", status: sensors.every((sensor) => ["fixture_validated_live_disabled", "disabled", "unknown"].includes(sensor.mode) || sensor.last_success) ? "pass" : "review_needed", detail: "Disabled-by-design sensor contracts are not treated as failures." },
  ]
  const severity = checks.some((item) => item.status === "review_needed") ? "review_required" : "healthy"
  return { policy: HEARTBEAT_POLICY, status: severity, checked_at: new Date().toISOString(), checks, cost: { database_queries: 0, external_requests: 0, historical_scans: 0, llm_requests: 0 }, scheduling: "not_enabled" }
}

export function buildSecurityReview({ operations = {}, posture = {} } = {}) {
  const findings = (operations.findings || []).map((item) => ({ finding_key: `operations:${item.code}`, lifecycle: "active", subsystem: item.code.includes("server") ? "availability" : item.code.includes("access") ? "access_control" : "availability", severity: item.severity, confidence: item.confidence, first_seen: null, last_seen: null, recurrence: 1, observation: item.observation, defensive_control: item.protection, defensive_result: item.code === "protected_access_rejected" ? "authorization_denied" : item.code === "rate_limit_active" ? "rate_limited" : "protection_uncertain", recommended_action: item.recommendation }))
  for (const check of posture.checks || []) if (check.status !== "pass") findings.push({ finding_key: `posture:${check.id}`, lifecycle: "needs_review", subsystem: "configuration", severity: "medium", confidence: .95, first_seen: null, last_seen: null, recurrence: 1, observation: check.detail, defensive_control: "security_posture", defensive_result: "protection_uncertain", recommended_action: "Verify this deterministic control before deployment." })
  return { cadence: "hourly_conceptual_not_scheduled", external_requests: 0, findings: findings.slice(0, 8), note: "Findings describe observed control outcomes; they do not assert compromise." }
}
