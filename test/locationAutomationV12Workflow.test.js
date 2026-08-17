import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("Phase 1P runner is bounded, resumable, production-only, and review-only", () => {
  const source = fs.readFileSync(new URL("../scripts/location-automation-1o.mjs", import.meta.url), "utf8")
  assert.match(source, /CANDIDATE_MAX = 69, REQUEST_MAX = 69/); assert.match(source, /Phase 1P is review-only/); assert.match(source, /bc-geocoder-phase-1p-cache/); assert.match(source, /geocoder\.api\.gov\.bc\.ca/); assert.doesNotMatch(source, /supabase\.|\.from\(["']|\.insert\(/i)
})
test("automation dry run remains protected and exposes requested queue labels", () => {
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8"), ui = fs.readFileSync(new URL("../src/map/LocationAutomationReview.jsx", import.meta.url), "utf8")
  assert.match(server, /app\.get\("\/api\/admin\/location-automation\/dry-run", requireAdmin/)
  for (const label of ["Active QC", "Completed history", "Later-pilot summary", "Shared-address groups"]) assert.match(ui, new RegExp(label))
  for (const label of ["Looks correct", "Require manual review", "Correct address", "Exclude exact location", "Report policy problem", "Defer"]) assert.match(ui, new RegExp(label))
  assert.match(ui, /point may lie within the parcel/)
})
test("Phase 1P artifact is non-public, deterministic, cached, licensed, and preserves identities", () => {
  const report = JSON.parse(fs.readFileSync(new URL("../data/location-automation-v1.2.1-review.json", import.meta.url), "utf8"))
  assert.equal(report.policy_version, "miller-location-auto-v1.2.1"); assert.equal(report.candidate_count, 69)
  assert.deepEqual(report.counts, { A: 12, B: 56, C: 1 }); assert.equal(report.bc_requests, 58); assert.equal(report.bc_cache_hits, 11)
  assert.deepEqual(report.verification_run, { bc_requests: 0, bc_cache_hits: 69, retries: 0, failures: 0 })
  assert.match(report.classification_fingerprint, /^[a-f0-9]{64}$/); assert.match(report.licence.attribution, /Open Government Licence/)
  assert.equal(new Set(report.records.map((item) => item.canonical_uuid)).size, 69); assert.equal(report.records.every((item) => item.public_map === false), true)
  assert.equal(report.records.some((item) => item.sensitivity_flags.length && item.tier === "A"), false)
  assert.equal(report.records.some((item) => item.conflicts.length && item.tier === "A"), false)
  assert.equal(report.quality_control_sample.length, 5); assert.equal(new Set(report.quality_control_sample.map((item) => item.canonical_uuid)).size, 5)
})
test("frontend review source contains attribution but no geocoder credential names", () => {
  const ui = fs.readFileSync(new URL("../src/map/LocationAutomationReview.jsx", import.meta.url), "utf8")
  assert.match(ui, /attribution_url/); assert.doesNotMatch(ui, /BC_GEOCODER_API_KEY|BC_GEOCODER_CLIENT_ID|apikey/i)
})
