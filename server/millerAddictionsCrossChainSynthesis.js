const text = value => String(value ?? "").replace(/\s+/g, " ").trim()

export const CROSS_CHAIN_PATTERN_TYPES = new Set([
  "repeated_recommendation",
  "recurring_service_gap",
  "recurring_geographic_gap",
  "recurring_responsible_actor",
  "repeated_policy_amendment",
  "prolonged_partial_implementation",
  "recurring_coroner_recommendation",
  "implementation_reporting_gap",
  "policy_to_service_gap",
  "repeated_access_barrier",
  "repeated_regulatory_change",
])

export const POLICY_SERVICE_VERIFICATION_STATUSES = new Set([
  "operationally_verified",
  "partially_verified",
  "announced_not_verified",
  "no_clear_evidence_found",
  "owner_review_required",
])

export const RESOURCE_MATCH_OUTCOMES = new Set([
  "exact_existing_resource_match",
  "probable_existing_resource_match",
  "new_resource_candidate",
  "service_expansion_of_existing_resource",
  "policy_program_not_resource",
  "insufficient_identity",
  "no_resource_match_found",
])

export const IMPLEMENTATION_DEPTHS = new Set([
  "announced",
  "funded",
  "administratively_created",
  "operational",
  "partially_operational",
  "geographically_partial",
  "utilization_documented",
  "outcome_evaluated",
])

const FORBIDDEN_PRIVATE_KEYS = /^(patient_name|complainant_name|deceased_name|private_address|personal_email|private_phone|medical_record)$/i

function assertNoPrivateFields(value, path = "record") {
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoPrivateFields(item, `${path}[${index}]`))
  if (!value || typeof value !== "object") return
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_PRIVATE_KEYS.test(key)) throw new Error(`miller_addictions_synthesis_private_field:${path}.${key}`)
    assertNoPrivateFields(nested, `${path}.${key}`)
  }
}

export function daysBetween(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(start)) || !/^\d{4}-\d{2}-\d{2}$/.test(text(end))) return null
  const value = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000)
  return Number.isFinite(value) && value >= 0 ? value : null
}

export function validateCrossChainPatternDataset(dataset, benchmark) {
  assertNoPrivateFields(dataset)
  if (dataset?.research_domain !== "miller_addictions" || dataset?.publication_scope !== "private_benchmark_only") throw new Error("miller_addictions_synthesis_scope_invalid")
  const chainIds = new Set((benchmark?.chains || []).map(item => item.policy_chain_id))
  if (dataset.chains_inspected !== chainIds.size) throw new Error("miller_addictions_synthesis_chain_count_invalid")
  const patternIds = new Set()
  for (const pattern of dataset.patterns || []) {
    if (!/^macp_[a-z0-9_]{3,100}$/.test(pattern.pattern_id || "") || patternIds.has(pattern.pattern_id)) throw new Error("miller_addictions_synthesis_pattern_id_invalid")
    patternIds.add(pattern.pattern_id)
    if (!CROSS_CHAIN_PATTERN_TYPES.has(pattern.pattern_type)) throw new Error("miller_addictions_synthesis_pattern_type_invalid")
    if (!pattern.title || !pattern.neutral_summary || !["high", "medium", "low"].includes(pattern.confidence)) throw new Error("miller_addictions_synthesis_pattern_invalid")
    if (!Array.isArray(pattern.chain_ids) || pattern.chain_ids.length < 2 || pattern.chain_ids.some(id => !chainIds.has(id))) throw new Error("miller_addictions_synthesis_pattern_chain_invalid")
    if (!Array.isArray(pattern.evidence_source_ids) || pattern.evidence_source_ids.length === 0) throw new Error("miller_addictions_synthesis_pattern_evidence_missing")
    if (pattern.owner_review_flag && !pattern.owner_review_reason) throw new Error("miller_addictions_synthesis_owner_review_gate")
  }
  for (const interval of dataset.temporal_intervals || []) {
    if (daysBetween(interval.start_date, interval.end_date) !== interval.days) throw new Error("miller_addictions_synthesis_interval_invalid")
  }
  return {
    chains: chainIds.size,
    patterns: patternIds.size,
    owner_review_required: (dataset.patterns || []).filter(item => item.owner_review_flag).length,
    repeated_recommendations: (dataset.repeated_recommendations || []).length,
    recurring_organizations: (dataset.recurring_organizations || []).length,
  }
}

