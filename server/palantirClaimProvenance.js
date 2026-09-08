import { createHash } from "node:crypto"

import { normalizePalantirEvidenceRole } from "./palantirEvidenceRoles.js"

export const PALANTIR_CLAIM_TYPES = Object.freeze([
  "allegation",
  "institutional_statement",
  "formal_finding",
  "regulator_finding",
  "audit_finding",
  "court_tribunal_finding",
  "recommendation",
  "response",
  "claimed_action",
  "implementation_claim",
  "independent_implementation_evidence",
  "measured_outcome",
  "policy_announcement",
  "funding_commitment",
  "service_availability_claim",
  "legal_procedural_status",
  "settlement_position",
  "statistical_contextual_claim",
])

export const PALANTIR_CLAIM_RELATIONSHIPS = Object.freeze([
  "supports",
  "corroborates",
  "contradicts",
  "narrows",
  "qualifies",
  "supersedes",
  "repeats",
  "independently_verifies",
  "institutional_response_to",
  "implementation_evidence_for",
  "outcome_evidence_for",
])

const CLAIM_TYPES = new Set(PALANTIR_CLAIM_TYPES)
const RELATIONSHIP_TYPES = new Set(PALANTIR_CLAIM_RELATIONSHIPS)
const CLAIM_STATUSES = new Set(["current", "corroborated", "disputed", "contradicted", "superseded", "partially_supported", "unresolved", "withdrawn", "historical_only"])
const VERIFICATION_STATES = new Set(["direct_official_source", "formal_finding", "institution_self_report", "independent_follow_up", "secondary_reporting", "unverified_lead"])
const PUBLIC_CLASSES = new Set(["owner_private_metadata", "public_source_fact", "public_candidate"])
const REVIEW_STATES = new Set(["confirmed", "owner_review", "rejected"])
const RESOLUTIONS = new Set(["unresolved", "resolved_in_favor_of_from", "resolved_in_favor_of_to"])
const clean = (value, limit = 800) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit)
const unique = (values, limit = 180) => [...new Set((values || []).map(value => clean(value, limit)).filter(Boolean))]
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24)
const safeUrl = value => /^https:\/\//.test(String(value || "")) ? clean(value, 500) : null
const isoDate = value => {
  if (!value) return null
  if (/^\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(String(value))) return String(value)
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null
}

const TYPE_TO_EVIDENCE_ROLE = Object.freeze({
  allegation: "allegation_report",
  institutional_statement: "institutional_acknowledgement",
  formal_finding: "merits_finding",
  regulator_finding: "regulator_finding",
  audit_finding: "audit_finding",
  court_tribunal_finding: "merits_finding",
  recommendation: "recommendation",
  response: "response",
  claimed_action: "response",
  implementation_claim: "response",
  independent_implementation_evidence: "implementation_evidence",
  measured_outcome: "measured_outcome",
  policy_announcement: "response",
  funding_commitment: "institutional_acknowledgement",
  service_availability_claim: "institutional_acknowledgement",
  legal_procedural_status: "procedural_decision",
  settlement_position: "settlement",
  statistical_contextual_claim: "systemic_context",
})

export function derivePalantirClaimVerificationState(input = {}) {
  const claimType = clean(input.claim_type, 80)
  const sourceRole = clean(input.source_role, 80)
  if (input.verification_state && VERIFICATION_STATES.has(input.verification_state)) return input.verification_state
  if (["formal_finding", "regulator_finding", "audit_finding", "court_tribunal_finding", "legal_procedural_status"].includes(claimType)) return "formal_finding"
  if (["independent_implementation_evidence", "measured_outcome"].includes(claimType) && sourceRole !== "asserting_institution") return "independent_follow_up"
  if (["institutional_statement", "response", "claimed_action", "implementation_claim", "policy_announcement", "funding_commitment", "service_availability_claim"].includes(claimType)) return "institution_self_report"
  if (sourceRole === "secondary_reporting") return "secondary_reporting"
  if (sourceRole === "official_primary" || sourceRole === "independent_oversight") return "direct_official_source"
  return "unverified_lead"
}

