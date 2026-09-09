import assert from "node:assert/strict"
import test from "node:test"

import {
  assessAccessEquityPage,
  assessStructuralPublicGate,
  buildStructuralInequalityLedger,
  normalizeStructuralInequalityRecord,
} from "../server/palantirStructuralInequality.js"

function record(overrides = {}) {
  return {
    structural_record_id: "structural:test:1",
    jurisdiction: "British Columbia",
    geography: "British Columbia",
    indigenous_population_context: "The official source explicitly reports a First Nations population comparator.",
    indigenous_context_explicit: true,
    domain: "primary_care_access",
    indicator: "Age-standardized population without a regular primary-care provider",
    observed: { value: 23, display: "23.0%", unit: "percent", denominator: "First Nations population" },
    comparator: { value: 17.5, display: "17.5%", unit: "percent", denominator: "Other residents" },
    comparator_type: "First Nations versus other residents",
    time_period: { observed: "2017/18", comparator: "2017/18", aligned: true },
    mechanism_status: "documented",
    documented_mechanism: "The report discusses systemic access barriers; this record does not assign causation from the numeric difference alone.",
    evidence_strength: "C",
    discrimination_status: "not_established",
    owner_review_state: "pending",
    public_projection_requested: true,
    source: { title: "Official data report", issuing_organization: "Public authority", url: "https://example.gc.ca/report", publication_date: "2020-12-01", locator: "Table 7", stable: true },
    ...overrides,
  }
}

test("a disparity remains separate from a discrimination conclusion", () => {
  const normalized = normalizeStructuralInequalityRecord(record())
  assert.equal(normalized.discrimination_status, "not_established")
  assert.equal(normalized.automatic_discrimination_inference, false)
  assert.equal(normalized.identity_inference_used, false)
  assert.match(normalized.caveat, /does not by itself establish discrimination or causation/i)
})

test("the public gate requires a comparator, aligned period, denominator, safe cells and owner approval", () => {
  const pending = assessStructuralPublicGate(record())
  assert.equal(pending.structurally_eligible, true)
  assert.equal(pending.publishable, false)
  assert.equal(pending.owner_review_required, true)

  const approved = assessStructuralPublicGate(record({ owner_review_state: "approved" }))
  assert.equal(approved.publishable, true)

  const missingComparator = assessStructuralPublicGate(record({ comparator: {}, comparator_type: null }))
  assert.equal(missingComparator.structurally_eligible, false)
  assert.ok(missingComparator.reasons.includes("meaningful_comparator"))
  assert.ok(missingComparator.reasons.includes("clear_denominator"))

  const misleadingComparator = assessStructuralPublicGate(record({ comparator_quality: "misleading" }))
  assert.equal(misleadingComparator.structurally_eligible, false)
  assert.ok(misleadingComparator.reasons.includes("meaningful_comparator"))

  const smallCell = assessStructuralPublicGate(record({ small_cell_or_suppression_risk: true, owner_review_state: "approved" }))
  assert.equal(smallCell.publishable, false)
  assert.ok(smallCell.reasons.includes("privacy_safe_cell_size"))
})

test("raw funding totals cannot pass without an explicit normalization basis", () => {
  const gate = assessStructuralPublicGate(record({ domain: "funding allocation", indicator: "Public funding allocated", normalization_basis: null }))
  assert.equal(gate.structurally_eligible, false)
  assert.ok(gate.reasons.includes("normalized_funding_comparison"))
})

test("documented discrimination requires source language rather than identity inference", () => {
  assert.throws(() => normalizeStructuralInequalityRecord(record({ discrimination_status: "documented_by_source" })), /requires_source_language/)
  const normalized = normalizeStructuralInequalityRecord(record({ discrimination_status: "documented_by_source", discrimination_source_language: "The issuing report formally identifies racism in the health system." }))
  assert.equal(normalized.discrimination_status, "documented_by_source")
  assert.equal(normalized.identity_inference_used, false)
  assert.throws(() => normalizeStructuralInequalityRecord(record({ identity_inference_used: true })), /identity_inference_prohibited/)
})

test("an Access & Equity page stays private when findings are unapproved or provincially thin", () => {
  const records = Array.from({ length: 10 }, (_, index) => record({ structural_record_id: `structural:test:${index}`, owner_review_state: "pending" }))
  const ledger = buildStructuralInequalityLedger(records, { generatedAt: "2026-09-09T12:00:00.000Z" })
  assert.equal(ledger.counts.structurally_eligible, 10)
  assert.equal(ledger.counts.publishable, 0)
  assert.equal(ledger.disparity_is_discrimination, false)
  const page = assessAccessEquityPage(ledger)
  assert.equal(page.permanent_public_page_justified, false)
  assert.equal(page.decision, "keep_private_hidden")
  assert.equal(page.automatic_publication, false)
})

test("response, implementation claim, independent evidence and outcome remain separate fields", () => {
  const normalized = normalizeStructuralInequalityRecord(record({
    response_summary: "The institution accepted the recommendation.",
    implementation_claim: "The institution reported completion.",
    independent_implementation_evidence: "An auditor found two components incomplete.",
    measured_outcome: "No measured outcome located.",
  }))
  assert.notEqual(normalized.response_summary, normalized.implementation_claim)
  assert.notEqual(normalized.implementation_claim, normalized.independent_implementation_evidence)
  assert.match(normalized.measured_outcome, /No measured outcome/i)
})
