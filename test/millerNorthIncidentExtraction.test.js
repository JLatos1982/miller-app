import test from "node:test"
import assert from "node:assert/strict"
import { normalizeMillerNorthSource } from "../server/millerNorthSourceTextNormalization.js"
import { extractMillerNorthIncidents } from "../server/millerNorthIncidentExtraction.js"

test("keeps a specifically described unnamed patient anonymous", () => {
  const normalizedSource = normalizeMillerNorthSource({ url: "https://example.org/unnamed", trustedDocument: { ok: true, url: "https://example.org/unnamed", text: "<article><p>An unnamed First Nations patient was turned away from Royal University Hospital in Saskatoon in 2025 while seeking emergency treatment.</p><p>The family filed a complaint alleging discrimination after the refusal of care.</p></article>" } })
  const result = extractMillerNorthIncidents({ normalizedSource, sourceUrl: normalizedSource.url, province: "saskatchewan" })
  assert.equal(result.source_classification, "unnamed_specific_incident")
  assert.equal(result.incident_candidates[0].incident_identity_class, "unnamed_but_specific_incident")
  assert.equal(result.incident_candidates[0].public_case_name, null)
  assert.match(result.incident_candidates[0].working_title, /^Patient not publicly named — Royal University Hospital — 2025$/)
})

test("rejects vague anonymous context", () => {
  const normalizedSource = normalizeMillerNorthSource({ url: "https://example.org/context", trustedDocument: { ok: true, url: "https://example.org/context", text: "<article><p>Indigenous patients have described racism in Saskatchewan health care.</p></article>" } })
  const result = extractMillerNorthIncidents({ normalizedSource, sourceUrl: normalizedSource.url, province: "saskatchewan" })
  assert.equal(result.incident_candidates.length, 0)
  assert.equal(result.source_classification, "systemic_context")
})

test("does not turn a named source into an anonymous duplicate", () => {
  const normalizedSource = normalizeMillerNorthSource({ url: "https://example.org/named", trustedDocument: { ok: true, url: "https://example.org/named", text: "<article><p>Jane Doe, a First Nations patient, was turned away from Regina General Hospital in Regina in 2025 while seeking emergency treatment.</p></article>" } })
  const result = extractMillerNorthIncidents({ normalizedSource, sourceUrl: normalizedSource.url, province: "saskatchewan" })
  assert.equal(result.incident_candidates.some(row => row.incident_identity_class === "unnamed_but_specific_incident"), false)
})
