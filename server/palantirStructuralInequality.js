const EVIDENCE_STRENGTHS = new Set(["A", "B", "C", "D", "E", "F"])
const RECORD_TYPES = new Set(["structural_indicator", "data_gap", "reporting_gap", "measurement_gap"])
const REVIEW_STATES = new Set(["pending", "approved", "rejected", "needs_more_research", "deferred", "false_positive"])
const DISCRIMINATION_STATES = new Set(["not_assessed", "not_established", "documented_by_source"])
const MECHANISM_STATES = new Set(["none_identified", "plausible_not_established", "documented", "formal_acknowledgement", "intervention", "measured_outcome"])
const COMPARATOR_QUALITY_STATES = new Set(["meaningful", "provisional", "misleading", "absent"])
const SOURCE_QUALITY_STATES = new Set(["primary_official", "indigenous_governed", "independent_officer", "official_derived", "peer_reviewed_context", "secondary_context"])
const PUBLICATION_STATES = new Set(["private_research", "owner_review", "approved_public", "rejected_public", "needs_more_research"])
const GAP_TYPES = new Set(["data_gap", "measurement_gap", "reporting_gap"])
const TREND_STATES = new Set(["improving", "worsening", "stable", "discontinuity", "methodology_changed", "data_discontinued", "insufficient_series"])
const COMPARABILITY_STATES = new Set(["high", "moderate", "poor", "not_comparable"])
const CLAIM_RELATIONSHIPS = new Set(["supports", "corroborates", "contradicts", "narrows", "supersedes"])
const DATA_AVAILABILITY_STATES = new Set(["collected_public", "collected_insufficiently_disaggregated", "likely_collected_not_public", "not_located", "apparently_not_collected", "methodology_unclear"])
const METHODOLOGY_QUALITY_STATES = new Set(["high", "moderate", "weak", "unusable", "unknown"])
const STRUCTURAL_CHAIN_STAGES = new Set(["remoteness", "service_availability_or_travel", "primary_care_continuity", "acsc_or_preventable_hospitalization", "outcome"])
const STRUCTURAL_LINK_STATES = new Set(["supported", "suggestive", "missing"])
const MISSING_EVIDENCE_EXISTENCE_STATES = new Set(["A_public_dataset_located", "B_public_aggregate_indicator_located", "C_collected_not_public", "D_likely_held_required_fields", "E_collection_uncertain", "F_not_available_for_question"])
const REQUEST_ROUTES = new Set(["published_data_inquiry", "open_data_request", "research_data_inquiry", "cihi_custom_data", "statistics_canada_custom_tabulation", "indigenous_health_partnership", "annual_report_clarification", "formal_foi_fallback", "formal_atip_fallback", "no_request"])
const MISSING_EVIDENCE_RESPONSE_TYPES = new Set(["clarification", "methodology_document", "aggregate_table", "denial", "partial_response", "referral", "governance_concern", "data_does_not_exist"])
const STRUCTURAL_ACCESS_DIMENSIONS = new Set(["primary_care_access", "continuity", "healthcare_workforce", "facility_service_availability", "service_stability", "emergency_access", "maternity_access", "mental_health_access", "addiction_access", "oat_access", "withdrawal_access", "treatment_access", "diagnostic_access", "transportation_medical_travel", "referral_burden", "aftercare_return_home_continuity", "funding_resources", "health_outcomes", "measurement_data_availability"])
const ACCESS_SIGNAL_TYPES = new Set(["long_travel_burden", "low_service_availability", "repeated_closures", "persistent_vacancies", "locum_dependence", "low_primary_care_attachment", "high_acsc_hospitalization", "high_ed_dependence", "poor_continuity", "high_need_low_capacity", "outcome_measurement_missing"])
const POLICY_OUTCOME_STAGES = new Set(["problem_identified", "recommendation", "funding", "program", "implementation", "measurable_indicator", "later_outcome"])
const POLICY_OUTCOME_LINK_STATES = new Set(["supported", "suggestive", "missing", "contradicted", "not_measurable"])
const MEASUREMENT_INEQUALITY_STATES = new Set(["measurable", "partially_measurable", "insufficiently_disaggregated", "collected_but_unpublished", "unknown", "apparently_not_collected"])
const TREATMENT_CASCADE_STAGES = new Set(["documented_need", "assessment", "withdrawal_or_oat", "treatment", "transportation", "housing", "aftercare", "return_home_continuity", "outcome"])
const SUGGESTED_FOLLOW_UP_STATUSES = new Set(["suggested", "watching_for_public_update", "resolved", "no_longer_priority"])

const clean = (value, limit = 600) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit)
const list = (value, limit = 240) => [...new Set((Array.isArray(value) ? value : value ? [value] : []).map(item => clean(item, limit)).filter(Boolean))]
const numberOrNull = value => Number.isFinite(Number(value)) ? Number(value) : null
const httpsUrl = value => /^https:\/\//.test(String(value || "")) ? clean(value, 700) : null

function normalizedMeasure(value = {}) {
  return Object.freeze({
    value: numberOrNull(value.value),
    display: clean(value.display, 120) || null,
    unit: clean(value.unit, 100) || null,
    denominator: clean(value.denominator, 180) || null,
  })
}

function alignedPeriod(value = {}) {
  return Object.freeze({
    observed: clean(value.observed, 120) || null,
    comparator: clean(value.comparator, 120) || null,
    aligned: value.aligned === true,
  })
}

function normalizedObservation(value = {}) {
  return Object.freeze({
    period: clean(value.period, 120) || null,
    value: numberOrNull(value.value),
    comparator_value: numberOrNull(value.comparator_value),
    unit: clean(value.unit, 100) || null,
    denominator: clean(value.denominator, 180) || null,
    comparator_denominator: clean(value.comparator_denominator, 180) || null,
    methodology: clean(value.methodology, 240) || null,
    source_locator: clean(value.source_locator, 180) || null,
  })
}

export function normalizeStructuralRate({ numerator, denominator, scale = 100, unit = "percent" } = {}) {
  const n = numberOrNull(numerator)
  const d = numberOrNull(denominator)
  const s = numberOrNull(scale)
  if (n === null || d === null || d <= 0 || s === null || s <= 0) throw new Error("palantir_structural_rate_inputs_invalid")
  return Object.freeze({ value: Number(((n / d) * s).toFixed(4)), numerator: n, denominator: d, scale: s, unit: clean(unit, 100), transparent_formula: `(numerator / denominator) * ${s}` })
}

export function classifyStructuralTimeSeries(observations = [], { lowerIsBetter = false, stableTolerance = 0.02 } = {}) {
  const series = observations.map(normalizedObservation)
  if (series.length < 2 || series.some(item => item.value === null || !item.period)) return Object.freeze({ state: "insufficient_series", observations: series, change: null, methodology_continuous: false })
  const methodologies = new Set(series.map(item => item.methodology).filter(Boolean))
  if (methodologies.size > 1) return Object.freeze({ state: "methodology_changed", observations: series, change: null, methodology_continuous: false })
  const first = series[0].value
  const last = series.at(-1).value
  const relative = first === 0 ? null : (last - first) / Math.abs(first)
  const improving = lowerIsBetter ? last < first : last > first
  const state = relative === null ? "discontinuity" : Math.abs(relative) <= stableTolerance ? "stable" : improving ? "improving" : "worsening"
  return Object.freeze({ state: TREND_STATES.has(state) ? state : "insufficient_series", observations: series, change: Number((last - first).toFixed(4)), relative_change: relative === null ? null : Number(relative.toFixed(4)), methodology_continuous: true })
}

