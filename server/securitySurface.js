import { securityFinding } from "./securityCore.js"

export const SURFACE_SENSORS = Object.freeze({
  public_surface: { id: "public_surface", version: "v1", category: "attack_surface", execution_class: "active_negative_probe", environment_scope: "local_owned_target_only", timeout_ms: 2500, expected_cost: "low" },
  auth_boundary_variants: { id: "auth_boundary_variants", version: "v1", category: "authorization", execution_class: "active_negative_probe", environment_scope: "local_owned_target_only", timeout_ms: 2500, expected_cost: "low" },
  response_contract: { id: "response_contract", version: "v1", category: "http_posture", execution_class: "active_negative_probe", environment_scope: "local_owned_target_only", timeout_ms: 2500, expected_cost: "low" },
})
const deny = (status) => status === 401 || status === 403
const json = (response) => String(response?.headers?.["content-type"] || "").toLowerCase().includes("application/json")
const finding = (profile, sensor, reasonCode, severity, description, evidence) => securityFinding({ target: profile, sensor, reasonCode, severity, description, recommendation: "Review the fixed profile contract and restore the expected boundary before deployment.", evidence })

export async function inspectAuthorizedSurface({ profile, request }) {
  if (profile.environment !== "local" || profile.authorization !== "local_owned_target_only" || typeof request !== "function") throw new Error("security_surface_probe_denied")
  const surface = profile.attackSurface || {}, publicRoute = surface.publicRoute || "/", protectedRoutes = surface.protectedRoutes || []
  const [publicResponse, ...protectedResponses] = await Promise.all([request({ method: "GET", path: publicRoute }), ...protectedRoutes.flatMap((path) => [request({ method: "GET", path, headers: {} }), request({ method: "GET", path, headers: { authorization: "Bearer malformed.fixed.negative" } })])])
  const findings = []
  if (publicResponse.status < 200 || publicResponse.status >= 400) findings.push(finding(profile, SURFACE_SENSORS.public_surface, "required_public_route_unreachable", "high", "A required public route is not reachable from the authorized local observer.", { path: publicRoute, status: publicResponse.status }))
  if (!String(publicResponse.headers?.["content-type"] || "").toLowerCase().includes("text/html")) findings.push(finding(profile, SURFACE_SENSORS.response_contract, "public_content_type_unexpected", "medium", "The required public route did not return the expected HTML content type.", { path: publicRoute }))
  for (let index = 0; index < protectedRoutes.length; index += 1) {
    const path = protectedRoutes[index], anonymous = protectedResponses[index * 2], malformed = protectedResponses[index * 2 + 1]
    if (!deny(anonymous.status)) findings.push(finding(profile, SURFACE_SENSORS.auth_boundary_variants, "protected_route_anonymous_not_denied", "critical", "A protected route did not deny an anonymous fixed negative request.", { path, status: anonymous.status }))
    if (!deny(malformed.status)) findings.push(finding(profile, SURFACE_SENSORS.auth_boundary_variants, "malformed_authorization_not_denied", "critical", "A protected route did not deny a fixed malformed authorization value.", { path, status: malformed.status }))
    if (anonymous.status >= 300 && anonymous.status < 400) findings.push(finding(profile, SURFACE_SENSORS.auth_boundary_variants, "protected_api_redirected", "medium", "A protected API route redirected instead of returning an authorization denial.", { path, status: anonymous.status }))
    if (!json(anonymous)) findings.push(finding(profile, SURFACE_SENSORS.response_contract, "protected_error_content_type_unexpected", "medium", "A protected API denial did not return the expected JSON content type.", { path }))
  }
  const anonymousStates = protectedRoutes.map((_, index) => protectedResponses[index * 2].status)
  if (new Set(anonymousStates.map((status) => deny(status))).size > 1) findings.push(finding(profile, SURFACE_SENSORS.auth_boundary_variants, "protected_route_auth_inconsistent", "high", "Equivalent protected routes have inconsistent anonymous access behaviour.", { routes: protectedRoutes.length }))
  return ["public_surface", "auth_boundary_variants", "response_contract"].map((instrument_id) => ({ instrument_id, completeness: "complete", state: "verified", findings: findings.filter((item) => item.instrument_id === instrument_id), external_requests: 0 }))
}
