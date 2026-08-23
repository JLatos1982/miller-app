import { defineSecurityProfile } from "./securityCore.js"

export const MILLER_SECURITY_PROFILE = defineSecurityProfile({
  targetId: "miller_local", targetKind: "node_express_application", environment: "local", version: "miller-security-profile-v1", authorization: "local_owned_target_only",
  expectedPublicRoutes: ["/", "/api/miller"], protectedRoutes: ["/api/admin/control-room", "/api/admin/maintenance-scheduler"],
  expectedHeaders: { "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "strict-origin-when-cross-origin", "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()", "cross-origin-opener-policy": "same-origin", "content-security-policy": "frame-ancestors 'none'" },
  expectedWorkers: [], expectedCapabilities: ["configuration_drift", "repository_hygiene", "http_header_posture", "auth_boundary", "response_hygiene", "runtime_anomaly", "public_surface", "auth_boundary_variants", "response_contract"], securityPolicy: { sensorStaleMs: 24 * 60 * 60 * 1000, scheduler: "disabled_by_design", externalTargets: "none" },
  attackSurface: { publicRoute: "/", protectedRoutes: ["/api/admin/control-room", "/api/admin/maintenance-scheduler"] },
})

export function localMillerProfile({ origin = "http://127.0.0.1:8787" } = {}) {
  const url = new URL(origin)
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) throw new Error("security_target_not_authorized")
  return { ...MILLER_SECURITY_PROFILE, origin: url.origin }
}
