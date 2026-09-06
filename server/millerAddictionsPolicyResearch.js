import { createHash } from "node:crypto"

export const MILLER_ADDICTIONS_DOMAIN = "miller_addictions"
export const ADDICTIONS_INSTRUMENT_TYPES = new Set([
  "legislation", "regulation", "federal_exemption", "government_order", "ministerial_order",
  "government_policy", "policy_direction", "formal_framework", "government_strategy",
  "government_response", "funding_announcement", "service_implementation", "professional_standard",
  "clinical_guideline", "court_judgment", "tribunal_decision", "coroner_death_review_report",
  "coroner_inquest_recommendation", "public_health_recommendation", "implementation_report",
  "audit_report", "evaluation_report", "outcome_surveillance",
])
export const ADDICTIONS_COMMITMENT_TYPES = new Set([
  "recommendation", "formal_commitment", "funding_commitment", "service_commitment",
  "policy_change", "regulatory_change", "reporting_requirement", "corrective_action",
  "implementation_obligation", "evaluation_commitment", "audit_recommendation",
])
export const IMPLEMENTATION_STATUSES = new Set([
  "implemented", "partially_implemented", "implementation_underway", "implementation_announced",
  "no_clear_evidence_found", "implementation_unclear", "implementation_disputed", "superseded",
  "not_applicable", "owner_review_required",
])
export const IMPLEMENTATION_SCOPES = new Set([
  "facility", "local", "regional", "provincial", "federal", "pilot", "system_wide", "unclear", "not_applicable",
])
export const BINDING_STATUSES = new Set(["binding", "non_binding", "mixed", "unknown"])
export const CURRENT_STATUSES = new Set([
  "proposed", "announced", "adopted", "in_force", "operational", "under_review", "amended",
  "superseded", "repealed", "expired", "decided", "published", "unknown",
])
export const RECURRENCE_SIGNALS = new Set([
  "no_recurrence_assessed", "later_related_signal_found", "repeated_recommendation",
  "continued_gap_reported", "later_incident_found", "insufficient_evidence",
])
export const RESOURCE_RELATIONSHIP_TYPES = new Set([
  "funds", "authorizes", "regulates", "creates", "expands", "restricts", "governs", "requires",
  "implements", "partially_implements", "associated_with",
])
export const INSTRUMENT_RELATIONSHIP_TYPES = new Set([
  "amends", "supersedes", "implements", "partially_implements", "responds_to", "operationalizes",
  "cited_by", "repeated_by", "created_by", "evaluates",
])
export const RESOURCE_MATCH_STATES = new Set(["exact_candidate", "possible_candidate", "unresolved", "no_match_expected"])

const SOURCE_ROLES = new Set([
  "official_text", "issuance", "recommendation", "response", "implementation", "evaluation",
  "outcome", "legal_context", "supersession", "corroboration", "recurrence_signal",
])
const COMMITMENT_SOURCE_ROLE_MAP = {
  official_text: "commitment",
  issuance: "commitment",
  recommendation: "recommendation",
  response: "acceptance",
  implementation: "implementation",
  evaluation: "evaluation",
  outcome: "evaluation",
  legal_context: "commitment",
  supersession: "supersession",
  corroboration: "evaluation",
  recurrence_signal: "repeat_signal",
}
const EVIDENCE_CLASSES = new Set([
  "official_primary_source", "official_plus_independent_corroboration", "independent_corroboration",
  "reported_unconfirmed", "owner_review_required",
])
const PRIVATE_PUBLICATION_STATES = new Set([
  "staged_private_review", "owner_review_required", "approved_for_publication", "publication_blocked",
])
const FORBIDDEN_PRIVATE_KEYS = /^(patient_name|complainant_name|deceased_name|private_address|personal_email|private_phone|medical_record)$/i
const clean = value => String(value ?? "").replace(/\s+/g, " ").trim()
const digest = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")
const isoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(clean(value)) ? clean(value) : null

function assertNoPrivateFields(value, path = "record") {
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoPrivateFields(item, `${path}[${index}]`))
  if (!value || typeof value !== "object") return
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_PRIVATE_KEYS.test(key)) throw new Error(`miller_addictions_private_field:${path}.${key}`)
    assertNoPrivateFields(nested, `${path}.${key}`)
  }
}