const linkKey = item => [item.policy_instrument_candidate_id || "", item.commitment_candidate_id || "", item.resource_candidate_name || ""].join("\u001f")

export function validatePolicyServiceVerificationDataset(dataset, benchmark) {
  assertNoPrivateFields(dataset)
  if (dataset?.research_domain !== "miller_addictions" || dataset?.publication_scope !== "private_benchmark_only") throw new Error("miller_addictions_service_verification_scope_invalid")
  const expectedLinks = new Set((benchmark?.resource_links || []).map(linkKey))
  const seenLinks = new Set()
  const verificationIds = new Set()
  for (const record of dataset.verifications || []) {
    if (!/^mapsv_[a-z0-9_]{3,120}$/.test(record.verification_id || "") || verificationIds.has(record.verification_id)) throw new Error("miller_addictions_service_verification_id_invalid")
    verificationIds.add(record.verification_id)
    const key = linkKey(record)
    if (!expectedLinks.has(key) || seenLinks.has(key)) throw new Error("miller_addictions_service_verification_link_invalid")
    seenLinks.add(key)
    if (!POLICY_SERVICE_VERIFICATION_STATUSES.has(record.verification_status)) throw new Error("miller_addictions_service_verification_status_invalid")
    if (!RESOURCE_MATCH_OUTCOMES.has(record.resource_match_outcome)) throw new Error("miller_addictions_service_verification_match_invalid")
    if (!Array.isArray(record.implementation_depth) || record.implementation_depth.some(value => !IMPLEMENTATION_DEPTHS.has(value))) throw new Error("miller_addictions_service_verification_depth_invalid")
    if (!Array.isArray(record.evidence) || record.evidence.length === 0 || record.evidence.some(item => !/^https:\/\//.test(item.source_url || ""))) throw new Error("miller_addictions_service_verification_evidence_invalid")
    if (record.verification_status === "operationally_verified" && !record.evidence.some(item => ["operational", "current_service", "utilization"].includes(item.evidence_role))) throw new Error("miller_addictions_service_verification_operational_evidence_missing")
    if (record.verification_status === "announced_not_verified" && record.opening_date) throw new Error("miller_addictions_service_verification_announcement_claim_invalid")
    if (["exact_existing_resource_match", "service_expansion_of_existing_resource"].includes(record.resource_match_outcome) && !/^curated:[a-z0-9]+$/.test(record.miller_match?.curated_resource_id || "")) throw new Error("miller_addictions_service_verification_existing_match_missing")
    if (record.owner_review_flag && !record.owner_review_reason) throw new Error("miller_addictions_service_verification_owner_review_gate")
    if (!record.owner_review_flag && record.owner_review_reason) throw new Error("miller_addictions_service_verification_owner_review_reason_invalid")
    if (record.publication_state === "approved_for_publication") throw new Error("miller_addictions_service_verification_publication_gate")
  }
  if (seenLinks.size !== expectedLinks.size) throw new Error("miller_addictions_service_verification_incomplete")
  const byStatus = Object.fromEntries([...POLICY_SERVICE_VERIFICATION_STATUSES].map(status => [status, (dataset.verifications || []).filter(item => item.verification_status === status).length]))
  const byMatch = Object.fromEntries([...RESOURCE_MATCH_OUTCOMES].map(status => [status, (dataset.verifications || []).filter(item => item.resource_match_outcome === status).length]))
  return { total: seenLinks.size, by_status: byStatus, by_match: byMatch, owner_review_required: (dataset.verifications || []).filter(item => item.owner_review_flag).length }
}