export function normalizePalantirClaim(input = {}) {
  const claimType = clean(input.claim_type, 80)
  const proposition = clean(input.normalized_proposition || input.claim_text || input.proposition, 800)
  const claimant = clean(input.claimant || input.asserting_institution, 220)
  const sourceDocumentId = clean(input.source_document_id, 180)
  const sourceUrl = safeUrl(input.provenance?.url || input.source_url)
  const citation = clean(input.provenance?.citation || input.citation, 240) || null
  if (!CLAIM_TYPES.has(claimType) || !proposition || !claimant || !sourceDocumentId || !(sourceUrl || citation)) throw new Error("palantir_claim_required_fields_missing")
  const evidenceRole = normalizePalantirEvidenceRole(input.evidence_role || TYPE_TO_EVIDENCE_ROLE[claimType])
  const publicationDate = isoDate(input.provenance?.publication_date || input.publication_date)
  const claimDate = isoDate(input.claim_date) || publicationDate
  const provenance = Object.freeze({
    source: clean(input.provenance?.source || input.source, 240) || null,
    document_id: sourceDocumentId,
    url: sourceUrl,
    citation,
    publication_date: publicationDate,
    issuing_organization: clean(input.provenance?.issuing_organization || input.issuing_organization, 220) || claimant,
    source_family: clean(input.provenance?.source_family || input.source_family, 100) || null,
    source_role: clean(input.provenance?.source_role || input.source_role, 100) || null,
    locator: Object.freeze({
      page: clean(input.provenance?.locator?.page || input.page, 40) || null,
      section: clean(input.provenance?.locator?.section || input.section, 160) || null,
      paragraph: clean(input.provenance?.locator?.paragraph || input.paragraph, 40) || null,
      row: clean(input.provenance?.locator?.row || input.row, 80) || null,
      recommendation_id: clean(input.provenance?.locator?.recommendation_id || input.recommendation_id, 180) || null,
      decision_paragraph: clean(input.provenance?.locator?.decision_paragraph || input.decision_paragraph, 40) || null,
    }),
  })
  const claimId = clean(input.claim_id, 180) || `claim:${digest({ event: input.canonical_event_id || null, sourceDocumentId, claimType, proposition: proposition.toLowerCase(), claimant: claimant.toLowerCase(), claimDate })}`
  const verificationState = derivePalantirClaimVerificationState({ ...input, claim_type: claimType, source_role: provenance.source_role })
  return Object.freeze({
    schema_version: "palantir-claim-v1",
    claim_id: claimId,
    canonical_event_id: clean(input.canonical_event_id, 180) || null,
    source_document_id: sourceDocumentId,
    claimant,
    claimant_organization_id: clean(input.claimant_organization_id, 180) || null,
    normalized_proposition: proposition,
    claim_value: input.claim_value ? Object.freeze({ value: clean(input.claim_value.value, 120) || null, unit: clean(input.claim_value.unit, 80) || null, currency: clean(input.claim_value.currency, 12) || null }) : null,
    claim_type: claimType,
    claim_date: claimDate,
    applicable_time_period: Object.freeze({ start: isoDate(input.applicable_time_period?.start), end: isoDate(input.applicable_time_period?.end), label: clean(input.applicable_time_period?.label, 160) || null }),
    jurisdiction: clean(input.jurisdiction, 100) || null,
    primary_domain: clean(input.primary_domain || input.domain, 100) || null,
    secondary_domains: unique(input.secondary_domains, 100),
    evidence_role: evidenceRole,
    source_role: provenance.source_role,
    verification_state: verificationState,
    claim_status: CLAIM_STATUSES.has(input.claim_status) ? input.claim_status : "current",
    public_classification: PUBLIC_CLASSES.has(input.public_classification) ? input.public_classification : "owner_private_metadata",
    related_recommendation_id: clean(input.related_recommendation_id || input.recommendation_id, 180) || null,
    related_milestone_id: clean(input.related_milestone_id, 180) || null,
    related_legal_decision_id: clean(input.related_legal_decision_id, 180) || null,
    related_organization_ids: unique(input.related_organization_ids, 180),
    related_resource_id: clean(input.related_resource_id, 180) || null,
    related_program_id: clean(input.related_program_id, 180) || null,
    indigenous_relevance: clean(input.indigenous_relevance, 100) || "not_assessed",
    provenance,
    last_reviewed: isoDate(input.last_reviewed) || null,
    proposition_character_count: proposition.length,
    long_source_text_stored: false,
    automatic_truth_determination: false,
    mutation_authority: false,
    publication_authority: false,
  })
}