export function assessStructuralComparator(input = {}) {
  const observedPeriod = clean(input.observed_period, 120)
  const comparatorPeriod = clean(input.comparator_period, 120)
  const checks = Object.freeze({
    same_jurisdiction: input.same_jurisdiction === true,
    aligned_time_period: Boolean(observedPeriod && comparatorPeriod && observedPeriod === comparatorPeriod),
    comparable_denominators: Boolean(clean(input.observed_denominator, 180) && clean(input.comparator_denominator, 180) && input.denominators_comparable === true),
    remoteness_addressed: input.remoteness_relevant !== true || input.remoteness_matched === true || Boolean(clean(input.remoteness_adjustment, 240)),
    population_or_need_adjusted: input.adjustment_required !== true || Boolean(clean(input.normalization_basis, 240)),
    explicit_limitations: list(input.limitations, 260).length > 0,
  })
  const misleading = input.unfair_comparator === true || !checks.same_jurisdiction || !checks.aligned_time_period || !checks.comparable_denominators || !checks.remoteness_addressed || !checks.population_or_need_adjusted
  return Object.freeze({ schema_version: "palantir-structural-comparator-assessment-v1", quality: misleading ? "misleading" : checks.explicit_limitations ? "meaningful" : "provisional", checks, limitations: list(input.limitations, 260), use_for_public_claim: !misleading && checks.explicit_limitations })
}

export function classifyStructuralMissingData(input = {}) {
  const gapType = GAP_TYPES.has(input.gap_type) ? input.gap_type : "data_gap"
  const sourceUrl = httpsUrl(input.source_url)
  if (!clean(input.indicator, 240) || !sourceUrl || !clean(input.scope, 180)) throw new Error("palantir_structural_gap_required_fields_missing")
  return Object.freeze({ schema_version: "palantir-structural-gap-v1", gap_type: gapType, indicator: clean(input.indicator, 240), scope: clean(input.scope, 180), source_url: sourceUrl, source_checked_at: isoDate(input.source_checked_at), expected_measure: clean(input.expected_measure, 300) || null, why_missing: clean(input.why_missing, 400) || "Public source did not provide a usable measure.", accountability_relevance: input.repeated_equity_commitment_unmeasurable === true, discrimination_evidence: false, owner_review_required: input.repeated_equity_commitment_unmeasurable === true })
}

export function buildStructuralDataAvailabilityMatrix(rows = [], { jurisdiction, generatedAt = new Date().toISOString() } = {}) {
  const normalizedJurisdiction = clean(jurisdiction, 120)
  if (!normalizedJurisdiction || !Array.isArray(rows) || rows.length === 0) throw new Error("palantir_structural_data_matrix_required_fields_missing")
  const indicators = rows.map(row => {
    const indicator = clean(row.indicator, 240)
    const availability = DATA_AVAILABILITY_STATES.has(row.availability) ? row.availability : null
    const sourceUrl = httpsUrl(row.source_url)
    const methodologyQuality = METHODOLOGY_QUALITY_STATES.has(row.methodology_quality) ? row.methodology_quality : "unknown"
    if (!indicator || !availability || !sourceUrl || !clean(row.next_action, 400)) throw new Error("palantir_structural_data_matrix_row_invalid")
    if (availability === "apparently_not_collected" && !clean(row.institutional_evidence, 500)) throw new Error("palantir_structural_not_collected_requires_institutional_evidence")
    const indigenousSpecific = row.indigenous_specific === true
    const comparatorAvailable = row.comparator_available === true
    const publicData = row.public === true
    return Object.freeze({
      indicator,
      availability,
      indigenous_specific: indigenousSpecific,
      comparator_available: comparatorAvailable,
      longitudinal: row.longitudinal === true,
      public: publicData,
      methodology_quality: methodologyQuality,
      source_url: sourceUrl,
      source_locator: clean(row.source_locator, 220) || null,
      institutional_evidence: clean(row.institutional_evidence, 500) || null,
      limitations: list(row.limitations, 320),
      next_action: clean(row.next_action, 400),
      equity_question_answerable: publicData && indigenousSpecific && comparatorAvailable && ["high", "moderate"].includes(methodologyQuality),
      absence_proves_discrimination: false,
    })
  })
  if (new Set(indicators.map(row => row.indicator)).size !== indicators.length) throw new Error("palantir_structural_data_matrix_duplicate_indicator")
  return Object.freeze({
    schema_version: "palantir-structural-data-availability-matrix-v1",
    jurisdiction: normalizedJurisdiction,
    generated_at: new Date(generatedAt).toISOString(),
    indicators: Object.freeze(indicators),
    counts: Object.freeze({
      total: indicators.length,
      collected_public: indicators.filter(row => row.availability === "collected_public").length,
      insufficiently_disaggregated: indicators.filter(row => row.availability === "collected_insufficiently_disaggregated").length,
      likely_collected_not_public: indicators.filter(row => row.availability === "likely_collected_not_public").length,
      not_located: indicators.filter(row => row.availability === "not_located").length,
      apparently_not_collected: indicators.filter(row => row.availability === "apparently_not_collected").length,
      methodology_unclear: indicators.filter(row => row.availability === "methodology_unclear").length,
      equity_question_answerable: indicators.filter(row => row.equity_question_answerable).length,
    }),
    absence_is_discrimination_evidence: false,
    publication_authority: false,
  })
}

export function buildStructuralAccessChain(input = {}) {
  const chainId = clean(input.chain_id, 180)
  const jurisdiction = clean(input.jurisdiction, 120)
  if (!chainId || !jurisdiction) throw new Error("palantir_structural_access_chain_required_fields_missing")
  const links = (Array.isArray(input.links) ? input.links : []).map(link => {
    const stage = STRUCTURAL_CHAIN_STAGES.has(link.stage) ? link.stage : null
    const supportState = STRUCTURAL_LINK_STATES.has(link.support_state) ? link.support_state : null
    const sourceUrl = httpsUrl(link.source_url)
    if (!stage || !supportState || !clean(link.statement, 500)) throw new Error("palantir_structural_access_chain_link_invalid")
    if (supportState === "supported" && !sourceUrl) throw new Error("palantir_structural_supported_link_requires_source")
    return Object.freeze({
      stage,
      support_state: supportState,
      statement: clean(link.statement, 500),
      indigenous_specific: link.indigenous_specific === true,
      comparator: clean(link.comparator, 260) || null,
      denominator: clean(link.denominator, 260) || null,
      period: clean(link.period, 120) || null,
      source_url: sourceUrl,
      source_locator: clean(link.source_locator, 220) || null,
      limitations: list(link.limitations, 320),
    })
  })
  if (new Set(links.map(link => link.stage)).size !== links.length) throw new Error("palantir_structural_access_chain_duplicate_stage")
  const byStage = new Map(links.map(link => [link.stage, link]))
  const ordered = [...STRUCTURAL_CHAIN_STAGES].map(stage => byStage.get(stage) || Object.freeze({ stage, support_state: "missing", statement: "No usable public link located.", indigenous_specific: false, comparator: null, denominator: null, period: null, source_url: null, source_locator: null, limitations: [] }))
  const supported = ordered.filter(link => link.support_state === "supported")
  const missing = ordered.filter(link => link.support_state === "missing")
  const state = missing.length === 0 && supported.length === ordered.length ? "complete_supported" : supported.length > 0 ? "partial" : "insufficient"
  return Object.freeze({
    schema_version: "palantir-structural-access-chain-v1",
    chain_id: chainId,
    jurisdiction,
    links: Object.freeze(ordered),
    chain_state: state,
    supported_links: supported.length,
    suggestive_links: ordered.filter(link => link.support_state === "suggestive").length,
    missing_links: missing.length,
    indigenous_specific_chain: supported.length === ordered.length && supported.every(link => link.indigenous_specific),
    causal_conclusion_supported: false,
    disparity_is_discrimination: false,
    owner_review_required: true,
  })
}

