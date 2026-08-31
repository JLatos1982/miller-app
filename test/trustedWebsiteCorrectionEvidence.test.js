import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { prepareTrustedWebsiteCorrectionEvidence, TRUSTED_WEBSITE_CORRECTION_EVIDENCE_CONTRACT, validateTrustedWebsiteCorrectionEvidenceRequest } from "../server/trustedWebsiteCorrectionEvidence.js"

const now = Date.parse("2026-08-31T12:00:00Z")
const resource = { id: "2739fba4-51d8-5c57-b433-9e31cd99a01d", display_name: "Working Gear", lifecycle_state: "active", editorial_status: "approved" }
const content = "Working Gear's official site is https://workinggear.example. Contact information is current."
const input = { contract: TRUSTED_WEBSITE_CORRECTION_EVIDENCE_CONTRACT, resource_id: resource.id, proposed_website: "https://workinggear.example/", authoritative_source_url: "https://workinggear.example/contact", source_content: content, source_retrieved_at: "2026-08-31T11:00:00Z" }
const dependencies = (change = {}) => ({ now: () => now, loadResource: async () => change.resource || resource, fetchDocument: async () => change.document || { ok: true, redirects: 0, url: input.authoritative_source_url, text: content } })

test("trusted website evidence validates a first-party source and derives server-only metadata", async () => {
  const result = await prepareTrustedWebsiteCorrectionEvidence(input, dependencies())
  assert.equal(result.proposed_website, "https://workinggear.example")
  assert.equal(result.source_url, input.authoritative_source_url)
  assert.match(result.source_content_sha256, /^[0-9a-f]{64}$/)
  assert.equal(result.validation_version, "miller-trusted-website-correction-evidence-v1")
  assert.equal(Object.hasOwn(result, "authoritative"), false)
})

test("writer rejects wrong resource, website, stale source, redirects, and non-first-party sources", async () => {
  await assert.rejects(() => prepareTrustedWebsiteCorrectionEvidence(input, dependencies({ resource: { ...resource, display_name: "Other Resource" } })), /identity_or_website_not_verified/)
  await assert.rejects(() => prepareTrustedWebsiteCorrectionEvidence({ ...input, proposed_website: "https://other.example" }, dependencies()), /non_first_party_source/)
  assert.throws(() => validateTrustedWebsiteCorrectionEvidenceRequest({ ...input, source_retrieved_at: "2026-08-29T11:00:00Z" }, now), /stale_source/)
  await assert.rejects(() => prepareTrustedWebsiteCorrectionEvidence(input, dependencies({ document: { ok: true, redirects: 1, url: input.authoritative_source_url, text: content } })), /redirected_or_unrelated_source/)
})

test("caller cannot provide trust markers or an AI assertion", () => {
  assert.throws(() => validateTrustedWebsiteCorrectionEvidenceRequest({ ...input, authoritative: true }, now), /rejected/)
  assert.throws(() => validateTrustedWebsiteCorrectionEvidenceRequest({ ...input, extraction_method: "openai" }, now), /rejected/)
})

test("migration is fixed website-only, conflict-aware, immutable, and service-role-only", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/202608710001_trusted_website_correction_evidence_writer_v1.sql", import.meta.url), "utf8")
  for (const fragment of ["persist_miller_trusted_website_correction_evidence_v1", "'website'", "'authoritative',true", "'no_conflict',true", "'confidence','high'", "'privacy_safe',true", "conflicting current authoritative website evidence", "p_preview boolean", "revoke all on function", "grant execute on function"]) assert.match(sql, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
})

test("HTTP surface is fixed, trusted-backend authenticated, and has a preview", () => {
  const source = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  assert.match(source, /trusted-website-correction-evidence-v1\/preview",requireSamwiseStatus/)
  assert.match(source, /app\.post\("\/api\/integrations\/samwise\/trusted-website-correction-evidence-v1",requireSamwiseStatus/)
  assert.doesNotMatch(source, /app\.patch\("\/api\/integrations\/samwise\/trusted-website-correction-evidence-v1/)
})