export function normalizePalantirClaimRelationship(input = {}, claims = []) {
  const relationshipType = clean(input.relationship_type, 80)
  const fromClaimId = clean(input.from_claim_id, 180)
  const toClaimId = clean(input.to_claim_id, 180)
  if (!RELATIONSHIP_TYPES.has(relationshipType) || !fromClaimId || !toClaimId || fromClaimId === toClaimId) throw new Error("palantir_claim_relationship_invalid")
  const known = new Set(claims.map(item => item.claim_id || item))
  if (known.size && (!known.has(fromClaimId) || !known.has(toClaimId))) throw new Error("palantir_claim_relationship_unknown_claim")
  const materialBasis = clean(input.material_basis, 500) || null
  const reviewedBy = clean(input.reviewed_by, 120) || null
  const scopeAligned = input.scope_aligned === true || input.same_scope_confirmed === true
  const timeAligned = input.time_aligned === true || input.comparable_time_period_confirmed === true
  const conflictLike = ["contradicts", "narrows", "qualifies", "supersedes"].includes(relationshipType)
  const weakKeywordOnly = input.weak_keyword_only === true
  let reviewState = REVIEW_STATES.has(input.review_state) ? input.review_state : "owner_review"
  if (weakKeywordOnly) reviewState = "rejected"
  if (reviewState === "confirmed" && (!reviewedBy || !materialBasis || (conflictLike && (!scopeAligned || !timeAligned)))) reviewState = "owner_review"
  const resolution = RESOLUTIONS.has(input.resolution) ? input.resolution : "unresolved"
  return Object.freeze({
    schema_version: "palantir-claim-relationship-v1",
    relationship_id: clean(input.relationship_id, 180) || `claim-relationship:${digest({ fromClaimId, toClaimId, relationshipType })}`,
    from_claim_id: fromClaimId,
    to_claim_id: toClaimId,
    relationship_type: relationshipType,
    material_basis: materialBasis,
    same_scope_confirmed: scopeAligned,
    comparable_time_period_confirmed: timeAligned,
    review_state: reviewState,
    reviewed_by: reviewedBy,
    reviewed_at: isoDate(input.reviewed_at) || null,
    resolution,
    resolution_date: isoDate(input.resolution_date) || null,
    resolution_rationale: clean(input.resolution_rationale, 500) || null,
    weak_keyword_relationship: weakKeywordOnly,
    automatic_contradiction: false,
    owner_review_required: reviewState === "owner_review" || (relationshipType === "contradicts" && resolution === "unresolved"),
    mutation_authority: false,
    publication_authority: false,
  })
}

export function resolvePalantirClaimStatuses(claims = [], relationships = []) {
  const normalizedClaims = claims.map(normalizePalantirClaim)
  const statuses = new Map(normalizedClaims.map(claim => [claim.claim_id, claim.claim_status]))
  for (const raw of relationships) {
    const relation = normalizePalantirClaimRelationship(raw, normalizedClaims)
    if (relation.review_state !== "confirmed") continue
    if (["supports", "corroborates", "independently_verifies", "implementation_evidence_for", "outcome_evidence_for"].includes(relation.relationship_type)) statuses.set(relation.to_claim_id, "corroborated")
    if (["narrows", "qualifies"].includes(relation.relationship_type)) statuses.set(relation.to_claim_id, "partially_supported")
    if (relation.relationship_type === "supersedes") statuses.set(relation.to_claim_id, "superseded")
    if (relation.relationship_type === "contradicts") {
      if (relation.resolution === "resolved_in_favor_of_from") { statuses.set(relation.to_claim_id, "contradicted"); statuses.set(relation.from_claim_id, "corroborated") }
      else if (relation.resolution === "resolved_in_favor_of_to") { statuses.set(relation.from_claim_id, "contradicted"); statuses.set(relation.to_claim_id, "corroborated") }
      else { statuses.set(relation.from_claim_id, "disputed"); statuses.set(relation.to_claim_id, "disputed") }
    }
  }
  return Object.freeze(Object.fromEntries(statuses))
}