export function assessStructuralTravelBurden(input = {}) {
  const sourceUrl = httpsUrl(input.source_url)
  if (!clean(input.jurisdiction, 120) || !sourceUrl) throw new Error("palantir_structural_travel_burden_required_fields_missing")
  const metrics = Object.freeze({
    trips: numberOrNull(input.trips),
    kilometres: numberOrNull(input.kilometres),
    travel_time: clean(input.travel_time, 160) || null,
    overnight_stays: numberOrNull(input.overnight_stays),
    escorts: numberOrNull(input.escorts),
    cancellations: numberOrNull(input.cancellations),
    missed_care: numberOrNull(input.missed_care),
    delays: clean(input.delays, 200) || null,
    expenditure: numberOrNull(input.expenditure),
  })
  const observedOperationalMetrics = Object.entries(metrics).filter(([, value]) => value !== null).map(([key]) => key)
  const normalized = Boolean(clean(input.population_denominator, 220))
  const comparatorAvailable = Boolean(clean(input.comparator, 260))
  const indigenousSpecific = input.indigenous_specific === true
  return Object.freeze({
    schema_version: "palantir-structural-travel-burden-assessment-v1",
    jurisdiction: clean(input.jurisdiction, 120),
    period: clean(input.period, 120) || null,
    indigenous_specific: indigenousSpecific,
    population_denominator: clean(input.population_denominator, 220) || null,
    comparator: clean(input.comparator, 260) || null,
    metrics,
    observed_operational_metrics: Object.freeze(observedOperationalMetrics),
    source_url: sourceUrl,
    source_locator: clean(input.source_locator, 220) || null,
    limitations: list(input.limitations, 320),
    usable_as_burden_description: observedOperationalMetrics.length > 0,
    usable_as_disparity_measure: observedOperationalMetrics.length > 0 && indigenousSpecific && normalized && comparatorAvailable,
    missing_denominator: !normalized,
    missing_comparator: !comparatorAvailable,
    absence_proves_discrimination: false,
  })
}

// This is a private, owner-review primitive. It inventories whether decisive
// evidence appears to exist and can prepare a bounded aggregate request, but
// deliberately has no dispatch, correspondence, or publication capability.
export function buildMissingEvidenceAcquisition(input = {}) {
  const acquisitionId = clean(input.acquisition_id, 180)
  const jurisdiction = clean(input.jurisdiction, 120)
  const indicator = clean(input.indicator, 240)
  const existenceState = MISSING_EVIDENCE_EXISTENCE_STATES.has(input.existence_state) ? input.existence_state : null
  const holder = input.likely_holder || {}
  const holderName = clean(holder.name, 180)
  const evidence = (Array.isArray(input.evidence_of_existence) ? input.evidence_of_existence : []).map(item => {
    const sourceUrl = httpsUrl(item.source_url)
    const claim = clean(item.claim, 500)
    if (!sourceUrl || !claim) throw new Error("palantir_missing_evidence_existence_evidence_invalid")
    return Object.freeze({ source_url: sourceUrl, locator: clean(item.locator, 220) || null, claim, source_type: clean(item.source_type, 100) || "source" })
  })
  if (!acquisitionId || !jurisdiction || !indicator || !existenceState || !holderName) throw new Error("palantir_missing_evidence_required_fields_missing")
  if (["C_collected_not_public", "D_likely_held_required_fields"].includes(existenceState) && evidence.length === 0) throw new Error("palantir_missing_evidence_held_classification_requires_evidence")
  const request = input.request_draft || null
  let requestDraft = null
  if (request) {
    const route = REQUEST_ROUTES.has(request.preferred_route) ? request.preferred_route : null
    const period = clean(request.period, 140)
    const denominator = clean(request.denominator, 360)
    const identityMethod = clean(request.indigenous_identification_method, 360)
    const suppression = clean(request.suppression_privacy, 360)
    const aggregateOnly = request.aggregate_only === true
    const asksIndividualRecords = request.asks_individual_records === true
    if (!route || !period || !denominator || !identityMethod || !suppression || !aggregateOnly || asksIndividualRecords) throw new Error("palantir_missing_evidence_request_not_privacy_safe")
    requestDraft = Object.freeze({
      recipient: clean(request.recipient, 180) || holderName,
      preferred_route: route,
      formal_fallback: REQUEST_ROUTES.has(request.formal_fallback) ? request.formal_fallback : null,
      period,
      requested_aggregate: clean(request.requested_aggregate, 1200),
      numerator: clean(request.numerator, 360) || null,
      denominator,
      indigenous_identification_method: identityMethod,
      geography: clean(request.geography, 360) || null,
      suppression_privacy: suppression,
      aggregate_only: true,
      asks_individual_records: false,
      owner_review_state: "pending",
      submission_state: "not_submitted",
      response_state: "none",
    })
  }
  return Object.freeze({
    schema_version: "palantir-missing-evidence-acquisition-v1",
    acquisition_id: acquisitionId,
    jurisdiction,
    indicator,
    research_question: clean(input.research_question, 600) || null,
    existence_state: existenceState,
    likely_holder: Object.freeze({
      name: holderName,
      underlying_system: clean(holder.underlying_system, 240) || "unknown",
      geographic_resolution: clean(holder.geographic_resolution, 180) || "unknown",
      indigenous_identification_method: clean(holder.indigenous_identification_method, 360) || "unknown",
      years_available: clean(holder.years_available, 180) || "unknown",
      linked_data_required: holder.linked_data_required === true,
      public: holder.public === true,
      aggregate_extraction_feasible: holder.aggregate_extraction_feasible === true ? "likely" : holder.aggregate_extraction_feasible === false ? "uncertain_or_unlikely" : "unknown",
      governance_privacy: list(holder.governance_privacy, 360),
    }),
    evidence_of_existence: Object.freeze(evidence),
    searches_completed: list(input.searches_completed, 420),
    failed_searches_to_preserve: list(input.failed_searches_to_preserve, 420),
    access_equity_impact: clean(input.access_equity_impact, 600) || null,
    request_draft: requestDraft,
    owner_review_state: "pending",
    submission_state: "not_submitted",
    response_state: "none",
    identity_inference_used: false,
    automatic_request_submission: false,
    mutation_authority: false,
    publication_authority: false,
  })
}

// A holder response is evidence, not automatic authority to analyse or publish.
// This intentionally accepts only a bounded summary and metadata: record-level
// material belongs in the holder's governed environment, never in Palantír.
export function ingestMissingEvidenceAcquisitionResponse(acquisition = {}, input = {}) {
  if (!clean(acquisition.acquisition_id, 180) || acquisition.schema_version !== "palantir-missing-evidence-acquisition-v1") throw new Error("palantir_missing_evidence_response_acquisition_invalid")
  const responseType = MISSING_EVIDENCE_RESPONSE_TYPES.has(input.response_type) ? input.response_type : null
  const holder = clean(input.responding_holder, 180)
  const receivedAt = isoDate(input.received_at)
  const summary = clean(input.summary, 1200)
  const sourceLocator = clean(input.source_locator, 700) || null
  if (!responseType || !holder || !receivedAt || !summary) throw new Error("palantir_missing_evidence_response_required_fields_missing")
  if (input.contains_individual_records === true || input.contains_identifiers === true || input.contains_small_cell_data === true) throw new Error("palantir_missing_evidence_response_record_level_material_prohibited")
  const nextAction = responseType === "referral"
    ? "Owner review of the referred holder and governance route."
    : responseType === "governance_concern"
      ? "Pause analysis; seek appropriate First Nations, Métis, or Inuit governance guidance."
      : responseType === "data_does_not_exist"
        ? "Owner review before recording a scope-specific non-existence finding."
        : responseType === "denial"
          ? "Preserve the reason and consider only a narrower cooperative route if appropriate."
          : "Owner review, methodology assessment, and governed decision on any next step."
  return Object.freeze({
    ...acquisition,
    response_state: "received",
    response: Object.freeze({
      response_type: responseType,
      responding_holder: holder,
      received_at: receivedAt,
      summary,
      source_locator: sourceLocator,
      record_level_material_accepted: false,
      publication_authority: false,
      classification_update_candidate: responseType === "data_does_not_exist" ? "F_not_available_for_question" : null,
      next_action: nextAction,
    }),
    owner_review_state: "pending",
    publication_authority: false,
  })
}

function isoDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
}

