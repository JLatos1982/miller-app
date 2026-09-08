import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

import listenerSources from "../src/data/samwise-public-record-source-registry-v1.json" with { type: "json" }
import { validateFarmOwnerRequest } from "../server/farmSupabaseInteraction.js"
import { buildSamwiseResearchSourceCatalog, planSamwiseUniversalResearch } from "../server/samwiseResearchWorkflow.js"
import { buildPalantirReviewPacket, createPalantirResearchPlan, executePalantirResearch, transitionPalantirResearchPlan } from "../server/palantirResearchExecutor.js"
import { persistPalantirExecution, persistPalantirPlan } from "../server/palantirExecutionStore.js"
import { normalizePalantirWorkplaceFinding, routePalantirWorkplaceFinding, summarizePalantirWorkplaceYield, validatePalantirWorkplaceSafetyTaxonomy } from "../server/palantirWorkplaceSafety.js"

const root = path.resolve(new URL("..", import.meta.url).pathname)
const catalog = buildSamwiseResearchSourceCatalog({ listenerRegistry: listenerSources })
const executionStorePath = path.join(root, "artifacts", "samwise-public-records", "palantir-workplace-safety-execution-store-v1.json")
const fixedNow = new Date("2026-09-08T18:00:00.000Z")
mkdirSync(path.dirname(executionStorePath), { recursive: true })
writeFileSync(executionStorePath, `${JSON.stringify({ schema_version: "palantir-execution-store-v1", plans: [], executions: [], updated_at: fixedNow.toISOString(), production_data_mutations: 0, publication_actions: 0 }, null, 2)}\n`, { mode: 0o600 })

const documents = {
  bc: {
    "research:worksafebc_incident_findings": [
      { document_id: "worksafebc-ni-2023197990005", title: "Worker fatally struck by vehicle that left roadway", source_url: "https://www.worksafebc.com/resources/health-safety/incident-investigation-report-summaries/worker-fatally-struck-by-vehicle-that-left-roadway?lang=en", review_level: "full_document" },
      { document_id: "worksafebc-ni-2023194040008", title: "Worker on break fell through unguarded floor opening", source_url: "https://www.worksafebc.com/en/resources/health-safety/incident-investigation-report-summaries/worker-on-break-fell-through-unguarded-floor-opening-later-died?lang=en", review_level: "full_document" },
      { document_id: "worksafebc-ni-2024170090013", title: "Worker struck by falling drilling-rig plate", source_url: "https://www.worksafebc.com/en/resources/health-safety/incident-investigation-report-summaries/worker-struck-by-falling-plate-from-drilling-rig-seriously-injured?lang=en", review_level: "full_document" }
    ],
    "research:worksafebc_penalty_summaries": [{ document_id: "worksafebc-penalty-index-current", title: "WorkSafeBC penalty summaries", source_url: "https://www.worksafebc.com/en/health-safety/create-manage/incident-investigations/penalties/penalty-summaries", review_level: "index_only" }],
    "research:bc_wcat_decisions": [{ document_id: "bc-wcat-search-current", title: "WCAT anonymized decision search", source_url: "https://www.wcat.bc.ca/home/search-past-decisions/", review_level: "index_only" }],
    "research:bc_human_rights_indigenous_employment": [{ document_id: "2008-BCHRT-104-official-digest", title: "Small Legs v. Dhillon official remedy digest", source_url: "https://www.bchrt.bc.ca/human-rights-duties/remedies/compensation/fired/", review_level: "full_document" }]
  },
  alberta: {
    "research:alberta_ohs_convictions": [
      { document_id: "ab-ohs-birchcliff-2026", title: "Birchcliff Energy Ltd. conviction", source_url: "https://www.alberta.ca/convictions-under-ohs-legislation", review_level: "full_document" },
      { document_id: "ab-ohs-kikino-2022", title: "Kikino Métis Settlement conviction", source_url: "https://www.alberta.ca/convictions-under-ohs-legislation", review_level: "full_document" }
    ],
    "research:alberta_ohs_prosecution_outcomes": [{ document_id: "ab-ohs-prosecution-outcomes-current", title: "Alberta OHS prosecution and appeal outcomes", source_url: "https://www.alberta.ca/prosecution-outcomes", review_level: "index_only" }],
    "research:alberta_workers_comp_appeals": [{ document_id: "ab-workers-comp-appeal-search-current", title: "Alberta Workers' Compensation Appeals Commission decision search", source_url: "https://www.appealscommission.ab.ca/", review_level: "index_only" }],
    "research:alberta_human_rights_employment": [{ document_id: "2021-AHRC-95", title: "Ledger v Alberta Health Services and Alberta Justice and Solicitor General", source_url: "https://www.albertahumanrights.ab.ca/what-are-human-rights/about-the-commission/human-rights-decisions/", review_level: "full_document" }]
  },
  saskatchewan: {
    "research:saskatchewan_ohs_prosecutions": [
      { document_id: "sk-ohs-sha-2024-12-11", title: "Saskatchewan Health Authority workplace-injury conviction", source_url: "https://www.saskatchewan.ca/government/news-and-media/2024/december/19/saskatchewan-health-authority-fined-75000-for-workplace-injury", review_level: "full_document" },
      { document_id: "sk-ohs-kindersley-2024-08-13", title: "Town of Kindersley worker-fatality conviction", source_url: "https://www.saskatchewan.ca/government/news-and-media/2024/august/23/town-of-kindersley-fined-175000-for-worker-fatality", review_level: "full_document" }
    ],
    "research:saskatchewan_wcb_appeal_decisions": [{ document_id: "sk-wcb-pro-14-2024", title: "Board Appeal Tribunal publication policy", source_url: "https://www.wcbsask.com/policy-and-procedure/appeals-board-appeal-tribunal-publication-decisions-pro-142024", review_level: "index_only" }],
    "research:saskatchewan_human_rights_employment": [{ document_id: "sk-shrc-annual-2023-24-caitlin", title: "Saskatchewan Human Rights Commission 2023–24 employment case summary", source_url: "https://saskatchewanhumanrights.ca/wp-content/uploads/2024/07/Annual-Report-23-24.pdf", review_level: "full_document" }]
  }
}