export function buildPalantirClaimLedger(rawClaims = [], rawRelationships = [], { ledgerId = "palantir:claims", generatedAt = new Date().toISOString() } = {}) {
  const claims = rawClaims.map(normalizePalantirClaim)
  if (new Set(claims.map(item => item.claim_id)).size !== claims.length) throw new Error("palantir_claim_duplicate_id")
  const relationships = rawRelationships.map(item => normalizePalantirClaimRelationship(item, claims))
  if (new Set(relationships.map(item => item.relationship_id)).size !== relationships.length) throw new Error("palantir_claim_duplicate_relationship")
  const statuses = resolvePalantirClaimStatuses(claims, relationships)
  const resolvedClaims = claims.map(claim => Object.freeze({ ...claim, claim_status: statuses[claim.claim_id] }))
  return Object.freeze({
    schema_version: "palantir-claim-ledger-v1",
    ledger_id: clean(ledgerId, 180),
    generated_at: new Date(generatedAt).toISOString(),
    claims: resolvedClaims,
    relationships,
    counts: Object.freeze({
      claims: resolvedClaims.length,
      source_documents: new Set(resolvedClaims.map(item => item.source_document_id)).size,
      claims_with_precise_locator: resolvedClaims.filter(item => Object.values(item.provenance.locator).some(Boolean)).length,
      institutional_self_reports: resolvedClaims.filter(item => item.verification_state === "institution_self_report").length,
      independent_follow_up: resolvedClaims.filter(item => item.verification_state === "independent_follow_up").length,
      relationships: relationships.filter(item => item.review_state === "confirmed").length,
      contradictions: relationships.filter(item => item.relationship_type === "contradicts" && item.review_state === "confirmed").length,
      unresolved_conflicts: relationships.filter(item => item.relationship_type === "contradicts" && item.review_state === "confirmed" && item.resolution === "unresolved").length,
      owner_review_items: relationships.filter(item => item.owner_review_required).length,
    }),
    historical_claims_preserved: true,
    mutation_authority: false,
    publication_authority: false,
  })
}

export function buildPalantirClaimTimeline(ledger, { canonicalEventId = null, recommendationId = null } = {}) {
  if (ledger?.schema_version !== "palantir-claim-ledger-v1") throw new Error("palantir_claim_ledger_invalid")
  const claims = ledger.claims.filter(claim => (!canonicalEventId || claim.canonical_event_id === canonicalEventId) && (!recommendationId || claim.related_recommendation_id === recommendationId)).sort((left, right) => String(left.claim_date || left.provenance.publication_date || "9999").localeCompare(String(right.claim_date || right.provenance.publication_date || "9999")) || left.claim_id.localeCompare(right.claim_id))
  const ids = new Set(claims.map(item => item.claim_id))
  const relationships = ledger.relationships.filter(item => ids.has(item.from_claim_id) && ids.has(item.to_claim_id))
  const parts = claims.map(claim => `${claim.claim_date || "Undated"}: ${claim.claimant} — ${claim.normalized_proposition}`)
  return Object.freeze({ schema_version: "palantir-claim-timeline-v1", canonical_event_id: canonicalEventId, recommendation_id: recommendationId, claims, relationships, summary: parts.join(" "), unresolved_conflicts: relationships.filter(item => item.relationship_type === "contradicts" && item.resolution === "unresolved").length, historical_claims_preserved: true })
}

