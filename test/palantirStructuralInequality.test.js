import assert from "node:assert/strict"
import test from "node:test"

import {
  assessAccessEquityPage,
  assessCrossProvinceStructuralComparability,
  assessMatchedCommunityPair,
  assessRemotenessAccessComparison,
  assessStructuralClaimRelationship,
  assessStructuralComparator,
  assessStructuralPublicGate,
  buildStructuralMechanismChain,
  buildStructuralInequalityLedger,
  buildStructuralSourceYield,
  classifyStructuralMissingData,
  classifyStructuralTimeSeries,
  normalizeStructuralRate,
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

test("rate normalization exposes its formula and rejects absent denominators", () => {
  assert.deepEqual(normalizeStructuralRate({ numerator: 78, denominator: 10_000, scale: 10_000, unit: "per 10,000" }), { value: 78, numerator: 78, denominator: 10_000, scale: 10_000, unit: "per 10,000", transparent_formula: "(numerator / denominator) * 10000" })
  assert.throws(() => normalizeStructuralRate({ numerator: 5, denominator: 0 }), /rate_inputs_invalid/)
})

test("time series preserve history and stop trend claims across methodology changes", () => {
  const worsening = classifyStructuralTimeSeries([{ period: "2013", value: 34, methodology: "stable" }, { period: "2017", value: 39, methodology: "stable" }], { lowerIsBetter: true })
  assert.equal(worsening.state, "worsening")
  const changed = classifyStructuralTimeSeries([{ period: "2023", value: 312, methodology: "2011 standard" }, { period: "2024", value: 325, methodology: "2021 standard" }], { lowerIsBetter: true })
  assert.equal(changed.state, "methodology_changed")
  assert.equal(changed.change, null)
})

test("comparator design rejects unmatched remoteness, periods and denominators", () => {
  const fair = assessStructuralComparator({ same_jurisdiction: true, observed_period: "2024", comparator_period: "2024", observed_denominator: "per 100,000", comparator_denominator: "per 100,000", denominators_comparable: true, remoteness_relevant: true, remoteness_matched: true, adjustment_required: false, limitations: ["Administrative identification excludes some Indigenous people."] })
  assert.equal(fair.quality, "meaningful")
  assert.equal(fair.use_for_public_claim, true)
  const unfair = assessStructuralComparator({ same_jurisdiction: true, observed_period: "2024", comparator_period: "2019", observed_denominator: "people", comparator_denominator: "visits", denominators_comparable: false, remoteness_relevant: true, remoteness_matched: false, limitations: ["Urban versus remote."] })
  assert.equal(unfair.quality, "misleading")
  assert.equal(unfair.use_for_public_claim, false)
})

test("missing measurement is an accountability gap, not discrimination evidence", () => {
  const gap = classifyStructuralMissingData({ gap_type: "measurement_gap", indicator: "Indigenous wait-time difference", scope: "Saskatchewan", source_url: "https://example.gc.ca/report", source_checked_at: "2026-09-09", repeated_equity_commitment_unmeasurable: true })
  assert.equal(gap.accountability_relevance, true)
  assert.equal(gap.discrimination_evidence, false)
  assert.equal(gap.owner_review_required, true)
})

test("matched communities remain descriptive and cannot auto-prove Indigenous inequality", () => {
  const pair = assessMatchedCommunityPair({ pair_id: "sk:la-ronge:meadow-lake", left: { name: "La Ronge", province: "SK", population: 2521, remoteness: "northern-road", road_access: "all-season-road", regional_context: "northern-service-hub", source_url: "https://www.saskatchewan.ca/a" }, right: { name: "Meadow Lake", province: "SK", population: 5322, remoteness: "northern-road", road_access: "all-season-road", regional_context: "northern-service-hub", source_url: "https://www.saskatchewan.ca/b" }, limitations: ["Both communities serve substantial Indigenous populations and do not form an Indigenous/non-Indigenous contrast."] })
  assert.equal(pair.indigenous_inequality_inference_usable, false)
  assert.equal(pair.owner_review_required, true)
})

test("source yield recommends recurring adapters only for repeated clean high-quality output", () => {
  const strong = buildStructuralSourceYield({ source_id: "fnha-phwa", documents_checked: 2, usable_structural_findings: 7, comparator_quality: "high", update_cadence: "multi-year", indigenous_specific_resolution: "First Nations", geographic_resolution: "province and health authority" })
  assert.equal(strong.recommendation, "recurring_adapter")
  const thin = buildStructuralSourceYield({ source_id: "generic-search", documents_checked: 12, usable_structural_findings: 0 })
  assert.equal(thin.recommendation, "owner_triggered_or_low_yield")
})

test("cross-province comparisons cannot silently bridge incompatible identification methods", () => {
  const assessment = assessCrossProvinceStructuralComparability({
    indicator: "Opioid toxicity mortality rate",
    observations: [
      { jurisdiction: "British Columbia", indicator: "Opioid toxicity mortality rate", value: 328.7, unit: "per 100,000", denominator_class: "First Nations population", period: "2023", methodology: "Coroner linkage", indigenous_identification_method: "Client file linkage", source_url: "https://www.fnha.ca/report" },
      { jurisdiction: "Saskatchewan", indicator: "Opioid toxicity mortality rate", value: 94.6, unit: "per 100,000", denominator_class: "First Nations population", period: "2023", methodology: "Coroner identification", indigenous_identification_method: "Family, treaty card, RCMP or health-care information", source_url: "https://www.nitha.com/report" },
    ],
    limitations: ["The provinces use different Indigenous identification and surveillance methods."],
  })
  assert.equal(assessment.comparability, "poor")
  assert.equal(assessment.use_for_direct_cross_province_comparison, false)
  assert.equal(assessment.forced_ranking_prohibited, true)
})

test("cross-province comparisons treat missing methods as non-alignment", () => {
  const assessment = assessCrossProvinceStructuralComparability({
    indicator: "Primary-care attachment",
    observations: [
      { jurisdiction: "British Columbia", value: 77, unit: "percent", denominator_class: "resident population", period: "2024", methodology: "linked records", indigenous_identification_method: "client file linkage", source_url: "https://www.fnha.ca/a" },
      { jurisdiction: "Alberta", value: 74, unit: "percent", denominator_class: "resident population", period: "2024", source_url: "https://www.alberta.ca/b" },
    ],
    limitations: ["Alberta did not publish the method needed for alignment."],
  })
  assert.equal(assessment.checks.methodologies_aligned, false)
  assert.equal(assessment.checks.indigenous_identification_aligned, false)
  assert.equal(assessment.comparability, "poor")
})

test("revised official surveillance can supersede an earlier number without becoming a contradiction", () => {
  const relation = assessStructuralClaimRelationship({
    proposed_relationship: "supersedes",
    same_series: true,
    left: { subject: "First Nations toxic-drug deaths in 2024", scope: "British Columbia", period: "2024", denominator: "deaths", methodology: "FNHA surveillance", publication_date: "2025-02-01", source_url: "https://www.fnha.ca/earlier" },
    right: { subject: "First Nations toxic-drug deaths in 2024", scope: "British Columbia", period: "2024", denominator: "deaths", methodology: "FNHA surveillance", publication_date: "2026-01-01", source_url: "https://www.fnha.ca/revised" },
  })
  assert.equal(relation.confirmed_relationship, "supersedes")
  assert.equal(relation.later_official_revision, true)
  assert.equal(relation.contradiction_inferred_from_wording_only, false)
})

test("contradiction requires aligned scope, period, denominator and methodology", () => {
  const relation = assessStructuralClaimRelationship({
    proposed_relationship: "contradicts",
    material_semantic_conflict: true,
    left: { subject: "Recommendation implemented", scope: "Saskatchewan northwest", period: "2024", denominator: "six recommendations", methodology: "agency self-report", source_url: "https://www.saskatchewan.ca/a" },
    right: { subject: "Recommendation implemented", scope: "Saskatchewan northwest", period: "2025", denominator: "six recommendations", methodology: "independent audit", source_url: "https://www.saskatchewan.ca/b" },
  })
  assert.equal(relation.relationship_state, "owner_review")
  assert.equal(relation.confirmed_relationship, null)
})

test("mechanism chains preserve multiple contributors without asserting a single cause", () => {
  const chain = buildStructuralMechanismChain({
    chain_id: "sk:toxicity:mechanisms",
    outcome_claim_id: "sk:toxicity:2023",
    mechanisms: [
      { mechanism: "Toxic and unpredictable supply", source_url: "https://www.nitha.com/report", evidence_role: "formal interpretation", documented_by_source: true },
      { mechanism: "Inadequate access to culturally safe treatment", source_url: "https://www.nitha.com/report", evidence_role: "formal interpretation", documented_by_source: true },
    ],
  })
  assert.equal(chain.multiple_contributing_mechanisms_preserved, true)
  assert.equal(chain.single_cause_asserted, false)
  assert.equal(chain.causal_conclusion_supported, false)
})

test("remoteness matching never treats remoteness as Indigenous identity", () => {
  const assessment = assessRemotenessAccessComparison({
    comparison_id: "sk:pilot:v2",
    remoteness_tolerance: 0.1,
    left: { name: "Community A", province: "SK", population: 2500, remoteness_index: 0.61, road_access: "all-season", referral_role: "regional hub", remoteness_source_url: "https://www150.statcan.gc.ca/a" },
    right: { name: "Community B", province: "SK", population: 3100, remoteness_index: 0.66, road_access: "all-season", referral_role: "regional hub", remoteness_source_url: "https://www150.statcan.gc.ca/b" },
    service_measurement_aligned: true,
    limitations: ["The pair is descriptive and has no independently verified Indigenous population contrast."],
  })
  assert.equal(assessment.descriptive_access_comparison_usable, true)
  assert.equal(assessment.indigenous_identity_inferred_from_remoteness, false)
  assert.equal(assessment.indigenous_inequality_inference_usable, false)
})

test("records retain quantitative provenance and reviewed claim relationships", () => {
  const normalized = normalizeStructuralInequalityRecord(record({
    exact_claim: "The later official release reports a revised value.",
    methodology: "Linked administrative surveillance.",
    indigenous_identification_method: "Official administrative identification.",
    suppression_rules: "Small cells are suppressed.",
    claim_relationships: [{ claim_id: "claim:earlier", relationship: "supersedes", rationale: "Later revision of the same series." }],
  }))
  assert.match(normalized.methodology, /surveillance/i)
  assert.equal(normalized.claim_relationships[0].relationship, "supersedes")
})