export function assessMatchedCommunityPair(input = {}) {
  const left = input.left || {}
  const right = input.right || {}
  const checks = Object.freeze({
    same_province: Boolean(clean(left.province, 80) && clean(left.province, 80) === clean(right.province, 80)),
    population_similar: Number(left.population) > 0 && Number(right.population) > 0 && Math.max(Number(left.population), Number(right.population)) / Math.min(Number(left.population), Number(right.population)) <= 2,
    remoteness_similar: Boolean(clean(left.remoteness, 80) && clean(left.remoteness, 80) === clean(right.remoteness, 80)),
    road_access_similar: Boolean(clean(left.road_access, 80) && clean(left.road_access, 80) === clean(right.road_access, 80)),
    regional_context_similar: Boolean(clean(left.regional_context, 160) && clean(left.regional_context, 160) === clean(right.regional_context, 160)),
    official_sources: Boolean(httpsUrl(left.source_url) && httpsUrl(right.source_url)),
  })
  const matchedCount = Object.values(checks).filter(Boolean).length
  const limitations = list(input.limitations, 320)
  return Object.freeze({ schema_version: "palantir-matched-community-pair-v1", pair_id: clean(input.pair_id, 180), left: { ...left, name: clean(left.name, 160), source_url: httpsUrl(left.source_url) }, right: { ...right, name: clean(right.name, 160), source_url: httpsUrl(right.source_url) }, checks, matched_criteria: matchedCount, descriptive_access_comparison_usable: matchedCount >= 5 && limitations.length > 0, indigenous_inequality_inference_usable: false, limitations, owner_review_required: true })
}

export function assessRemotenessAccessComparison(input = {}) {
  const left = input.left || {}
  const right = input.right || {}
  const leftRemoteness = numberOrNull(left.remoteness_index)
  const rightRemoteness = numberOrNull(right.remoteness_index)
  const leftPopulation = numberOrNull(left.population)
  const rightPopulation = numberOrNull(right.population)
  const tolerance = Math.max(0, numberOrNull(input.remoteness_tolerance) ?? 0.1)
  const maximumPopulationRatio = Math.max(1, numberOrNull(input.maximum_population_ratio) ?? 2)
  const populationRatio = leftPopulation > 0 && rightPopulation > 0
    ? Math.max(leftPopulation, rightPopulation) / Math.min(leftPopulation, rightPopulation)
    : null
  const checks = Object.freeze({
    same_province: Boolean(clean(left.province, 80) && clean(left.province, 80) === clean(right.province, 80)),
    official_remoteness_source: Boolean(httpsUrl(left.remoteness_source_url) && httpsUrl(right.remoteness_source_url)),
    remoteness_index_available: leftRemoteness !== null && rightRemoteness !== null && leftRemoteness >= 0 && leftRemoteness <= 1 && rightRemoteness >= 0 && rightRemoteness <= 1,
    remoteness_within_tolerance: leftRemoteness !== null && rightRemoteness !== null && Math.abs(leftRemoteness - rightRemoteness) <= tolerance,
    population_within_ratio: populationRatio !== null && populationRatio <= maximumPopulationRatio,
    road_access_similar: Boolean(clean(left.road_access, 100) && clean(left.road_access, 100) === clean(right.road_access, 100)),
    referral_role_similar: Boolean(clean(left.referral_role, 160) && clean(left.referral_role, 160) === clean(right.referral_role, 160)),
    service_measurement_aligned: input.service_measurement_aligned === true,
  })
  const limitations = list(input.limitations, 320)
  const accepted = Object.values(checks).every(Boolean) && limitations.length > 0
  return Object.freeze({
    schema_version: "palantir-remoteness-access-comparison-v1",
    comparison_id: clean(input.comparison_id, 180),
    left: Object.freeze({ name: clean(left.name, 160), province: clean(left.province, 80), population: leftPopulation, remoteness_index: leftRemoteness, road_access: clean(left.road_access, 100) || null, referral_role: clean(left.referral_role, 160) || null, remoteness_source_url: httpsUrl(left.remoteness_source_url) }),
    right: Object.freeze({ name: clean(right.name, 160), province: clean(right.province, 80), population: rightPopulation, remoteness_index: rightRemoteness, road_access: clean(right.road_access, 100) || null, referral_role: clean(right.referral_role, 160) || null, remoteness_source_url: httpsUrl(right.remoteness_source_url) }),
    checks,
    remoteness_difference: leftRemoteness === null || rightRemoteness === null ? null : Number(Math.abs(leftRemoteness - rightRemoteness).toFixed(4)),
    population_ratio: populationRatio === null ? null : Number(populationRatio.toFixed(4)),
    descriptive_access_comparison_usable: accepted,
    indigenous_identity_inferred_from_remoteness: false,
    indigenous_inequality_inference_usable: false,
    limitations,
    owner_review_required: true,
  })
}

export function assessCrossProvinceStructuralComparability(input = {}) {
  const observations = (Array.isArray(input.observations) ? input.observations : []).map(item => Object.freeze({
    jurisdiction: clean(item.jurisdiction, 100),
    indicator: clean(item.indicator || input.indicator, 240),
    value: numberOrNull(item.value),
    unit: clean(item.unit, 100) || null,
    denominator_class: clean(item.denominator_class || item.denominator, 180) || null,
    period: clean(item.period, 120) || null,
    methodology: clean(item.methodology, 240) || null,
    indigenous_identification_method: clean(item.indigenous_identification_method, 240) || null,
    source_url: httpsUrl(item.source_url),
  }))
  const unique = key => new Set(observations.map(item => item[key]).filter(Boolean)).size
  const completeAndUnique = key => observations.length >= 2 && observations.every(item => Boolean(item[key])) && unique(key) === 1
  const checks = Object.freeze({
    at_least_two_jurisdictions: new Set(observations.map(item => item.jurisdiction).filter(Boolean)).size >= 2,
    same_indicator_definition: completeAndUnique("indicator"),
    numeric_values_present: observations.length >= 2 && observations.every(item => item.value !== null),
    official_sources_present: observations.length >= 2 && observations.every(item => item.source_url),
    units_aligned: completeAndUnique("unit"),
    denominators_aligned: completeAndUnique("denominator_class") || input.denominators_comparable === true,
    periods_aligned: completeAndUnique("period") || input.periods_comparable === true,
    methodologies_aligned: completeAndUnique("methodology") || input.methodologies_comparable === true,
    indigenous_identification_aligned: completeAndUnique("indigenous_identification_method") || input.identification_methods_comparable === true,
    explicit_limitations: list(input.limitations, 320).length > 0,
  })
  const core = checks.at_least_two_jurisdictions && checks.same_indicator_definition && checks.numeric_values_present && checks.official_sources_present && checks.units_aligned
  const alignment = [checks.denominators_aligned, checks.periods_aligned, checks.methodologies_aligned, checks.indigenous_identification_aligned]
  const alignedCount = alignment.filter(Boolean).length
  const state = !core
    ? "not_comparable"
    : alignedCount === alignment.length && checks.explicit_limitations
      ? "high"
      : alignedCount >= 3 && checks.explicit_limitations
        ? "moderate"
        : "poor"
  return Object.freeze({
    schema_version: "palantir-cross-province-comparability-v1",
    indicator: clean(input.indicator || observations[0]?.indicator, 240),
    observations,
    checks,
    comparability: COMPARABILITY_STATES.has(state) ? state : "not_comparable",
    use_for_direct_cross_province_comparison: state === "high",
    use_for_contextual_comparison: state === "high" || state === "moderate",
    limitations: list(input.limitations, 320),
    forced_ranking_prohibited: true,
  })
}

