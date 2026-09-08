import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  buildRecommendationResponseChains,
  buildSeriousHarmQueries,
  exploreDocumentGraph,
  runCoronerSeriousHarmListener,
  validateCoronerSourceRegistry,
} from "../server/millerNorthCoronerSeriousHarmListener.js"
import { validateMillerNorthListenerMemory } from "../server/millerNorthListeningPipeline.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const out = name => resolve(root, "artifacts/miller-north", name)
const read = name => JSON.parse(readFileSync(resolve(root, name), "utf8"))
const checkedAt = "2026-09-07T23:30:00.000Z"

const registry = read("src/data/miller-north-coroner-serious-harm-source-registry-v1.json")
validateCoronerSourceRegistry(registry)

const documents = [
  {
    adapter_id: "coroners_inquests", source_family: "fatality_inquiry", document_role: "source_index", province: "alberta", event_key: "ab_fatality_inquiry_system",
    url: "https://www.alberta.ca/fatality-inquiries", title: "Fatality inquiries", publication_date: "2026-09-07",
    summary: "Official overview and indexes for public Alberta fatality inquiries and recommendation responses.", relevance: "potentially_relevant", verification_state: "system_source_verified",
  },
  {
    adapter_id: "coroners_inquests", source_family: "recommendation_response_tracker", document_role: "organizational_response", province: "alberta", event_key: "ab_maskwacis_four_youth_inquiry_2017_2020",
    url: "https://open.alberta.ca/opendata/responses-to-public-fatality-inquiry-recommendations", title: "Responses to public fatality inquiry recommendations", publication_date: "2026-08-31",
    summary: "Official tracker includes 62 responder rows covering 40 distinct numbered recommendations for the four-youth Maskwacis inquiry; a response label is not implementation proof.", relevance: "potentially_relevant", verification_state: "official_aggregate_verified", material_change: true,
  },
  {
    adapter_id: "coroners_inquests", source_family: "fatality_inquiry", document_role: "fatality_inquiry_report", province: "alberta", event_key: "ab_maskwacis_four_youth_inquiry_2017_2020",
    url: "https://open.alberta.ca/publications/fatality-inquiry-2025-07-23", title: "Report to the Minister of Justice: T.M., C.L., S.R. and E.S.", publication_date: "2025-07-23", event_date: "2017-2020", facility: "Maskwacis and regional services",
    summary: "Public fatality inquiry concerning four Indigenous youths who died by suicide, with recommendations spanning mental-health, child/family services, information sharing, governance and funding.", relevance: "potentially_relevant", verification_state: "official_finding_verified",
  },
  {
    adapter_id: "indigenous_media", source_family: "indigenous_media", document_role: "media_corroboration", province: "alberta", event_key: "ab_maskwacis_four_youth_inquiry_2017_2020",
    url: "https://cfweradio.ca/2025/08/27/33304/", title: "Deaths of 4 First Nation teens prompt 44 recommendations", publication_date: "2025-08-27", event_date: "2017-2020", facility: "Maskwacis and regional services",
    summary: "Indigenous media corroboration describing the inquiry, the four youths and the report's 44 recommendations.", relevance: "potentially_relevant", verification_state: "corroborated",
  },
  {
    adapter_id: "government_legislature", source_family: "medical_examiner", document_role: "source_index", province: "alberta", event_key: "ab_ocme_public_access",
    url: "https://www.alberta.ca/office-of-chief-medical-examiner-overview", title: "Office of the Chief Medical Examiner overview", publication_date: "2026-09-07",
    summary: "Official mandate and aggregate workload information; not a public searchable incident collection.", relevance: "potentially_relevant", verification_state: "system_source_verified",
  },
  {
    adapter_id: "coroners_inquests", source_family: "coroner_inquest", document_role: "source_index", province: "british_columbia", event_key: "bc_coroner_inquest_system",
    url: "https://www2.gov.bc.ca/gov/content/life-events/death/coroners-service/inquest-schedule-jury-findings-verdicts", title: "BC Coroners Service inquest schedule, findings and verdicts", publication_date: "2026-05-20",
    summary: "Official annual inquest index with verdicts and, where posted, recommendation responses.", relevance: "potentially_relevant", verification_state: "system_source_verified",
  },
  {
    adapter_id: "coroners_inquests", source_family: "coroner_inquest", document_role: "jury_verdict", province: "british_columbia", event_key: "bc_nadine_solonas_2017", public_case_name: "Nadine Marcy Solonas", event_date: "2017-10-01", facility: "GR Baker Memorial Hospital and Vancouver General Hospital", new_incident_candidate: true,
    url: "https://www2.gov.bc.ca/assets/gov/birth-adoption-death-marriage-and-divorce/deaths/coroners-service/inquest/2023/bccs_solonas_verdict_with_coroner_comments.pdf", title: "Verdict at Coroners Inquest: Nadine Marcy Solonas", publication_date: "2023-06-06",
    summary: "The public verdict documents a fatal head injury, paramedic assessment after initial refusal, hospital care and transfer, and recommends a 24/7 Indigenous support position for Indigenous people in RCMP custody who distrust or refuse first-responder care.", evidence_text: "Paramedics assessed her; she agreed to hospital treatment; flight paramedics transported her. Jury recommendation: create an Indigenous support position on call 24/7.", relevance: "relevant_new_incident_candidate", verification_state: "corroborated",
  },
  {
    adapter_id: "indigenous_media", source_family: "indigenous_media", document_role: "media_corroboration", province: "british_columbia", event_key: "bc_nadine_solonas_2017", public_case_name: "Nadine Marcy Solonas", event_date: "2017-10-01", facility: "Quesnel",
    url: "https://www.cfnrfm.ca/2023/06/06/inquest-into-death-of-quesnel-woman-in-2017-brings-calls-for-a-support-worker-for-indigenous-people-in-custody/", title: "Inquest into death of Quesnel woman brings call for Indigenous support worker", publication_date: "2023-06-06",
    summary: "Indigenous media corroborates Ms. Solonas's Tl’azt’en and Nak’azdli Whut’en connections and the inquest recommendation.", relevance: "potentially_relevant", verification_state: "corroborated",
  },
  {
    adapter_id: "regulators", source_family: "regulator", document_role: "regulator_finding", province: "british_columbia", event_key: "bc_bccnm_lowe_2021", event_date: "2021-09", facility: "emergency department", new_incident_candidate: true,
    url: "https://www.bccnm.ca/Public/complaints/Pages/Notice.aspx?NoticeID=880", title: "BCCNM consent agreement: Katherine Lowe, RN", publication_date: "2023-01-25",
    summary: "The regulator states that an emergency nurse found an Indigenous person apparently pulseless and unresponsive in the vestibule, did not adequately assess or perform resuscitative measures, and accepted a public reprimand and return-to-practice terms.", evidence_text: "Did not adequately assess or perform any resuscitative measures; remedial education included Indigenous cultural safety.", relevance: "relevant_new_incident_candidate", verification_state: "official_finding_verified",
  },
  {
    adapter_id: "regulators", source_family: "regulator", document_role: "regulator_finding", province: "british_columbia", event_key: "bc_bccnm_villaflor_2021", event_date: "2021-06", facility: "public care setting", new_incident_candidate: true,
    url: "https://www.bccnm.ca/Public/complaints/Pages/Notice.aspx?NoticeID=846", title: "BCCNM consent agreement: Christopher Villaflor, LPN", publication_date: "2022-09-23",
    summary: "The regulator states that a nurse performed a religious ritual on a client in a public setting without informed consent and without consideration of the client's Indigenous heritage; the agreement included a suspension, practice limits, mentorship and remedial education.", evidence_text: "Without informed consent; without consideration of the client's Indigenous heritage.", relevance: "relevant_new_incident_candidate", verification_state: "official_finding_verified",
  },
  {
    adapter_id: "coroners_inquests", source_family: "death_review_panel", document_role: "death_review_panel_report", province: "british_columbia", event_key: "bc_police_encounters_death_review_2013_2017",
    url: "https://www2.gov.bc.ca/assets/gov/birth-adoption-death-marriage-and-divorce/deaths/coroners-service/death-review-panel/policeencountersdrp.pdf", title: "BC Coroners Service Death Review Panel: deaths during or following police encounters", publication_date: "2019-03",
    summary: "Systemic review of 127 deaths; 26 decedents were Indigenous. It includes rural/small-community and emergency mental-health recommendations but does not support 26 separate Miller North incident records.", relevance: "potentially_relevant", verification_state: "official_systemic_evidence",
  },
  {
    adapter_id: "coroners_inquests", source_family: "coroner_inquest", document_role: "source_index", province: "saskatchewan", event_key: "sk_coroner_inquest_system",
    url: "https://www.saskatchewan.ca/government/government-structure/boards-commissions-and-agencies/saskatchewan-coroners-service", title: "Saskatchewan Coroners Service", publication_date: "2026-09-07",
    summary: "Official overview links schedules, jury findings, recommendations and responses through the Saskatchewan Publications Centre.", relevance: "potentially_relevant", verification_state: "system_source_verified",
  },
  {
    adapter_id: "health_system", source_family: "health_system_response", document_role: "organizational_response", province: "saskatchewan", event_key: "sk_trevor_dubois_2026", public_case_name: "Trevor Dubois", event_date: "2026-01-09", facility: "Royal University Hospital", related_incident_id: "mni_b0800a1d1732b3fb35c8ebc1",
    url: "https://www.saskhealthauthority.ca/news-events/news/update-statement-regarding-patient-death-royal-university-hospital", title: "SHA update: patient death at Royal University Hospital", publication_date: "2026-01-12",
    summary: "SHA states that police and Saskatchewan Coroners Service investigations were active, it deemed the matter a Critical Incident, initiated internal and use-of-force reviews, engaged a third-party reviewer and suspended the involved Protective Services Officer pending review.", relevance: "relevant_existing_incident", verification_state: "institutional_response_verified", material_change: true,
  },
  {
    adapter_id: "indigenous_media", source_family: "indigenous_media", document_role: "media_corroboration", province: "saskatchewan", event_key: "sk_rene_whitstone_2016", public_case_name: "Rene Whitstone", event_date: "2016-03", facility: "Lloydminster Hospital", related_incident_id: "private_candidate:rene_whitstone_2016",
    url: "https://www.aptnnews.ca/national-news/family-says-saskatchewan-hospitals-refusal-to-immediately-treat-deaf-mute-cree-man-hastened-death/", title: "Family says hospital delay hastened death of Cree man", publication_date: "2016-03-14",
    summary: "APTN reports family allegations of delayed care linked to an expired health card and records the health region's differing account. No coroner, regulator or later formal outcome was located in the bounded search.", relevance: "relevant_existing_incident", verification_state: "provisional",
  },
  {
    adapter_id: "indigenous_media", source_family: "indigenous_health_governance", document_role: "indigenous_led_report", province: "british_columbia", event_key: "bc_keegan_combes_2015", public_case_name: "Keegan Combes", event_date: "2015", facility: "Chilliwack General Hospital", related_incident_id: "existing:keegan_combes",
    url: "https://www.fnha.ca/Documents/FNHA-Remembering-Keegan.pdf", title: "Remembering Keegan: a BC First Nations case study reflection", publication_date: "2022",
    summary: "Existing Miller North event and Indigenous-led accountability report; retained as a reconciliation control, not counted as a new incident.", relevance: "relevant_existing_incident", verification_state: "corroborated",
  },
  {
    adapter_id: "coroners_inquests", source_family: "fatality_inquiry", document_role: "fatality_inquiry_report", province: "alberta", event_key: "ab_ojatm_2019", event_date: "2019-02-18", facility: "Blood Reserve and Alberta child/family services", new_incident_candidate: true,
    url: "https://open.alberta.ca/publications/fatality-inquiry-2025-01-07", title: "Report to the Minister of Justice: O.J.A.T.M.", publication_date: "2025-02-03",
    summary: "The public inquiry and response tracker concern an Indigenous youth's death by suicide and recommendations about kinship care, suicide prevention, Blood Reserve staffing and healing-lodge resources. Full-report healthcare-scope review remains required.", relevance: "potentially_relevant", verification_state: "provisional",
  },
  {
    adapter_id: "indigenous_media", source_family: "indigenous_media", document_role: "media_corroboration", province: "alberta", event_key: "ab_jonathan_anderson_2020", public_case_name: "Jonathan Anderson", event_date: "2020-03", facility: "Edmonton Remand Centre and hospital", new_incident_candidate: true,
    url: "https://cfweradio.ca/2024/09/23/23782/", title: "Local Indigenous man dies in Edmonton Remand centre; reports say more mental health resources are needed", publication_date: "2024-09-23",
    summary: "Indigenous media reports a completed fatality inquiry about a man who sought AHS mental-health care in remand before a suicide attempt and later death. The official report was not independently retrieved in this pass.", relevance: "potentially_relevant", verification_state: "provisional",
  },
  {
    adapter_id: "government_legislature", source_family: "government_response", document_role: "government_response", province: "saskatchewan", event_key: "sk_hospital_security_review_2026", event_date: "2026-05-21", facility: "Saskatchewan Health Authority facilities",
    url: "https://www.saskatchewan.ca/government/news-and-media/2026/may/21/independent-review-begins-to-strengthen-hospital-safety-and-security", title: "Independent review begins to strengthen hospital safety and security", publication_date: "2026-05-21",
    summary: "A provincewide third-party review of protective-services practices includes First Nations and Métis engagement but expressly excludes detailed investigation of individual incidents and clinical matters.", relevance: "potentially_relevant", verification_state: "official_systemic_evidence", material_change: true,
  },
  {
    adapter_id: "coroners_inquests", source_family: "death_review_panel", document_role: "death_review_panel_report", province: "british_columbia", event_key: "bc_youth_suicide_panel_2019_2023",
    url: "https://www2.gov.bc.ca/gov/content/life-events/death/coroners-service/death-review-panel", title: "Creating Connection, Supporting Strengths: youth and young adult suicide review", publication_date: "2025-09-15",
    summary: "The B.C. panel and linked response letters provide systemic evidence about youth mental-health coordination and rural access. Aggregate findings do not create individual incident records.", relevance: "potentially_relevant", verification_state: "official_systemic_evidence",
  }
]

