import assert from "node:assert/strict"
import test from "node:test"

import publicDerived from "../src/data/miller-north-care-setting-derived-public-v1.json" with { type: "json" }
import publicEvidence from "../src/data/indigenous-healthcare-evidence-public-v1.json" with { type: "json" }
import { buildMillerNorthCareSettingEnrichment, classifyMillerNorthCareSetting, validateMillerNorthCareSettingEnrichment, validateMillerNorthCareSettingPublicProjection } from "../server/millerNorthCareSettingEnrichment.js"

const row = (id, summary, extra = {}) => ({ public_record_id: id, summary, source: { title: "Public source" }, ...extra })

test("care settings are derived from explicit evidence without changing raw rows", () => {
  const records = [row("one", "The account describes treatment in the emergency department."), row("two", "Paramedics transported the patient by ambulance."), row("three", "A broad report without a named setting.")]
  const before = JSON.stringify(records), result = buildMillerNorthCareSettingEnrichment(records)
  assert.equal(result.deterministic_enriched, 2)
  assert.equal(result.unclassified, 1)
  assert.equal(JSON.stringify(records), before)
  assert.deepEqual(validateMillerNorthCareSettingEnrichment(result, records.map(item => item.public_record_id)), { valid: true, rows: 3 })
})

test("conflicting settings and weak model proposals remain reviewable", () => {
  const conflict = classifyMillerNorthCareSetting(row("four", "Paramedics brought the patient to the emergency department."))
  assert.equal(conflict.review_status, "owner_review")
  const weak = classifyMillerNorthCareSetting(row("five", "The account described a clinic visit."), { modelSuggestion: { setting: "primary_care", confidence: .8, evidence: "clinic visit", model: "qwen" } })
  assert.equal(weak.review_status, "owner_review")
  const supported = classifyMillerNorthCareSetting(row("six", "The account explicitly says walk-in clinic."), { modelSuggestion: { setting: "primary_care", confidence: .99, evidence: "walk-in clinic", model: "qwen" } })
  assert.equal(supported.route, "deterministic_explicit_phrase")
})

test("public derived care settings contain deterministic labels only", () => {
  const result = validateMillerNorthCareSettingPublicProjection(publicDerived, publicEvidence.records.map(item => item.public_record_id))
  assert.equal(result.records, 164)
  assert.ok(publicDerived.records.every(item => item.classification_route !== "local_model_suggestion"))
})