export function assessStructuralClaimRelationship(input = {}) {
  const proposed = CLAIM_RELATIONSHIPS.has(input.proposed_relationship) ? input.proposed_relationship : null
  const left = input.left || {}
  const right = input.right || {}
  const same = field => Boolean(clean(left[field], 240) && clean(left[field], 240) === clean(right[field], 240))
  const checks = Object.freeze({
    recognized_relationship: Boolean(proposed),
    official_sources: Boolean(httpsUrl(left.source_url) && httpsUrl(right.source_url)),
    same_subject: same("subject"),
    same_scope: same("scope"),
    same_period: same("period"),
    same_denominator: same("denominator"),
    same_methodology: same("methodology"),
    material_semantic_conflict: input.material_semantic_conflict === true,
    same_series: input.same_series === true,
  })
  const leftDate = Date.parse(left.publication_date || "")
  const rightDate = Date.parse(right.publication_date || "")
  const laterOfficialRevision = Number.isFinite(leftDate) && Number.isFinite(rightDate) && rightDate > leftDate && checks.same_series && checks.official_sources
  const contradictionSupported = proposed === "contradicts" && checks.same_subject && checks.same_scope && checks.same_period && checks.same_denominator && checks.same_methodology && checks.material_semantic_conflict
  const supersessionSupported = proposed === "supersedes" && checks.same_subject && checks.same_scope && laterOfficialRevision
  const ordinaryRelationshipSupported = ["supports", "corroborates", "narrows"].includes(proposed) && checks.same_subject && checks.official_sources
  const accepted = contradictionSupported || supersessionSupported || ordinaryRelationshipSupported
  return Object.freeze({
    schema_version: "palantir-structural-claim-relationship-v1",
    proposed_relationship: proposed,
    relationship_state: accepted ? "accepted" : proposed ? "owner_review" : "rejected",
    confirmed_relationship: accepted ? proposed : null,
    checks,
    later_official_revision: laterOfficialRevision,
    contradiction_inferred_from_wording_only: false,
    reasons: Object.entries(checks).filter(([, passed]) => !passed).map(([key]) => key),
    owner_review_required: !accepted && Boolean(proposed),
  })
}

export function buildStructuralMechanismChain(input = {}) {
  const mechanisms = (Array.isArray(input.mechanisms) ? input.mechanisms : []).map(item => Object.freeze({
    mechanism: clean(item.mechanism, 300),
    source_url: httpsUrl(item.source_url),
    evidence_role: clean(item.evidence_role, 120) || "context",
    documented_by_source: item.documented_by_source === true,
    formal_causal_finding: item.formal_causal_finding === true,
    limitations: list(item.limitations, 260),
  })).filter(item => item.mechanism)
  const documented = mechanisms.filter(item => item.documented_by_source && item.source_url)
  return Object.freeze({
    schema_version: "palantir-structural-mechanism-chain-v1",
    chain_id: clean(input.chain_id, 180),
    outcome_claim_id: clean(input.outcome_claim_id, 180),
    mechanisms,
    documented_mechanism_count: documented.length,
    multiple_contributing_mechanisms_preserved: documented.length > 1,
    single_cause_asserted: false,
    causal_conclusion_supported: documented.length > 0 && documented.every(item => item.formal_causal_finding),
    caveat: clean(input.caveat, 500) || "The documented mechanisms may contribute to the observed outcome; this chain does not assign a single cause.",
    owner_review_required: true,
  })
}

export function buildStructuralSourceYield(input = {}) {
  const checked = Math.max(0, Number(input.documents_checked || 0))
  const usable = Math.max(0, Number(input.usable_structural_findings || 0))
  const quality = ["high", "medium", "low"].includes(input.comparator_quality) ? input.comparator_quality : "low"
  const cadence = clean(input.update_cadence, 120) || "unknown"
  const recommendation = usable >= 3 && quality === "high" && cadence !== "unknown" ? "recurring_adapter" : usable >= 1 ? "periodic_or_citation_led_review" : "owner_triggered_or_low_yield"
  return Object.freeze({ schema_version: "palantir-structural-source-yield-v1", source_id: clean(input.source_id, 180), documents_checked: checked, usable_structural_findings: usable, indigenous_specific_resolution: clean(input.indigenous_specific_resolution, 160) || "unknown", geographic_resolution: clean(input.geographic_resolution, 160) || "unknown", historical_depth: clean(input.historical_depth, 160) || "unknown", update_cadence: cadence, data_cleanliness: clean(input.data_cleanliness, 120) || "unknown", parse_difficulty: clean(input.parse_difficulty, 120) || "unknown", comparator_quality: quality, cross_domain_discoveries: Math.max(0, Number(input.cross_domain_discoveries || 0)), yield_rate: checked ? Number((usable / checked).toFixed(4)) : 0, recommendation })
}

export function normalizeStructuralInequalityRecord(input = {}) {
  const recordType = RECORD_TYPES.has(input.record_type) ? input.record_type : "structural_indicator"
  const evidenceStrength = clean(input.evidence_strength, 1).toUpperCase()
  const sourceUrl = httpsUrl(input.source?.url || input.source_url)
  const observed = normalizedMeasure(input.observed)
  const comparator = normalizedMeasure(input.comparator)
  const timePeriod = alignedPeriod(input.time_period)
  const reviewState = REVIEW_STATES.has(input.owner_review_state) ? input.owner_review_state : "pending"
  const discriminationStatus = DISCRIMINATION_STATES.has(input.discrimination_status) ? input.discrimination_status : "not_established"
  const mechanismStatus = MECHANISM_STATES.has(input.mechanism_status) ? input.mechanism_status : "none_identified"
  const comparatorQuality = COMPARATOR_QUALITY_STATES.has(input.comparator_quality)
    ? input.comparator_quality
    : comparator.value !== null && comparator.denominator && clean(input.comparator_type, 120) ? "meaningful" : "absent"
  if (!clean(input.structural_record_id, 180) || !clean(input.jurisdiction, 100) || !clean(input.indicator, 240) || !sourceUrl || !EVIDENCE_STRENGTHS.has(evidenceStrength)) {
    throw new Error("palantir_structural_record_required_fields_missing")
  }
  if (recordType === "structural_indicator" && (observed.value === null || !observed.denominator)) throw new Error("palantir_structural_observation_requires_denominator")
  if (discriminationStatus === "documented_by_source" && !clean(input.discrimination_source_language, 400)) throw new Error("palantir_structural_documented_discrimination_requires_source_language")
  if (input.identity_inference_used === true) throw new Error("palantir_structural_identity_inference_prohibited")
  return Object.freeze({
    schema_version: "palantir-structural-inequality-record-v1",
    structural_record_id: clean(input.structural_record_id, 180),
    record_type: recordType,
    jurisdiction: clean(input.jurisdiction, 100),
    province: clean(input.province || input.jurisdiction, 100),
    geography: clean(input.geography, 180) || null,
    indigenous_population_context: clean(input.indigenous_population_context, 400) || null,
    indigenous_context_explicit: input.indigenous_context_explicit === true,
    domain: clean(input.domain, 120),
    indicator: clean(input.indicator, 240),
    observed,
    comparator,
    comparator_type: clean(input.comparator_type, 120) || null,
    comparator_quality: comparatorQuality,
    time_period: timePeriod,
    disparity_magnitude: clean(input.disparity_magnitude, 180) || null,
    normalization_basis: clean(input.normalization_basis, 200) || null,
    possible_confounders: list(input.possible_confounders, 260),
    mechanism_status: mechanismStatus,
    documented_mechanism: clean(input.documented_mechanism, 600) || null,
    institutional_acknowledgement: clean(input.institutional_acknowledgement, 500) || null,
    recommendation_ids: list(input.recommendation_ids, 180),
    response_summary: clean(input.response_summary, 500) || null,
    implementation_claim: clean(input.implementation_claim, 500) || null,
    independent_implementation_evidence: clean(input.independent_implementation_evidence, 500) || null,
    measured_outcome: clean(input.measured_outcome, 500) || null,
    time_series: Object.freeze((Array.isArray(input.time_series) ? input.time_series : []).map(normalizedObservation)),
    trend_state: TREND_STATES.has(input.trend_state) ? input.trend_state : null,
    evidence_strength: evidenceStrength,
    discrimination_status: discriminationStatus,
    discrimination_source_language: clean(input.discrimination_source_language, 400) || null,
    caveat: clean(input.caveat, 600) || "An observed disparity does not by itself establish discrimination or causation.",
    small_cell_or_suppression_risk: input.small_cell_or_suppression_risk === true,
    source: Object.freeze({
      title: clean(input.source?.title || input.source_title, 260),
      issuing_organization: clean(input.source?.issuing_organization || input.issuing_organization, 220),
      url: sourceUrl,
      publication_date: clean(input.source?.publication_date || input.publication_date, 40) || null,
      locator: clean(input.source?.locator || input.source_locator, 180) || null,
      stable: input.source?.stable !== false,
      quality: SOURCE_QUALITY_STATES.has(input.source?.quality || input.source_quality) ? input.source?.quality || input.source_quality : "official_derived",
    }),
    exact_claim: clean(input.exact_claim, 500) || null,
    methodology: clean(input.methodology, 500) || null,
    indigenous_identification_method: clean(input.indigenous_identification_method, 500) || null,
    suppression_rules: clean(input.suppression_rules, 400) || null,
    claim_relationships: Object.freeze((Array.isArray(input.claim_relationships) ? input.claim_relationships : []).map(relationship => Object.freeze({
      claim_id: clean(relationship.claim_id, 180),
      relationship: CLAIM_RELATIONSHIPS.has(relationship.relationship) ? relationship.relationship : null,
      rationale: clean(relationship.rationale, 300) || null,
    })).filter(relationship => relationship.claim_id && relationship.relationship)),
    accountability_links: list(input.accountability_links, 180),
    practical_resource_links: list(input.practical_resource_links, 180),
    owner_review_state: reviewState,
    publication_state: PUBLICATION_STATES.has(input.publication_state) ? input.publication_state : "private_research",
    last_verified: isoDate(input.last_verified),
    next_recheck: isoDate(input.next_recheck),
    public_projection_requested: input.public_projection_requested === true,
    identity_inference_used: false,
    automatic_discrimination_inference: false,
    mutation_authority: false,
    publication_authority: false,
  })
}

