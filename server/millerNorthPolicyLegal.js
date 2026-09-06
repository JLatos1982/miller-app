import { createHash } from "node:crypto"

export const COMMITMENT_TYPES = new Set([
  "recommendation", "formal_commitment", "corrective_action_requirement", "promised_reform", "required_policy_change", "required_training", "governance_reform", "oversight_mechanism", "service_commitment", "reporting_requirement", "legislative_commitment", "regulatory_requirement", "settlement_obligation", "tribunal_directed_action", "audit_recommendation",
])
export const COMMITMENT_IMPLEMENTATION_STATUSES = new Set([
  "implemented", "partially_implemented", "implementation_underway", "implementation_announced", "no_clear_evidence_found", "implementation_unclear", "implementation_disputed", "superseded", "not_applicable", "owner_review_required",
])
export const IMPLEMENTATION_SCOPES = new Set(["local", "pilot", "organization_wide", "regional", "provincial", "system_wide", "interprovincial", "federal", "unclear", "not_applicable"])
export const POLICY_LEGAL_INSTRUMENT_TYPES = new Set([
  "legislation", "regulation", "government_policy", "ministry_directive", "health_authority_policy", "professional_standard", "regulatory_standard", "practice_standard", "code_of_ethics_conduct", "government_order", "ministerial_directive", "tribunal_decision", "human_rights_decision", "court_judgment", "settlement_public_resolution", "coroner_recommendation", "inquest_recommendation", "commissioned_review_recommendation", "ombudsperson_recommendation", "oversight_complaint_mechanism", "implementation_framework", "formal_action_plan", "government_response", "regulatory_action_plan",
])
export const BINDING_STATUSES = new Set(["binding", "non_binding", "mixed", "unknown"])
export const INSTRUMENT_STATUSES = new Set(["proposed", "announced", "adopted", "in_force", "operational", "under_review", "amended", "superseded", "repealed", "expired", "settled", "decided", "unknown"])
export const RECURRENCE_SIGNALS = new Set(["no_recurrence_assessed", "later_related_signal_found", "repeated_recommendation", "continued_gap_reported", "later_incident_found", "insufficient_evidence"])
export const POLICY_RELATIONSHIP_TYPES = new Set(["governed_by", "investigated_under", "complaint_under", "decision_under", "resulted_in", "prompted_change_to", "implements", "partially_implements", "responds_to", "operationalizes", "cited_by", "repeated_by", "creates_oversight_for", "candidate_match"])
const INSTRUMENT_SOURCE_ROLES = new Set(["official_text", "issuance", "implementation", "evaluation", "legal_context", "corroboration", "recurrence_signal", "supersession"])
const FIXTURE_RELATIONSHIP_TYPES = new Set([...POLICY_RELATIONSHIP_TYPES, "amends", "supersedes", "cites", "repeats", "predecessor_of"])

const EVIDENCE_CLASSES = new Set(["official_primary_source", "official_plus_independent_corroboration", "independent_corroboration", "reported_unconfirmed", "owner_review_required"])
const PRIVATE_PUBLICATION_STATES = new Set(["staged_private_review", "owner_review_required", "approved_for_publication", "publication_blocked"])
const clean = value => String(value || "").replace(/\s+/g, " ").trim()
const digest = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")
const isoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(clean(value)) ? clean(value) : null
const yearText = value => clean(value) || null
const commitmentTypeFor = item => {
  const text = clean(item.recommendation_or_commitment).toLowerCase()
  if (/settlement|remed/.test(text)) return "settlement_obligation"
  if (/ombud|oversight|advocate|complaint mechanism/.test(text)) return "oversight_mechanism"
  if (/train|education/.test(text)) return "required_training"
  if (/report|monitor|publish/.test(text)) return "reporting_requirement"
  if (/legislat|regulat/.test(text)) return "legislative_commitment"
  if (/policy|procedure|practice standard/.test(text)) return "required_policy_change"
  if (/implement|establish|create|appoint|provide|fund/.test(text)) return "formal_commitment"
  return "recommendation"
}
const implementationScopeFor = value => {
  const normalized = clean(value).toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "")
  const aliases = { systemwide: "system_wide", province_wide: "provincial", provincial_system: "provincial", organization: "organization_wide", organization_level: "organization_wide" }
  const candidate = aliases[normalized] || normalized
  return IMPLEMENTATION_SCOPES.has(candidate) ? candidate : "unclear"
}
const sourceOrganization = url => {
  try { return new URL(url).hostname.replace(/^www\./, "") } catch { return "Source organization not resolved" }
}