const recommendationRows = [
  { event_key: "ab_maskwacis_four_youth_inquiry_2017_2020", recommendation_id: "12", recommendation_summary: "AHS information-sharing policies and training", responsible_organization: "Alberta Health Services", response_status: "Waiting for Response" },
  { event_key: "ab_maskwacis_four_youth_inquiry_2017_2020", recommendation_id: "13", recommendation_summary: "Local multi-organization information-sharing protocol", responsible_organization: "Children and Family Services", response_status: "Accepted in Principle" },
  { event_key: "ab_maskwacis_four_youth_inquiry_2017_2020", recommendation_id: "13", recommendation_summary: "Local multi-organization information-sharing protocol", responsible_organization: "Alberta Health Services", response_status: "Waiting for Response" },
  { event_key: "ab_maskwacis_four_youth_inquiry_2017_2020", recommendation_id: "13", recommendation_summary: "Local multi-organization information-sharing protocol", responsible_organization: "Akamihk/AMO", response_status: "No Response" },
  { event_key: "ab_maskwacis_four_youth_inquiry_2017_2020", recommendation_id: "13", recommendation_summary: "Local multi-organization information-sharing protocol", responsible_organization: "KCWS", response_status: "Other" },
  { event_key: "ab_maskwacis_four_youth_inquiry_2017_2020", recommendation_id: "28", recommendation_summary: "Review representativeness of Indigenous Wisdom Council", responsible_organization: "Alberta Health Services", response_status: "Waiting for Response" },
  { event_key: "ab_maskwacis_four_youth_inquiry_2017_2020", recommendation_id: "29", recommendation_summary: "AHS Central Zone meetings with Maskwacis", responsible_organization: "Alberta Health Services", response_status: "Waiting for Response" },
  { event_key: "ab_maskwacis_four_youth_inquiry_2017_2020", recommendation_id: "35", recommendation_summary: "Make Indigenous youth-suicide resources available to delegated agencies", responsible_organization: "Alberta Health Services", response_status: "Waiting for Response" },
  { event_key: "ab_maskwacis_four_youth_inquiry_2017_2020", recommendation_id: "35", recommendation_summary: "Make Indigenous youth-suicide resources available to delegated agencies", responsible_organization: "Children and Family Services", response_status: "Accepted in Principle" },
]