export function assessStructuralPublicGate(input = {}) {
  const record = input.schema_version === "palantir-structural-inequality-record-v1" ? input : normalizeStructuralInequalityRecord(input)
  const isGap = record.record_type !== "structural_indicator"
  const fundingNeedsNormalization = /fund|spend|budget|allocation/i.test(record.domain + " " + record.indicator)
  const checks = Object.freeze({
    authoritative_stable_source: Boolean(record.source.title && record.source.issuing_organization && record.source.url && record.source.stable),
    explicit_indigenous_context: record.indigenous_context_explicit,
    meaningful_comparator: isGap || Boolean(record.comparator_quality === "meaningful" && record.comparator.value !== null && record.comparator.denominator && record.comparator_type),
    aligned_time_period: isGap || record.time_period.aligned,
    clear_denominator: isGap || Boolean(record.observed.denominator && record.comparator.denominator),
    normalized_funding_comparison: !fundingNeedsNormalization || Boolean(record.normalization_basis),
    privacy_safe_cell_size: !record.small_cell_or_suppression_risk,
    careful_caveat: Boolean(record.caveat),
    evidence_strength_c_to_f: ["C", "D", "E", "F"].includes(record.evidence_strength),
    owner_approved: record.owner_review_state === "approved",
    approved_public_state: record.publication_state === "approved_public",
  })
  const structuralEligibilityKeys = Object.keys(checks).filter(key => !["owner_approved", "approved_public_state"].includes(key))
  const structurallyEligible = structuralEligibilityKeys.every(key => checks[key])
  return Object.freeze({
    schema_version: "palantir-structural-public-gate-v1",
    structural_record_id: record.structural_record_id,
    checks,
    structurally_eligible: structurallyEligible,
    publishable: structurallyEligible && checks.owner_approved && checks.approved_public_state && record.public_projection_requested,
    reasons: Object.entries(checks).filter(([, passed]) => !passed).map(([key]) => key),
    owner_review_required: structurallyEligible && !checks.owner_approved,
    publication_authority: false,
  })
}

export function buildStructuralInequalityLedger(records = [], { ledgerId = "palantir:structural-inequality", generatedAt = new Date().toISOString() } = {}) {
  const normalized = records.map(normalizeStructuralInequalityRecord)
  if (new Set(normalized.map(record => record.structural_record_id)).size !== normalized.length) throw new Error("palantir_structural_duplicate_record")
  const gates = normalized.map(assessStructuralPublicGate)
  return Object.freeze({
    schema_version: "palantir-structural-inequality-ledger-v1",
    ledger_id: clean(ledgerId, 180),
    generated_at: new Date(generatedAt).toISOString(),
    records: normalized,
    public_gates: gates,
    counts: Object.freeze({
      total: normalized.length,
      structural_indicators: normalized.filter(record => record.record_type === "structural_indicator").length,
      data_gaps: normalized.filter(record => record.record_type !== "structural_indicator").length,
      structurally_eligible: gates.filter(gate => gate.structurally_eligible).length,
      publishable: gates.filter(gate => gate.publishable).length,
      owner_review: gates.filter(gate => gate.owner_review_required).length,
      small_cell_rejected: gates.filter(gate => !gate.checks.privacy_safe_cell_size).length,
    }),
    disparity_is_discrimination: false,
    private_by_default: true,
    mutation_authority: false,
    publication_authority: false,
  })
}

export function assessAccessEquityPage(ledger, { minimumFindings = 8, minimumJurisdictions = 3 } = {}) {
  if (ledger?.schema_version !== "palantir-structural-inequality-ledger-v1") throw new Error("palantir_structural_ledger_invalid")
  const publishableIds = new Set(ledger.public_gates.filter(gate => gate.publishable).map(gate => gate.structural_record_id))
  const records = ledger.records.filter(record => publishableIds.has(record.structural_record_id))
  const jurisdictions = new Set(records.map(record => record.jurisdiction))
  const justified = records.length >= minimumFindings && jurisdictions.size >= minimumJurisdictions
  return Object.freeze({
    schema_version: "palantir-access-equity-page-assessment-v1",
    permanent_public_page_justified: justified,
    publishable_findings: records.length,
    represented_jurisdictions: [...jurisdictions].sort(),
    minimum_findings: minimumFindings,
    minimum_jurisdictions: minimumJurisdictions,
    decision: justified ? "owner_may_review_public_safe_projection" : "keep_private_hidden",
    thin_page_prohibited: true,
    automatic_publication: false,
  })
}

// Structural access is deliberately a profile, not a score. Each dimension is
// source-backed where possible and unknowns remain explicit research work.
export function buildStructuralAccessProfile(input = {}) {
  const profileId = clean(input.profile_id, 180)
  const jurisdiction = clean(input.jurisdiction, 120)
  if (!profileId || !jurisdiction) throw new Error("palantir_structural_access_profile_required_fields_missing")
  const dimensions = (Array.isArray(input.dimensions) ? input.dimensions : []).map(item => {
    const dimension = STRUCTURAL_ACCESS_DIMENSIONS.has(item.dimension) ? item.dimension : null
    const state = POLICY_OUTCOME_LINK_STATES.has(item.state) ? item.state : null
    const sourceUrl = httpsUrl(item.source_url)
    if (!dimension || !state || !clean(item.summary, 500)) throw new Error("palantir_structural_access_dimension_invalid")
    if (["supported", "contradicted"].includes(state) && !sourceUrl) throw new Error("palantir_structural_access_dimension_source_required")
    return Object.freeze({
      dimension,
      state,
      summary: clean(item.summary, 500),
      source_url: sourceUrl,
      source_locator: clean(item.source_locator, 220) || null,
      period: clean(item.period, 120) || null,
      population_definition: clean(item.population_definition, 320) || null,
      indigenous_identification_method: clean(item.indigenous_identification_method, 360) || null,
      governance: list(item.governance, 260),
      limitations: list(item.limitations, 320),
    })
  })
  if (new Set(dimensions.map(item => item.dimension)).size !== dimensions.length) throw new Error("palantir_structural_access_duplicate_dimension")
  return Object.freeze({
    schema_version: "palantir-structural-access-profile-v1",
    profile_id: profileId,
    jurisdiction,
    geography: clean(input.geography, 180) || null,
    dimensions: Object.freeze(dimensions),
    supported_dimensions: dimensions.filter(item => item.state === "supported").length,
    unknown_or_missing_dimensions: dimensions.filter(item => ["missing", "not_measurable"].includes(item.state)).length,
    indigenous_identity_inferred_from_geography: false,
    community_ranking_prohibited: true,
    discrimination_conclusion: "not_established",
    private_by_default: true,
    owner_review_required: true,
  })
}

