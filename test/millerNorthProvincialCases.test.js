import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import registry from "../artifacts/farm/open-government-source-registry-2026-09-06.json" with { type: "json" }
import bc from "../artifacts/miller-north/miller-north-provincial-case-british-columbia-in-plain-sight-2026-09-06.json" with { type: "json" }
import sk from "../artifacts/miller-north/miller-north-provincial-case-saskatchewan-saskatoon-coerced-sterilization-2026-09-06.json" with { type: "json" }
import ab from "../artifacts/miller-north/miller-north-provincial-case-alberta-indigenous-primary-care-panel-2026-09-06.json" with { type: "json" }
import { buildRecommendationThemeSummary, validateProvincialCaseSet } from "../server/millerNorthProvincialCases.js"

test("three provincial cases remain private, distinct and evidence bearing", () => {
  const result = validateProvincialCaseSet([bc, sk, ab], registry)
  assert.deepEqual(result.provinces, { british_columbia: 1, saskatchewan: 1, alberta: 1 })
  assert.equal(result.cases, 3)
  assert.ok(result.sources >= 25)
  assert.ok(result.evidence_edges >= 20)
  assert.ok([bc, sk, ab].every(record => record.production_mutations === 0 && record.publication_mutations === 0))
})

test("In Plain Sight preserves exactly 24 canonical recommendations and recommendation 11 PIDA mapping", () => {
  assert.equal(bc.recommendation_tracker.length, 24)
  assert.deepEqual(bc.recommendation_tracker.map(item => item.recommendation_number), Array.from({ length: 24 }, (_, index) => index + 1))
  const pida = bc.recommendation_tracker.find(item => item.recommendation_number === 11)
  assert.match(pida.short_summary, /disclosure|PIDA/i)
  assert.equal(bc.pida_numbering_resolution.canonical_recommendation_number, 11)
  assert.equal(bc.pida_numbering_resolution.resolution, "apparent_current_reporting_label_error")
})

test("theme projection accounts for every In Plain Sight recommendation once", () => {
  const summaries = buildRecommendationThemeSummary(bc.recommendation_tracker, bc.recommendation_themes)
  const numbers = summaries.flatMap(theme => theme.recommendation_numbers).sort((a, b) => a - b)
  assert.deepEqual(numbers, Array.from({ length: 24 }, (_, index) => index + 1))
})

test("Saskatoon remains a cohort and does not store patient identities", () => {
  assert.equal(sk.identity.subject_type, "cohort_systemic_pattern")
  assert.equal(sk.privacy.anonymized_patients_preserved, true)
  assert.match(sk.legal_policy_context.find(item => item.title.includes("Bill S-228")).boundary, /later contextual legal development/i)
  assert.doesNotMatch(JSON.stringify(sk), /patient_name|complainant_name|witness_name/i)
})

test("Alberta selection documents why the provincewide panel displaced weaker Red Deer candidates", () => {
  assert.equal(ab.alberta_selection.ordered_geographic_search_completed, true)
  assert.equal(ab.alberta_selection.selected_candidate_id, "ab_candidate_primary_care_panel")
  assert.match(ab.alberta_selection.reason_selected, /Red Deer|Central Alberta/i)
  assert.equal(ab.knowledge_gap_follow_ups.length, 1)
})

test("bounded gap investigations stop and do not send information requests", () => {
  for (const record of [bc, sk, ab]) {
    assert.ok(record.knowledge_gap_follow_ups.length <= 1)
    assert.ok(record.knowledge_gap_follow_ups.every(item => item.stopping_reason && item.information_requests_sent === 0))
  }
})

test("owner preview is unwired, private and visually bounded", () => {
  const source = readFileSync(new URL("../src/admin/MillerNorthProvincialCasesPreview.jsx", import.meta.url), "utf8")
  assert.match(source, /Administrator only · private provincial research cases/)
  assert.match(source, /What happened/)
  assert.match(source, /What remains unknown/)
  assert.match(source, /cannot publish records/)
  assert.doesNotMatch(source, /fetch\(|supabase|approved_for_publication/)
})
