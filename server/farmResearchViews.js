const compact = value => String(value ?? "").replace(/\s+/g, " ").trim()

export const FARM_RESEARCH_DOMAINS = new Set([
  "miller_addictions",
  "miller_north_indigenous_healthcare",
])

export const FARM_FINDING_TYPES = new Set([
  "major_new_connection",
  "verified_service_implementation",
  "repeated_recommendation",
  "prolonged_partial_implementation",
  "new_resource_candidate",
  "legal_or_policy_change",
  "funding_to_service_match",
  "implementation_gap",
  "important_new_source",
  "architecture_learning",
])

export const LEGAL_GOVERNMENT_RELATIONSHIP_TYPES = new Set([
  "governed_by",
  "funded_by",
  "created_by",
  "expanded_by",
  "regulated_by",
  "required_by",
  "recommended_by",
  "responds_to",
  "implements",
  "partially_implements",
  "supersedes",
  "amends",
  "operationalizes",
  "evaluated_by",
  "audited_by",
  "linked_to_resource",
  "linked_to_incident",
  "linked_to_commitment",
])

export const SOURCE_AUTHORITY_CLASSES = new Set([
  "official_primary",
  "indigenous_government_or_organization",
  "independent_oversight",
  "authoritative_registry",
])

const FORBIDDEN_PRIVATE_KEYS = /^(patient_name|complainant_name|deceased_name|witness_name|private_address|personal_email|private_phone|medical_record)$/i

export function assertResearchPrivacy(value, path = "record") {
  if (Array.isArray(value)) return value.forEach((item, index) => assertResearchPrivacy(item, `${path}[${index}]`))
  if (!value || typeof value !== "object") return true
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_PRIVATE_KEYS.test(key)) throw new Error(`farm_research_private_field:${path}.${key}`)
    assertResearchPrivacy(nested, `${path}.${key}`)
  }
  return true
}

const points = (condition, score) => condition ? score : 0

export function scoreResearchFinding(finding = {}) {
  assertResearchPrivacy(finding)
  if (!FARM_FINDING_TYPES.has(finding.finding_type)) throw new Error("farm_research_finding_type_invalid")
  const independentSources = Math.max(0, Number(finding.independent_source_count) || 0)
  const linkedChains = Math.max(0, Number(finding.linked_chain_count) || 0)
  const reach = { local: 2, regional: 4, provincial: 8, federal: 10, interjurisdictional: 10 }[finding.geographic_reach] || 0
  const factors = {
    official_primary_source: points(finding.official_primary_source, 20),
    independent_sources: Math.min(independentSources, 2) * 5,
    linked_chains: Math.min(linkedChains, 3) * 4,
    repeated_recommendation: points(finding.repeated_recommendation, 12),
    prolonged_partial_implementation: points(finding.prolonged_partial_implementation, 12),
    real_world_service_impact: points(finding.real_world_service_impact, 12),
    new_resource_discovery: points(finding.new_resource_discovery, 10),
    legal_or_regulatory_significance: points(finding.legal_or_regulatory_significance, 8),
    geographic_reach: reach,
    owner_review_attention: points(finding.owner_review_flag, 6),
  }
  const priority_score = Math.min(100, Object.values(factors).reduce((sum, value) => sum + value, 0))
  const priority_band = priority_score >= 70 ? "review_first" : priority_score >= 45 ? "review_next" : priority_score >= 25 ? "reference" : "low_priority"
  return {
    finding_id: compact(finding.finding_id),
    finding_type: finding.finding_type,
    priority_score,
    priority_band,
    factors,
    owner_review_flag: Boolean(finding.owner_review_flag),
    scoring_notice: "Priority only; this is not an evidence, effectiveness, compliance, or reputational score.",
  }
}