// A signal identifies a bounded next research question. It is never a finding
// about discrimination, institutional intent, or a community's rank.
export function buildStructuralAccessSignal(input = {}) {
  const signalType = ACCESS_SIGNAL_TYPES.has(input.signal_type) ? input.signal_type : null
  const sourceUrl = httpsUrl(input.source_url)
  if (!signalType || !clean(input.research_question, 500) || !sourceUrl) throw new Error("palantir_structural_access_signal_required_fields_missing")
  return Object.freeze({
    schema_version: "palantir-structural-access-signal-v1",
    signal_id: clean(input.signal_id, 180) || null,
    jurisdiction: clean(input.jurisdiction, 120) || null,
    geography: clean(input.geography, 180) || null,
    signal_type: signalType,
    observed_pattern: clean(input.observed_pattern, 500) || null,
    research_question: clean(input.research_question, 500),
    source_url: sourceUrl,
    source_locator: clean(input.source_locator, 220) || null,
    evidence_quality: clean(input.evidence_quality, 100) || "unknown",
    limitations: list(input.limitations, 320),
    priority_only: true,
    discrimination_finding: false,
    community_ranking: false,
    owner_review_required: true,
  })
}

// The composite is intentionally withheld unless every contributing dimension
// has a transparent scale, source and pre-specified non-arbitrary weighting.
export function assessStructuralAccessIndexExperiment(input = {}) {
  const dimensions = (Array.isArray(input.dimensions) ? input.dimensions : []).map(item => Object.freeze({
    dimension: STRUCTURAL_ACCESS_DIMENSIONS.has(item.dimension) ? item.dimension : null,
    normalized_value: numberOrNull(item.normalized_value),
    normalization_method: clean(item.normalization_method, 240) || null,
    source_url: httpsUrl(item.source_url),
    weight: numberOrNull(item.weight),
    missingness: clean(item.missingness, 180) || null,
  }))
  if (dimensions.some(item => !item.dimension)) throw new Error("palantir_structural_access_index_dimension_invalid")
  const method = clean(input.weighting_method, 500)
  const complete = dimensions.length >= 2 && dimensions.every(item => item.normalized_value !== null && item.normalization_method && item.source_url && item.weight !== null && item.weight >= 0)
  const weightTotal = dimensions.reduce((sum, item) => sum + (item.weight ?? 0), 0)
  const useComposite = input.pre_specified_weighting === true && Boolean(method) && complete && Math.abs(weightTotal - 1) < 0.0001
  const composite = useComposite ? Number(dimensions.reduce((sum, item) => sum + item.normalized_value * item.weight, 0).toFixed(4)) : null
  return Object.freeze({
    schema_version: "palantir-structural-access-index-experiment-v1",
    index_id: clean(input.index_id, 180) || null,
    dimensions: Object.freeze(dimensions),
    weighting_method: method || null,
    pre_specified_weighting: input.pre_specified_weighting === true,
    composite_status: useComposite ? "private_experimental_composite" : "dimensions_retained_no_composite",
    composite_value: composite,
    withheld_reason: useComposite ? null : "No composite is emitted without complete, source-backed dimensions and a pre-specified non-arbitrary weighting method.",
    sensitivity_analysis_required: useComposite,
    public_use_prohibited: true,
    community_league_table_prohibited: true,
  })
}

export function assessNeedToResourceFit(input = {}) {
  const need = input.need || {}
  const resource = input.resource || {}
  const needValue = numberOrNull(need.value)
  const resourceValue = numberOrNull(resource.value)
  const checks = Object.freeze({
    need_source: Boolean(httpsUrl(need.source_url)),
    resource_source: Boolean(httpsUrl(resource.source_url)),
    same_geography: Boolean(clean(need.geography, 180) && clean(need.geography, 180) === clean(resource.geography, 180)),
    aligned_period: Boolean(clean(need.period, 120) && clean(need.period, 120) === clean(resource.period, 120)),
    stated_need_denominator: Boolean(clean(need.denominator, 260)),
    stated_resource_denominator: Boolean(clean(resource.denominator, 260)),
    comparable_units: input.units_comparable === true,
    known_values: needValue !== null && resourceValue !== null,
  })
  const usable = Object.values(checks).every(Boolean)
  return Object.freeze({
    schema_version: "palantir-need-resource-fit-v1",
    jurisdiction: clean(input.jurisdiction, 120) || null,
    need: Object.freeze({ label: clean(need.label, 240) || null, value: needValue, denominator: clean(need.denominator, 260) || null, geography: clean(need.geography, 180) || null, period: clean(need.period, 120) || null, source_url: httpsUrl(need.source_url) }),
    resource: Object.freeze({ label: clean(resource.label, 240) || null, value: resourceValue, denominator: clean(resource.denominator, 260) || null, geography: clean(resource.geography, 180) || null, period: clean(resource.period, 120) || null, source_url: httpsUrl(resource.source_url) }),
    checks,
    analytical_state: usable ? "research_question_ready" : "insufficient_for_need_resource_inference",
    possible_mismatch: usable && input.predefined_mismatch_rule === true ? input.possible_mismatch === true : null,
    mismatch_is_discrimination_evidence: false,
    causal_conclusion_supported: false,
    owner_review_required: true,
  })
}

export function assessServiceReliability(input = {}) {
  const scheduled = numberOrNull(input.scheduled_hours)
  const available = numberOrNull(input.available_hours)
  const daysExpected = numberOrNull(input.expected_days)
  const daysAvailable = numberOrNull(input.available_days)
  if ((scheduled !== null || available !== null) && (scheduled === null || available === null || scheduled <= 0 || available < 0 || available > scheduled)) throw new Error("palantir_service_reliability_hours_invalid")
  if ((daysExpected !== null || daysAvailable !== null) && (daysExpected === null || daysAvailable === null || daysExpected <= 0 || daysAvailable < 0 || daysAvailable > daysExpected)) throw new Error("palantir_service_reliability_days_invalid")
  const sourceUrl = httpsUrl(input.source_url)
  const measure = scheduled !== null ? { numerator: available, denominator: scheduled, unit: "hours" } : daysExpected !== null ? { numerator: daysAvailable, denominator: daysExpected, unit: "days" } : null
  return Object.freeze({
    schema_version: "palantir-service-reliability-v1",
    jurisdiction: clean(input.jurisdiction, 120) || null,
    service_type: clean(input.service_type, 160) || null,
    period: clean(input.period, 120) || null,
    measure,
    availability_rate: measure ? Number((measure.numerator / measure.denominator).toFixed(4)) : null,
    source_url: sourceUrl,
    measurement_state: measure && sourceUrl ? "measured" : "not_measured",
    limits: list(input.limits, 320),
    historical_availability_fabricated: false,
    identity_inference_used: false,
  })
}

export function buildTreatmentAccessCascade(input = {}) {
  const stages = (Array.isArray(input.stages) ? input.stages : []).map(item => {
    const stage = TREATMENT_CASCADE_STAGES.has(item.stage) ? item.stage : null
    const state = POLICY_OUTCOME_LINK_STATES.has(item.state) ? item.state : null
    const sourceUrl = httpsUrl(item.source_url)
    if (!stage || !state || !clean(item.summary, 500)) throw new Error("palantir_treatment_cascade_stage_invalid")
    if (state === "supported" && !sourceUrl) throw new Error("palantir_treatment_cascade_source_required")
    return Object.freeze({ stage, state, summary: clean(item.summary, 500), source_url: sourceUrl, limitations: list(item.limitations, 320) })
  })
  if (new Set(stages.map(item => item.stage)).size !== stages.length) throw new Error("palantir_treatment_cascade_duplicate_stage")
  const byStage = new Map(stages.map(item => [item.stage, item]))
  const ordered = [...TREATMENT_CASCADE_STAGES].map(stage => byStage.get(stage) || Object.freeze({ stage, state: "missing", summary: "No usable evidence located.", source_url: null, limitations: [] }))
  return Object.freeze({
    schema_version: "palantir-treatment-access-cascade-v1",
    jurisdiction: clean(input.jurisdiction, 120),
    stages: Object.freeze(ordered),
    measurable_stages: ordered.filter(item => item.state === "supported").length,
    missing_or_unmeasurable_stages: ordered.filter(item => ["missing", "not_measurable"].includes(item.state)).length,
    implementation_is_outcome: false,
    causal_conclusion_supported: false,
    private_by_default: true,
  })
}