const previousPath = out("miller-north-coroner-serious-harm-listener-memory-v1.json")
let previous
try { previous = JSON.parse(readFileSync(previousPath, "utf8")) } catch { previous = undefined }
const cycle = runCoronerSeriousHarmListener(documents, previous, { checkedAt })
validateMillerNorthListenerMemory(cycle)

const solonasGraph = exploreDocumentGraph(documents.find(item => item.event_key === "bc_nadine_solonas_2017" && item.source_family === "coroner_inquest"), [
  { parent_url: documents[6].url, ...documents[7] },
], { maxDocuments: 8, maxDepth: 2 })
const maskwacisGraph = exploreDocumentGraph(documents[2], [
  { parent_url: documents[2].url, ...documents[1] },
  { parent_url: documents[2].url, ...documents[3] },
], { maxDocuments: 8, maxDepth: 2 })

const excavation = {
  schema_version: "miller-north-coroner-serious-harm-excavation-v1",
  generated_at: checkedAt,
  scope: { provinces: ["british_columbia", "alberta", "saskatchewan"], eras: ["2023-2026", "2019-2022", "2015-2018", "older indexes where searchable"], external_api_cost_usd: 0, production_writes: 0, publication_writes: 0, qwen_calls: 0 },
  counts: {
    registry_sources: registry.sources.length,
    documents_in_listener_cycle: documents.length,
    reconciled_underlying_events_or_systems: cycle.reconciled_events.length,
    genuinely_new_verified_incident_candidates: 3,
    genuinely_new_provisional_incidents: 2,
    known_incidents_with_new_official_evidence: 1,
    existing_private_provisional_leads_rechecked: 1,
    new_systemic_evidence_records: 3,
    material_accountability_updates: 3,
    proposed_accountability_watch_chains: 2,
    repeated_or_secondary_documents_reconciled: documents.length - cycle.reconciled_events.length,
    known_events_not_double_counted: 4,
    rejected_or_out_of_scope_candidates: 5,
    serious_harm_candidates: 3,
    ems_or_patient_transport_candidates: 1,
    rural_or_remote_candidates: 2,
    owner_review_items: 3,
    local_public_incident_records: 4,
    local_accountability_watch_chains_added: 2
  },
  findings: {
    new_verified_incidents: [
      { candidate_id: "mnsh_nadine_solonas_2017", title: "Nadine Marcy Solonas inquest", province: "british_columbia", event_date: "2017-10-01", source_role: "jury_verdict", strongest_source: documents[6].url, corroboration: documents[7].url, care_setting: ["ambulance_paramedic", "emergency_department", "interfacility_transfer"], mechanism_tags: ["security_or_police", "ambulance_or_paramedic", "transfer_or_medevac", "assessment_or_resuscitation"], verification_status: "corroborated_official_inquest", already_represented: false, next_investigation_step: "Locate an RCMP response specific to the jury recommendation, if one was made public.", accountability_significance: "A named Indigenous-led support recommendation connects custody, mistrust of first responders, paramedic assessment and hospital transfer.", owner_review_required: true },
      { candidate_id: "mnsh_bccnm_lowe_2021", title: "BCCNM consent agreement concerning emergency assessment of an Indigenous person", province: "british_columbia", event_date: "2021-09", source_role: "regulator_finding", strongest_source: documents[8].url, corroboration: null, care_setting: ["emergency_department"], mechanism_tags: ["assessment_or_resuscitation"], verification_status: "official_regulator_finding", already_represented: false, next_investigation_step: "Check for a linked public coroner record without attempting to identify the person.", accountability_significance: "Direct regulator finding and sanctions; publication must preserve the person's anonymity.", owner_review_required: true },
      { candidate_id: "mnsh_bccnm_villaflor_2021", title: "BCCNM consent agreement concerning ritual without informed consent", province: "british_columbia", event_date: "2021-06", source_role: "regulator_finding", strongest_source: documents[9].url, corroboration: null, care_setting: ["other"], mechanism_tags: ["consent"], verification_status: "official_regulator_finding", already_represented: false, next_investigation_step: "Keep as a regulator-evidence candidate; no identity or extra incident detail is required.", accountability_significance: "Direct regulatory evidence of conduct involving an Indigenous client and formal practice consequences.", owner_review_required: true }
    ],
    new_provisional_incidents: [
      { candidate_id: "mnsh_ab_ojatm_2019", title: "O.J.A.T.M. fatality inquiry", province: "alberta", event_date: "2019-02-18", source_role: "fatality_inquiry_report", strongest_source: documents[15].url, verification_status: "private_owner_review", next_investigation_step: "Read the complete inquiry and separate health-system questions from child and family services findings.", owner_review_required: true },
      { candidate_id: "mnsh_ab_jonathan_anderson_2020", title: "Jonathan Anderson fatality inquiry", province: "alberta", event_date: "2020-03", source_role: "indigenous_media", strongest_source: documents[16].url, verification_status: "private_owner_review", next_investigation_step: "Retrieve and review the official fatality inquiry report before any public projection.", owner_review_required: true }
    ],
    existing_incidents_with_new_official_evidence: [
      { incident_id: "mni_b0800a1d1732b3fb35c8ebc1", title: "Trevor Dubois", source: documents[12].url, evidence_added: "SHA confirmed parallel police/coroner investigations, Critical Incident and use-of-force reviews, a third-party reviewer and a staff suspension pending review.", limitation: "This is the institution's account and is not an independent finding or final outcome." }
    ],
    existing_provisional_leads_rechecked: [
      { title: "Rene Whitstone", source: documents[13].url, status: "provisional_hold", result: "No coroner, regulator or later formal outcome was located in the bounded search; family allegations and the health region's account remain disputed." }
    ],
    new_systemic_evidence: [
      { title: "Maskwacis four-youth fatality inquiry and response tracker", source: documents[2].url, response_tracker: documents[1].url, status: "verified_accountability_chain_candidate", note: "Four deaths are reconciled as one inquiry/accountability cluster; 62 response rows cover 40 distinct numbered recommendations in the current tracker." },
      { title: "BC deaths during or following police encounters review", source: documents[10].url, status: "systemic_evidence_only", note: "The 127-death cohort included 26 Indigenous people; it does not create 26 individual incident records." },
      { title: "Saskatchewan hospital safety and security review", source: documents[17].url, status: "systemic_evidence_only", note: "The review includes First Nations and Métis engagement but expressly excludes detailed investigation of individual incidents and clinical matters." }
    ],
    rejected_or_out_of_scope: [
      { candidate: "Shayne Turner coroner recommendations", reason: "Healthcare mechanism is relevant, but the authoritative/public sources reviewed did not establish Indigenous identity." },
      { candidate: "Kevin First Charger fatality inquiry", reason: "A name is not evidence of Indigenous identity; the record is primarily a custodial-medical recommendation and needs a reliable identity/source connection before Miller North review." },
      { candidate: "Broad provincial road-fatality statistics", reason: "No specific Indigenous healthcare-access, ambulance or patient-transport event." },
      { candidate: "General TSB aviation occurrences", reason: "Out of scope unless a record establishes an air-ambulance, medevac or patient-transport connection." },
      { candidate: "BCCNM notices matched only through site navigation text", reason: "False-positive Indigenous matches unless the decision body itself establishes the connection." }
    ]
  },
  recommendation_response_assessment: {
    event_key: "ab_maskwacis_four_youth_inquiry_2017_2020",
    report_recommendation_count_reported_by_indigenous_media: 44,
    current_tracker_responder_rows: 62,
    current_tracker_distinct_numbered_recommendations: 40,
    current_tracker_status_counts: { accepted_in_principle_including_one_source_typo: 31, not_accepted: 13, other: 9, waiting_for_response: 5, accepted: 3, no_response: 1 },
    interpretation: "Tracker labels describe published responder positions. They do not by themselves establish implementation or outcomes. The difference between 44 report recommendations and 40 distinct numbered recommendations represented in the tracker must not be silently normalized.",
    highlighted_chains: buildRecommendationResponseChains(recommendationRows)
  },
  document_led_investigations: [solonasGraph, maskwacisGraph],
  stopping_rules_applied: ["primary event verified", "major official response families checked", "sources repeated", "no novel public branch remained", "further evidence would require a non-public or request-only record"],
  source_access_failures: [
    { source: "Saskatchewan Publications Centre product search API", result: "bounded public API request timed out; individual indexed downloads remain publicly discoverable", next_action: "Document supported query parameters or use catalogue exports before productionizing." },
    { source: "Alberta Open Government HTML pages", result: "some HTML requests returned access errors while CKAN metadata and the public XLSX download remained available", next_action: "Use CKAN metadata/resources as the deterministic listener path." },
    { source: "Individual BC and Saskatchewan coroner reports", result: "request-based rather than a bulk public index", next_action: "Do not automate requests; use public inquests, reports and responses first." }
  ],
  listener_memory_metrics: cycle.metrics,
  privacy: { identifiable_private_complaint_data_collected: false, report_requests_sent: false, owner_review_required_before_publication: true }
}

