import test from "node:test"
import assert from "node:assert/strict"
import { MILLER_SECURITY_PROFILE } from "../server/millerSecurityProfile.js"
import { inspectAuthorizedSurface } from "../server/securitySurface.js"
import { runLocalExternalSentinel } from "../server/externalSentinel.js"
import { correlateSecurityEvidence, internalExternalAgreement } from "../server/securityCorrelation.js"
import { buildSecurityPulseDigest } from "../server/securityDigest.js"
import { securityVersionContext, versionAssociation } from "../server/securityVersion.js"

const headers = { "content-type": "application/json", "content-security-policy": "default-src 'self'; frame-ancestors 'none'" }
const cleanRequest = async ({ path, headers: requestHeaders = {}, method }) => path === "/" ? { status: 200, headers: { ...headers, "content-type": "text/html" }, elapsed_ms: 20 } : method === "TRACE" ? { status: 405, headers, elapsed_ms: 20 } : requestHeaders.authorization ? { status: 401, headers, elapsed_ms: 20 } : { status: 401, headers, elapsed_ms: 20 }

test("surface contract detects auth regressions and preserves route-specific evidence", async () => {
  const healthy = await inspectAuthorizedSurface({ profile: MILLER_SECURITY_PROFILE, request: cleanRequest })
  assert.equal(healthy.flatMap((item) => item.findings).length, 0)
  const broken = await inspectAuthorizedSurface({ profile: MILLER_SECURITY_PROFILE, request: async ({ path }) => path === "/" ? { status: 200, headers: { "content-type": "text/html" } } : { status: 200, headers: { "content-type": "text/html" } } })
  assert.ok(broken.flatMap((item) => item.findings).some((item) => item.finding_type === "protected_route_anonymous_not_denied"))
})

test("local external sentinel is fixed-target, bounded, and produces no raw evidence", async () => {
  const submitted = []
  const result = await runLocalExternalSentinel({ url: "http://127.0.0.1:8787", localOnly: "true", observerKey: "test_observer", nonce: "fixed", request: cleanRequest, submit: async (item) => submitted.push(item) })
  assert.equal(result.observations.length, 5); assert.equal(submitted.length, 5)
  await assert.rejects(() => runLocalExternalSentinel({ url: "https://example.test", observerKey: "test_observer", request: cleanRequest, submit: async () => {} }), /local_only/)
  assert.doesNotMatch(JSON.stringify(result), /token|cookie|body/i)
})

test("correlation, independent agreement, and digest remain deterministic", () => {
  const findings = [{ finding_fingerprint: "a", finding_type: "protected_route_anonymous_not_denied", severity: "critical", lifecycle: "new" }]
  const external = [{ observation_key: "b", observation_type: "auth_negative_probe", status: "fail" }]
  const incidents = correlateSecurityEvidence({ findings, external })
  assert.equal(incidents[0].category, "auth_boundary")
  assert.equal(internalExternalAgreement({ internal: findings, external }).state, "internal_external_agree_problem")
  assert.equal(buildSecurityPulseDigest({ findings, outcomes: [], incidents, agreement: [] }).posture, "critical")
  assert.equal(internalExternalAgreement({ internal: [], external }).state, "internal_external_disagree")
})

test("version association records sequence without claiming causation", () => {
  const version = securityVersionContext({ gitSha: "def456", profile: MILLER_SECURITY_PROFILE })
  const association = versionAssociation({ finding: { finding_fingerprint: "f" }, prior: [{ finding_fingerprint: "f", observed_at: "2026-01-01", version: { git_sha: "abc123" } }], version })
  assert.equal(association.first_observed_after_version_change, true)
  assert.match(association.wording, /causation is not established/)
})