export function claimsFromPalantirRecommendation(recommendation = {}) {
  const base = { canonical_event_id: recommendation.related_event_id, jurisdiction: recommendation.jurisdiction, primary_domain: recommendation.primary_domain, secondary_domains: recommendation.secondary_domains, related_recommendation_id: recommendation.recommendation_id, last_reviewed: recommendation.last_reviewed }
  const sourceDocumentId = clean(recommendation.source_document_id || recommendation.recommendation_id, 180)
  const claims = [normalizePalantirClaim({ ...base, claim_id: `claim:${recommendation.recommendation_id}:proposition`, source_document_id: sourceDocumentId, claimant: recommendation.issuing_organization || recommendation.source_report, claim_type: "recommendation", normalized_proposition: recommendation.recommendation_text, claim_date: recommendation.recommendation_date, source_url: recommendation.source_url, source_family: "recommendation_response_trackers", source_role: "official_primary", recommendation_id: recommendation.recommendation_id })]
  const relationships = []
  for (const response of recommendation.responses || []) {
    const responseClaim = normalizePalantirClaim({ ...base, source_document_id: response.response_id, claimant: response.responder_organization, claim_type: response.claimed_action ? "claimed_action" : "response", normalized_proposition: response.claimed_action || response.response_text || response.response_status, claim_date: response.response_date, source_url: response.source_url, source_family: "recommendation_response_trackers", source_role: "asserting_institution" })
    claims.push(responseClaim)
    relationships.push({ from_claim_id: responseClaim.claim_id, to_claim_id: claims[0].claim_id, relationship_type: "institutional_response_to", material_basis: "The response record is explicitly linked to the recommendation.", reviewed_by: "deterministic_recommendation_binding", review_state: "confirmed", scope_aligned: true, time_aligned: true })
  }
  for (const evidence of recommendation.implementation_evidence || []) {
    const evidenceClaim = normalizePalantirClaim({ ...base, source_document_id: evidence.evidence_id, claimant: evidence.issuing_organization || "Independent follow-up source", claim_type: "independent_implementation_evidence", normalized_proposition: evidence.summary, claim_date: evidence.date, source_url: evidence.source_url, source_family: "recommendation_response_trackers", source_role: evidence.independent === false ? "asserting_institution" : "independent_oversight" })
    claims.push(evidenceClaim)
    relationships.push({ from_claim_id: evidenceClaim.claim_id, to_claim_id: claims[0].claim_id, relationship_type: "implementation_evidence_for", material_basis: "The reviewed evidence record is explicitly bound to the recommendation.", reviewed_by: "deterministic_recommendation_binding", review_state: "confirmed", scope_aligned: true, time_aligned: true })
  }
  for (const evidence of recommendation.outcome_evidence || []) {
    const outcomeClaim = normalizePalantirClaim({ ...base, source_document_id: evidence.evidence_id, claimant: evidence.issuing_organization || "Outcome evidence source", claim_type: "measured_outcome", normalized_proposition: evidence.summary, claim_date: evidence.date, source_url: evidence.source_url, source_family: "recommendation_response_trackers", source_role: evidence.independent === false ? "asserting_institution" : "independent_oversight" })
    claims.push(outcomeClaim)
    relationships.push({ from_claim_id: outcomeClaim.claim_id, to_claim_id: claims[0].claim_id, relationship_type: "outcome_evidence_for", material_basis: "The reviewed outcome evidence is explicitly bound to the recommendation.", reviewed_by: "deterministic_recommendation_binding", review_state: "confirmed", scope_aligned: true, time_aligned: true })
  }
  return Object.freeze({ claims, relationships })
}

export function normalizePalantirLegalClaim(input = {}) {
  const legalTypes = new Set(["allegation", "formal_finding", "court_tribunal_finding", "legal_procedural_status", "settlement_position", "measured_outcome"])
  if (!legalTypes.has(input.claim_type)) throw new Error("palantir_legal_claim_type_invalid")
  const claim = normalizePalantirClaim({ ...input, primary_domain: input.primary_domain || "courts_legal", source_family: input.source_family || "courts" })
  return Object.freeze({ ...claim, allegation_is_judicial_finding: false, procedural_status_establishes_merits: false, settlement_is_admission: false })
}

export function applyPalantirMilestoneDocument({ milestone, priorLedger = null, documentClaims = [], relationships = [], generatedAt = new Date().toISOString() } = {}) {
  if (milestone?.schema_version !== "palantir-milestone-v1" || !["document_found", "changed", "owner_review"].includes(milestone.current_status)) throw new Error("palantir_claim_milestone_document_invalid")
  const priorClaims = priorLedger?.schema_version === "palantir-claim-ledger-v1" ? priorLedger.claims : []
  const priorRelationships = priorLedger?.schema_version === "palantir-claim-ledger-v1" ? priorLedger.relationships : []
  const linkedClaims = documentClaims.map(item => normalizePalantirClaim({ ...item, related_milestone_id: milestone.milestone_id, canonical_event_id: item.canonical_event_id || milestone.matter_id }))
  const claimsById = new Map(priorClaims.map(item => [item.claim_id, item]))
  for (const claim of linkedClaims) claimsById.set(claim.claim_id, claim)
  const relationsById = new Map(priorRelationships.map(item => [item.relationship_id, item]))
  for (const relation of relationships) { const normalized = normalizePalantirClaimRelationship(relation, [...claimsById.values()]); relationsById.set(normalized.relationship_id, normalized) }
  const ledger = buildPalantirClaimLedger([...claimsById.values()], [...relationsById.values()], { ledgerId: priorLedger?.ledger_id || `palantir:claims:${milestone.matter_id || milestone.milestone_id}`, generatedAt })
  const changes = priorLedger ? diffPalantirClaimLedgers(priorLedger, ledger) : { schema_version: "palantir-claim-change-v1", checked: ledger.claims.length, changes: linkedClaims.map(item => ({ claim_id: item.claim_id, change_type: "new_claim", owner_review_required: true })), material_changes: linkedClaims.length, owner_review_items: linkedClaims.length }
  return Object.freeze({ schema_version: "palantir-milestone-claim-ingest-v1", milestone_id: milestone.milestone_id, retrieval_status: "expected_document_located", accountability_status: "claims_require_review", ledger, changes, milestone_document_found_is_successful_implementation: false, automatic_publication: false, mutation_authority: false })
}

