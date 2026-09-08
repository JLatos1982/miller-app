export const MILLER_NORTH_DOMAINS = Object.freeze([
  "healthcare",
  "policing_custody_corrections",
  "government_services_funding",
  "child_welfare_youth_services",
  "housing_homelessness",
  "human_rights_public_services",
  "transportation_access",
  "education_exploratory",
])

export const MILLER_NORTH_EVIDENCE_STATES = Object.freeze([
  "explicit_racism_finding",
  "explicit_discrimination_finding",
  "indigenous_specific_systemic_inequity",
  "credible_allegation",
  "institutional_acknowledgement",
  "formal_investigation",
  "no_discrimination_finding",
  "insufficient_evidence",
])

export const MILLER_NORTH_LIVE_ACTION_STATES = Object.freeze([
  "new_lead",
  "corroborated_public_report",
  "institutional_acknowledgement",
  "investigation_underway",
  "formal_process_scheduled",
  "finding_issued",
  "recommendation_issued",
  "response_pending",
  "implementation_monitoring",
  "closed_no_further_public_trail",
])

const DOMAINS = new Set(MILLER_NORTH_DOMAINS)
const EVIDENCE_STATES = new Set(MILLER_NORTH_EVIDENCE_STATES)
const ACTION_STATES = new Set(MILLER_NORTH_LIVE_ACTION_STATES)
const clean = (value, limit = 500) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit)
const CROSS_LANE_ROUTES = new Set(["primary_miller_north_record", "secondary_miller_north_evidence_upgrade", "accountability_watch_update", "live_monitoring_candidate", "legal_context_record", "original_miller_context", "shared_support_resource_candidate", "private_owner_review", "irrelevant"])

export function validateMillerNorthDomainAssessment(assessment = {}) {
  const errors = []
  if (!DOMAINS.has(assessment.primary_domain)) errors.push("primary_domain_invalid")
  if (!EVIDENCE_STATES.has(assessment.evidence_state)) errors.push("evidence_state_invalid")
  for (const field of ["indigenous_relevance", "public_body_relevance", "discrimination_evidence", "systemic_inequity", "harm", "formal_finding", "accountability_significance"]) {
    if (!["established", "supported", "alleged", "not_established", "not_applicable", "uncertain"].includes(assessment[field])) errors.push(`${field}_invalid`)
  }
  if (!["official", "indigenous_led", "quasi_official", "court_or_tribunal", "institutional", "reported_account"].includes(assessment.source_role)) errors.push("source_role_invalid")
  if (assessment.publication_candidate === true && !["established", "supported"].includes(assessment.indigenous_relevance)) errors.push("publication_requires_supported_indigenous_relevance")
  if (assessment.publication_candidate === true && !["established", "supported"].includes(assessment.public_body_relevance)) errors.push("publication_requires_public_body_relevance")
  if (assessment.evidence_state === "explicit_racism_finding" && assessment.formal_finding !== "established") errors.push("racism_finding_requires_formal_finding")
  if (assessment.evidence_state === "explicit_discrimination_finding" && assessment.formal_finding !== "established") errors.push("discrimination_finding_requires_formal_finding")
  return { valid: errors.length === 0, errors }
}

export function buildMillerNorthLiveCandidate(input = {}) {
  if (!ACTION_STATES.has(input.action_state)) throw new Error("miller_north_live_action_state_invalid")
  if (!DOMAINS.has(input.primary_domain)) throw new Error("miller_north_live_domain_invalid")
  const assessment = validateMillerNorthDomainAssessment(input.evidence || {})
  if (!assessment.valid) throw new Error(`miller_north_live_evidence_invalid:${assessment.errors.join(",")}`)
  const milestone = clean(input.next_public_milestone, 240) || null
  const expected = clean(input.expected_document, 160) || null
  const monitoring = clean(input.monitoring_source, 500) || null
  if (["formal_process_scheduled", "response_pending", "implementation_monitoring"].includes(input.action_state) && !(milestone && expected && monitoring)) throw new Error("miller_north_live_milestone_fields_required")
  return {
    schema_version: "miller-north-live-candidate-v2",
    canonical_id: clean(input.canonical_id, 160),
    title: clean(input.title, 180),
    primary_domain: input.primary_domain,
    secondary_domains: [...new Set((input.secondary_domains || []).filter(domain => DOMAINS.has(domain) && domain !== input.primary_domain))],
    action_state: input.action_state,
    established_summary: clean(input.established_summary, 700),
    allegation_summary: clean(input.allegation_summary, 500) || null,
    institution: clean(input.institution, 180),
    formal_process: clean(input.formal_process, 180) || null,
    next_public_milestone: milestone,
    expected_document: expected,
    monitoring_source: monitoring,
    accountable_body: clean(input.accountable_body, 180) || null,
    complaint_pathway: clean(input.complaint_pathway, 120) || null,
    legal_support_category: clean(input.legal_support_category, 120) || null,
    practical_support_category: clean(input.practical_support_category, 120) || null,
    next_research_action: clean(input.next_research_action, 240) || null,
    owner_review_priority: ["high", "normal", "milestone", "low"].includes(input.owner_review_priority) ? input.owner_review_priority : "normal",
    evidence: input.evidence,
    related_event_id: clean(input.related_event_id, 160) || null,
    related_watch_chain_id: clean(input.related_watch_chain_id, 160) || null,
    publication_authority: false,
    mutation_authority: false,
  }
}

