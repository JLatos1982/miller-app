import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { correctionRequestFingerprint, validateCanonicalCorrectionRequest } from "../server/canonicalFieldCorrection.js"

const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/miller-canonical-field-correction-v1.json", import.meta.url), "utf8"))
const now = Date.parse("2026-08-31T12:00:00Z")
function request(change = {}) { const value = { ...fixture, ...change }; value.request_fingerprint = correctionRequestFingerprint(value); return value }

test("Samwise fixture has a deterministic strict request fingerprint and normalized first write", () => {
  const valid = validateCanonicalCorrectionRequest(request(), now)
  assert.equal(valid.proposed_value, "+16045551234"); assert.equal(valid.expected_profile_absent, true)
  assert.equal(correctionRequestFingerprint(request()), request().request_fingerprint)
})
test("strict contract rejects unknown fields, stale expiry, and malformed evidence", () => {
  assert.throws(() => validateCanonicalCorrectionRequest(request({ unexpected: true }), now), /rejected/)
  assert.throws(() => validateCanonicalCorrectionRequest(request({ expires_at: "2026-08-30T00:00:00Z" }), now), /rejected/)
  assert.throws(() => validateCanonicalCorrectionRequest(request({ supporting_evidence_bindings: [] }), now), /evidence_gate_failed/)
})
test("location corrections require a bound location while contact corrections cannot choose one", () => {
  const location = request({ field: "city", proposed_value: "Burnaby", canonical_location_id: "a39cd1b9-7942-4c7e-b5c0-101e4c2e702b", supporting_evidence_bindings: [{ ...fixture.supporting_evidence_bindings[0], field: "city" }] })
  assert.equal(validateCanonicalCorrectionRequest(location, now).field, "city")
  assert.throws(() => validateCanonicalCorrectionRequest(request({ field: "city", proposed_value: "Burnaby", supporting_evidence_bindings: [{ ...fixture.supporting_evidence_bindings[0], field: "city" }] }), now), /rejected/)
})
test("database transaction is fixed, atomic, evidence-gated, concurrency-bound, idempotent, and rollback-ready", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/202608630001_canonical_field_correction_transaction_v1.sql", import.meta.url), "utf8")
  for (const expected of ["p_preview boolean", "pg_advisory_xact_lock", "for update", "expected_profile_version", "expected_canonical_fingerprint", "expected_current_value", "evidence_gate_failed", "miller_canonical_field_corrections", "request_fingerprint", "prior_fingerprint", "new_fingerprint", "audit_id", "revoke all on function public.apply_miller_canonical_field_correction_v1"]) assert.match(sql, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(sql, /update public\.resource_locations set city=v_proposed/)
  assert.doesNotMatch(sql, /latitude\s*=|longitude\s*=|public_map\s*=/)
})
test("endpoint surface is fixed and does not expose a generic correction patch", () => {
  const source = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  assert.match(source, /app\.post\("\/api\/integrations\/samwise\/canonical-field-correction-v1",requireSamwiseStatus/)
  assert.match(source, /canonical-field-correction-v1\/preview/)
  assert.doesNotMatch(source, /app\.patch\("\/api\/integrations\/samwise\/canonical-field-correction-v1/)
})
