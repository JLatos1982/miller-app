const legalRecord = (index, review_level) => ({
  legal_record_id: `fixture_legal_${index}`,
  citation: `2025 SCC ${index + 10}`,
  process_role: "merits_decision",
  review_level,
  source_url: `https://example.test/legal/${index}`,
  source_authority: "synthetic_test_fixture",
  project_route: "private_review",
  finding_boundary: "Synthetic boundary used only to exercise validation.",
  disposition: "owner_review",
  publication_candidate: false,
})

export const legalCorpusV3Fixture = {
  scope: { index_entries_checked: 695, prior_decision_records: 19 },
  new_records: [
    ...Array.from({ length: 7 }, (_, index) => legalRecord(index, "official_digest_reviewed")),
    ...Array.from({ length: 7 }, (_, index) => legalRecord(index + 7, "full_decision_reviewed")),
    { ...legalRecord(14, "full_decision_reviewed"), citation: "2025 CHRT 6", process_role: "compliance_order" },
  ],
  corrections: [{ citation: "2024 CHRT 95", prior_role: "compliance_order", corrected_role: "interested_party_order" }],
  jordans_principle: { connected_steps: [{ citation: "2024 CHRT 95", role: "interested_party_order" }] },
  publication: { public_records_added: 0, production_mutations: 0 },
  reconciliation: { duplicate_incidents_created: 0 },
  support_pathway_matches: {
    disclaimer: "Miller does not determine whether someone has a legal claim.",
    reviewed_suggestions: [{ owner_review: true, resource_ids: ["fixture-resource"] }],
  },
}

export const legalCorpusV4Fixture = {
  scope: { named_legal_matters_reconciled: 6, new_public_records: 0, production_writes: 0 },
  legal_matters: [
    { legal_record_id: "legal_sk_2011_skqb_337", finding_boundary: "This did not determine that the institution discriminated." },
    { legal_record_id: "legal_sk_2021_skca_18", project_route: "miller_legal_context_private" },
    { legal_record_id: "fixture_judicial_review_milestone", finding_boundary: "No later court citation or decision was located." },
    { legal_record_id: "fixture_campbell", citation: "2019 BCHRT 275", discrimination_evidence: "explicit_discrimination_finding", publication_candidate: false, owner_review_reason: "full_reasons_recheck required" },
    { legal_record_id: "fixture_smith", citation: "2020 BCHRT 52", discrimination_evidence: "explicit_discrimination_finding", publication_candidate: false, owner_review_reason: "full_reasons_recheck required" },
    { legal_record_id: "legal_ca_jordans_principle_chain_v4", finding_boundary: "None alone proves complete implementation or improved outcomes.", project_route: "miller_north_accountability_watch_private_candidate" },
  ],
  systemic_evidence_candidates: [{ title: "Synthetic systemic recommendation monitoring", disposition: "private_owner_review" }],
  reconciliation: { new_incidents_created: 0, automatic_publications: 0, systemic_evidence_candidates: 1 },
}

export const domainYieldFixture = {
  documents_checked: 3,
  domains: { child_youth: { documents_checked: 2 }, healthcare: { documents_checked: 1 } },
  publication: { public_records_added: 0, public_filters_added: 0 },
  source_family_observations: [{ source_family: "child_youth_advocate", assessment: "highest_new_domain_yield" }],
}

const recommendation = (index, options = {}) => ({
  recommendation_id: `fixture-rec-${index}`,
  response: options.response ?? "Bounded response",
  implementation_evidence: options.implementation ? "Independent implementation evidence" : null,
  outcome_evidence: null,
  response_is_implementation: false,
  claimed_action_is_outcome: false,
})

export const childYouthLedgerFixture = {
  recommendations: Array.from({ length: 30 }, (_, index) => recommendation(index, { implementation: index < 3 })),
  counts: { distinct_alberta_recommendations: 5, alberta_responder_rows: 6 },
}