const findings = [
  { canonical_finding_id: "palantir:worksafebc-municipal-road-2023", title: "Municipal worker was fatally struck beside a roadway", source_url: documents.bc["research:worksafebc_incident_findings"][0].source_url, jurisdiction: "British Columbia", event_date: "2023-05", employer: "Municipal government", employer_type: "municipality", industry: "municipal infrastructure", evidence_role: "formal_investigation_finding", formal_finding: "The vehicle left a 30 km/h work zone at high speed; WorkSafeBC also identified worker exposure to traffic as a broader safety issue for municipalities.", discrimination_state: "not_applicable", secondary_domains: ["government_services", "transportation"], owner_review_required: false },
  { canonical_finding_id: "palantir:worksafebc-school-opening-2023", title: "School construction opening remained unguarded before a fatal fall", source_url: documents.bc["research:worksafebc_incident_findings"][1].source_url, jurisdiction: "British Columbia", event_date: "2023-08", employer: "School district and contractors", employer_type: "school_district", industry: "education construction", evidence_role: "formal_investigation_finding", formal_finding: "The investigation concerned an unguarded floor opening after railings were removed during work at a newly built elementary school.", discrimination_state: "not_applicable", secondary_domains: ["education", "government_services"], owner_review_required: false },
  { canonical_finding_id: "palantir:worksafebc-drilling-plate-2024", title: "Drilling-rig floor plates fell and seriously injured a worker", source_url: documents.bc["research:worksafebc_incident_findings"][2].source_url, jurisdiction: "British Columbia", event_date: "2024-03", employer: "Wellbore drilling company", employer_type: "private_employer", industry: "oil and gas", evidence_role: "formal_investigation_finding", formal_finding: "Two 544 kg floor plate extensions disconnected while a drilling rig was being prepared for transport.", discrimination_state: "not_applicable", secondary_domains: [], owner_review_required: false },
  { canonical_finding_id: "palantir:small-legs-dhillon-2008", title: "Tribunal found race discrimination after racist workplace comments and dismissal", source_url: documents.bc["research:bc_human_rights_indigenous_employment"][0].source_url, jurisdiction: "British Columbia", decision_date: "2008", employer: "Private hairstyling employer", employer_type: "private_employer", industry: "personal services", evidence_role: "human_rights_merits_finding", formal_finding: "The official Tribunal digest records race discrimination based on racist comments and dismissal and a $5,000 injury-to-dignity award.", indigenous_relevance: "explicit_person_or_group", indigenous_evidence_basis: "explicit_source", discrimination_state: "explicit_formal_finding", discrimination_evidence_basis: "explicit_source", secondary_domains: ["human_rights", "courts_legal"], owner_review_required: true },
  { canonical_finding_id: "palantir:ab-ohs-birchcliff-2026", title: "Fatal water-sampling incident resulted in conviction and creative sentence", source_url: documents.alberta["research:alberta_ohs_convictions"][0].source_url, jurisdiction: "Alberta", event_date: "2023-10-10", decision_date: "2026-08-14", employer: "Birchcliff Energy Ltd.", employer_type: "private_employer", industry: "oil and gas", evidence_role: "court_conviction_and_sentence", formal_finding: "The employer pleaded guilty to failing to create or implement safe water-sampling procedures after a worker fatality.", penalty: "$312,500 directed to industry training and local rescue capacity", corrective_action: "The sentence funded surface-water risk training, rescue training, and equipment; this is ordered activity, not measured effectiveness.", discrimination_state: "not_applicable", secondary_domains: ["courts_legal", "education"], owner_review_required: false },
  { canonical_finding_id: "palantir:ab-ohs-kikino-2022", title: "OHS conviction ordered a safety-system gap analysis and enhanced supervision", source_url: documents.alberta["research:alberta_ohs_convictions"][1].source_url, jurisdiction: "Alberta", event_date: "2020-03-10", decision_date: "2022-09-22", employer: "Kikino Métis Settlement", employer_type: "public_agency", industry: "local government operations", evidence_role: "court_conviction_and_sentence", formal_finding: "The employer pleaded guilty to failing to assess the worksite and identify hazards before a worker was seriously injured.", penalty: "$8,500 creative sentence and 18 months of enhanced regulatory supervision", corrective_action: "The sentence required a gap analysis and action plan; the reviewed source did not provide later independent implementation evidence.", indigenous_relevance: "explicit_indigenous_institution_only", indigenous_evidence_basis: "explicit_source", discrimination_state: "no_discrimination_finding", secondary_domains: ["government_services", "professional_regulation"], owner_review_required: false },
  { canonical_finding_id: "palantir:ledger-2021-ahrc-95", title: "Review decision returned an Indigenous nurse's workplace race complaint to hearing", source_url: documents.alberta["research:alberta_human_rights_employment"][0].source_url, jurisdiction: "Alberta", decision_date: "2021-04-23", employer: "Alberta Health Services and Alberta Justice and Solicitor General", employer_type: "corrections_body", industry: "correctional healthcare", evidence_role: "procedural_human_rights_decision", formal_finding: "The review overturned dismissal and referred the complaint for hearing; it did not decide whether discrimination occurred. The case later settled before a merits hearing.", indigenous_relevance: "explicit_person_or_group", indigenous_evidence_basis: "explicit_source", discrimination_state: "credible_allegation_procedural_only", discrimination_evidence_basis: "explicit_source", secondary_domains: ["human_rights", "healthcare", "corrections", "government_services"], owner_review_required: true },
  { canonical_finding_id: "palantir:sk-ohs-sha-2024", title: "Health authority pleaded guilty after a serious ladder fall", source_url: documents.saskatchewan["research:saskatchewan_ohs_prosecutions"][0].source_url, jurisdiction: "Saskatchewan", event_date: "2023-05-11", decision_date: "2024-12-11", employer: "Saskatchewan Health Authority", employer_type: "health_authority", industry: "healthcare", evidence_role: "court_conviction_and_sentence", formal_finding: "The health authority pleaded guilty to failing to ensure a ladder was safely designed, used, and maintained after a worker was seriously injured.", penalty: "$75,000 including surcharge", discrimination_state: "not_applicable", secondary_domains: ["healthcare", "government_services", "courts_legal"], owner_review_required: false },
  { canonical_finding_id: "palantir:sk-ohs-kindersley-2024", title: "Municipality pleaded guilty after fatal sewer-manhole exposure", source_url: documents.saskatchewan["research:saskatchewan_ohs_prosecutions"][1].source_url, jurisdiction: "Saskatchewan", event_date: "2022-08-30", decision_date: "2024-08-13", employer: "Town of Kindersley", employer_type: "municipality", industry: "municipal infrastructure", evidence_role: "court_conviction_and_sentence", formal_finding: "The municipality pleaded guilty to failing to take practicable steps to prevent harmful hazardous-substance exposure after a worker fatality.", penalty: "$175,000 including surcharge", discrimination_state: "not_applicable", secondary_domains: ["government_services", "courts_legal"], owner_review_required: false },
  { canonical_finding_id: "palantir:sk-shrc-caitlin-2023-24", title: "Mediated employment complaint followed concerns about treatment of Indigenous women", source_url: documents.saskatchewan["research:saskatchewan_human_rights_employment"][0].source_url, jurisdiction: "Saskatchewan", decision_date: "2023-24 reporting year", employer: "Unnamed organization", employer_type: "private_employer", industry: "services", evidence_role: "mediated_resolution", formal_finding: "An anonymized Commission summary reports allegations, mediation, compensation, an apology, and distribution of a harassment policy. It is not a merits finding.", indigenous_relevance: "explicit_person_or_group", indigenous_evidence_basis: "explicit_source", discrimination_state: "mediated_without_merits_finding", discrimination_evidence_basis: "explicit_source", secondary_domains: ["human_rights"], owner_review_required: true }
].map(normalizePalantirWorkplaceFinding)

