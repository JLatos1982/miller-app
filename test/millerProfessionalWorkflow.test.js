import assert from "node:assert/strict"
import test from "node:test"

import { buildMillerAccessPathway, decomposeMillerProfessionalNeeds, explainMillerProfessionalResults, recommendedMillerPackIds } from "../server/millerProfessionalWorkflow.js"

test("need decomposition uses bounded deterministic context rules", () => {
  const needs = decomposeMillerProfessionalNeeds("Someone is leaving detox Friday, has nowhere to stay and doesn't drive", ["detox", "housing"])
  assert.deepEqual(needs.map(item => item.need_id), ["detox", "housing", "continuity", "transportation"])
  assert.equal(needs.find(item => item.need_id === "transportation").role, "barrier")
  assert.ok(needs.every(item => ["request_language", "deterministic_context_rule"].includes(item.basis)))
})

test("result explanations are concise and derive from public card facts", () => {
  const needs = decomposeMillerProfessionalNeeds("Need treatment and transportation", ["treatment", "transportation"])
  const [card] = explainMillerProfessionalResults([{
    canonical_id: "service-1", name: "Regional Access", category: "Treatment", service_type: "Treatment navigation",
    description: "Treatment navigation and medical travel information.", location_label: "Serves Northern Saskatchewan",
    access_note: "Call the centralized intake line", referral_note: "", funding_note: "", transportation_note: "Travel information is available",
    phone: "1-800-555-0100", website: "https://example.test", tags: [],
  }], needs)
  assert.deepEqual(card.why_shown, ["Serves Northern Saskatchewan", "Matches Treatment", "Centralized intake"])
  assert.deepEqual(card.matched_needs, ["treatment", "transportation"])
  assert.equal(card.result_group, "start_here")
})

test("result explanations never turn an explicit non-self-referral boundary into a self-referral claim", () => {
  const [card] = explainMillerProfessionalResults([{
    canonical_id: "hospital-only", name: "Hospital consultation", category: "Healthcare", service_type: "Hospital addiction consultation",
    description: "Inpatient consultation.", location_label: "Serves Edmonton",
    access_note: "Not community self-referral, outpatient intake or walk-in care. Hospital/provider route only.", referral_note: "Not community self-referral.",
  }], [])
  assert.ok(!card.why_shown.includes("Self-referral stated"))
  assert.ok(!card.why_shown.includes("Walk-in access stated"))
})

test("result explanations never turn no-referral wording into a referral-required claim", () => {
  const [card] = explainMillerProfessionalResults([{
    canonical_id: "walk-in-no-referral", name: "Walk-in program", category: "Healthcare", service_type: "Opioid agonist treatment",
    description: "Walk-in program.", location_label: "Serves Morley",
    access_note: "Walk-in; no referral required.", referral_note: "No referral required.",
  }], [])
  assert.ok(!card.why_shown.includes("Referral required"))
  assert.ok(card.why_shown.includes("Walk-in access stated"))
})

test("pathway and suggested pack remain bounded and worker-controlled", () => {
  const needs = decomposeMillerProfessionalNeeds("Treatment, housing and transportation", ["treatment", "housing", "transportation"])
  const results = explainMillerProfessionalResults([
    { canonical_id: "t", name: "Treatment intake", service_type: "Treatment", category: "Treatment", access_note: "Call first", phone: "1", website: "", tags: [] },
    { canonical_id: "h", name: "Housing navigator", service_type: "Housing", category: "Housing", access_note: "Self-referral", phone: "2", website: "", tags: [] },
    { canonical_id: "x", name: "Travel support", service_type: "Transportation", category: "Transportation", transportation_note: "Travel help", phone: "3", website: "", tags: [] },
  ], needs)
  const pathway = buildMillerAccessPathway({ results, needs, searchScope: {} })
  assert.ok(pathway.length <= 4)
  assert.deepEqual(pathway.map(item => item.order), [1, 2, 3])
  assert.deepEqual(recommendedMillerPackIds(results, needs), ["t", "h", "x"])
})