export function buildMillerNorthCrossLaneRecord(input = {}) {
  if (!DOMAINS.has(input.primary_domain)) throw new Error("miller_north_cross_lane_primary_domain_invalid")
  const secondary = [...new Set((input.secondary_domains || []).filter(domain => DOMAINS.has(domain) && domain !== input.primary_domain))]
  const support = Array.isArray(input.domain_support) ? input.domain_support.map(item => ({
    domain: DOMAINS.has(item?.domain) ? item.domain : null,
    source_id: clean(item?.source_id, 160),
    source_url: /^https:\/\//.test(String(item?.source_url || "")) ? clean(item.source_url, 500) : null,
    basis: ["explicit_source", "reviewed_citation", "deterministic_canonical_match"].includes(item?.basis) ? item.basis : null,
    excerpt_reference: clean(item?.excerpt_reference, 180) || null,
  })).filter(item => item.domain && item.source_id && item.basis && (item.source_url || item.excerpt_reference)) : []
  const supportedDomains = new Set(support.map(item => item.domain))
  if (secondary.some(domain => !supportedDomains.has(domain))) throw new Error("miller_north_cross_lane_secondary_domain_requires_support")
  const routes = [...new Set((input.routing_outputs || []).filter(route => CROSS_LANE_ROUTES.has(route)))]
  if (!routes.length) throw new Error("miller_north_cross_lane_route_required")
  return {
    schema_version: "miller-north-cross-lane-record-v1",
    canonical_id: clean(input.canonical_id, 180),
    title: clean(input.title, 220),
    primary_domain: input.primary_domain,
    secondary_domains: secondary,
    domain_support: support,
    related_existing_event: clean(input.related_existing_event, 180) || null,
    related_watch_chain: clean(input.related_watch_chain, 180) || null,
    related_legal_context: [...new Set((input.related_legal_context || []).map(item => clean(item, 180)).filter(Boolean))].slice(0, 12),
    related_support_categories: [...new Set((input.related_support_categories || []).map(item => clean(item, 100)).filter(Boolean))].slice(0, 12),
    related_original_miller_categories: [...new Set((input.related_original_miller_categories || []).map(item => clean(item, 100)).filter(Boolean))].slice(0, 12),
    next_research_action: clean(input.next_research_action, 300) || null,
    routing_outputs: routes,
    owner_review_required: input.owner_review_required !== false,
    automatic_merge: false,
    publication_authority: false,
    mutation_authority: false,
  }
}

export function summarizeCrossDomainDiscoveries(records = []) {
  const valid = records.filter(record => record?.schema_version === "miller-north-cross-lane-record-v1")
  return {
    schema_version: "miller-north-cross-domain-summary-v1",
    records: valid.length,
    cross_domain_discoveries: valid.filter(record => record.secondary_domains.length > 0).length,
    secondary_domain_links: valid.reduce((sum, record) => sum + record.secondary_domains.length, 0),
    existing_events_strengthened: valid.filter(record => record.related_existing_event).length,
    watch_links: valid.filter(record => record.related_watch_chain).length,
    original_miller_routes: valid.filter(record => record.routing_outputs.includes("original_miller_context")).length,
    support_candidates: valid.filter(record => record.routing_outputs.includes("shared_support_resource_candidate")).length,
  }
}

const PATHWAY_RULES = Object.freeze([
  { id: "discrimination", terms: /discriminat|racis|stereotyp|cultural(?:ly)? unsafe/i, process: "human_rights_process", supports: ["human_rights", "indigenous_legal_services"] },
  { id: "professional_conduct", terms: /professional conduct|regulator|nurs|physician|consent/i, process: "professional_regulator_complaint", supports: ["patient_rights", "complaint_navigation"] },
  { id: "police_conduct", terms: /police|rcmp|custody|arrest|use of force|detention/i, process: "police_oversight_complaint", supports: ["indigenous_legal_services", "courtworker", "police_complaint_information"] },
  { id: "custody_death", terms: /death in custody|custody death/i, process: "coroner_inquest_and_police_oversight", supports: ["indigenous_legal_services", "victim_support"] },
  { id: "housing", terms: /housing|tenan|evict|shelter|homeless/i, process: "human_rights_or_tenancy_process", supports: ["tenancy", "housing", "human_rights"] },
  { id: "government_service", terms: /benefit|funding|public service|service access|jordan'?s principle/i, process: "appeal_ombuds_or_legal_navigation", supports: ["benefits_appeal", "ombuds", "indigenous_legal_services"] },
  { id: "child_welfare", terms: /child welfare|child protection|foster|youth service/i, process: "child_youth_advocate_or_legal_support", supports: ["child_youth_advocacy", "indigenous_legal_services"] },
])

export function suggestPublicAccountabilityPathways(record = {}) {
  const text = [record.title, record.established_summary, record.allegation_summary, record.primary_domain, ...(record.mechanism_tags || [])].filter(Boolean).join(" ")
  const matches = PATHWAY_RULES.filter(rule => rule.terms.test(text))
  return {
    label: "Related legal and advocacy resources",
    disclaimer: "These resources may help people understand complaint, human-rights or legal-support options. Miller North does not determine whether someone has a legal claim.",
    pathways: matches.map(match => ({ rule_id: match.id, process_category: match.process, support_categories: match.supports, owner_review_required: true })),
    automatic_publication: false,
  }
}

export function summarizeMillerNorthDomainYield(records = []) {
  const empty = () => ({ documents_checked: 0, relevant_candidates: 0, verified_records: 0, systemic_evidence: 0, watch_candidates: 0, live_incidents: 0, pathway_links: 0, rejected_noise: 0 })
  const domains = Object.fromEntries(MILLER_NORTH_DOMAINS.map(domain => [domain, empty()]))
  for (const record of records) {
    if (!domains[record.primary_domain]) continue
    const metrics = domains[record.primary_domain]
    for (const field of Object.keys(metrics)) metrics[field] += Math.max(0, Number(record[field] || 0))
  }
  return { schema_version: "miller-north-domain-yield-v1", domains, opaque_score: false }
}