const findingsBySource = new Map([
  ["research:worksafebc_incident_findings", findings.slice(0, 3)],
  ["research:bc_human_rights_indigenous_employment", [findings[3]]],
  ["research:alberta_ohs_convictions", findings.slice(4, 6)],
  ["research:alberta_human_rights_employment", [findings[6]]],
  ["research:saskatchewan_ohs_prosecutions", findings.slice(7, 9)],
  ["research:saskatchewan_human_rights_employment", [findings[9]]]
])

const sourceToProvince = new Map(Object.entries(documents).flatMap(([province, sources]) => Object.keys(sources).map(sourceId => [sourceId, province])))
const cycles = []
for (const [index, [province, provinceDocuments]] of Object.entries(documents).entries()) {
  const jurisdiction = province === "bc" ? "British Columbia" : province === "alberta" ? "Alberta" : "Saskatchewan"
  const request = validateFarmOwnerRequest({ request_type: "research_public_records", target_id: "samwise_public_records_intelligence", parameters: { topic: "workplace health safety enforcement Indigenous discrimination public institutions", jurisdiction, domains: ["public_safety", "human_rights", "government_services", "healthcare", "corrections"], depth: "bounded", max_documents: 50, recent_only: false } })
  const generated = planSamwiseUniversalResearch(request, catalog, { maxSources: 8 })
  const selectedIds = Object.keys(provinceDocuments)
  const selectedSources = selectedIds.map(sourceId => {
    const source = catalog.sources.find(item => item.source_id === sourceId)
    if (!source) throw new Error(`workplace_source_missing:${sourceId}`)
    const planned = generated.source_plan.find(item => item.source_id === sourceId)
    return planned || { source_id: source.source_id, source_family: source.source_family, jurisdiction: source.jurisdiction, operations: source.operations, scheduled_listener_id: source.scheduled_listener_id, selection_score: 1, selection_reasons: ["owner-approved workplace proof source", `jurisdiction:${jurisdiction}`] }
  })
  const basePlan = { ...generated, source_plan: selectedSources, limits: { ...generated.limits, sources: selectedSources.length, documents: 50 } }
  let plan = createPalantirResearchPlan(basePlan, { now: new Date(fixedNow.getTime() + index * 60_000), requestedBy: "owner" })
  plan = transitionPalantirResearchPlan(plan, "approved", { actor: "owner", reason: "Bounded workplace-safety proof cycle explicitly authorized", now: new Date(fixedNow.getTime() + index * 60_000 + 1_000) })
  persistPalantirPlan(executionStorePath, plan)
  const checkpoints = []
  const adapters = Object.fromEntries(selectedIds.map(sourceId => [sourceId, async () => {
    const sourceFindings = findingsBySource.get(sourceId) || []
    return {
      documents: provinceDocuments[sourceId],
      findings: sourceFindings.map(item => ({ ...item, destinations: routePalantirWorkplaceFinding(item).routes })),
      cross_domain_discoveries: sourceFindings.filter(item => item.secondary_domains.length).map(item => ({ canonical_finding_id: item.canonical_finding_id, primary_domain: item.primary_domain, secondary_domains: item.secondary_domains, evidence_basis: "explicit_source", material_value: "A reviewed source explicitly supports material relevance outside workplace safety." })),
      stopping_reason: sourceFindings.length ? "source_complete" : "no_material_change",
      cost_usd: 0
    }
  }]))
  const execution = await executePalantirResearch({
    plan,
    adapters,
    persistCheckpoint: async value => { persistPalantirExecution(executionStorePath, value); checkpoints.push({ state: value.state, completed_sources: value.source_checkpoints.filter(item => ["completed", "no_material_change"].includes(item.status)).length, documents: value.documents.length, findings: value.findings.length }) },
    now: () => new Date(fixedNow.getTime() + index * 60_000 + 2_000 + checkpoints.length * 1_000)
  })
  cycles.push({ jurisdiction, plan, execution, checkpoints_written: checkpoints.length, checkpoint_summaries: checkpoints, review_packet: buildPalantirReviewPacket(execution, { title: `${jurisdiction} workplace-safety review` }) })
}

