import taxonomy from "../src/data/palantir-workplace-safety-taxonomy-v1.json" with { type: "json" }

const ROLE_SET = new Set(taxonomy.evidence_roles)
const INDIGENOUS_SET = new Set(taxonomy.indigenous_relevance_states)
const DISCRIMINATION_SET = new Set(taxonomy.discrimination_states)
const PUBLIC_INSTITUTION_TYPES = new Set(["health_authority", "municipality", "provincial_ministry", "corrections_body", "police_service", "school_district", "crown_corporation", "public_agency"])
const clean = (value, limit = 500) => String(value ?? "").normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
const list = value => Array.isArray(value) ? value : value ? [value] : []

export function validatePalantirWorkplaceSafetyTaxonomy(value = taxonomy) {
  if (value?.schema_version !== "palantir-workplace-safety-taxonomy-v1" || value.primary_domain !== "public_safety") throw new Error("palantir_workplace_taxonomy_invalid")
  if (!value.explicit_indigenous_terms?.length || !value.mechanism_terms?.length || !value.evidence_roles?.length) throw new Error("palantir_workplace_taxonomy_incomplete")
  if (value.routing_boundaries?.indigenous_identity_inference !== false || value.routing_boundaries?.automatic_miller_north_publication !== false || value.routing_boundaries?.investigation_to_miller_public !== false) throw new Error("palantir_workplace_taxonomy_boundary_invalid")
  return { valid: true, evidence_roles: value.evidence_roles.length, mechanism_terms: value.mechanism_terms.length }
}

export function normalizePalantirWorkplaceFinding(input = {}) {
  const id = clean(input.canonical_finding_id, 180)
  const sourceUrl = clean(input.source_url, 500)
  const evidenceRole = clean(input.evidence_role, 100)
  const indigenousRelevance = clean(input.indigenous_relevance, 80) || "not_established"
  const discriminationState = clean(input.discrimination_state, 100) || "not_applicable"
  if (!id || !/^https:\/\//.test(sourceUrl) || !ROLE_SET.has(evidenceRole) || !INDIGENOUS_SET.has(indigenousRelevance) || !DISCRIMINATION_SET.has(discriminationState)) throw new Error("palantir_workplace_finding_invalid")
  if (indigenousRelevance !== "not_established" && !["explicit_source", "reviewed_citation"].includes(input.indigenous_evidence_basis)) throw new Error("palantir_workplace_indigenous_evidence_required")
  if (discriminationState !== "not_applicable" && discriminationState !== "no_discrimination_finding" && !["explicit_source", "reviewed_citation"].includes(input.discrimination_evidence_basis)) throw new Error("palantir_workplace_discrimination_evidence_required")
  const secondaryDomains = list(input.secondary_domains).map(item => typeof item === "string" ? item : item.domain).map(item => clean(item, 80)).filter(Boolean)
  return Object.freeze({
    schema_version: "palantir-workplace-safety-finding-v1",
    canonical_finding_id: id,
    title: clean(input.title, 180),
    source_url: sourceUrl,
    jurisdiction: clean(input.jurisdiction, 80),
    event_date: clean(input.event_date, 40) || null,
    decision_date: clean(input.decision_date, 40) || null,
    employer: clean(input.employer, 180) || null,
    employer_type: clean(input.employer_type, 80) || "private_employer",
    industry: clean(input.industry, 100) || null,
    evidence_role: evidenceRole,
    formal_finding: clean(input.formal_finding, 700) || null,
    violation: clean(input.violation, 500) || null,
    penalty: clean(input.penalty, 300) || null,
    corrective_action: clean(input.corrective_action, 500) || null,
    implementation_evidence: clean(input.implementation_evidence, 500) || null,
    indigenous_relevance: indigenousRelevance,
    indigenous_evidence_basis: clean(input.indigenous_evidence_basis, 80) || null,
    discrimination_state: discriminationState,
    discrimination_evidence_basis: clean(input.discrimination_evidence_basis, 80) || null,
    primary_domain: "public_safety",
    secondary_domains: [...new Set(secondaryDomains)],
    related_existing_event: clean(input.related_existing_event, 180) || null,
    owner_review_required: input.owner_review_required === true,
    privacy_class: "owner_private_metadata",
    mutation_authority: false,
    publication_authority: false,
  })
}

export function routePalantirWorkplaceFinding(finding) {
  if (finding?.schema_version !== "palantir-workplace-safety-finding-v1") throw new Error("palantir_workplace_finding_required")
  const routes = new Set(["owner_intelligence"])
  const publicInstitution = PUBLIC_INSTITUTION_TYPES.has(finding.employer_type)
  const explicitIndigenousPerson = finding.indigenous_relevance === "explicit_person_or_group"
  const discriminationMaterial = ["explicit_formal_finding", "credible_allegation_procedural_only", "mediated_without_merits_finding"].includes(finding.discrimination_state)
  if (publicInstitution && explicitIndigenousPerson && discriminationMaterial) routes.add("miller_north_evidence_candidate")
  if (!publicInstitution && finding.indigenous_relevance === "not_established") routes.add("future_project_candidate")
  return Object.freeze({
    routes: [...routes],
    miller_public_allowed: false,
    miller_north_publication_allowed: false,
    owner_review_required: routes.has("miller_north_evidence_candidate") || finding.owner_review_required,
    no_identity_inference: true,
  })
}

export function summarizePalantirWorkplaceYield({ sourcesChecked = 0, pagesChecked = 0, fullRecords = 0, findings = [], rejectedNoise = 0, duplicates = 0, technicalFailures = 0, comparableCycles = 1 } = {}) {
  const normalized = findings.map(item => item?.schema_version === "palantir-workplace-safety-finding-v1" ? item : normalizePalantirWorkplaceFinding(item))
  const crossDomain = normalized.filter(item => item.secondary_domains.length)
  return Object.freeze({
    sources_checked: sourcesChecked,
    records_pages_checked: pagesChecked,
    full_records_reviewed: fullRecords,
    useful_findings: normalized.length,
    formal_findings: normalized.filter(item => ["formal_investigation_finding", "administrative_penalty", "court_conviction_and_sentence", "human_rights_merits_finding"].includes(item.evidence_role)).length,
    indigenous_specific_findings: normalized.filter(item => item.indigenous_relevance === "explicit_person_or_group").length,
    cross_domain_discoveries: crossDomain.length,
    cross_domain_discovery_rate: normalized.length ? Number((crossDomain.length / normalized.length).toFixed(3)) : 0,
    owner_review_items: normalized.filter(item => routePalantirWorkplaceFinding(item).owner_review_required).length,
    duplicates,
    rejected_noise: rejectedNoise,
    technical_failures: technicalFailures,
    cadence_recommendation: comparableCycles >= 3 && normalized.length >= 6 ? "monthly_listener_pilot" : "occasional_research_domain",
    automatic_publications: 0,
  })
}