export function buildPolicyOutcomeLagChain(input = {}) {
  const chainId = clean(input.chain_id, 180)
  if (!chainId || !clean(input.jurisdiction, 120)) throw new Error("palantir_policy_outcome_chain_required_fields_missing")
  const links = (Array.isArray(input.links) ? input.links : []).map(item => {
    const stage = POLICY_OUTCOME_STAGES.has(item.stage) ? item.stage : null
    const state = POLICY_OUTCOME_LINK_STATES.has(item.state) ? item.state : null
    const sourceUrl = httpsUrl(item.source_url)
    if (!stage || !state || !clean(item.statement, 500)) throw new Error("palantir_policy_outcome_chain_link_invalid")
    if (["supported", "contradicted"].includes(state) && !sourceUrl) throw new Error("palantir_policy_outcome_chain_source_required")
    return Object.freeze({ stage, state, statement: clean(item.statement, 500), date: isoDate(item.date), source_url: sourceUrl, source_locator: clean(item.source_locator, 220) || null, limitations: list(item.limitations, 320) })
  })
  if (new Set(links.map(item => item.stage)).size !== links.length) throw new Error("palantir_policy_outcome_chain_duplicate_stage")
  const byStage = new Map(links.map(item => [item.stage, item]))
  const ordered = [...POLICY_OUTCOME_STAGES].map(stage => byStage.get(stage) || Object.freeze({ stage, state: "missing", statement: "No usable evidence located.", date: null, source_url: null, source_locator: null, limitations: [] }))
  return Object.freeze({
    schema_version: "palantir-policy-outcome-lag-chain-v1",
    chain_id: chainId,
    jurisdiction: clean(input.jurisdiction, 120),
    links: Object.freeze(ordered),
    supported_links: ordered.filter(item => item.state === "supported").length,
    outcome_measured: ordered.find(item => item.stage === "later_outcome")?.state === "supported",
    intervention_is_effectiveness_evidence: false,
    causal_conclusion_supported: false,
    owner_review_required: true,
  })
}

export function buildMeasurementInequalityMatrix(input = {}) {
  const provinces = list(input.provinces, 120)
  if (provinces.length < 2 || !Array.isArray(input.rows) || input.rows.length === 0) throw new Error("palantir_measurement_inequality_matrix_required_fields_missing")
  const rows = input.rows.map(row => {
    const cells = {}
    for (const province of provinces) {
      const cell = row.cells?.[province] || {}
      const state = MEASUREMENT_INEQUALITY_STATES.has(cell.state) ? cell.state : null
      if (!state || !httpsUrl(cell.source_url)) throw new Error("palantir_measurement_inequality_cell_invalid")
      cells[province] = Object.freeze({ state, indigenous_specific: cell.indigenous_specific === true, comparator_available: cell.comparator_available === true, longitudinal: cell.longitudinal === true, age_standardized: cell.age_standardized === true, public: cell.public === true, governed: cell.governed === true, methodology_quality: METHODOLOGY_QUALITY_STATES.has(cell.methodology_quality) ? cell.methodology_quality : "unknown", latest_year: clean(cell.latest_year, 60) || null, next_expected_update: clean(cell.next_expected_update, 120) || null, source_url: httpsUrl(cell.source_url), limitations: list(cell.limitations, 300) })
    }
    return Object.freeze({ indicator: clean(row.indicator, 240), cells: Object.freeze(cells) })
  })
  if (rows.some(row => !row.indicator) || new Set(rows.map(row => row.indicator)).size !== rows.length) throw new Error("palantir_measurement_inequality_row_invalid")
  return Object.freeze({ schema_version: "palantir-measurement-inequality-matrix-v1", provinces: Object.freeze(provinces), rows: Object.freeze(rows), cross_province_rankings_prohibited: true, absence_is_wrongdoing_evidence: false, private_by_default: true, owner_review_required: true })
}

// A public-safe question card deliberately contains no outreach plan, contact
// information, request wording or private analyst notes. It can be displayed
// only through its separate owner/public gate.
export function buildSuggestedFollowUpRecord(input = {}) {
  const sourceUrls = list(input.source_urls, 700).map(httpsUrl).filter(Boolean)
  const title = clean(input.title, 180)
  const jurisdiction = clean(input.jurisdiction, 120)
  const researchQuestion = clean(input.research_question, 600)
  const whyItMatters = clean(input.why_it_matters, 900)
  const currentlyKnow = clean(input.what_we_currently_know, 1200)
  const missing = clean(input.what_is_missing, 900)
  const evidenceNeeded = clean(input.evidence_needed, 900)
  const governance = clean(input.governance_considerations, 700)
  const prohibited = /\b(foi|atip|email|phone|contact details|request draft|private analyst|internal note)\b/i
  const publicFields = [title, jurisdiction, researchQuestion, whyItMatters, currentlyKnow, missing, evidenceNeeded, governance]
  if (!title || !jurisdiction || !researchQuestion || !whyItMatters || !currentlyKnow || !missing || !evidenceNeeded || sourceUrls.length === 0) throw new Error("palantir_suggested_follow_up_required_fields_missing")
  if (publicFields.some(value => prohibited.test(value))) throw new Error("palantir_suggested_follow_up_private_strategy_prohibited")
  const reviewState = REVIEW_STATES.has(input.owner_review_state) ? input.owner_review_state : "pending"
  const publicationState = PUBLICATION_STATES.has(input.publication_state) ? input.publication_state : "private_research"
  return Object.freeze({
    schema_version: "palantir-suggested-follow-up-v1",
    follow_up_id: clean(input.follow_up_id, 180) || null,
    title,
    jurisdiction,
    research_question: researchQuestion,
    why_it_matters: whyItMatters,
    what_we_currently_know: currentlyKnow,
    what_is_missing: missing,
    evidence_needed: evidenceNeeded,
    likely_data_holder_or_source_family: clean(input.likely_data_holder_or_source_family, 360) || "Relevant public reporting or an appropriately governed data source",
    governance_considerations: governance || null,
    related_findings: list(input.related_findings, 180),
    related_accountability_chain: list(input.related_accountability_chain, 180),
    priority: ["high", "medium", "low"].includes(input.priority) ? input.priority : "medium",
    status: SUGGESTED_FOLLOW_UP_STATUSES.has(input.status) ? input.status : "suggested",
    source_urls: Object.freeze(sourceUrls),
    last_reviewed: isoDate(input.last_reviewed),
    owner_review_state: reviewState,
    publication_state: publicationState,
    public_projection_requested: input.public_projection_requested === true,
    private_outreach_strategy_included: false,
    publication_authority: false,
  })
}

export function assessSuggestedFollowUpPublicGate(input = {}) {
  const record = input.schema_version === "palantir-suggested-follow-up-v1" ? input : buildSuggestedFollowUpRecord(input)
  const checks = Object.freeze({
    complete_public_rationale: Boolean(record.title && record.research_question && record.why_it_matters && record.what_we_currently_know && record.what_is_missing && record.evidence_needed),
    source_backed: record.source_urls.length > 0,
    governance_stated_when_needed: record.governance_considerations !== null || !/first nations|indigenous|metis|inuit/i.test(`${record.title} ${record.research_question}`),
    no_private_strategy: record.private_outreach_strategy_included === false,
    owner_approved: record.owner_review_state === "approved",
    approved_public_state: record.publication_state === "approved_public",
  })
  const publicSafe = ["complete_public_rationale", "source_backed", "governance_stated_when_needed", "no_private_strategy"].every(key => checks[key])
  return Object.freeze({
    schema_version: "palantir-suggested-follow-up-public-gate-v1",
    follow_up_id: record.follow_up_id,
    checks,
    publicly_eligible: publicSafe,
    publishable: publicSafe && checks.owner_approved && checks.approved_public_state && record.public_projection_requested,
    owner_review_required: publicSafe && !checks.owner_approved,
    automatic_publication: false,
  })
}
