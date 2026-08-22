const current = (claim) => !["superseded", "rejected", "unknown"].includes(claim.status)
const key = (value) => String(typeof value === "string" ? value : value?.value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")

export const NEXT_BEST_ACTIONS = Object.freeze({
  INVESTIGATE_ENTITY_RELATIONSHIP: "investigate_entity_relationship",
  RESOLVE_ADDRESS_CONFLICT: "resolve_authoritative_address_conflict",
  FIND_PROGRAMME_AT_SITE: "find_authoritative_programme_at_site",
  RECONFIRM_STALE_EVIDENCE: "reconfirm_stale_evidence",
  STOP_RETRYING: "stop_retrying_no_new_evidence",
  NO_ACTION: "no_action_needed",
})

export function selfAuditNextActions({ resources = [], claims = [], evidence = [], qc = [], matchCandidates = [], researchItems = [] } = {}) {
  const evidenceByClaim = new Map(), qcByResource = new Map(qc.map((item) => [item.canonical_resource_id, item]))
  for (const item of evidence) evidenceByClaim.set(item.claim_id, [...(evidenceByClaim.get(item.claim_id) || []), item])
  const pendingMatches = new Set(matchCandidates.filter((item) => item.decision === "pending" && ["possible", "insufficient"].includes(item.classification)).flatMap((item) => [item.left_resource_id, item.right_resource_id]).filter(Boolean))
  return resources.filter((resource) => resource.lifecycle_state === "active" && resource.editorial_status !== "hidden").map((resource) => {
    const occupancy = claims.filter((claim) => claim.resource_id === resource.id && claim.field_name === "location_occupancy" && current(claim))
    const occupancyEvidence = occupancy.flatMap((claim) => evidenceByClaim.get(claim.id) || [])
    const authoritative = occupancyEvidence.filter((item) => item.stale !== true && Number(item.source_authority) >= 85 && item.source_url)
    const values = new Set(occupancy.filter((claim) => (evidenceByClaim.get(claim.id) || []).some((item) => item.stale !== true && Number(item.source_authority) >= 85)).map((claim) => key(claim.proposed_value)).filter(Boolean))
    const stale = occupancyEvidence.filter((item) => item.stale === true)
    const failed = researchItems.filter((item) => item.resource_id === resource.id && ["failed", "insufficient"].includes(item.outcome)).length
    const hasQc = qcByResource.has(resource.id)
    if (pendingMatches.has(resource.id)) return issue(resource, "entity_relationship_unresolved", NEXT_BEST_ACTIONS.INVESTIGATE_ENTITY_RELATIONSHIP, 100, ["canonical_match_pending", "retain_separate_until_authoritative_relationship_evidence"], { occupancy_claims: occupancy.length, authoritative_evidence: authoritative.length, has_qc: hasQc, prior_failed_attempts: failed })
    if (values.size > 1) return issue(resource, "authoritative_address_conflict", NEXT_BEST_ACTIONS.RESOLVE_ADDRESS_CONFLICT, 90, ["multiple_current_authoritative_occupancy_addresses"], { occupancy_claims: occupancy.length, authoritative_evidence: authoritative.length, has_qc: hasQc, prior_failed_attempts: failed })
    if (stale.length) return issue(resource, "stale_evidence", NEXT_BEST_ACTIONS.RECONFIRM_STALE_EVIDENCE, 70, ["stale_evidence_present"], { occupancy_claims: occupancy.length, authoritative_evidence: authoritative.length, stale_evidence: stale.length, has_qc: hasQc, prior_failed_attempts: failed })
    if (!authoritative.length && occupancy.length) return issue(resource, "occupancy_unresolved", NEXT_BEST_ACTIONS.FIND_PROGRAMME_AT_SITE, 80, ["authoritative_programme_at_site_evidence_missing"], { occupancy_claims: occupancy.length, authoritative_evidence: 0, has_qc: hasQc, prior_failed_attempts: failed })
    if (failed >= 2 && !authoritative.length) return issue(resource, "repeated_research_no_gain", NEXT_BEST_ACTIONS.STOP_RETRYING, 60, ["repeated_unsuccessful_research", "no_new_authoritative_evidence"], { occupancy_claims: occupancy.length, authoritative_evidence: 0, has_qc: hasQc, prior_failed_attempts: failed })
    return issue(resource, "sufficient_for_current_state", NEXT_BEST_ACTIONS.NO_ACTION, 0, ["no_deterministic_next_action"], { occupancy_claims: occupancy.length, authoritative_evidence: authoritative.length, has_qc: hasQc, prior_failed_attempts: failed })
  }).sort((a, b) => b.priority - a.priority || String(a.resource_id).localeCompare(String(b.resource_id)))
}

function issue(resource, issue_type, recommended_next_action, priority, reason_codes, state) {
  return { resource_id: resource.id, issue_type, recommended_next_action, priority, reason_codes, current_state: state, read_only: true }
}