const querySets = {
  schema_version: "miller-north-coroner-serious-harm-query-sets-v1",
  generated_at: checkedAt,
  design_note: "Named entities are search anchors only. A community, facility, organization or surname never establishes an individual's Indigenous identity.",
  mechanism_vocabulary: ["inquest", "coroner", "ambulance", "patient death", "recommendation response", "hospital security", "sent home", "interfacility transfer"],
  provinces: {
    british_columbia: buildSeriousHarmQueries({ province: "British Columbia", entities: ["First Nations Health Authority", "Carrier Sekani Family Services", "Northern Health", "GR Baker Memorial Hospital", "St. Paul's Hospital", "BC Emergency Health Services"], mechanisms: ["inquest", "coroner", "ambulance", "patient death", "hospital security", "interfacility transfer"], limit: 24 }),
    alberta: buildSeriousHarmQueries({ province: "Alberta", entities: ["Maskwacis Health Services", "Alberta First Nations Information Governance Centre", "Ponoka Hospital", "Red Deer Regional Hospital", "Stoney Nakoda Tsuut'ina Tribal Council", "Alberta College of Paramedics"], mechanisms: ["fatality inquiry", "recommendation response", "ambulance", "patient death", "sent home", "interfacility transfer"], limit: 24 }),
    saskatchewan: buildSeriousHarmQueries({ province: "Saskatchewan", entities: ["First Nations Health Ombudsperson Office", "Federation of Sovereign Indigenous Nations", "Saskatoon Tribal Council", "Northern Inter-Tribal Health Authority", "Royal University Hospital", "Saskatchewan College of Paramedics"], mechanisms: ["inquest", "coroner", "ambulance", "patient death", "hospital security", "sent home"], limit: 24 })
  },
  stopping_rules: ["bounded result pages", "stop after repeated sources", "stop after primary and major response sources are checked", "never infer identity from entity/location"]
}

