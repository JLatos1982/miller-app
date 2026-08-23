import { securityFinding } from "./securityCore.js"

const sensor = (id, category, version = "v1") => ({ id, category, version, execution_class: "active_negative_probe", environment_scope: "local_owned_target_only", timeout_ms: 2_500, expected_cost: "low" })
export const HTTP_SECURITY_SENSORS = Object.freeze({
  http_header_posture: sensor("http_header_posture", "http_posture"), auth_boundary: sensor("auth_boundary", "authorization"), response_hygiene: sensor("response_hygiene", "http_posture"), request_boundary: sensor("request_boundary", "http_posture"), runtime_anomaly: { id: "runtime_anomaly", category: "runtime", version: "v1", execution_class: "passive", environment_scope: "local_only", timeout_ms: 100, expected_cost: "none" },
})

const header = (response, key) => String(response?.headers?.[key] || response?.headers?.[key.toLowerCase()] || "")
const leak = (body) => /\b(?:at \S+ \([^)]*:\d+:\d+\)|stack trace|supabase_service_role|postgresql:\/\/|bearer\s+[a-z0-9._-]{12,})/i.test(String(body || ""))
const expectedHeaderFindings = ({ profile, response }) => Object.entries(profile.expectedHeaders).flatMap(([name, expected]) => {
  const actual = header(response, name).toLowerCase()
  return actual.includes(String(expected).toLowerCase()) ? [] : [securityFinding({ target: profile, sensor: HTTP_SECURITY_SENSORS.http_header_posture, reasonCode: `missing_${name.replaceAll("-", "_")}`, severity: "high", description: `Expected response header ${name} was absent or weaker than policy.`, recommendation: "Restore the profile-required response header before deployment.", evidence: { header: name, expected } })]
})

export async function inspectAuthorizedHttpPosture({ profile, request }) {
  if (profile.environment !== "local" || profile.authorization !== "local_owned_target_only" || typeof request !== "function") throw new Error("security_http_probe_denied")
  const [publicResponse, protectedResponse, methodResponse] = await Promise.all([
    request({ method: "GET", path: profile.expectedPublicRoutes[0] }),
    request({ method: "GET", path: profile.protectedRoutes[0], headers: {} }),
    request({ method: "TRACE", path: profile.expectedPublicRoutes[0] }),
  ])
  const findings = [
    ...expectedHeaderFindings({ profile, response: publicResponse }),
    ...(protectedResponse.status === 401 || protectedResponse.status === 403 ? [] : [securityFinding({ target: profile, sensor: HTTP_SECURITY_SENSORS.auth_boundary, reasonCode: "protected_route_not_denied", severity: "critical", description: "A fixed negative probe did not receive an authentication denial from a protected route.", recommendation: "Restore the protected-route authentication middleware and verify the negative probe.", evidence: { status: protectedResponse.status } })]),
    ...([404, 405].includes(methodResponse.status) ? [] : [securityFinding({ target: profile, sensor: HTTP_SECURITY_SENSORS.request_boundary, reasonCode: "unexpected_http_method", severity: "medium", description: "A disallowed HTTP method was not rejected by the local application.", recommendation: "Limit the route to its expected HTTP methods.", evidence: { status: methodResponse.status } })]),
    ...(leak(protectedResponse.body) ? [securityFinding({ target: profile, sensor: HTTP_SECURITY_SENSORS.response_hygiene, reasonCode: "sensitive_error_detail", severity: "high", description: "A fixed negative authentication response appeared to include implementation detail.", recommendation: "Return a generic protected-route error and keep diagnostic detail server-side.", evidence: { status: protectedResponse.status } })] : []),
  ]
  return [
    { instrument_id: "http_header_posture", completeness: "complete", state: "verified", findings: findings.filter((item) => item.instrument_id === "http_header_posture"), external_requests: 0 },
    { instrument_id: "auth_boundary", completeness: "complete", state: "verified", findings: findings.filter((item) => item.instrument_id === "auth_boundary"), external_requests: 0 },
    { instrument_id: "request_boundary", completeness: "complete", state: "verified", findings: findings.filter((item) => item.instrument_id === "request_boundary"), external_requests: 0 },
    { instrument_id: "response_hygiene", completeness: "complete", state: "verified", findings: findings.filter((item) => item.instrument_id === "response_hygiene"), external_requests: 0 },
  ]
}

export function inspectRuntimeAnomalies({ profile, runtime = {} }) {
  const findings = []
  if (Number(runtime.failed_requests || 0) >= 3) findings.push(securityFinding({ target: profile, sensor: HTTP_SECURITY_SENSORS.runtime_anomaly, reasonCode: "repeated_server_errors", severity: "medium", description: "Aggregate runtime telemetry reports repeated server errors.", recommendation: "Inspect route-class logs without retaining request content.", evidence: { failed_requests: runtime.failed_requests } }))
  if (Number(runtime.rejected_protected_requests || 0) >= 12) findings.push(securityFinding({ target: profile, sensor: HTTP_SECURITY_SENSORS.runtime_anomaly, reasonCode: "rejected_protected_request_spike", severity: "low", description: "Aggregate telemetry reports an unusual concentration of rejected protected requests.", recommendation: "Review aggregate route pressure; do not block sources automatically.", evidence: { rejected: runtime.rejected_protected_requests } }))
  return { instrument_id: "runtime_anomaly", completeness: "complete", state: "verified", findings, external_requests: 0 }
}
