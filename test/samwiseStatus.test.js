import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { buildSamwiseStatus, createRequireSamwiseStatus, getSamwiseBearerToken, samwiseTokenMatches } from "../server/samwiseStatus.js"

function responseRecorder() {
  return { statusCode: 200, body: null, headers: {}, status(value) { this.statusCode = value; return this }, json(value) { this.body = value; return this }, setHeader(name, value) { this.headers[name] = value } }
}

async function authorize(header, configured = "bridge-test-token") {
  const middleware = createRequireSamwiseStatus({ getToken: () => configured })
  const res = responseRecorder(); let nextCalled = false
  await middleware({ headers: header ? { authorization: header } : {} }, res, () => { nextCalled = true })
  return { res, nextCalled }
}

test("Samwise status authentication is dedicated, strict, and fails closed", async () => {
  assert.equal(getSamwiseBearerToken("Bearer abc"), "abc")
  assert.equal(getSamwiseBearerToken("Basic abc"), "")
  assert.equal(samwiseTokenMatches("same", "same"), true)
  assert.equal(samwiseTokenMatches("wrong", "same"), false)
  for (const result of [await authorize(), await authorize("Basic bridge-test-token"), await authorize("Bearer wrong"), await authorize("Bearer bridge-test-token", "")]) {
    assert.equal(result.res.statusCode, 401); assert.deepEqual(result.res.body, { error: "Unauthorized" }); assert.equal(result.nextCalled, false); assert.equal(result.res.headers["Cache-Control"], "no-store")
  }
  const valid = await authorize("Bearer bridge-test-token")
  assert.equal(valid.nextCalled, true)
  const ordinaryAdmin = await authorize("Bearer valid-admin-token")
  assert.equal(ordinaryAdmin.res.statusCode, 401)
})

test("Samwise status is fixed, sanitized, bounded, and accurately distinguishes source states", () => {
  const now = Date.parse("2026-08-28T12:00:00Z")
  const status = buildSamwiseStatus({ now, build: { git_sha: "abc123" }, database: { state: "healthy", observed_at: new Date(now).toISOString() }, deploymentAlignment: "aligned", pulse: { status: "completed", completed_at: new Date(now - 60_000).toISOString() }, maintenance: { status: "completed", completed_at: new Date(now - 60_000).toISOString() }, securityFindings: [{ severity: "medium", lifecycle: "resolved" }], checkpoints: [{ sensor_id: "health_canada_drug_safety", health_state: "healthy", last_success_at: new Date(now - 60_000).toISOString() }], queues: { resource_review: 2, shelter_review: 3, location_qc: 4, attachment_scan: 5, resource_name: "must-not-pass-through" } })
  assert.equal(status.schema_version, "miller-status-v1"); assert.equal(status.application.build, "known"); assert.equal(status.security.self_check_scope, "local_only")
  assert.equal(status.overall, "review_required")
  assert.deepEqual(status.operations.queues, { resource_review: 2, shelter_review: 3, location_qc: 4, attachment_scan: 5 })
  assert.deepEqual(status.verification.trusted_website_correction_evidence, { writer_evidence_rows: 0, writer_claim_rows: 0, canonical_profile_rows: 0, canonical_audit_rows: 0, correction_ledger_rows: 0 })
  assert.deepEqual(status.sources.map((item) => [item.id, item.mode, item.freshness]), [["health_canada_drug_safety", "manual", "current"], ["bccdc_unregulated_drug", "live_disabled", "live_disabled"], ["bc_coroners_unregulated_drug", "live_disabled", "live_disabled"], ["toward_the_heart", "live_disabled", "live_disabled"]])
  const encoded = JSON.stringify(status)
  for (const forbidden of ["resource_name", "must-not-pass-through", "authorization", "service_role", "supabase", "postgres", "http://", "https://", "stack", "token"]) assert.doesNotMatch(encoded.toLowerCase(), new RegExp(forbidden.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.ok(encoded.length < 5000)
})

test("Samwise status reports unknown, never-run, degraded, and stale states without inventing health", () => {
  const now = Date.parse("2026-08-28T12:00:00Z")
  const unknown = buildSamwiseStatus({ now, database: { state: "unknown" }, deploymentAlignment: "schema_unknown" })
  assert.equal(unknown.overall, "unknown"); assert.equal(unknown.security.self_check_scope, "not_run"); assert.equal(unknown.security.latest_check.state, "never_run")
  assert.equal(unknown.sources.find((item) => item.id === "health_canada_drug_safety").freshness, "never_run")
  const degraded = buildSamwiseStatus({ now, database: { state: "degraded" }, securityFindings: [{ severity: "high", lifecycle: "active" }], maintenance: { status: "running", started_at: new Date(now - 21 * 60 * 1000).toISOString() } })
  assert.equal(degraded.overall, "degraded"); assert.equal(degraded.operations.maintenance.state, "stale"); assert.equal(degraded.security.open_findings.high, 1)
})

test("Samwise route is GET-only, uses only its dedicated credential, and returns no raw status inputs", () => {
  const source = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  assert.match(source, /app\.get\("\/api\/integrations\/samwise\/status",requireSamwiseStatus/)
  assert.doesNotMatch(source, /app\.(?:post|patch|put|delete)\("\/api\/integrations\/samwise\/status"/)
  assert.match(source, /select\("severity,lifecycle"\)/)
  assert.match(source, /resource_canonical_profile"\)\.select\("resource_id",\{count:"exact",head:true\}\)/)
  assert.match(source, /miller_canonical_field_corrections"\)\.select\("correction_id",\{count:"exact",head:true\}\)/)
  assert.doesNotMatch(source, /SAMWISE_STATUS_TOKEN[^\n]*json/)
})