export function normalizeImplementationTrackingCommitment(item) {
  if (!item?.tracking_id || !/^maa_[a-f0-9]{24}$/.test(item.originating_action_id || "")) throw new Error("miller_north_commitment_origin_invalid")
  if (!COMMITMENT_IMPLEMENTATION_STATUSES.has(item.implementation_status)) throw new Error("miller_north_commitment_status_invalid")
  const owner_review_flag = Boolean(item.owner_review_flag)
  const responsible_organizations = clean(item.responsible_organization).split(/\s+(?:and|with)\s+/i).map(clean).filter(Boolean)
  const accountability_commitment_id = `macm_${digest(`miller-north-commitment-v1\u001f${item.tracking_id}`).slice(0, 24)}`
  const commitment_summary = clean(item.recommendation_or_commitment)
  const commitment_type = commitmentTypeFor(item)
  const implementation_scope = implementationScopeFor(item.implementation_scope)
  const core = {
    accountability_commitment_id,
    accountability_action_stable_id: item.originating_action_id,
    accountability_chain_id: item.accountability_chain_id,
    working_title: commitment_summary.slice(0, 240),
    commitment_summary,
    original_wording_excerpt: null,
    commitment_type,
    originating_organization: responsible_organizations[0] || "Originating organization requires review",
    responsible_organizations: responsible_organizations.length ? responsible_organizations : ["Responsible organization requires review"],
    responsible_authority: null,
    date_issued: isoDate(item.recommendation_date),
    date_issued_text: yearText(item.recommendation_date),
    date_accepted: null,
    expected_completion_date: isoDate(item.expected_implementation_date),
    expected_completion_date_text: yearText(item.expected_implementation_date),
    implementation_status: item.implementation_status,
    implementation_status_date: isoDate(item.status_last_evidenced_date),
    implementation_status_date_text: yearText(item.status_last_evidenced_date),
    implementation_scope,
    implementation_evidence_summary: clean(item.evidence_summary) || null,
    follow_up_due_date: null,
    follow_up_due_date_text: null,
    repeat_recommendation_flag: Boolean(item.repeat_recommendation_signal),
    evidence_classification: owner_review_flag ? "owner_review_required" : "official_primary_source",
    confidence: item.confidence,
    owner_review_flag,
    owner_review_reason: owner_review_flag ? clean(item.owner_review_reason) || "Implementation evidence requires owner review." : null,
    publication_state: owner_review_flag ? "owner_review_required" : "staged_private_review",
    research_version: "miller-north-implementation-tracking-v1",
    provenance: { tracking_id: item.tracking_id, originating_candidate_id: item.originating_candidate_id, no_production_import: true },
  }
  core.commitment_fingerprint = digest([core.accountability_chain_id, core.commitment_summary.toLowerCase(), core.responsible_organizations])
  const promiseUrls = (item.promise_source_urls || []).map(url => ({ url, role: "originating_recommendation", organization: sourceOrganization(url), source_type: "originating source" }))
  const statusUrls = (item.status_sources || []).map(source => ({ url: source.url, role: item.repeat_recommendation_signal ? "repeat_signal" : "implementation", organization: source.organization || sourceOrganization(source.url), source_type: source.source_type || "implementation source" }))
  const sources = [...promiseUrls, ...statusUrls].map(source => ({
    source_organization: source.organization,
    source_title: null,
    source_url: source.url,
    source_type: source.source_type,
    publication_date: null,
    source_role: source.role,
    relevant_evidence: source.role === "implementation" || source.role === "repeat_signal" ? core.implementation_evidence_summary : core.commitment_summary,
    evidence_classification: core.evidence_classification,
    is_independent: !/(\.gov\.|gov\.bc\.ca|alberta\.ca|saskatchewan\.ca|saskhealthauthority\.ca|cpsa\.ca|bccnm\.ca|cpsbc\.ca|fnha\.ca|fnhoo\.ca)/i.test(source.url),
    provenance: { tracking_id: item.tracking_id, no_production_import: true },
  }))
  return { commitment: core, sources }
}