export function rankOwnerFindings(findings = []) {
  const ids = new Set()
  return findings.map(finding => {
    if (!/^frf_[a-z0-9_]{3,100}$/.test(finding.finding_id || "") || ids.has(finding.finding_id)) throw new Error("farm_research_finding_id_invalid")
    ids.add(finding.finding_id)
    return { ...finding, significance: scoreResearchFinding(finding) }
  }).sort((left, right) => right.significance.priority_score - left.significance.priority_score || left.finding_id.localeCompare(right.finding_id))
}

export function validateOfficialSourceRegistry(registry = {}) {
  assertResearchPrivacy(registry)
  if (registry.publication_scope !== "private_research_registry" || registry.schema_version !== "farm-open-government-source-registry-v1") throw new Error("farm_source_registry_scope_invalid")
  const ids = new Set()
  for (const source of registry.sources || []) {
    if (!/^fogs_[a-z0-9_]{3,100}$/.test(source.source_family_id || "") || ids.has(source.source_family_id)) throw new Error("farm_source_registry_id_invalid")
    ids.add(source.source_family_id)
    if (!SOURCE_AUTHORITY_CLASSES.has(source.authority_class)) throw new Error("farm_source_registry_authority_invalid")
    if (!/^https:\/\//.test(source.base_url || "") || !Array.isArray(source.expected_document_classes) || !source.expected_document_classes.length) throw new Error("farm_source_registry_source_invalid")
    if (!Array.isArray(source.usefulness) || !source.usefulness.every(domain => FARM_RESEARCH_DOMAINS.has(domain))) throw new Error("farm_source_registry_domain_invalid")
  }
  return { sources: ids.size, miller: registry.sources.filter(item => item.usefulness.includes("miller_addictions")).length, miller_north: registry.sources.filter(item => item.usefulness.includes("miller_north_indigenous_healthcare")).length }
}

const candidateFor = (verification, candidates) => candidates.find(candidate => compact(candidate.name).toLowerCase() === compact(verification.service_name).toLowerCase()) || null

export function buildResourceBackstoryProjection(verification, candidates = []) {
  assertResearchPrivacy(verification)
  const candidate = candidateFor(verification, candidates)
  const evidence = Array.isArray(verification.evidence) ? verification.evidence : []
  if (verification.publication_state === "approved_for_publication") throw new Error("farm_backstory_publication_gate")
  if (!evidence.length || evidence.some(item => !/^https:\/\//.test(item.source_url || ""))) throw new Error("farm_backstory_evidence_missing")
  const resourceIdentity = verification.miller_match?.curated_resource_id
    ? { state: verification.resource_match_outcome, curated_resource_id: verification.miller_match.curated_resource_id, candidate_id: null }
    : { state: verification.resource_match_outcome, curated_resource_id: null, candidate_id: candidate?.sourceRecordId || null }
  return {
    schema_version: "farm-resource-backstory-projection-v1",
    research_domain: "miller_addictions",
    publication_scope: "private_admin_only",
    verification_id: verification.verification_id,
    resource_identity: resourceIdentity,
    client_projection: {
      name: verification.service_name,
      access_status: verification.verification_status === "operationally_verified" ? "operational_evidence_available" : "owner_review_required",
      operator: candidate?.operator || null,
      location: candidate?.location || null,
      contact: candidate?.contact || null,
      eligibility: candidate?.eligibility || null,
      intake: candidate?.intake || null,
    },
    research_projection: {
      policy_instrument_candidate_id: verification.policy_instrument_candidate_id || null,
      commitment_candidate_id: verification.commitment_candidate_id || null,
      responsible_organizations: verification.responsible_organizations || [],
      service_change_kind: verification.service_change_kind,
      funding: {
        announced_amount_cad: verification.funding_amount_cad ?? null,
        quantity: verification.promised_quantity ?? null,
        unit: verification.promised_unit ?? null,
        geography: verification.promised_geography || null,
        timeline: verification.expected_timeline || null,
      },
      authoritative_timeline: evidence.map(item => ({ role: item.evidence_role, organization: item.source_organization, source_url: item.source_url, summary: item.evidence_summary })),
    },
    accountability_projection: {
      policy_claim: verification.policy_claim,
      verification_status: verification.verification_status,
      implementation_depth: verification.implementation_depth || [],
      last_evidenced_date: verification.status_last_evidenced_date || null,
      conflict_notes: verification.conflict_notes || null,
      owner_review_flag: Boolean(verification.owner_review_flag || candidate?.review_state === "owner_review_required"),
      owner_review_reason: verification.owner_review_reason || candidate?.owner_review_reason || null,
    },
  }
}

export function buildPolicyResourceEvidencePath(verification, candidates = []) {
  const projection = buildResourceBackstoryProjection(verification, candidates)
  const policyEvidence = verification.evidence.filter(item => ["announcement", "funding", "operational"].includes(item.evidence_role)).map(item => item.source_url)
  const steps = [
    {
      step: "policy_or_commitment",
      object_ids: [verification.policy_instrument_candidate_id, verification.commitment_candidate_id].filter(Boolean),
      claim: verification.policy_claim,
      evidence_source_urls: policyEvidence.length ? policyEvidence : verification.evidence.map(item => item.source_url),
    },
    ...verification.evidence.map(item => ({ step: item.evidence_role, organization: item.source_organization, claim: item.evidence_summary, evidence_source_urls: [item.source_url] })),
    {
      step: "resource_identity",
      object_ids: [projection.resource_identity.curated_resource_id, projection.resource_identity.candidate_id].filter(Boolean),
      claim: `${verification.resource_match_outcome}: ${verification.service_name}`,
      evidence_source_urls: verification.evidence.map(item => item.source_url),
    },
  ]
  if (steps.some(step => !step.claim || !step.evidence_source_urls.length)) throw new Error("farm_traceability_step_evidence_missing")
  return { verification_id: verification.verification_id, service_name: verification.service_name, verification_status: verification.verification_status, steps, owner_review_flag: projection.accountability_projection.owner_review_flag }
}

const bullets = values => values.map(value => `- ${value}`).join("\n")

export function generateOwnerSummary(run = {}) {
  assertResearchPrivacy(run)
  if (run.publication_scope !== "private_owner_review" || !run.title) throw new Error("farm_owner_summary_scope_invalid")
  return `# Owner Summary — ${run.title}\n\n## What changed\n\n${bullets(run.what_changed || [])}\n\n## Why it matters\n\n${compact(run.why_it_matters)}\n\n## Strongest evidence\n\n${bullets(run.strongest_evidence || [])}\n\n## Uncertainty / caution\n\n${bullets(run.uncertainty || [])}\n\n## Recommended next move\n\n${compact(run.recommended_next_move)}\n\n## Key metrics\n\n${bullets(Object.entries(run.key_metrics || {}).map(([key, value]) => `${key.replaceAll("_", " ")}: ${value}`))}\n`
}

export function generateResearchBrief(run = {}) {
  assertResearchPrivacy(run)
  if (run.publication_scope !== "private_owner_review" || !run.title) throw new Error("farm_research_brief_scope_invalid")
  return `# Research Brief — ${run.title}\n\n## Executive summary\n\n${compact(run.executive_summary)}\n\n## Scope\n\n${compact(run.scope)}\n\n## Key findings\n\n${bullets(run.key_findings || [])}\n\n## Evidence highlights\n\n${bullets(run.evidence_highlights || [])}\n\n## Policy/service relationships\n\n${bullets(run.policy_service_relationships || [])}\n\n## Implementation status\n\n${compact(run.implementation_status)}\n\n## Unresolved questions\n\n${bullets(run.unresolved_questions || [])}\n\n## Method\n\n${compact(run.method)}\n\n## Sources\n\n${bullets(run.sources || [])}\n\n## Limitations\n\n${compact(run.limitations)}\n`
}
