import test from "node:test"
import assert from "node:assert/strict"
import { capabilityGaps, capabilityRegistry, defineSecurityProfile } from "../server/securityCore.js"
import { MILLER_SECURITY_PROFILE, localMillerProfile } from "../server/millerSecurityProfile.js"
import { inspectAuthorizedHttpPosture, inspectRuntimeAnomalies } from "../server/securityHttpSensors.js"

const healthy = { status: 200, headers: { "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "strict-origin-when-cross-origin", "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()", "cross-origin-opener-policy": "same-origin", "content-security-policy": "default-src 'self'; frame-ancestors 'none'" }, body: "ok" }

test("security profile is fixed, versioned, and local-only", () => {
  assert.equal(MILLER_SECURITY_PROFILE.targetId, "miller_local")
  assert.throws(() => localMillerProfile({ origin: "https://example.test" }), /not_authorized/)
  assert.throws(() => defineSecurityProfile({ targetId: "bad target", version: "v1" }), /invalid/)
})

test("authorized local HTTP probe detects headers, auth, methods, and leaks", async () => {
  const clean = await inspectAuthorizedHttpPosture({ profile: MILLER_SECURITY_PROFILE, request: async ({ method, path }) => path.includes("admin") ? { status: 401, headers: healthy.headers, body: "Unauthorized" } : method === "TRACE" ? { status: 405, headers: healthy.headers, body: "" } : healthy })
  assert.equal(clean.flatMap((item) => item.findings).length, 0)
  const broken = await inspectAuthorizedHttpPosture({ profile: MILLER_SECURITY_PROFILE, request: async ({ method, path }) => path.includes("admin") ? { status: 200, headers: {}, body: "Error at auth (/srv/server.js:1:2)" } : method === "TRACE" ? { status: 200, headers: {}, body: "" } : { status: 200, headers: {}, body: "" } })
  const codes = broken.flatMap((item) => item.findings).map((item) => item.finding_type)
  assert.ok(codes.includes("protected_route_not_denied")); assert.ok(codes.includes("unexpected_http_method")); assert.ok(codes.includes("sensitive_error_detail")); assert.ok(codes.some((code) => code.startsWith("missing_")))
})

test("runtime anomalies remain aggregate-only and never create an enforcement action", () => {
  const observation = inspectRuntimeAnomalies({ profile: MILLER_SECURITY_PROFILE, runtime: { failed_requests: 3, rejected_protected_requests: 12 } })
  assert.equal(observation.findings.length, 2)
  assert.doesNotMatch(JSON.stringify(observation), /token|cookie|request_body/i)
})

test("capability registry is code-defined and missing expected senses become bounded gaps", () => {
  const registry = capabilityRegistry({ profile: MILLER_SECURITY_PROFILE, instruments: { configuration_drift: { id: "configuration_drift", version: "v1", category: "configuration", timeout_ms: 10 } }, outcomes: [] })
  assert.equal(registry[0].mutation_ability, "none")
  const gaps = capabilityGaps({ profile: MILLER_SECURITY_PROFILE, instruments: { configuration_drift: { id: "configuration_drift" } }, outcomes: [] })
  assert.ok(gaps.some((item) => item.problem_class === "expected_sensor_not_registered"))
})

test("cyber-range lifecycle classifies a regression, recurrence, and resolution deterministically", async () => {
  const previous = [], persisted = [], resolved = []
  const { reconcileInstrumentFindings } = await import("../server/securityPulse.js")
  const broken = (await inspectAuthorizedHttpPosture({ profile: MILLER_SECURITY_PROFILE, request: async () => ({ status: 200, headers: {}, body: "" }) }))[0].findings
  const first = reconcileInstrumentFindings({ instrumentId: "http_header_posture", completeness: "complete", findings: broken, previous })
  persisted.push(...first.new); previous.push(...first.new.map((item) => ({ ...item, lifecycle: "new" })))
  const recurring = reconcileInstrumentFindings({ instrumentId: "http_header_posture", completeness: "complete", findings: broken, previous })
  const restored = reconcileInstrumentFindings({ instrumentId: "http_header_posture", completeness: "complete", findings: [], previous })
  resolved.push(...restored.resolved)
  assert.ok(first.new.length > 0); assert.equal(recurring.recurring.length, broken.length); assert.equal(resolved.length, broken.length)
})