export function normalizeMillerAddictionsPolicyCandidate(record) {
  assertNoPrivateFields(record)
  if (record?.research_domain !== MILLER_ADDICTIONS_DOMAIN) throw new Error("miller_addictions_domain_invalid")
  if (!/^map_[a-z0-9_]{3,100}$/.test(record.candidate_id || "")) throw new Error("miller_addictions_candidate_id_invalid")
  if (!ADDICTIONS_INSTRUMENT_TYPES.has(record.instrument_type)) throw new Error("miller_addictions_instrument_type_invalid")
  if (!BINDING_STATUSES.has(record.binding_status) || !CURRENT_STATUSES.has(record.current_status)) throw new Error("miller_addictions_legal_classification_invalid")
  if (!RECURRENCE_SIGNALS.has(record.recurrence_signal)) throw new Error("miller_addictions_recurrence_invalid")
  if (!EVIDENCE_CLASSES.has(record.evidence_classification)) throw new Error("miller_addictions_evidence_invalid")
  if (!Array.isArray(record.sources) || !record.sources.length || record.sources.some(source => !/^https:\/\//.test(source.source_url || "") || !SOURCE_ROLES.has(source.source_role))) throw new Error("miller_addictions_source_invalid")
  if ((record.relationships || []).some(relation => !INSTRUMENT_RELATIONSHIP_TYPES.has(relation.relationship_type))) throw new Error("miller_addictions_instrument_relationship_invalid")

  const ownerReview = Boolean(record.owner_review_flag)
  const instrument = {
    research_domain: MILLER_ADDICTIONS_DOMAIN,
    policy_instrument_id: `mapi_${digest(`miller-addictions-policy-v1\u001f${record.candidate_id}`).slice(0, 24)}`,
    benchmark_candidate_id: record.candidate_id,
    policy_chain_id: clean(record.policy_chain_id),
    title: clean(record.title),
    instrument_type: record.instrument_type,
    jurisdiction: record.jurisdiction,
    province: record.province || null,
    issuing_authority: clean(record.issuing_authority),
    date_issued: isoDate(record.date_issued),
    date_issued_text: clean(record.date_issued) || null,
    effective_date: isoDate(record.effective_date),
    effective_date_text: clean(record.effective_date) || null,
    current_status: record.current_status,
    binding_status: record.binding_status,
    binding_status_evidence: clean(record.binding_status_evidence) || null,
    topic_tags: Array.isArray(record.topic_tags) ? [...new Set(record.topic_tags.map(clean).filter(Boolean))] : [],
    neutral_summary: clean(record.neutral_summary),
    implementation_status: record.implementation_status,
    implementation_status_date: isoDate(record.implementation_status_date),
    implementation_status_date_text: clean(record.implementation_status_date) || null,
    implementation_scope: record.implementation_scope,
    implementation_evidence_summary: clean(record.implementation_evidence_summary) || null,
    recurrence_signal: record.recurrence_signal,
    recurrence_notes: clean(record.recurrence_notes) || null,
    evidence_classification: record.evidence_classification,
    confidence: record.confidence,
    owner_review_flag: ownerReview,
    owner_review_reason: ownerReview ? clean(record.owner_review_reason) || "Classification or relationship requires owner review." : null,
    publication_state: ownerReview ? "owner_review_required" : "staged_private_review",
    research_version: "miller-addictions-policy-benchmark-v1",
    provenance: { benchmark_candidate_id: record.candidate_id, no_production_import: true },
  }
  if (!/^mapc_[a-z0-9_]{3,100}$/.test(instrument.policy_chain_id)) throw new Error("miller_addictions_chain_id_invalid")
  if (!IMPLEMENTATION_STATUSES.has(instrument.implementation_status) || !IMPLEMENTATION_SCOPES.has(instrument.implementation_scope)) throw new Error("miller_addictions_implementation_invalid")
  if (!new Set(["high", "medium", "low"]).has(instrument.confidence)) throw new Error("miller_addictions_confidence_invalid")
  if (!instrument.title || !instrument.issuing_authority || !instrument.neutral_summary) throw new Error("miller_addictions_required_text_missing")
  instrument.instrument_fingerprint = digest([instrument.jurisdiction, instrument.instrument_type, instrument.title.toLowerCase(), instrument.issuing_authority.toLowerCase()])
  const sources = record.sources.map(source => ({
    ...source,
    evidence_classification: source.evidence_classification || record.evidence_classification,
    is_independent: Boolean(source.is_independent),
    provenance: { benchmark_candidate_id: record.candidate_id, no_production_import: true },
  }))
  return { instrument, sources, relationships: record.relationships || [] }
}

export function normalizeMillerAddictionsCommitment(commitment) {
  assertNoPrivateFields(commitment)
  if (commitment?.research_domain !== MILLER_ADDICTIONS_DOMAIN || !ADDICTIONS_COMMITMENT_TYPES.has(commitment.commitment_type)) throw new Error("miller_addictions_commitment_type_invalid")
  if (!IMPLEMENTATION_STATUSES.has(commitment.implementation_status) || !IMPLEMENTATION_SCOPES.has(commitment.implementation_scope)) throw new Error("miller_addictions_commitment_implementation_invalid")
  if (!Array.isArray(commitment.responsible_organizations) || !commitment.responsible_organizations.length) throw new Error("miller_addictions_commitment_owner_missing")
  if (!/^mapc_[a-z0-9_]{3,100}$/.test(commitment.policy_chain_id || "")) throw new Error("miller_addictions_commitment_chain_invalid")
  const ownerReview = Boolean(commitment.owner_review_flag)
  const normalized = {
    ...commitment,
    commitment_id: `madc_${digest(`miller-addictions-commitment-v1\u001f${commitment.candidate_commitment_id}`).slice(0, 24)}`,
    title: clean(commitment.title),
    summary: clean(commitment.summary),
    responsible_organizations: commitment.responsible_organizations.map(clean).filter(Boolean),
    date_issued: isoDate(commitment.date_issued), date_issued_text: clean(commitment.date_issued) || null,
    expected_completion_date: isoDate(commitment.expected_completion_date), expected_completion_date_text: clean(commitment.expected_completion_date) || null,
    implementation_status_date: isoDate(commitment.implementation_status_date), implementation_status_date_text: clean(commitment.implementation_status_date) || null,
    owner_review_flag: ownerReview,
    owner_review_reason: ownerReview ? clean(commitment.owner_review_reason) || "Commitment implementation requires owner review." : null,
    publication_state: ownerReview ? "owner_review_required" : "staged_private_review",
    research_version: "miller-addictions-policy-benchmark-v1",
    provenance: { candidate_commitment_id: commitment.candidate_commitment_id, no_production_import: true },
  }
  normalized.commitment_fingerprint = digest([normalized.policy_chain_id, normalized.summary.toLowerCase(), normalized.responsible_organizations])
  return normalized
}

export function validateMillerAddictionsPolicyFixture({ records = [], commitments = [], resource_links = [], source_catalog = {}, record_defaults = {}, chains = [] } = {}) {
  if (!records.length) throw new Error("miller_addictions_fixture_empty")
  const chainIds = new Set()
  for (const chain of chains) {
    if (!/^mapc_[a-z0-9_]{3,100}$/.test(chain.policy_chain_id || "") || chainIds.has(chain.policy_chain_id) || !clean(chain.title) || !clean(chain.neutral_summary)) throw new Error("miller_addictions_chain_invalid")
    chainIds.add(chain.policy_chain_id)
  }
  if (!chainIds.size) throw new Error("miller_addictions_chains_empty")
  const hydratedRecords = records.map(record => ({
    ...record_defaults,
    ...record,
    sources: record.sources || (record.source_ids || []).map(sourceId => {
      const source = source_catalog[sourceId]
      if (!source) throw new Error(`miller_addictions_source_catalog_missing:${sourceId}`)
      return { ...source, source_role: record.source_role || source.source_role || "official_text" }
    }),
  }))
  const instrumentIds = new Set(), instrumentFingerprints = new Set()
  const candidateIds = new Set(records.map(record => record.candidate_id))
  for (const record of records) if (!chainIds.has(record.policy_chain_id)) throw new Error("miller_addictions_record_chain_missing")
  const normalizedRecords = hydratedRecords.map(record => {
    const item = normalizeMillerAddictionsPolicyCandidate(record)
    if (instrumentIds.has(item.instrument.policy_instrument_id) || instrumentFingerprints.has(item.instrument.instrument_fingerprint)) throw new Error("miller_addictions_duplicate_instrument")
    instrumentIds.add(item.instrument.policy_instrument_id); instrumentFingerprints.add(item.instrument.instrument_fingerprint)
    return item
  })
  const commitmentIds = new Set(), commitmentFingerprints = new Set()
  const commitmentCandidateIds = new Set(commitments.map(commitment => commitment.candidate_commitment_id))
  const normalizedCommitments = commitments.map(commitment => {
    if (commitment.originating_policy_candidate_id && !candidateIds.has(commitment.originating_policy_candidate_id)) throw new Error("miller_addictions_commitment_origin_missing")
    if ((commitment.source_ids || []).some(sourceId => !source_catalog[sourceId])) throw new Error("miller_addictions_commitment_source_missing")
    const source_references = (commitment.source_ids || []).map(sourceId => {
      const source = source_catalog[sourceId]
      return { ...source, source_role: COMMITMENT_SOURCE_ROLE_MAP[source.source_role] || "commitment" }
    })
    const item = normalizeMillerAddictionsCommitment({ ...commitment, source_references })
    if (commitmentIds.has(item.commitment_id) || commitmentFingerprints.has(item.commitment_fingerprint)) throw new Error("miller_addictions_duplicate_commitment")
    commitmentIds.add(item.commitment_id); commitmentFingerprints.add(item.commitment_fingerprint)
    return item
  })
  for (const link of resource_links) {
    if (!RESOURCE_RELATIONSHIP_TYPES.has(link.relationship_type) || !RESOURCE_MATCH_STATES.has(link.resource_match_state)) throw new Error("miller_addictions_resource_relationship_invalid")
    if (!link.resource_candidate_name || (link.canonical_resource_id && !/^[a-f0-9-]{36}$/i.test(link.canonical_resource_id))) throw new Error("miller_addictions_resource_candidate_invalid")
    if (link.owner_review_flag && !link.owner_review_reason) throw new Error("miller_addictions_resource_owner_review_gate")
    if (link.policy_instrument_candidate_id && !candidateIds.has(link.policy_instrument_candidate_id)) throw new Error("miller_addictions_resource_policy_missing")
    if (link.commitment_candidate_id && !commitmentCandidateIds.has(link.commitment_candidate_id)) throw new Error("miller_addictions_resource_commitment_missing")
  }
  for (const record of records) for (const relation of record.relationships || []) if (relation.target_candidate_id && !candidateIds.has(relation.target_candidate_id)) throw new Error("miller_addictions_relation_target_missing")
  return {
    chains,
    records: normalizedRecords,
    commitments: normalizedCommitments,
    resource_links,
    counts: {
      total: normalizedRecords.length,
      chains: chains.length,
      official_primary_source: normalizedRecords.filter(item => ["official_primary_source", "official_plus_independent_corroboration"].includes(item.instrument.evidence_classification)).length,
      independently_corroborated: normalizedRecords.filter(item => item.sources.some(source => source.is_independent)).length,
      owner_review_required: normalizedRecords.filter(item => item.instrument.owner_review_flag).length,
      commitments: normalizedCommitments.length,
      resource_links: resource_links.length,
    },
  }
}

export function assertPrivateMillerAddictionsPayload(item) {
  assertNoPrivateFields(item)
  if (item?.research_domain !== MILLER_ADDICTIONS_DOMAIN || !PRIVATE_PUBLICATION_STATES.has(item.publication_state)) throw new Error("miller_addictions_payload_invalid")
  if (item.owner_review_flag && (!item.owner_review_reason || item.publication_state === "approved_for_publication")) throw new Error("miller_addictions_owner_review_gate")
  return true
}