export function buildCommitmentFixtureBatch({ trackedItems = [] } = {}) {
  if (!Array.isArray(trackedItems) || !trackedItems.length) throw new Error("miller_north_commitment_fixture_empty")
  const ids = new Set(), fingerprints = new Set()
  return trackedItems.map(item => {
    const normalized = normalizeImplementationTrackingCommitment(item)
    if (ids.has(normalized.commitment.accountability_commitment_id) || fingerprints.has(normalized.commitment.commitment_fingerprint)) throw new Error("miller_north_commitment_duplicate")
    ids.add(normalized.commitment.accountability_commitment_id)
    fingerprints.add(normalized.commitment.commitment_fingerprint)
    return normalized
  })
}

export function validateCommitmentFixtureBatch({ trackedItems = [] } = {}) {
  const batch = buildCommitmentFixtureBatch({ trackedItems })
  const ownerReview = batch.filter(item => item.commitment.owner_review_flag).length
  const deterministicNormalization = batch.filter(item => !isoDate(item.commitment.date_issued_text) || item.commitment.implementation_scope !== clean(trackedItems.find(source => source.tracking_id === item.commitment.provenance.tracking_id)?.implementation_scope)).length
  return { batch, counts: { cleanly_compatible: batch.length - deterministicNormalization, compatible_after_normalization: deterministicNormalization, ambiguous: 0, rejected: 0, owner_review_required: ownerReview }, repeat_recommendation_count: batch.filter(item => item.commitment.repeat_recommendation_flag).length }
}