mkdirSync(dirname(previousPath), { recursive: true })
writeFileSync(previousPath, `${JSON.stringify(cycle, null, 2)}\n`)
writeFileSync(out("miller-north-coroner-serious-harm-excavation-v1.json"), `${JSON.stringify(excavation, null, 2)}\n`)
writeFileSync(out("miller-north-coroner-serious-harm-query-sets-v1.json"), `${JSON.stringify(querySets, null, 2)}\n`)

const report = `# Miller North Coroner & Serious Harm Listener v1\n\nGenerated: 2026-09-07\n\n## Outcome\n\nThis bounded, read-only excavation tested official incident-producing systems rather than repeating generic news searches. Owner review approved a local publication-safe projection containing **4 serious-harm records**: three newly represented B.C. incidents and one existing Saskatchewan event strengthened by an institutional statement. Accountability Watch gained **2 locally prepared chains**: the Maskwacis four-youth inquiry and the Solonas recommendation. Two Alberta matters remain private pending stronger official review. Nothing was deployed or written to production.\n\n## Alberta\n\nAlberta's fatality-inquiry system is the strongest recurring listener target. The public inquiry index links reports and the Open Government CKAN dataset exposes a structured recommendation-response workbook. The workbook contains 727 data rows. For the four-youth Maskwacis inquiry, the current tracker contains 62 responder rows covering 40 distinct numbered recommendations, while the inquiry and Indigenous reporting describe 44 recommendations. The tracker records 31 accepted-in-principle rows (including one explicitly normalized source typo), 13 not accepted, 9 other, 5 waiting for response, 3 accepted and 1 no response. These are responder positions, not implementation or outcome findings.\n\nO.J.A.T.M. and Jonathan Anderson remain private review candidates. O.J.A.T.M. requires a full-report healthcare-scope review. Jonathan Anderson requires retrieval of the official inquiry report before publication. The Office of the Chief Medical Examiner publishes mandate and aggregate workload information but is not a directly searchable public incident corpus.\n\n## British Columbia\n\nThe inquest index, verdicts and response links are highly listenable. The Nadine Marcy Solonas verdict documents paramedic assessment, emergency care and interfacility transfer and includes a jury recommendation to RCMP E Division for a 24/7 Indigenous support position for Indigenous people in custody who refuse or distrust first-responder care. The public projection does not characterize the inquest as a racism or legal-responsibility finding. No recommendation-specific RCMP response was located.\n\nTwo BCCNM consent agreements are direct regulatory outcomes. One concerns inadequate assessment, resuscitative measures and documentation for an unnamed Indigenous person in an emergency setting. The other concerns a religious ritual performed without informed consent and without consideration of an unnamed client's Indigenous heritage. Both public summaries minimize identity and reproduce no private complaint detail.\n\nDeath Review Panels remain systemic sources and are not expanded into individual incidents without case-level public evidence. Individual coroner reports are request-based; Miller North does not automate report requests.\n\n## Saskatchewan\n\nThe Government of Saskatchewan news search, filters and RSS were more reliable than bulk Saskatchewan Publications API access. Exact public document URLs remain usable, supporting a future two-step discovery and document-monitoring adapter.\n\nThe SHA statement about Trevor Dubois adds institutional evidence to an existing incident: announced police and Coroners Service investigations, a Critical Incident review, a use-of-force review, a third-party reviewer and staff suspension pending review. It is an institutional account, not a final finding. A later provincewide hospital-security review includes First Nations and Métis engagement but expressly excludes detailed investigation of individual incidents and clinical matters.\n\nThe historical Rene Whitstone lead remains private and provisional because no coroner, regulator, tribunal or later formal outcome was located.\n\n## Focused lanes\n\nThe Solonas verdict supplies one verified EMS/patient-transfer record. No additional public regulator or inquest record met the Indigenous-healthcare publication standard in the bounded EMS search. Hospital-security findings remain concentrated in the Dubois event and Saskatchewan's separate systemic review. Mental-health and rural/remote evidence improved through the Maskwacis inquiry and two private Alberta candidates, but those candidates require further official-document review. Broad collision statistics and generic TSB occurrences were rejected unless a direct patient-transport or medevac link was established.\n\n## Recommended recurring listeners\n\n1. Alberta recommendation-response workbook: stable structured identities and high accountability value; preserve response/implementation separation.\n2. B.C. inquest index and verdicts: high-quality official evidence and recommendation links.\n3. BCCNM notices: strong incident yield after body-only Indigenous/mechanism filtering.\n4. Saskatchewan government news plus exact Publications documents: promising, but bulk catalogue traversal needs a further technical mapping pass.\n\n## Safety\n\nNo private complaint data was sought or retained. No coroner report request, information request, production write, migration, deployment, push, commit or notification occurred. Local publication files remain subject to the repository's publication-safe projection and owner-review rules.\n`
writeFileSync(out("miller-north-coroner-serious-harm-listener-v1-2026-09-07.md"), report)

console.log(JSON.stringify({ memory: cycle.metrics, excavation: excavation.counts, registry_sources: registry.sources.length }, null, 2))