export function projectPalantirClaimGraph(ledger) {
  if (ledger?.schema_version !== "palantir-claim-ledger-v1") throw new Error("palantir_claim_ledger_invalid")
  const documentIds = new Set(ledger.claims.map(item => item.source_document_id))
  const institutionIds = new Set(ledger.claims.map(item => item.claimant_organization_id).filter(Boolean))
  const eventIds = new Set(ledger.claims.map(item => item.canonical_event_id).filter(Boolean))
  const nodes = [
    ...ledger.claims.map(item => ({ node_id: item.claim_id, node_type: "claim" })),
    ...[...documentIds].map(node_id => ({ node_id, node_type: "document" })),
    ...[...institutionIds].map(node_id => ({ node_id, node_type: "institution" })),
    ...[...eventIds].map(node_id => ({ node_id, node_type: "event" })),
  ]
  const edges = [
    ...ledger.claims.map(item => ({ from: item.source_document_id, to: item.claim_id, edge_type: "contains_claim" })),
    ...ledger.claims.filter(item => item.claimant_organization_id).map(item => ({ from: item.claimant_organization_id, to: item.claim_id, edge_type: "asserted_claim" })),
    ...ledger.claims.filter(item => item.canonical_event_id).map(item => ({ from: item.claim_id, to: item.canonical_event_id, edge_type: "concerns_event" })),
    ...ledger.relationships.filter(item => item.review_state === "confirmed").map(item => ({ from: item.from_claim_id, to: item.to_claim_id, edge_type: item.relationship_type })),
  ]
  return Object.freeze({ schema_version: "palantir-claim-graph-projection-v1", nodes, edges, graph_database_required: false, reviewed_relationships_only: true })
}

export function routePalantirClaim(claim, { relationshipReviewComplete = false } = {}) {
  const item = normalizePalantirClaim(claim)
  const routes = new Set(["owner_intelligence"])
  if (item.related_resource_id && ["service_availability_claim", "funding_commitment"].includes(item.claim_type) && item.provenance.source_role === "official_primary") routes.add("shared_resource_candidate")
  if (item.indigenous_relevance === "verified_source_supported" && relationshipReviewComplete) routes.add("miller_north_evidence_candidate")
  return Object.freeze({ claim_id: item.claim_id, routes: [...routes], miller_public_allowed: false, resource_verification_required: routes.has("shared_resource_candidate"), miller_north_publication_allowed: false, owner_review_required: item.public_classification !== "public_source_fact" || routes.has("miller_north_evidence_candidate"), automatic_publication: false, mutation_authority: false })
}