export function normalizePolicyLegalCandidate(record) {
  if (!record?.candidate_id || !POLICY_LEGAL_INSTRUMENT_TYPES.has(record.instrument_type)) throw new Error("miller_north_policy_instrument_type_invalid")
  if (!BINDING_STATUSES.has(record.binding_status) || !INSTRUMENT_STATUSES.has(record.current_status) || !RECURRENCE_SIGNALS.has(record.recurrence_signal)) throw new Error("miller_north_policy_instrument_classification_invalid")
  if (!EVIDENCE_CLASSES.has(record.evidence_classification) || !Array.isArray(record.sources) || !record.sources.length) throw new Error("miller_north_policy_instrument_evidence_invalid")
  if (record.sources.some(source => !/^https:\/\//.test(source.source_url || "") || !INSTRUMENT_SOURCE_ROLES.has(source.source_role))) throw new Error("miller_north_policy_instrument_source_invalid")
  if ((record.relationships || []).some(relationship => !FIXTURE_RELATIONSHIP_TYPES.has(relationship.relationship_type))) throw new Error("miller_north_policy_instrument_relationship_invalid")
  const owner_review_flag = Boolean(record.owner_review_flag)
  const policy_legal_instrument_id = `mpli_${digest(`miller-north-policy-legal-v1\u001f${record.candidate_id}`).slice(0, 24)}`
  const instrument = {
    policy_legal_instrument_id,
    benchmark_candidate_id: record.candidate_id,
    working_title: clean(record.title),
    instrument_type: record.instrument_type,
    jurisdiction: record.jurisdiction,
    province: record.province || null,
    issuing_authority: clean(record.issuing_authority),
    responsible_organizations: record.responsible_organizations || [],
    date_issued: isoDate(record.date_issued), date_issued_text: yearText(record.date_issued),
    effective_date: isoDate(record.effective_date), effective_date_text: yearText(record.effective_date),
    repeal_or_supersession_date: isoDate(record.repeal_or_supersession_date), repeal_or_supersession_date_text: yearText(record.repeal_or_supersession_date),
    current_status: record.current_status,
    binding_status: record.binding_status,
    binding_status_evidence: clean(record.binding_status_evidence) || null,
    scope: clean(record.scope) || null,
    healthcare_setting: clean(record.healthcare_setting) || null,
    indigenous_specific_relevance: clean(record.indigenous_specific_relevance),
    neutral_summary: clean(record.neutral_summary),
    key_obligations_or_recommendations: clean(record.key_obligations_or_recommendations) || null,
    evidence_classification: record.evidence_classification,
    confidence: record.confidence,
    recurrence_signal: record.recurrence_signal,
    owner_review_flag,
    owner_review_reason: owner_review_flag ? clean(record.owner_review_reason) || "Policy/legal classification or relationship requires owner review." : null,
    publication_state: owner_review_flag ? "owner_review_required" : "staged_private_review",
    research_version: "miller-north-policy-legal-benchmark-v1",
    provenance: { benchmark_candidate_id: record.candidate_id, no_production_import: true },
  }
  instrument.instrument_fingerprint = digest([instrument.jurisdiction, instrument.instrument_type, instrument.working_title.toLowerCase(), instrument.issuing_authority.toLowerCase()])
  const sources = record.sources.map(source => ({ ...source, evidence_classification: source.evidence_classification || record.evidence_classification, is_independent: Boolean(source.is_independent), provenance: { benchmark_candidate_id: record.candidate_id, no_production_import: true } }))
  return { instrument, sources, relationships: record.relationships || [], recurrence_notes: record.recurrence_notes || null }
}

export function validatePolicyLegalFixture({ records = [] } = {}) {
  if (!Array.isArray(records) || !records.length) throw new Error("miller_north_policy_fixture_empty")
  const ids = new Set(), fingerprints = new Set()
  const batch = records.map(record => {
    const item = normalizePolicyLegalCandidate(record)
    if (ids.has(item.instrument.policy_legal_instrument_id) || fingerprints.has(item.instrument.instrument_fingerprint)) throw new Error("miller_north_policy_instrument_duplicate")
    ids.add(item.instrument.policy_legal_instrument_id); fingerprints.add(item.instrument.instrument_fingerprint)
    return item
  })
  return {
    batch,
    counts: {
      total: batch.length,
      official_primary_source: batch.filter(item => item.instrument.evidence_classification === "official_primary_source" || item.instrument.evidence_classification === "official_plus_independent_corroboration").length,
      independently_corroborated: batch.filter(item => item.sources.some(source => source.is_independent)).length,
      owner_review_required: batch.filter(item => item.instrument.owner_review_flag).length,
    },
  }
}

export function assertPrivatePolicyLegalPayload(item) {
  if (!item || !POLICY_LEGAL_INSTRUMENT_TYPES.has(item.instrument_type) || !BINDING_STATUSES.has(item.binding_status) || !PRIVATE_PUBLICATION_STATES.has(item.publication_state)) throw new Error("miller_north_policy_payload_invalid")
  if (item.owner_review_flag && (!item.owner_review_reason || item.publication_state === "approved_for_publication")) throw new Error("miller_north_policy_owner_review_gate")
  if (!/^mpli_[a-f0-9]{24}$/.test(item.policy_legal_instrument_id)) throw new Error("miller_north_policy_id_invalid")
  return true
}
