const EVIDENCE_STRENGTHS = new Set(["A", "B", "C", "D", "E", "F"])
const RECORD_TYPES = new Set(["structural_indicator", "data_gap", "reporting_gap", "measurement_gap"])
const REVIEW_STATES = new Set(["pending", "approved", "rejected", "needs_more_research", "deferred", "false_positive"])
const DISCRIMINATION_STATES = new Set(["not_assessed", "not_established", "documented_by_source"])
const MECHANISM_STATES = new Set(["none_identified", "plausible_not_established", "documented", "formal_acknowledgement", "intervention", "measured_outcome"])
const COMPARATOR_QUALITY_STATES = new Set(["meaningful", "provisional", "misleading", "absent"])

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
    }),
    accountability_links: list(input.accountability_links, 180),
    practical_resource_links: list(input.practical_resource_links, 180),
    owner_review_state: reviewState,
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
