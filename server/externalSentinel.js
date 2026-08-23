import { createHash, randomUUID } from "node:crypto"
import { localMillerProfile } from "./millerSecurityProfile.js"

const key = (parts) => createHash("sha256").update(parts.join("|")).digest("hex")
const loopback = new Set(["127.0.0.1", "localhost", "::1"])
export function defineSentinelTarget({ mode = "local", url, authorizedHostnames = [], expectedRoutes = ["/", "/api/admin/control-room"], tls = {} } = {}) {
  const target = new URL(url || "")
  if (mode !== "local") throw new Error("remote_sentinel_not_enabled")
  if (!loopback.has(target.hostname) || target.protocol !== "http:") throw new Error("external_sentinel_local_only")
  if (authorizedHostnames.length || !expectedRoutes.every((path) => ["/", "/api/admin/control-room"].includes(path))) throw new Error("external_sentinel_target_contract_denied")
  return Object.freeze({
    mode,
    origin: target.origin,
    hostname: target.hostname,
    expectedRoutes: Object.freeze([...expectedRoutes]),
    tls: Object.freeze({ required: tls.required === true, expiry_warning_days: Math.max(1, Math.min(180, Number(tls.expiry_warning_days || 21))) }),
  })
}
export function classifyTlsPosture({ certificatePresent, hostnameMatched, chainValid, protocol, expiresAt, now = Date.now(), warningDays = 21 } = {}) {
  if (!certificatePresent) return { status: "fail", reason_code: "certificate_missing" }
  if (!hostnameMatched) return { status: "fail", reason_code: "certificate_hostname_mismatch" }
  if (!chainValid) return { status: "fail", reason_code: "certificate_chain_invalid" }
  if (!/^TLSv1\.[23]$/.test(String(protocol || ""))) return { status: "fail", reason_code: "tls_protocol_unacceptable" }
  const expires = new Date(expiresAt || 0).getTime()
  if (!Number.isFinite(expires) || expires <= now) return { status: "fail", reason_code: "certificate_expired" }
  if (expires - now < Math.max(1, Number(warningDays)) * 86400000) return { status: "inconclusive", reason_code: "certificate_expiry_window" }
  return { status: "pass", reason_code: "tls_posture_healthy" }
}
export function assertLocalSentinelEnvironment({ url, localOnly = process.env.MILLER_EXTERNAL_SENTINEL_LOCAL_ONLY } = {}) { if (localOnly !== "true") throw new Error("external_sentinel_local_only"); return defineSentinelTarget({ url }).origin }
export async function runLocalExternalSentinel({ url, localOnly, observerKey, request, submit, nonce = randomUUID(), now = () => new Date().toISOString() } = {}) {
  const origin = assertLocalSentinelEnvironment({ url, localOnly }); if (!/^[a-z0-9][a-z0-9_-]{2,79}$/.test(String(observerKey || "")) || typeof request !== "function" || typeof submit !== "function") throw new Error("external_sentinel_configuration_denied")
  const profile = localMillerProfile({ origin }), publicResponse = await request({ method: "GET", path: "/" }), protectedResponse = await request({ method: "GET", path: "/api/admin/control-room", headers: {} }), methodResponse = await request({ method: "TRACE", path: "/" })
  const observations = [
    ["availability", publicResponse.status >= 200 && publicResponse.status < 400 ? "pass" : "fail", { status: publicResponse.status }],
    ["http_headers", profile.expectedHeaders["content-security-policy"] && String(publicResponse.headers?.["content-security-policy"] || "").includes("frame-ancestors 'none'") ? "pass" : "fail", { status: publicResponse.status }],
    ["auth_negative_probe", [401, 403].includes(protectedResponse.status) ? "pass" : "fail", { status: protectedResponse.status }],
    ["latency_anomaly", Number(publicResponse.elapsed_ms || 0) <= 5000 ? "pass" : "inconclusive", { elapsed_ms: Math.min(5000, Math.max(0, Number(publicResponse.elapsed_ms || 0))) }],
    ["http_headers", [404, 405].includes(methodResponse.status) ? "pass" : "fail", { method: "TRACE", status: methodResponse.status }],
  ].map(([observation_type, status, evidence], index) => ({ observer_key: observerKey, observation_key: key([observerKey, nonce, String(index), observation_type]), observation_type, observed_at: now(), status, evidence_summary: evidence }))
  for (const observation of observations) await submit(observation)
  return { target: profile.targetId, observer_key: observerKey, observations, external_requests: 0, mutations: 0 }
}