export const spiritMattersLedgerFixture = {
  recommendations: Array.from({ length: 24 }, (_, index) => recommendation(index, { implementation: index < 10 })),
  counts: { original_2013_recommendations: 10, renewed_or_new_2023_recommendations: 14 },
  response_sources_by_current_recommendation: Object.fromEntries(Array.from({ length: 14 }, (_, index) => [`rec-${index}`, "fixture-source"])),
}

export const crossLaneReviewFixture = {
  records: Array.from({ length: 5 }, (_, index) => ({
    canonical_id: `fixture-cross-lane-${index}`,
    secondary_domains: ["human_rights_public_services"],
    domain_support: [{ domain: "human_rights_public_services", basis: "reviewed_citation", source_url: `https://example.test/cross-lane/${index}` }],
    publication_authority: false,
    automatic_merge: false,
  })),
  counts: { cross_domain_discoveries: 5 },
}

const completedExecution = id => ({
  schema_version: "palantir-research-execution-v1",
  research_request_id: id,
  state: "completed",
  source_checkpoints: [{ source_id: "research:fixture", status: "completed" }],
  documents: [{ id: "doc", review_level: "full_document" }],
  findings: [],
  cross_domain_discoveries: [],
  errors: [],
  mutation_authority: false,
  publication_authority: false,
})

export const palantirProofFixture = {
  summary: { plans_generated: 3, plans_approved: 3, plans_completed: 3, sources_executed: 3, full_documents_reviewed: 6, findings: 6, cross_domain_discoveries: 4, igor_jobs_completed: 3, miller_resource_opportunities: 0, miller_north_candidates: 0, future_project_candidates: 4, owner_intelligence_items: 6, external_api_cost_usd: 0, qwen_usage: 0, production_database_writes: 0, publication_actions: 0 },
  cycles: [
    { checkpoints_written: 2, plan: { continuation_of: "research:public-benefits-administration-v2", source_plan: [{ source_id: "research:alberta_auditor_general_reports" }] }, execution: completedExecution("research:benefits") },
    { checkpoints_written: 2, plan: { source_plan: [{ source_id: "research:workplace" }] }, execution: completedExecution("research:workplace") },
    { checkpoints_written: 2, plan: { source_plan: [{ source_id: "research:municipal" }] }, execution: completedExecution("research:municipal") },
  ],
}

export const learningLedgerFixture = { summary: { lessons: 9, promoted_shared_rules: 6 } }

const workplaceFinding = (id, overrides = {}) => ({
  canonical_finding_id: id,
  title: `Synthetic workplace finding ${id}`,
  source_url: `https://example.test/workplace/${encodeURIComponent(id)}`,
  source_family: "workplace_safety_enforcement",
  source_role: "official_record",
  evidence_role: "formal_investigation_finding",
  intelligence_state: "formal_finding",
  jurisdiction: "British Columbia",
  employer_type: "private_employer",
  indigenous_relevance: "not_established",
  discrimination_state: "no_discrimination_finding",
  primary_domain: "public_safety",
  secondary_domains: ["government_services"],
  cross_domain_reviewed: true,
  downstream_destinations: ["future_project_candidate", "owner_intelligence"],
  ...overrides,
})

export const workplaceSafetyProofFixture = {
  source_systems_checked: 4,
  full_records_reviewed: 4,
  findings: Array.from({ length: 4 }, (_, index) => workplaceFinding(`fixture-proof-${index}`, index === 1 ? { relevant_entities: [{ name: "Alberta OHS", entity_type: "enforcement_agency" }] } : {})),
  summary: { miller_outputs: 0, miller_north_outputs: 0 },
}

const normalizedWorkplaceBase = (id, overrides = {}) => ({
  schema_version: "palantir-workplace-safety-finding-v1",
  canonical_finding_id: id,
  title: `Synthetic ${id}`,
  source_url: `https://example.test/workplace-proof/${encodeURIComponent(id)}`,
  jurisdiction: "Alberta",
  employer_type: "private_employer",
  evidence_role: "formal_investigation_finding",
  indigenous_relevance: "not_established",
  discrimination_state: "no_discrimination_finding",
  secondary_domains: ["government_services"],
  ...overrides,
})