export function diffPalantirClaimLedgers(previous = {}, current = {}) {
  const beforeClaims = new Map((previous.claims || []).map(item => [item.claim_id, normalizePalantirClaim(item)]))
  const afterClaims = new Map((current.claims || []).map(item => [item.claim_id, normalizePalantirClaim(item)]))
  const changes = []
  for (const [claimId, claim] of afterClaims) {
    const prior = beforeClaims.get(claimId)
    if (!prior) { changes.push({ claim_id: claimId, change_type: "new_claim", owner_review_required: claim.verification_state !== "direct_official_source" }); continue }
    for (const field of ["normalized_proposition", "claim_value", "claim_type", "claim_status", "verification_state", "applicable_time_period", "related_recommendation_id", "related_milestone_id", "related_legal_decision_id"]) {
      if (JSON.stringify(prior[field]) !== JSON.stringify(claim[field])) changes.push({ claim_id: claimId, change_type: field === "normalized_proposition" ? "claim_position_changed" : `${field}_changed`, owner_review_required: true })
    }
  }
  for (const claimId of beforeClaims.keys()) if (!afterClaims.has(claimId)) changes.push({ claim_id: claimId, change_type: "claim_missing_from_source", owner_review_required: true })
  const beforeRelations = new Set((previous.relationships || []).map(item => item.relationship_id))
  for (const relationship of current.relationships || []) if (!beforeRelations.has(relationship.relationship_id) && relationship.review_state !== "rejected") changes.push({ claim_id: relationship.from_claim_id, change_type: relationship.relationship_type === "contradicts" ? "new_contradiction" : "new_claim_relationship", relationship_id: relationship.relationship_id, owner_review_required: relationship.owner_review_required })
  return Object.freeze({ schema_version: "palantir-claim-change-v1", checked: afterClaims.size, changes, material_changes: changes.length, owner_review_items: changes.filter(item => item.owner_review_required).length, wording_only_changes_ignored: true, review_date_changes_ignored: true, historical_claims_preserved: true, mutation_authority: false, publication_authority: false })
}

export function buildPalantirClaimOwnerSummary(ledger) {
  if (ledger?.schema_version !== "palantir-claim-ledger-v1") throw new Error("palantir_claim_ledger_invalid")
  const unresolved = ledger.relationships.filter(item => item.owner_review_required)
  const independentClaimIds = new Set(ledger.claims.filter(item => item.verification_state === "independent_follow_up" || item.verification_state === "formal_finding").map(item => item.claim_id))
  const unverifiedInstitutional = ledger.claims.filter(item => item.verification_state === "institution_self_report" && !ledger.relationships.some(relation => relation.to_claim_id === item.claim_id && independentClaimIds.has(relation.from_claim_id) && relation.review_state === "confirmed"))
  const unresolvedGaps = ledger.claims.filter(item => ["partially_supported", "disputed", "contradicted", "unresolved"].includes(item.claim_status) || unverifiedInstitutional.some(claim => claim.claim_id === item.claim_id))
  return Object.freeze({ schema_version: "palantir-claim-owner-summary-v1", claims: ledger.claims.length, provenance_complete: ledger.claims.filter(item => item.provenance.url || item.provenance.citation).length, precise_locators: ledger.counts.claims_with_precise_locator, contradictions: ledger.counts.contradictions, unresolved_conflicts: ledger.counts.unresolved_conflicts, unresolved_claim_gaps: unresolvedGaps.map(item => ({ claim_id: item.claim_id, claimant: item.claimant, status: item.claim_status, source: item.provenance.url || item.provenance.citation })), institutional_claims_without_independent_evidence: unverifiedInstitutional.map(item => ({ claim_id: item.claim_id, claimant: item.claimant, source: item.provenance.url || item.provenance.citation })), owner_review: unresolved.map(item => ({ relationship_id: item.relationship_id, reason: item.relationship_type === "contradicts" ? "unresolved_or_ambiguous_contradiction" : "relationship_requires_review" })), raw_source_bodies_exposed: false, mutation_authority: false, publication_authority: false })
}

export function normalizePalantirClaimBatch(items = []) {
  const records = []
  const ownerReview = []
  const seen = new Map()
  for (const item of items.slice(0, 100)) {
    try {
      const claim = normalizePalantirClaim(item)
      const duplicate = seen.get(claim.claim_id)
      if (duplicate) { ownerReview.push({ claim_id: claim.claim_id, reason: "duplicate_claim", same_as: duplicate }); continue }
      seen.set(claim.claim_id, claim.claim_id)
      records.push(claim)
    } catch {
      ownerReview.push({ claim_id: clean(item.claim_id, 180) || "unidentified", reason: "claim_requires_human_normalization" })
    }
  }
  return Object.freeze({ checked: Math.min(items.length, 100), valid: records.length, duplicates_suppressed: ownerReview.filter(item => item.reason === "duplicate_claim").length, records, owner_review: ownerReview, truth_determinations: 0, publication_actions: 0, mutation_authority: false })
}
