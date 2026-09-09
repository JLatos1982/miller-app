import assert from "node:assert/strict"
import test from "node:test"

import {
  assessAccessEquityPage,
  assessNeedToResourceFit,
  assessServiceReliability,
  assessSuggestedFollowUpPublicGate,
  assessCrossProvinceStructuralComparability,
  assessStructuralAccessIndexExperiment,
  assessMatchedCommunityPair,
  assessRemotenessAccessComparison,
  assessStructuralClaimRelationship,
  assessStructuralComparator,
  assessStructuralPublicGate,
  buildStructuralMechanismChain,
  buildStructuralAccessProfile,
  buildStructuralAccessSignal,
  buildStructuralDataAvailabilityMatrix,
  buildStructuralAccessChain,
  buildStructuralInequalityLedger,
  buildMissingEvidenceAcquisition,
  ingestMissingEvidenceAcquisitionResponse,
  buildStructuralSourceYield,
  buildTreatmentAccessCascade,
  buildPolicyOutcomeLagChain,
  buildMeasurementInequalityMatrix,
  buildInterventionOutcomeCaseStudy,
  buildAccessEquityPublicProjection,
  buildSuggestedFollowUpRecord,
  assessStructuralTravelBurden,
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

  const approved = assessStructuralPublicGate(record({ owner_review_state: "approved", publication_state: "approved_public" }))
  assert.equal(approved.publishable, true)

  const ownerApprovedButPrivate = assessStructuralPublicGate(record({ owner_review_state: "approved", publication_state: "owner_review" }))
  assert.equal(ownerApprovedButPrivate.publishable, false)
  assert.ok(ownerApprovedButPrivate.reasons.includes("approved_public_state"))

  const missingComparator = assessStructuralPublicGate(record({ comparator: {}, comparator_type: null }))
  assert.equal(missingComparator.structurally_eligible, false)
  assert.ok(missingComparator.reasons.includes("meaningful_comparator"))
  assert.ok(missingComparator.reasons.includes("clear_denominator"))

  const misleadingComparator = assessStructuralPublicGate(record({ comparator_quality: "misleading" }))
  assert.equal(misleadingComparator.structurally_eligible, false)
  assert.ok(misleadingComparator.reasons.includes("meaningful_comparator"))

  const smallCell = assessStructuralPublicGate(record({ small_cell_or_suppression_risk: true, owner_review_state: "approved", publication_state: "approved_public" }))
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

test("data availability distinguishes missing public data from evidence that a measure is not collected", () => {
  const matrix = buildStructuralDataAvailabilityMatrix([
    { indicator: "Primary-care attachment", availability: "collected_public", indigenous_specific: true, comparator_available: false, longitudinal: false, public: true, methodology_quality: "moderate", source_url: "https://www150.statcan.gc.ca/table", next_action: "Seek an aligned non-First Nations comparator." },
    { indicator: "Medical-travel trips", availability: "likely_collected_not_public", indigenous_specific: true, comparator_available: false, longitudinal: false, public: false, methodology_quality: "weak", source_url: "https://www.sac-isc.gc.ca/report", institutional_evidence: "Trip-log reporting forms and a legacy operational system are documented.", next_action: "Request aggregate trip measures." },
  ], { jurisdiction: "Saskatchewan", generatedAt: "2026-09-09T12:00:00.000Z" })
  assert.equal(matrix.counts.total, 2)
  assert.equal(matrix.counts.equity_question_answerable, 0)
  assert.equal(matrix.indicators[0].equity_question_answerable, false)
  assert.equal(matrix.absence_is_discrimination_evidence, false)
  assert.throws(() => buildStructuralDataAvailabilityMatrix([{ indicator: "Wait times", availability: "apparently_not_collected", public: false, source_url: "https://example.gc.ca/a", next_action: "Recheck." }], { jurisdiction: "Saskatchewan" }), /not_collected_requires_institutional_evidence/)
})

test("structural access chains expose every missing link instead of implying a complete causal path", () => {
  const chain = buildStructuralAccessChain({
    chain_id: "sk:first-nations-access-v4",
    jurisdiction: "Saskatchewan",
    links: [
      { stage: "remoteness", support_state: "suggestive", statement: "A public remoteness index exists, but it is not an identity measure.", source_url: "https://www150.statcan.gc.ca/remoteness", period: "2016", limitations: ["Remoteness cannot identify First Nations residents."] },
      { stage: "primary_care_continuity", support_state: "supported", statement: "Lower continuity predicts higher ACSC hospitalization in the Saskatchewan population studied.", source_url: "https://secure.cihi.ca/report", comparator: "low versus high continuity", denominator: "patients with at least two family-physician visits", period: "2007-2013" },
      { stage: "outcome", support_state: "supported", statement: "First Nations opioid-toxicity mortality exceeded the non-First Nations rate.", source_url: "https://www.nitha.com/report", indigenous_specific: true, comparator: "non-First Nations", denominator: "population rate", period: "2023" },
    ],
  })
  assert.equal(chain.chain_state, "partial")
  assert.equal(chain.missing_links, 2)
  assert.equal(chain.indigenous_specific_chain, false)
  assert.equal(chain.causal_conclusion_supported, false)
})

test("missing-evidence acquisition requires existence evidence and makes only unsent aggregate drafts", () => {
  const acquisition = buildMissingEvidenceAcquisition({
    acquisition_id: "sk:primary-care:attachment-continuity",
    jurisdiction: "Saskatchewan",
    indicator: "First Nations and non-First Nations primary-care attachment and continuity",
    research_question: "Can a privacy-safe aggregate comparator be produced?",
    existence_state: "D_likely_held_required_fields",
    likely_holder: {
      name: "Saskatchewan Health Quality Council / Ministry of Health",
      underlying_system: "Person Health Registration System, Physician Services Claims and hospital abstracts",
      geographic_resolution: "broad region or remoteness",
      indigenous_identification_method: "Self-declared Registered Indian flag; limitations must be stated",
      years_available: "To be confirmed by holder",
      linked_data_required: true,
      public: false,
      aggregate_extraction_feasible: true,
      governance_privacy: ["First Nations governance review", "small-cell suppression"],
    },
    evidence_of_existence: [{ source_url: "https://example.gc.ca/methods", locator: "Methods", source_type: "peer-reviewed administrative-data study", claim: "Linked Saskatchewan administrative databases and a First Nations flag were analyzed through a formal data-sharing agreement." }],
    searches_completed: ["Public indicator and metadata search"],
    failed_searches_to_preserve: ["No aligned public Saskatchewan series located"],
    access_equity_impact: "Would permit a bounded access comparator, not an identity inference.",
    request_draft: {
      recipient: "HQC data inquiry",
      preferred_route: "research_data_inquiry",
      formal_fallback: "formal_foi_fallback",
      period: "2019-20 through 2024-25",
      requested_aggregate: "Annual aggregate attachment and continuity measures by status and broad remoteness.",
      numerator: "Residents meeting a defined attachment or continuity threshold",
      denominator: "Eligible Saskatchewan residents in each stated group",
      indigenous_identification_method: "Document the self-declared Registered Indian flag, linkage and exclusions.",
      geography: "Privacy-safe broad remoteness category only",
      suppression_privacy: "Suppress small cells and disclose no record-level data.",
      aggregate_only: true,
      asks_individual_records: false,
    },
  })
  assert.equal(acquisition.request_draft.submission_state, "not_submitted")
  assert.equal(acquisition.automatic_request_submission, false)
  assert.equal(acquisition.likely_holder.aggregate_extraction_feasible, "likely")
  assert.throws(() => buildMissingEvidenceAcquisition({ acquisition_id: "x", jurisdiction: "SK", indicator: "x", existence_state: "C_collected_not_public", likely_holder: { name: "holder" } }), /held_classification_requires_evidence/)
})

test("holder-response ingestion preserves a privacy-safe record and cannot publish it", () => {
  const acquisition = buildMissingEvidenceAcquisition({
    acquisition_id: "ab:investigator:aggregate-outcomes",
    jurisdiction: "Alberta",
    indicator: "Indigenous Patient Safety Investigator aggregate outcomes",
    existence_state: "D_likely_held_required_fields",
    likely_holder: { name: "Office of Alberta Health Advocates" },
    evidence_of_existence: [{ source_url: "https://www.alberta.ca/indigenous-patient-safety-investigator-and-advocate", claim: "The role reviews concerns and makes recommendations." }],
  })
  const response = ingestMissingEvidenceAcquisitionResponse(acquisition, {
    response_type: "methodology_document",
    responding_holder: "Office of Alberta Health Advocates",
    received_at: "2026-09-09T12:00:00.000Z",
    summary: "Holder supplied a methodology document for owner review.",
    source_locator: "Owner-provided document reference",
  })
  assert.equal(response.response_state, "received")
  assert.equal(response.response.response_type, "methodology_document")
  assert.equal(response.publication_authority, false)
  assert.throws(() => ingestMissingEvidenceAcquisitionResponse(acquisition, { response_type: "aggregate_table", responding_holder: "Office", received_at: "2026-09-09", summary: "Rows included.", contains_individual_records: true }), /record_level_material_prohibited/)
})

test("travel spending without trips, denominator or comparator is burden context rather than disparity", () => {
  const travel = assessStructuralTravelBurden({ jurisdiction: "Saskatchewan", period: "2023-24", indigenous_specific: true, expenditure: 115_915_000, source_url: "https://www.sac-isc.gc.ca/annual-report", limitations: ["No public trips, kilometres or destination series was reported."] })
  assert.equal(travel.usable_as_burden_description, true)
  assert.equal(travel.usable_as_disparity_measure, false)
  assert.equal(travel.missing_denominator, true)
  assert.equal(travel.missing_comparator, true)
})

test("structural access profiles preserve dimensions and unknowns without a community rank", () => {
  const profile = buildStructuralAccessProfile({
    profile_id: "bc:primary-care:v8",
    jurisdiction: "British Columbia",
    dimensions: [
      { dimension: "primary_care_access", state: "supported", summary: "A baseline First Nations comparator is published.", source_url: "https://www.fnha.ca/a", population_definition: "Source-defined First Nations population", governance: ["FNHA context"] },
      { dimension: "continuity", state: "missing", summary: "No comparable outcome series located." },
    ],
  })
  assert.equal(profile.supported_dimensions, 1)
  assert.equal(profile.unknown_or_missing_dimensions, 1)
  assert.equal(profile.community_ranking_prohibited, true)
  assert.equal(profile.discrimination_conclusion, "not_established")
})

test("signals are research priorities, never discrimination findings", () => {
  const signal = buildStructuralAccessSignal({
    signal_id: "ab:outcome-gap",
    jurisdiction: "Alberta",
    signal_type: "outcome_measurement_missing",
    observed_pattern: "Public implementation is documented without a common outcome series.",
    research_question: "Do recipient annual reports contain a privacy-safe outcome schema?",
    source_url: "https://www.alberta.ca/program",
  })
  assert.equal(signal.priority_only, true)
  assert.equal(signal.discrimination_finding, false)
})

test("the index experiment withholds an arbitrary composite", () => {
  const withheld = assessStructuralAccessIndexExperiment({
    dimensions: [{ dimension: "continuity", normalized_value: 0.7, normalization_method: "z score", source_url: "https://example.ca/a" }],
  })
  assert.equal(withheld.composite_status, "dimensions_retained_no_composite")
  assert.equal(withheld.composite_value, null)
  const experimental = assessStructuralAccessIndexExperiment({
    pre_specified_weighting: true,
    weighting_method: "Equal weights pre-specified for a sensitivity test.",
    dimensions: [
      { dimension: "continuity", normalized_value: 0.7, normalization_method: "min-max", source_url: "https://example.ca/a", weight: 0.5 },
      { dimension: "service_stability", normalized_value: 0.3, normalization_method: "min-max", source_url: "https://example.ca/b", weight: 0.5 },
    ],
  })
  assert.equal(experimental.composite_status, "private_experimental_composite")
  assert.equal(experimental.public_use_prohibited, true)
})

test("need-to-resource inference requires aligned geography, period and denominators", () => {
  const incomplete = assessNeedToResourceFit({
    jurisdiction: "Alberta",
    need: { label: "ACSC", value: 12, denominator: "per 100,000", geography: "Alberta", period: "2024", source_url: "https://example.ca/need" },
    resource: { label: "Primary care", value: 3, denominator: "per 10,000", geography: "Alberta", period: "2023", source_url: "https://example.ca/resource" },
  })
  assert.equal(incomplete.analytical_state, "insufficient_for_need_resource_inference")
  assert.equal(incomplete.mismatch_is_discrimination_evidence, false)
})

test("service reliability refuses to invent a denominator", () => {
  const unmeasured = assessServiceReliability({ jurisdiction: "Saskatchewan", service_type: "Emergency department", source_url: "https://www.saskatchewan.ca/disruptions" })
  assert.equal(unmeasured.measurement_state, "not_measured")
  assert.equal(unmeasured.availability_rate, null)
  const measured = assessServiceReliability({ jurisdiction: "Test", service_type: "Clinic", scheduled_hours: 100, available_hours: 90, source_url: "https://example.ca/hours" })
  assert.equal(measured.availability_rate, 0.9)
})

test("treatment cascades and policy chains keep implementation separate from outcomes", () => {
  const cascade = buildTreatmentAccessCascade({
    jurisdiction: "Saskatchewan",
    stages: [
      { stage: "documented_need", state: "supported", summary: "Need is documented.", source_url: "https://example.ca/need" },
      { stage: "transportation", state: "suggestive", summary: "Program activity is public, but normalized burden is not." },
    ],
  })
  assert.equal(cascade.implementation_is_outcome, false)
  assert.ok(cascade.missing_or_unmeasurable_stages > 0)
  const chain = buildPolicyOutcomeLagChain({
    chain_id: "ab:navigator:v8",
    jurisdiction: "Alberta",
    links: [
      { stage: "problem_identified", state: "supported", statement: "Panel documented barriers.", source_url: "https://example.ca/panel", date: "2023-01-01" },
      { stage: "program", state: "supported", statement: "Navigator program created.", source_url: "https://example.ca/program", date: "2024-01-01" },
      { stage: "later_outcome", state: "not_measurable", statement: "No public outcome series located." },
    ],
  })
  assert.equal(chain.outcome_measured, false)
  assert.equal(chain.intervention_is_effectiveness_evidence, false)
})

test("measurement inequality matrix preserves different provincial capabilities without ranking them", () => {
  const matrix = buildMeasurementInequalityMatrix({
    provinces: ["British Columbia", "Alberta", "Saskatchewan"],
    rows: [{
      indicator: "Primary-care attachment or continuity",
      cells: {
        "British Columbia": { state: "partially_measurable", indigenous_specific: true, comparator_available: true, longitudinal: false, age_standardized: false, public: true, governed: true, methodology_quality: "moderate", latest_year: "2017/18", source_url: "https://www.fnha.ca/report" },
        Alberta: { state: "insufficiently_disaggregated", indigenous_specific: false, comparator_available: false, longitudinal: false, age_standardized: false, public: true, governed: false, methodology_quality: "weak", latest_year: "2024", source_url: "https://www.alberta.ca/dashboard" },
        Saskatchewan: { state: "collected_but_unpublished", indigenous_specific: false, comparator_available: false, longitudinal: false, age_standardized: false, public: false, governed: true, methodology_quality: "unknown", source_url: "https://www.saskhealthquality.ca/report" },
      },
    }],
  })
  assert.equal(matrix.rows[0].cells.Saskatchewan.state, "collected_but_unpublished")
  assert.equal(matrix.cross_province_rankings_prohibited, true)
})

test("suggested follow-ups are source-backed questions behind their own public gate", () => {
  const followUp = buildSuggestedFollowUpRecord({
    follow_up_id: "sk:continuity-acsc",
    title: "Can Saskatchewan measure primary-care continuity and preventable hospitalization?",
    jurisdiction: "Saskatchewan",
    research_question: "Can a governed aggregate analysis compare Registered First Nations residents with a consistently defined comparison population?",
    why_it_matters: "Aligned measures would help determine whether access and potentially preventable hospitalization can be assessed together.",
    what_we_currently_know: "Administrative components and a public ACSC definition are documented, but no aligned public comparator was located.",
    what_is_missing: "An age-standardized, privacy-suppressed series with a stated population definition and method.",
    evidence_needed: "A governed methodology or public aggregate measure with numerator, denominator and suppression rules.",
    likely_data_holder_or_source_family: "Saskatchewan health administrative reporting and First Nations governance partners",
    governance_considerations: "Administrative Registered Indian identification is not equivalent to all Indigenous people; Métis and Inuit require distinct approaches.",
    source_urls: ["https://www.cihi.ca/en/indicators/ambulatory-care-sensitive-conditions-hospitalizations"],
    priority: "high",
    status: "suggested",
    owner_review_state: "pending",
    publication_state: "owner_review",
    public_projection_requested: true,
  })
  const pending = assessSuggestedFollowUpPublicGate(followUp)
  assert.equal(pending.publicly_eligible, true)
  assert.equal(pending.publishable, false)
  const approved = assessSuggestedFollowUpPublicGate({ ...followUp, owner_review_state: "approved", publication_state: "approved_public" })
  assert.equal(approved.publishable, true)
  assert.throws(() => buildSuggestedFollowUpRecord({ ...followUp, title: "Draft FOI language" }), /private_strategy_prohibited/)
})

test("intervention outcome cases preserve outcome gaps without treating implementation as effectiveness", () => {
  const study = buildInterventionOutcomeCaseStudy({
    case_id: "bc:fnpci:v9",
    jurisdiction: "British Columbia",
    intervention: "First Nations-led Primary Health Care Initiative",
    community_governance_required: true,
    links: [
      { stage: "baseline_disparity", state: "supported", statement: "A pre-intervention First Nations attachment disparity was published.", population: "Source-defined First Nations and Other Residents", period: "2017/18", denominator: "Population rate", source_url: "https://www.fnha.ca/baseline" },
      { stage: "implementation", state: "supported", statement: "Sites, visits, staffing and net-new attachments are reported.", period: "2025", source_url: "https://www2.gov.bc.ca/action" },
      { stage: "attachment_or_continuity_outcome", state: "not_yet_measurable", statement: "No catchment-defined pre/post attachment or continuity series was located." },
      { stage: "downstream_utilization_or_outcome", state: "missing", statement: "No centre-linked ED or ACSC series was located." },
    ],
  })
  assert.equal(study.outcome_measured, false)
  assert.equal(study.outcome_not_yet_measurable, true)
  assert.equal(study.implementation_is_effectiveness_evidence, false)
  assert.equal(study.causal_conclusion_supported, false)
})

test("public Access & Equity projection includes only dual-gated public-safe records", () => {
  const candidate = record({
    structural_record_id: "bc:attachment",
    owner_review_state: "pending",
    publication_state: "owner_review",
    public_projection_requested: true,
  })
  const card = {
    public_id: "bc:attachment",
    role: "measured_disparity",
    title: "Primary-care attachment gap",
    public_summary: "The available data show a difference in the reported population and period.",
    what_was_measured: "Population attachment rate.",
    compared_with: "A source-defined comparison population in the same period.",
    what_it_does_not_establish: "It does not establish a single cause.",
  }
  const withheld = buildAccessEquityPublicProjection({ findings: [{ record: candidate, public_card: card }] })
  assert.equal(withheld.findings.length, 0)
  const released = buildAccessEquityPublicProjection({ findings: [{ record: { ...candidate, owner_review_state: "approved", publication_state: "approved_public" }, public_card: card }] })
  assert.equal(released.findings.length, 1)
  assert.equal(released.search_enabled, true)
  assert.equal(released.private_candidates_included, false)
})
