import { createHash } from "node:crypto"

import { reconcileListenerDocument } from "./farmListenerFramework.js"

export const SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID = "samwise_public_records_intelligence"
export const SAMWISE_PUBLIC_RECORDS_VERSION = "samwise-public-records-intelligence-v1"
export const PALANTIR_DISPLAY_NAME = "Palantír"
export const PALANTIR_QUALIFIED_NAME = "Samwise Palantír"

export const SAMWISE_PUBLIC_RECORD_DOMAINS = Object.freeze([
  "healthcare",
  "policing",
  "corrections",
  "courts_legal",
  "human_rights",
  "government_services",
  "public_funding",
  "child_youth",
  "housing",
  "transportation",
  "education",
  "professional_regulation",
  "public_safety",
  "other_public_institution",
])

export const SAMWISE_INTELLIGENCE_STATES = Object.freeze([
  "discovered",
  "known",
  "changed",
  "corroborated",
  "formal_process",
  "formal_finding",
  "implementation_monitoring",
  "resolved_public_trail",
  "owner_review",
  "irrelevant",
])

export const SAMWISE_OUTPUT_ROUTES = Object.freeze([
  "miller_north_evidence_candidate",
  "miller_north_watch_candidate",
  "miller_north_live_candidate",
  "miller_resource_candidate",
  "shared_resource_candidate",
  "owner_intelligence",
  "future_project_candidate",
  "research_context_only",
  "irrelevant",
])

export const SAMWISE_SOURCE_FAMILIES = Object.freeze([
  "coroners_inquests",
  "fatality_inquiries",
  "healthcare_regulators",
  "professional_regulators",
  "courts",
  "human_rights_tribunals",
  "judicial_reviews",
  "police_oversight",
  "corrections_oversight",
  "child_youth_advocates",
  "ombuds_offices",
  "government_audits",
  "legislative_government_reports",
  "recommendation_response_trackers",
  "indigenous_led_organizations",
  "public_funding_programs",
  "administrative_appeals",
  "workplace_safety_enforcement",
  "institutional_statements",
])

const DOMAIN_SET = new Set(SAMWISE_PUBLIC_RECORD_DOMAINS)
const STATE_SET = new Set(SAMWISE_INTELLIGENCE_STATES)
const ROUTE_SET = new Set(SAMWISE_OUTPUT_ROUTES)
const SOURCE_FAMILY_SET = new Set(SAMWISE_SOURCE_FAMILIES)
const PUBLICATION_SENSITIVE_ROUTES = new Set(["miller_north_evidence_candidate", "miller_north_watch_candidate", "miller_north_live_candidate"])
const LEGACY_ROUTE_MAP = Object.freeze({ future_project: "future_project_candidate" })
const LEGACY_DOMAIN_MAP = Object.freeze({
  policing_custody_corrections: "policing",
  government_services_funding: "government_services",
  child_welfare_youth_services: "child_youth",
  housing_homelessness: "housing",
  human_rights_public_services: "human_rights",
  transportation_access: "transportation",
  education_exploratory: "education",
  legal: "courts_legal",
})
const LISTENER_SOURCE_FAMILY_MAP = Object.freeze({
  alberta_fatality_recommendation_responses: "recommendation_response_trackers",
  bc_coroners_inquests: "coroners_inquests",
  bc_human_rights_tribunal: "human_rights_tribunals",
  bc_human_rights_judicial_reviews: "judicial_reviews",
  alberta_human_rights_decisions: "human_rights_tribunals",
  bc_nursing_regulator_notices: "healthcare_regulators",
  bc_physician_regulator_case_summaries: "healthcare_regulators",
  alberta_child_youth_advocate: "child_youth_advocates",
  alberta_ocya: "child_youth_advocates",
  fnho_indigenous_led_publications: "indigenous_led_organizations",
  saskatchewan_milestone_documents: "institutional_statements",
  saskatchewan_human_rights: "human_rights_tribunals",
  canlii_selected_queries: "courts",
  bc_historical_inquest_scans: "coroners_inquests",
  bc_police_serious_incident_oversight: "police_oversight",
  alberta_police_serious_incident_oversight: "police_oversight",
  federal_rcmp_complaint_oversight: "police_oversight",
  federal_corrections_ombuds: "corrections_oversight",
  bc_child_youth_advocate: "child_youth_advocates",
  saskatchewan_child_youth_advocate: "child_youth_advocates",
  sk_advocate_children_youth: "child_youth_advocates",
  bc_representative_children_youth: "child_youth_advocates",
  correctional_investigator: "corrections_oversight",
  legal_corpus: "courts",
})