export const palantirWorkplaceProofFixture = {
  findings: [
    normalizedWorkplaceBase("palantir:small-legs-dhillon-2008", { evidence_role: "human_rights_merits_finding", indigenous_relevance: "explicit_person_or_group", indigenous_evidence_basis: "reviewed_citation", discrimination_state: "explicit_formal_finding", discrimination_evidence_basis: "reviewed_citation", owner_review_required: true }),
    normalizedWorkplaceBase("palantir:ledger-2021-ahrc-95", { evidence_role: "procedural_human_rights_decision", employer_type: "health_authority", indigenous_relevance: "explicit_person_or_group", indigenous_evidence_basis: "reviewed_citation", discrimination_state: "credible_allegation_procedural_only", discrimination_evidence_basis: "reviewed_citation", owner_review_required: true, secondary_domains: ["healthcare", "corrections"] }),
    normalizedWorkplaceBase("palantir:sk-shrc-caitlin-2023-24", { evidence_role: "mediated_resolution", indigenous_relevance: "explicit_person_or_group", indigenous_evidence_basis: "explicit_source", discrimination_state: "mediated_without_merits_finding", discrimination_evidence_basis: "explicit_source", owner_review_required: true }),
    normalizedWorkplaceBase("palantir:ab-ohs-kikino-2022", { employer_type: "public_agency", indigenous_relevance: "explicit_indigenous_institution_only", indigenous_evidence_basis: "explicit_source", secondary_domains: ["government_services"] }),
    ...Array.from({ length: 6 }, (_, index) => normalizedWorkplaceBase(`palantir:fixture-${index}`, { secondary_domains: index < 5 ? ["government_services"] : [] })),
  ],
  cycles: Array.from({ length: 3 }, (_, index) => ({ plan: { source_plan: [{ source_id: `research:fixture-${index}` }] }, checkpoints_written: 2, execution: { state: "completed", mutation_authority: false, publication_authority: false } })),
  consumer_routing: { publications: 0, investigations_routed_to_public_miller: 0 },
}
palantirWorkplaceProofFixture.findings = palantirWorkplaceProofFixture.findings.map(item => ({ ...item, routing: { routes: item.canonical_finding_id === "palantir:ledger-2021-ahrc-95" ? ["owner_intelligence", "miller_north_evidence_candidate"] : ["owner_intelligence"] } }))

export const benefitsV2Fixture = {
  documents_fully_reviewed: 3,
  recommendation_rows: [
    { status: "partially_implemented" },
    { status: "case_level_outcome_documented" },
    ...Array.from({ length: 5 }, () => ({ status: "response_received" })),
  ],
  consumer_outputs: { publications: 0 },
}

const benefitsFinding = (id, overrides = {}) => ({
  canonical_finding_id: id,
  title: `Synthetic benefits finding ${id}`,
  summary: "This is monitoring context and not a finding.",
  source_url: `https://example.test/benefits/${id}`,
  source_family: "ombuds_offices",
  evidence_role: "monitoring_context",
  intelligence_state: "known",
  primary_domain: "government_services",
  secondary_domains: ["housing"],
  cross_domain_reviewed: true,
  downstream_destinations: ["owner_intelligence"],
  ...overrides,
})

export const benefitsExplorationFixture = {
  capability_id: "samwise_public_records_intelligence",
  sources_checked: 6,
  publication_scope: "private_owner_review",
  findings: [benefitsFinding("service-pressure"), benefitsFinding("appeal"), benefitsFinding("access"), benefitsFinding("fairness")],
}

export const migrationBaselineFixture = {
  processed: { findings: 63, legal_decisions: 8, child_youth_recommendations: 30, corrections_recommendations: 24 },
  safeguards: { production_mutations: 0, original_miller_research_records: 0 },
  routes: {},
}
