const EVIDENCE_STRENGTHS = new Set(["A", "B", "C", "D", "E", "F"])
const RECORD_TYPES = new Set(["structural_indicator", "data_gap", "reporting_gap", "measurement_gap"])
const REVIEW_STATES = new Set(["pending", "approved", "rejected", "needs_more_research", "deferred", "false_positive"])
const DISCRIMINATION_STATES = new Set(["not_assessed", "not_established", "documented_by_source"])
const MECHANISM_STATES = new Set(["none_identified", "plausible_not_established", "documented", "formal_acknowledgement", "intervention", "measured_outcome"])
const COMPARATOR_QUALITY_STATES = new Set(["meaningful", "provisional", "misleading", "absent"])
const SOURCE_QUALITY_STATES = new Set(["primary_official", "indigenous_governed", "independent_officer", "official_derived", "peer_reviewed_context", "secondary_context"])
const PUBLICATION_STATES = new Set(["private_research", "owner_review", "approved", "rejected", "published"])
const GAP_TYPES = new Set(["data_gap", "measurement_gap", "reporting_gap"])
const TREND_STATES = new Set(["improving", "worsening", "stable", "discontinuity", "methodology_changed", "data_discontinued", "insufficient_series"])
const COMPARABILITY_STATES = new Set(["high", "moderate", "poor", "not_comparable"])
const CLAIM_RELATIONSHIPS = new Set(["supports", "corroborates", "contradicts", "narrows", "supersedes"])

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
  })
  const structuralEligibilityKeys = Object.keys(checks).filter(key => key !== "owner_approved")
  const structurallyEligible = structuralEligibilityKeys.every(key => checks[key])
  return Object.freeze({
    schema_version: "palantir-structural-public-gate-v1",
    structural_record_id: record.structural_record_id,
    checks,
    structurally_eligible: structurallyEligible,
    publishable: structurallyEligible && checks.owner_approved && record.public_projection_requested,
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