const clean = (value, limit = 500) => String(value ?? "").normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
const list = value => Array.isArray(value) ? value : value ? [value] : []
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const httpsUrl = value => {
  try { return new URL(clean(value)).protocol === "https:" }
  catch { return false }
}

export function normalizeSamwiseDomain(value, { additionalDomains = [] } = {}) {
  const normalized = clean(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
  const domain = LEGACY_DOMAIN_MAP[normalized] || normalized
  const extensions = new Set(additionalDomains.map(item => clean(item, 80).toLowerCase()).filter(item => /^extension_[a-z0-9_]{2,60}$/.test(item)))
  return DOMAIN_SET.has(domain) || extensions.has(domain) ? domain : "other_public_institution"
}

export function normalizeSamwiseSourceFamily(value) {
  const normalized = clean(value, 100).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
  const family = LISTENER_SOURCE_FAMILY_MAP[normalized] || normalized
  if (!SOURCE_FAMILY_SET.has(family)) throw new Error("samwise_source_family_unsupported")
  return family
}

function normalizeSecondaryDomain(value, input, additionalDomains) {
  const domain = normalizeSamwiseDomain(typeof value === "string" ? value : value?.domain, { additionalDomains })
  const basis = clean(typeof value === "object" ? value?.evidence_basis : input.cross_domain_evidence_basis, 80)
  const sourceReference = clean(typeof value === "object" ? value?.source_reference : input.source_url, 500)
  const reviewed = input.cross_domain_reviewed === true || ["explicit_source", "reviewed_citation", "deterministic_canonical_match"].includes(basis)
  if (!reviewed || !sourceReference) throw new Error("samwise_secondary_domain_requires_reviewed_evidence")
  return { domain, evidence_basis: basis || "explicit_source", source_reference: sourceReference }
}

function normalizeEntity(value) {
  const name = clean(typeof value === "string" ? value : value?.name, 180)
  if (!name) return null
  return {
    entity_id: clean(typeof value === "object" ? value?.entity_id : "", 180) || null,
    name,
    entity_type: clean(typeof value === "object" ? value?.entity_type : "organization", 80) || "organization",
    resolution: clean(typeof value === "object" ? value?.resolution : "unresolved", 60) || "unresolved",
  }
}

export function normalizeSamwiseFinding(input = {}, { additionalDomains = [] } = {}) {
  const sourceUrl = clean(input.source_url || input.source?.url, 500)
  if (!httpsUrl(sourceUrl)) throw new Error("samwise_public_source_https_required")
  const adapterSourceFamily = clean(input.source_family || input.source?.adapter_family || input.source?.family, 100)
  const sourceFamily = normalizeSamwiseSourceFamily(adapterSourceFamily)
  const primaryDomain = normalizeSamwiseDomain(input.primary_domain, { additionalDomains })
  const secondaryDomains = list(input.secondary_domains)
    .map(value => normalizeSecondaryDomain(value, input, additionalDomains))
    .filter(value => value.domain !== primaryDomain)
    .filter((value, index, values) => values.findIndex(candidate => candidate.domain === value.domain) === index)
  const state = STATE_SET.has(input.intelligence_state) ? input.intelligence_state : "discovered"
  const canonicalId = clean(input.canonical_finding_id || input.canonical_id || input.legal_record_id || input.recommendation_id, 180)
  if (!canonicalId) throw new Error("samwise_finding_id_required")
  const title = clean(input.title || input.case_name || input.report, 180)
  if (!title) throw new Error("samwise_finding_title_required")
  const finding = {
    schema_version: SAMWISE_PUBLIC_RECORDS_VERSION,
    capability_id: SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID,
    canonical_finding_id: canonicalId,
    document_id: clean(input.document_id || input.citation, 180) || null,
    event_id: clean(input.event_id || input.related_event_id, 180) || null,
    title,
    summary: clean(input.summary || input.established_summary || input.merits_finding, 900),
    source: {
      url: sourceUrl,
      family: sourceFamily,
      adapter_family: adapterSourceFamily === sourceFamily ? null : adapterSourceFamily,
      role: clean(input.source_role || input.source?.role, 100) || "public_record",
      document_fingerprint: clean(input.document_fingerprint, 128) || null,
    },
    evidence_role: clean(input.evidence_role || input.procedural_stage, 100) || "unclassified_public_record",
    intelligence_state: state,
    primary_domain: primaryDomain,
    secondary_domains: secondaryDomains,
    relevant_entities: list(input.relevant_entities || input.responsible_organizations).map(normalizeEntity).filter(Boolean).slice(0, 30),
    relationships: {
      related_existing_events: list(input.related_existing_events || input.related_event_id).map(value => clean(value, 180)).filter(Boolean),
      related_accountability_chains: list(input.related_accountability_chains || input.related_watch_chain_id).map(value => clean(value, 180)).filter(Boolean),
      related_legal_context: list(input.related_legal_context).map(value => clean(value, 180)).filter(Boolean),
    },
    actionability: {
      next_public_milestone: clean(input.next_public_milestone, 300) || null,
      expected_document: clean(input.expected_document, 180) || null,
      accountable_body: clean(input.accountable_body, 180) || null,
      monitoring_source: clean(input.monitoring_source, 300) || null,
      next_research_action: clean(input.next_research_action, 400) || null,
      complaint_pathway: clean(input.complaint_pathway, 180) || null,
      support_categories: list(input.related_support_categories || input.support_categories).map(value => clean(value, 100)).filter(Boolean).slice(0, 12),
    },
    relevance: {
      indigenous: input.indigenous_relevance === true ? "explicit_source" : input.indigenous_relevance === false ? "not_supported" : clean(input.indigenous_relevance || input.relevance?.indigenous, 80) || "not_assessed",
      institutional: clean(input.institutional_relevance, 80) || "supported_public_body",
      discrimination: clean(input.discrimination_evidence, 80) || "not_assessed",
    },
    resource_opportunities: list(input.resource_opportunities).map(value => clean(value, 180)).filter(Boolean).slice(0, 20),
    requested_destinations: list(input.downstream_destinations || input.project_routing).map(value => clean(value, 100)).map(value => LEGACY_ROUTE_MAP[value] || value).filter(value => ROUTE_SET.has(value)),
    privacy_class: clean(input.privacy_class, 60) || "owner_private_metadata",
    owner_review_required: input.owner_review_required !== false,
    mutation_authority: false,
    publication_authority: false,
  }
  finding.finding_fingerprint = hash({ canonical_finding_id: finding.canonical_finding_id, document_id: finding.document_id, source: finding.source, evidence_role: finding.evidence_role, state: finding.intelligence_state, primary_domain: finding.primary_domain, secondary_domains: finding.secondary_domains.map(item => item.domain) })
  return Object.freeze(finding)
}

export function routeSamwiseFinding(finding, { resourceCandidates = [] } = {}) {
  if (finding?.capability_id !== SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID) throw new Error("samwise_finding_required")
  if (finding.intelligence_state === "irrelevant") return Object.freeze({ finding_id: finding.canonical_finding_id, routes: ["irrelevant"], automatic_publication: false })
  const routes = new Set(finding.requested_destinations)
  if (resourceCandidates.length || finding.resource_opportunities.length) routes.add("shared_resource_candidate")
  if (!routes.size) routes.add("owner_intelligence")
  routes.delete("irrelevant")
  if (routes.has("miller_resource_candidate") && !resourceCandidates.length) {
    routes.delete("miller_resource_candidate")
    routes.add("research_context_only")
  }
  if ([...routes].some(route => PUBLICATION_SENSITIVE_ROUTES.has(route))) routes.add("owner_intelligence")
  return Object.freeze({
    finding_id: finding.canonical_finding_id,
    routes: [...routes],
    consumer_review_required: [...routes].some(route => PUBLICATION_SENSITIVE_ROUTES.has(route)),
    automatic_publication: false,
    mutation_authority: false,
    publication_authority: false,
  })
}

export function reconcileSamwiseDocument({ listenerId, sourceId, sourceUrl, documentFingerprint, eventFingerprint, previousDocuments = [] } = {}) {
  if (!httpsUrl(sourceUrl)) throw new Error("samwise_public_source_https_required")
  return {
    capability_id: SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID,
    ...reconcileListenerDocument({ listenerId, sourceId, canonicalUrl: sourceUrl, documentFingerprint, eventFingerprint, previousDocuments }),
    event_identity_is_document_identity: false,
    automatic_event_merge: false,
  }
}

export function buildSamwiseOwnerReviewPacket(finding, routing) {
  if (finding?.capability_id !== SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID) throw new Error("samwise_finding_required")
  return Object.freeze({
    schema_version: "samwise-public-record-owner-review-v1",
    capability_id: SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID,
    canonical_finding_id: finding.canonical_finding_id,
    title: finding.title,
    summary: finding.summary,
    source_reference: finding.source.url,
    source_role: finding.source.role,
    evidence_role: finding.evidence_role,
    intelligence_state: finding.intelligence_state,
    primary_domain: finding.primary_domain,
    secondary_domains: finding.secondary_domains.map(item => item.domain),
    relationships: finding.relationships,
    actionability: finding.actionability,
    proposed_routes: routing.routes,
    owner_review_state: "pending",
    automatic_publication: false,
    mutation_authority: false,
    publication_authority: false,
  })
}

export function adaptFarmListenerToSamwise(listener, supportedSourceFamilies) {
  if (!supportedSourceFamilies.includes(listener.source_family)) return null
  return Object.freeze({
    ...listener,
    capability_id: SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID,
    legacy_listener_id: listener.listener_id,
    consumer_hints: listener.project_scope === "miller_north" ? ["miller_north_evidence_candidate"] : listener.project_scope === "miller" ? ["miller_resource_candidate"] : listener.project_scope === "both" ? ["miller_north_evidence_candidate", "miller_resource_candidate"] : ["owner_intelligence"],
    scheduler: "farm_job_scheduler",
    mutation_authority: false,
    publication_authority: false,
  })
}

export function calculateSamwiseSourceYield(runs = []) {
  const number = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0
  const total = field => runs.reduce((sum, run) => sum + number(run[field]), 0)
  const documentsChecked = total("checked")
  const usefulFindings = total("useful_findings") || total("material_changes") + total("new_events") + total("existing_events_strengthened")
  const failures = runs.filter(run => ["failed", "quarantined"].includes(run.status)).length
  const crossDomain = runs.reduce((sum, run) => sum + number(run.cross_domain_discoveries ?? run.cross_lane_discoveries?.length), 0)
  return Object.freeze({
    runs: runs.length,
    documents_checked: documentsChecked,
    useful_findings: usefulFindings,
    new_events: total("new_events"),
    evidence_upgrades: total("existing_events_strengthened"),
    cross_domain_discoveries: crossDomain,
    recommendations_extracted: total("recommendations_extracted"),
    milestones_identified: total("milestones_identified"),
    resource_discoveries: total("resource_discoveries"),
    watch_candidates: total("watch_candidates"),
    owner_review_items: total("owner_review"),
    noise_or_rejections: total("noise_or_rejections"),
    failures,
    cost_usd: Number(total("cost_usd").toFixed(4)),
    manual_review_minutes: total("manual_review_minutes"),
    useful_per_100_documents: documentsChecked ? Number((usefulFindings / documentsChecked * 100).toFixed(2)) : 0,
    score_type: "transparent_counts_only",
  })
}