const yieldSummary = summarizePalantirWorkplaceYield({ sourcesChecked: 11, pagesChecked: 15, fullRecords: 10, findings, rejectedNoise: 5, duplicates: 1, technicalFailures: 1, comparableCycles: 2 })
const artifact = {
  schema_version: "palantir-workplace-safety-proof-v2",
  generated_at: "2026-09-08T18:30:00.000Z",
  capability_id: "samwise_public_records_intelligence",
  display_name: "Palantír",
  taxonomy: validatePalantirWorkplaceSafetyTaxonomy(),
  scope: { provinces: ["British Columbia", "Alberta", "Saskatchewan"], recency_priority: ["2024-present", "2020-2023", "2015-2019", "older high-value findings"], identity_inference: false },
  source_systems_registered: catalog.sources.filter(item => ["British Columbia", "Alberta", "Saskatchewan"].includes(item.jurisdiction) && ["workplace_safety_enforcement", "administrative_appeals", "human_rights_tribunals"].includes(item.source_family)).map(item => ({ source_id: item.source_id, jurisdiction: item.jurisdiction, source_family: item.source_family, public_index: item.public_index, operations: item.operations })),
  cycles,
  findings: findings.map(item => ({ ...item, routing: routePalantirWorkplaceFinding(item) })),
  source_yield: yieldSummary,
  province_breakdown: {
    "British Columbia": { source_systems_checked: 4, records_pages_checked: 6, full_records_reviewed: 4, useful_findings: 4, date_range: "2008–2026 publication cycle" },
    "Alberta": { source_systems_checked: 4, records_pages_checked: 5, full_records_reviewed: 3, useful_findings: 3, date_range: "2020–2026" },
    "Saskatchewan": { source_systems_checked: 3, records_pages_checked: 4, full_records_reviewed: 3, useful_findings: 3, date_range: "2022–2024 events and 2023–24 reporting" }
  },
  outcome_categories: {
    formal_ohs_investigation_findings: findings.filter(item => item.evidence_role === "formal_investigation_finding").length,
    prosecutions_or_convictions: findings.filter(item => item.evidence_role === "court_conviction_and_sentence").length,
    serious_injury_or_fatality: 7,
    public_sector_institutional_cases: findings.filter(item => ["health_authority", "municipality", "school_district", "corrections_body", "public_agency"].includes(item.employer_type)).length,
    explicit_discrimination_findings: findings.filter(item => item.discrimination_state === "explicit_formal_finding").length,
    indigenous_specific_person_or_group: findings.filter(item => item.indigenous_relevance === "explicit_person_or_group").length,
    indigenous_institution_context_only: findings.filter(item => item.indigenous_relevance === "explicit_indigenous_institution_only").length,
    procedural_only: findings.filter(item => item.discrimination_state === "credible_allegation_procedural_only").length,
    mediated_without_merits: findings.filter(item => item.discrimination_state === "mediated_without_merits_finding").length
  },
  cross_domain: {
    healthcare: findings.filter(item => item.secondary_domains.includes("healthcare")).map(item => item.canonical_finding_id),
    policing_corrections: findings.filter(item => item.secondary_domains.includes("corrections") || item.secondary_domains.includes("policing")).map(item => item.canonical_finding_id),
    child_youth: [],
    government_services: findings.filter(item => item.secondary_domains.includes("government_services")).map(item => item.canonical_finding_id),
    legal_human_rights: findings.filter(item => item.secondary_domains.includes("human_rights") || item.secondary_domains.includes("courts_legal")).map(item => item.canonical_finding_id),
    unexpected_material: ["palantir:worksafebc-municipal-road-2023", "palantir:worksafebc-school-opening-2023", "palantir:ab-ohs-birchcliff-2026", "palantir:ledger-2021-ahrc-95", "palantir:sk-ohs-sha-2024"],
    unexpected_material_rate: 0.5
  },
  consumer_routing: {
    miller_north_private_candidates: findings.filter(item => routePalantirWorkplaceFinding(item).routes.includes("miller_north_evidence_candidate")).map(item => item.canonical_finding_id),
    miller_north_records_strengthened: [],
    miller_north_watch_candidates: [],
    original_miller_resource_candidates: [],
    investigations_routed_to_public_miller: 0,
    publications: 0
  },
  source_lessons: [
    { source_id: "research:worksafebc_incident_findings", lesson: "Use the notice-of-incident number as the stable document key; public summaries may name only an employer class." },
    { source_id: "research:worksafebc_penalty_summaries", lesson: "The published amount and status may change during review, so a penalty row is monitored state rather than an immutable final outcome." },
    { source_id: "research:alberta_ohs_convictions", lesson: "One annual page contains many decisions; fingerprint employer, conviction date, incident date, and disposition, and retain withdrawn-charge context." },
    { source_id: "research:saskatchewan_ohs_prosecutions", lesson: "The fiscal-year index links to exact prosecution releases that preserve guilty-plea, fine, surcharge, and withdrawn-charge roles." },
    { source_id: "research:saskatchewan_wcb_appeal_decisions", lesson: "Published-reasons coverage begins with appeals submitted on or after October 1, 2024; the policy page was intermittently unavailable during retrieval." },
    { source_id: "human_rights_intersection", lesson: "Referral, settlement, and merits findings must remain separate; OHS records alone rarely establish discrimination." }
  ],
  continuation: {
    recommended: true,
    next_sources: ["bounded WCAT keyword decisions", "Alberta Appeals Commission significant decisions", "Saskatchewan WCB published reasons after October 2024"],
    cadence_disposition: yieldSummary.cadence_recommendation,
    reason: "Formal safety yield is strong, but Indigenous-specific Miller North yield is sparse and one three-province comparable cycle is insufficient for permanent scheduling."
  },
  boundaries: { mutation_authority: false, publication_authority: false, indigenous_identity_inference: false, qwen_usage: 0, external_api_cost_usd: 0, production_database_writes: 0 }
}

const output = path.join(root, "artifacts", "samwise-public-records", "palantir-workplace-safety-proof-v2.json")
mkdirSync(path.dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ output, sources: yieldSummary.sources_checked, full_records: yieldSummary.full_records_reviewed, findings: yieldSummary.useful_findings, cross_domain: yieldSummary.cross_domain_discoveries, miller_north_private: artifact.consumer_routing.miller_north_private_candidates.length, publications: 0 }, null, 2)}\n`)
