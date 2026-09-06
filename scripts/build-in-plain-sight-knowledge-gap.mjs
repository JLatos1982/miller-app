import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  validateCanonicalDossierWorkflow,
  validateInPlainSightLedger,
  validateKnowledgeUpdateProjection,
} from "../server/farmKnowledgeGapInvestigator.js"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const farm = join(root, "artifacts", "farm")
const readJson = name => JSON.parse(readFileSync(join(farm, name), "utf8"))
const write = (name, value) => writeFileSync(join(farm, name), `${typeof value === "string" ? value.trim() : JSON.stringify(value, null, 2)}\n`)

const registry = readJson("open-government-source-registry-2026-09-06.json")
const fixtures = readJson("farm-canonical-research-fixtures-2026-09-06.json")
const dossiers = [
  "research-dossier-new-roads-2026-09-06.json",
  "research-dossier-creekside-road-to-recovery-2026-09-06.json",
  "research-dossier-fnho-governance-funding-2026-09-06.json",
  "research-dossier-in-plain-sight-reporting-2026-09-06.json",
].map(readJson)

const sourceCatalog = [
  ["ips_source_original_report", "fogs_bc_health_ministry", "https://engage.gov.bc.ca/app/uploads/sites/613/2020/11/In-Plain-Sight-Full-Report-2020.pdf", "In Plain Sight: Addressing Indigenous-specific Racism and Discrimination in B.C. Health Care", "In Plain Sight independent review / Government of British Columbia", "official_review_report", "2020-11-30"],
  ["ips_source_24_month_report", "fogs_bc_news_archive", "https://news.gov.bc.ca/files/IPS2YearReport.pdf", "In Plain Sight Task Team 24-Month Report", "In Plain Sight Task Team / Government of British Columbia", "official_progress_report", "2023-11-30"],
  ["ips_source_action_307", "fogs_bc_declaration_act_reporting", "https://declaration.gov.bc.ca/actions/3-07/", "Declaration Act Action 3.07", "Government of British Columbia", "official_action_plan_reporting", null],
  ["ips_source_hpoa_current", "fogs_bc_health_ministry", "https://www2.gov.bc.ca/gov/content/health/practitioner-professional-resources/professional-regulation/health-professions-and-occupations-act", "Health Professions and Occupations Act", "British Columbia Ministry of Health", "official_legislative_implementation_page", "2026-04-01"],
  ["ips_source_patient_quality_engagement", "fogs_bc_health_ministry", "https://engage.gov.bc.ca/patientcarequality/indigenous-engagement/", "Indigenous engagement: patient care quality review", "Government of British Columbia", "official_policy_engagement_page", null],
  ["ips_source_sharing_concerns", "fogs_bc_health_authorities", "https://healthqualitybc.ca/resources/sharing-concerns-principles-to-guide-the-development-of-an-indigenous-patient-feedback-process/", "Sharing Concerns: Principles to Guide the Development of an Indigenous Patient Feedback Process", "Health Quality BC", "official_health_system_guidance", "2024"],
  ["ips_source_tfa_evaluation", "fogs_fnha", "https://www.fnha.ca/Documents/Evaluation-of-the-BC-Tripartite-Framework-Agreement-on-First-Nations-Health-Governance-Final-Report-2018-2024.pdf", "Evaluation of the BC Tripartite Framework Agreement on First Nations Health Governance, 2018–2024", "First Nations Health Authority", "indigenous_led_evaluation", "2024"],
  ["ips_source_mmiwg_status_2024", "fogs_bc_open_information", "https://www2.gov.bc.ca/assets/gov/law-crime-and-justice/about-bc-justice-system/inquiries/mmiw/mmiwg-status-update-2024.pdf", "Responding to MMIWG: Status Update 2024", "Government of British Columbia", "official_cross_government_status_report", "2024-06-30"],
  ["ips_source_csh_standard", "fogs_fnha", "https://fnha.ca/fnha-and-hso-release-bc-cultural-safety-and-humility-standard/", "FNHA and HSO release B.C. Cultural Safety and Humility Standard", "First Nations Health Authority", "indigenous_led_standard_release", "2022-11-29"],
  ["ips_source_cowichan_hospital", "fogs_bc_news_archive", "https://archive.news.gov.bc.ca/releases/news_releases_2024-2028/2025INF0055-001108.htm", "New Quw’utsun Valley Hospital reaches 75% completion", "Government of British Columbia", "official_capital_project_update", "2025-10-17"],
  ["ips_source_ombudsperson_indigenous", "fogs_bc_ombudsperson", "https://bcombudsperson.ca/about-us/indigenous-initiatives/", "Indigenous initiatives", "Office of the Ombudsperson of British Columbia", "official_oversight_program_page", null],
  ["ips_source_camosun_iapr", "fogs_bc_open_information", "https://www2.gov.bc.ca/assets/gov/education/post-secondary-education/institution-resources-administration/accountability-framework/iapr/cam_iapr.pdf", "Camosun College Accountability Report 2024–2025", "Camosun College / Government of British Columbia", "official_institutional_accountability_report", "2025-06-30"],
  ["ips_source_selkirk_iapr", "fogs_bc_open_information", "https://www2.gov.bc.ca/assets/gov/education/post-secondary-education/institution-resources-administration/accountability-framework/iapr/sel_iapr.pdf", "Selkirk College Institutional Accountability Plan and Report 2024–2025", "Selkirk College / Government of British Columbia", "official_institutional_accountability_report", "2025-06-30"],
  ["ips_source_nursing_newsletter", "fogs_bc_health_ministry", "https://www2.gov.bc.ca/assets/gov/health/about-bc-s-health-care-system/heath-care-partners/health-newsletter/nps_newsletter_may_2024.pdf", "Nursing Policy Secretariat Newsletter, May 2024", "British Columbia Ministry of Health", "official_program_update", "2024-05-31"],
  ["ips_source_pho_learning_tools", "fogs_bc_health_ministry", "https://www2.gov.bc.ca/gov/content/health/about-bc-s-health-care-system/office-of-the-provincial-health-officer/unlearning-undoing-project/evolving-unlearning-undoing-project-tools", "Evolving Unlearning & Undoing Project tools", "Office of the Provincial Health Officer", "official_training_resource", null],
  ["ips_source_canada_health_act", "fogs_health_canada", "https://www.canada.ca/en/health-canada/services/publications/health-system-services/canada-health-act-annual-report-2024-2025.html", "Canada Health Act Annual Report 2024–2025", "Health Canada", "official_annual_report", "2025"],
  ["ips_source_sfu_fnha_mou", "fogs_fnha", "https://www.fnha.ca/about/news-and-events/news/sfu-and-fnha-sign-mou-to-improve-health-and-wellness-of-first-nations-peoples-in-bc", "SFU and FNHA sign MOU to improve health and wellness of First Nations peoples in B.C.", "First Nations Health Authority", "indigenous_organization_partnership_update", "2026-01-20"],
].map(([source_id, source_family_id, url, title, source_organization, source_type, publication_date]) => ({ source_id, source_family_id, url, title, source_organization, source_type, publication_date }))

const all = (...ids) => [...new Set(["ips_source_original_report", "ips_source_24_month_report", ...ids])]
const action = (date, summary, depth, ...source_references) => ({ date, summary, depth, source_references })
const evidence = (summary, ...source_references) => ({ summary, source_references })
const rec = (recommendation_number, value) => ({
  recommendation_id: `ips_recommendation_${String(recommendation_number).padStart(2, "0")}`,
  recommendation_number,
  original_recommendation_date: "2020-11-30",
  ...value,
})

const recommendations = [
  rec(1, {
    neutral_recommendation_summary: "The Province should apologize, prompt comparable health-system apologies and lead a comprehensive system-wide anti-racism response with common language and clear institutional responsibilities.",
    original_responsible_parties: ["Government of British Columbia (lead)", "health authorities", "health regulators", "health-sector associations and unions", "health education institutions"],
    relevant_organizations: ["British Columbia Ministry of Health", "regional health authorities", "PHSA", "health regulatory colleges", "health-sector bargaining parties"],
    government_or_institutional_response: "The Province, health authorities, PHSA and regulatory bodies issued apologies; later collective agreements and the Physician Master Agreement added anti-racism, cultural-safety, leave and workforce provisions.",
    commitments_made: ["Lead a coordinated system response", "embed common responsibilities across health-sector institutions"],
    implementation_actions: [action("2020-11-30 to 2023-11-30", "Provincial and health-system apologies were issued and 2022–25 agreements added relevant provisions.", "policy_adoption", "ips_source_24_month_report"), action("2023-2024", "Declaration Act reporting continued to identify agreement provisions as implementation activity.", "reporting", "ips_source_action_307")],
    implementation_evidence: [evidence("Official reporting documents apologies and concrete agreement provisions, while describing the provisions as an early step in longer system change.", "ips_source_24_month_report", "ips_source_action_307")],
    latest_evidence_date: "2026-09-06", source_references: all("ips_source_action_307"), evidence_classification: "official_primary_source", public_evidence_coverage: "direct_official_current",
    current_defensible_status: "substantially_implemented", confidence: "high", reporting_limitation: "The public record does not provide one system-wide outcome measure showing the broader transformation is complete.", owner_review_flag: false, owner_review_reason: null,
    remaining_gap_category: "organization_specific_follow_up", stopping_reason: "The apology and agreement outputs are established; system-wide outcome evidence is distributed and beyond this bounded ledger.", follow_up_signals: ["Later reporting continues to describe the agreement provisions as a first step rather than a completed system transformation."],
  }),
  rec(2, {
    neutral_recommendation_summary: "The Province, working with Indigenous peoples, should establish policy foundations and legislative changes that require anti-racism and embed cultural safety consistently with the Declaration Act and UN Declaration.",
    original_responsible_parties: ["Government of British Columbia (lead)", "Indigenous peoples in British Columbia (consultation and cooperation partners)"],
    relevant_organizations: ["British Columbia Ministry of Health", "Government of British Columbia", "Office of the Superintendent of Health Profession and Occupation Oversight"],
    government_or_institutional_response: "Government reported Human Rights Code, Health Professions and Occupations Act, Anti-Racism Data Act and Interpretation Act changes and later brought the HPOA framework into force.",
    commitments_made: ["Legislate anti-racism and cultural-safety foundations", "align implementation with the Declaration Act"],
    implementation_actions: [action("2021-12 to 2023-11", "Several legislative changes were enacted or reported as part of the response.", "policy_adoption", "ips_source_24_month_report"), action("2026-04-01", "The Health Professions and Occupations Act framework replaced the prior Health Professions Act framework.", "policy_adoption", "ips_source_hpoa_current")],
    implementation_evidence: [evidence("The current HPOA page expressly connects the reform to cultural safety, accountability and In Plain Sight.", "ips_source_hpoa_current")],
    latest_evidence_date: "2026-04-01", source_references: all("ips_source_hpoa_current", "ips_source_action_307"), evidence_classification: "official_primary_source", public_evidence_coverage: "direct_official_current",
    current_defensible_status: "partially_implemented", confidence: "high", reporting_limitation: "Multiple legislative elements are documented, but no authoritative source demonstrates that the full cross-system policy-and-law requirement is complete or operationally effective.", owner_review_flag: true, owner_review_reason: "Completion depends on the breadth and operational effect of multiple laws, policies and practices, not enactment alone.",
    remaining_gap_category: "owner_review", stopping_reason: "Authoritative enactment evidence is sufficient for partial status; effectiveness and full scope require legal/policy review.", follow_up_signals: ["The current Action 3.07 page carries forward a numbering mismatch by associating the PIDA expansion with recommendation 2; the original report assigns PIDA to recommendation 11."],
  }),
  rec(3, {
    neutral_recommendation_summary: "The Province, First Nations governing and representative bodies and Métis Nation British Columbia should jointly establish a legislatively recognized B.C. Indigenous Health Officer with a structured relationship to the Provincial Health Officer.",
    original_responsible_parties: ["Government of British Columbia", "First Nations governing bodies and representative organizations", "Métis Nation British Columbia"],
    relevant_organizations: ["British Columbia Ministry of Health", "Office of the Provincial Health Officer", "First Nations leadership organizations", "Métis Nation British Columbia"],
    government_or_institutional_response: "The 2023 report described continuing discussions with the Provincial Health Officer and Indigenous leaders.",
    commitments_made: ["Continue joint discussion on the position and its authority"],
    implementation_actions: [action("2023-11-30", "Official reporting described discussions about establishing the position.", "commitment", "ips_source_24_month_report")],
    implementation_evidence: [evidence("The latest recommendation-specific evidence located describes discussion, not establishment or legislative recognition.", "ips_source_24_month_report")],
    latest_evidence_date: "2023-11-30", source_references: all(), evidence_classification: "official_primary_source", public_evidence_coverage: "direct_official_baseline_only",
    current_defensible_status: "implementation_evidence_fragmentary", confidence: "medium", reporting_limitation: "No later authoritative public source located in this bounded search confirms creation, appointment, statutory authority or a structured PHO relationship.", owner_review_flag: true, owner_review_reason: "The public evidence stops at discussions and cannot resolve present institutional status.",
    remaining_gap_category: "FOI_candidate", stopping_reason: "Exact-title and responsible-organization searches returned the originating and 2023 reports but no later establishment record; the remaining question likely requires a ministry status record.", follow_up_signals: [],
  }),
  rec(4, {
    neutral_recommendation_summary: "The Province, First Nations governing and representative bodies and Métis Nation British Columbia should jointly establish a legislatively recognized, adequately funded Indigenous Health Representative and Advocate office for navigation, early intervention and dispute resolution.",
    original_responsible_parties: ["Government of British Columbia", "First Nations governing bodies and representative organizations", "Métis Nation British Columbia"],
    relevant_organizations: ["British Columbia Ministry of Health", "Office of the Ombudsperson", "health-system quality and safety leaders"],
    government_or_institutional_response: "The 2023 report described consultations, comparative research and an options paper; related complaint-support mechanisms have advanced separately.",
    commitments_made: ["Develop options for the representative-and-advocate functions"],
    implementation_actions: [action("2023-11-30", "A complaints working group reviewed models and was informing an options paper.", "commitment", "ips_source_24_month_report")],
    implementation_evidence: [evidence("The public record located shows preparatory work but does not establish that the specified office, authority and funding exist.", "ips_source_24_month_report", "ips_source_patient_quality_engagement")],
    latest_evidence_date: "2023-11-30", source_references: all("ips_source_patient_quality_engagement"), evidence_classification: "official_primary_source", public_evidence_coverage: "direct_official_baseline_only",
    current_defensible_status: "implementation_evidence_fragmentary", confidence: "medium", reporting_limitation: "Complaint-process improvements are not equivalent to the legislatively recognized office described in the recommendation.", owner_review_flag: true, owner_review_reason: "Current establishment, authority and funding of the proposed office remain unresolved.",
    remaining_gap_category: "FOI_candidate", stopping_reason: "Official web avenues did not produce a later office-establishment or legislative record; a bounded request for the status/options paper is the next proportionate step.", follow_up_signals: ["Later complaint-process work addresses adjacent functions but does not publicly resolve whether the recommended office was created."],
  }),
  rec(5, {
    neutral_recommendation_summary: "The Province, First Nations governing and representative bodies and Métis Nation British Columbia should jointly improve patient complaint processes for individual and systemic Indigenous-specific racism.",
    original_responsible_parties: ["Government of British Columbia", "First Nations governing bodies and representative organizations", "Métis Nation British Columbia"],
    relevant_organizations: ["British Columbia Ministry of Health", "Health Quality BC", "patient care quality offices", "FNHA", "health regulatory colleges"],
    government_or_institutional_response: "A draft guide, working groups, navigator roles, regulator reviews and regional complaint-process changes were reported; the current engagement program is developing further policy.",
    commitments_made: ["Co-develop a culturally safe patient feedback and complaint strategy"],
    implementation_actions: [action("2023-11-30", "Complaint pathways, navigator roles and regulator reviews were reported.", "operational_implementation", "ips_source_24_month_report"), action("2024", "Health Quality BC published an updated Sharing Concerns resource informed by evaluation.", "policy_adoption", "ips_source_sharing_concerns"), action("2025-2027", "The provincial patient-care-quality engagement program identified Indigenous engagement and policy development priorities.", "commitment", "ips_source_patient_quality_engagement")],
    implementation_evidence: [evidence("Concrete guidance and operational complaint-support activities exist, while a final uniform system strategy remains in development.", "ips_source_sharing_concerns", "ips_source_patient_quality_engagement")],
    latest_evidence_date: "2026-09-06", source_references: all("ips_source_sharing_concerns", "ips_source_patient_quality_engagement"), evidence_classification: "official_plus_health_system_reporting", public_evidence_coverage: "direct_official_current",
    current_defensible_status: "partially_implemented", confidence: "high", reporting_limitation: "The sources demonstrate mechanisms and continuing design work, not provincewide consistency or complaint outcomes.", owner_review_flag: false, owner_review_reason: null,
    remaining_gap_category: "organization_specific_follow_up", stopping_reason: "Implementation mechanisms are established; a provincewide inventory and outcome evaluation would require organization-level data.", follow_up_signals: ["The 2024 update to the principles and 2025–27 engagement priorities show that complaint-process work remains iterative."],
  }),
  rec(6, {
    neutral_recommendation_summary: "Parties to bilateral and tripartite First Nations health agreements should address unmet commitments through renewed structures and agreements consistent with the Declaration Act.",
    original_responsible_parties: ["Government of British Columbia", "Government of Canada", "First Nations Health Authority", "First Nations Health Council", "B.C. First Nations"],
    relevant_organizations: ["First Nations Health Council", "First Nations Health Authority", "British Columbia Ministry of Health", "Indigenous Services Canada"],
    government_or_institutional_response: "Tripartite partners continued work under the governance agreement and supported a First Nations-led 10-Year Strategy on the Social Determinants of Health.",
    commitments_made: ["Renew tripartite structures", "implement the First Nations-led 10-Year Strategy"],
    implementation_actions: [action("2023-03-02", "Chiefs approved the 10-Year Strategy and partners committed to an implementation model.", "policy_adoption", "ips_source_24_month_report"), action("2024", "A First Nations-led evaluation documented implementation activity and outstanding sustainability and accountability work.", "evaluation", "ips_source_tfa_evaluation")],
    implementation_evidence: [evidence("The strategy and evaluation demonstrate active governance implementation, but the broad set of previously unmet commitments is not presented as closed.", "ips_source_tfa_evaluation")],
    latest_evidence_date: "2024-12-31", source_references: all("ips_source_tfa_evaluation"), evidence_classification: "official_plus_indigenous_led_evaluation", public_evidence_coverage: "organizational_current_with_official_baseline",
    current_defensible_status: "implementation_underway", confidence: "high", reporting_limitation: "The recommendation covers multiple agreements and unmet commitments; public sources do not provide one commitment-by-commitment completion ledger.", owner_review_flag: true, owner_review_reason: "Agreement-level scope and governance authority require careful review rather than a single completion label.",
    remaining_gap_category: "organization_specific_follow_up", stopping_reason: "The authoritative governance evaluation establishes current work and remaining issues; finer-grained status belongs with the agreement parties.", follow_up_signals: ["The later evaluation continued to identify sustainability, clarity and accountability work within the tripartite arrangement."],
  }),
  rec(7, {
    neutral_recommendation_summary: "The Ministry should establish a senior Métis health relationship table and direct health authorities to enter measurable Letters of Understanding with Métis Nation British Columbia and Métis Chartered Communities.",
    original_responsible_parties: ["British Columbia Ministry of Health", "regional health authorities", "PHSA", "Métis Nation British Columbia", "Métis Chartered Communities"],
    relevant_organizations: ["Métis Nation British Columbia", "British Columbia Ministry of Health", "regional health authorities", "PHSA"],
    government_or_institutional_response: "Monthly bilateral meetings, a cross-government Métis table and LOUs with regional health authorities were reported; later reporting describes continuing tables and joint planning.",
    commitments_made: ["Maintain a structured senior table", "operationalize measurable health-authority relationships"],
    implementation_actions: [action("2023-11-30", "A bilateral table and LOUs with all five regional health authorities were reported, with PHSA work then under development.", "office_or_program_creation", "ips_source_24_month_report"), action("2024-06-30", "Cross-government reporting described LOUs and implementation tables continuing.", "reporting", "ips_source_mmiwg_status_2024")],
    implementation_evidence: [evidence("Formal tables and agreements are evidenced; ongoing outcome measurement is not comprehensively reported in one place.", "ips_source_24_month_report", "ips_source_mmiwg_status_2024")],
    latest_evidence_date: "2024-06-30", source_references: all("ips_source_mmiwg_status_2024"), evidence_classification: "official_plus_metis_governance_reporting", public_evidence_coverage: "organizational_current_with_official_baseline",
    current_defensible_status: "substantially_implemented", confidence: "high", reporting_limitation: "The existence of tables and agreements is clear; consistent measurable outcomes across every agreement are not established by this ledger.", owner_review_flag: false, owner_review_reason: null,
    remaining_gap_category: "organization_specific_follow_up", stopping_reason: "Core governance mechanisms are confirmed; the remaining question is agreement-specific outcome reporting.", follow_up_signals: ["Later reporting revisits the tables and LOUs as active implementation mechanisms."],
  }),
  rec(8, {
    neutral_recommendation_summary: "Health-system policymakers, authorities, regulators, facilities, review boards and education programs should adopt an Indigenous cultural-safety and humility accreditation standard developed with Indigenous peoples.",
    original_responsible_parties: ["health policymakers", "health authorities", "health regulators", "health organizations and facilities", "patient care quality review boards", "health education programs"],
    relevant_organizations: ["First Nations Health Authority", "Health Standards Organization", "British Columbia Ministry of Health", "health authorities", "accreditation bodies"],
    government_or_institutional_response: "FNHA and HSO published a First Nations-led B.C. Cultural Safety and Humility Standard; later work is converting it into an assessment standard for accreditation and supporting organizational adoption.",
    commitments_made: ["Move the standard from reference guidance to an assessable accreditation mechanism", "develop Ministry adoption plans"],
    implementation_actions: [action("2022-11-29", "FNHA and HSO released the B.C. Cultural Safety and Humility Standard.", "policy_adoption", "ips_source_csh_standard"), action("2023-11-30 onward", "Official reporting described funded conversion to an assessment standard and Ministry implementation planning.", "commitment", "ips_source_24_month_report")],
    implementation_evidence: [evidence("The standard exists as a concrete output; universal adoption and accreditation use are not yet demonstrated.", "ips_source_csh_standard", "ips_source_action_307")],
    latest_evidence_date: "2025-12-31", source_references: all("ips_source_csh_standard", "ips_source_action_307"), evidence_classification: "official_plus_indigenous_led_source", public_evidence_coverage: "organizational_current_with_official_baseline",
    current_defensible_status: "partially_implemented", confidence: "high", reporting_limitation: "Publication of a standard is not the same as adoption by every named institution or use in accreditation.", owner_review_flag: true, owner_review_reason: "The recommendation's universal adoption scope is broader than the evidence of standard creation and assessment development.",
    remaining_gap_category: "organization_specific_follow_up", stopping_reason: "Standard creation is confirmed; adoption and accreditation status must be checked institution by institution.", follow_up_signals: ["Later work to create an assessment standard indicates that accreditation operationalization remained underway after publication."],
  }),
  rec(9, {
    neutral_recommendation_summary: "The Province should establish a system-wide Indigenous cultural-safety, health-rights and anti-racism measurement framework with appropriate Indigenous data governance.",
    original_responsible_parties: ["Government of British Columbia", "First Nations governing bodies and representative organizations", "Métis Nation British Columbia", "Indigenous Health Officer", "Indigenous Health Representative and Advocate"],
    relevant_organizations: ["PHSA", "Providence Health Care", "British Columbia Ministry of Health", "regional health authorities", "NCCIH"],
    government_or_institutional_response: "A measurement working group was developing indicators, data-sharing arrangements and a dashboard, informed by NCCIH work.",
    commitments_made: ["Develop a balanced indicator set and performance dashboard", "apply Indigenous data-governance processes"],
    implementation_actions: [action("2022-06 to 2023-11", "NCCIH published measurement work and a B.C. working group began framework and dashboard development.", "commitment", "ips_source_24_month_report"), action("2024-06-30", "Cross-government reporting continued to describe measurement and dashboard development.", "reporting", "ips_source_mmiwg_status_2024")],
    implementation_evidence: [evidence("The working mechanism is documented, but no public system-wide dashboard or completed framework was located.", "ips_source_24_month_report", "ips_source_mmiwg_status_2024")],
    latest_evidence_date: "2024-06-30", source_references: all("ips_source_mmiwg_status_2024"), evidence_classification: "official_primary_source", public_evidence_coverage: "direct_official_current",
    current_defensible_status: "implementation_underway", confidence: "medium", reporting_limitation: "Working-group activity does not establish a completed framework, public dashboard or full Indigenous data-governance implementation.", owner_review_flag: true, owner_review_reason: "No completed public framework or dashboard was located.",
    remaining_gap_category: "organization_specific_follow_up", stopping_reason: "Official sources establish development activity; current deliverables need confirmation from the Ministry/working-group leads.", follow_up_signals: ["The later status update continued to describe development rather than a completed measurement system."],
  }),
  rec(10, {
    neutral_recommendation_summary: "Hospital design should be undertaken with local Indigenous peoples and host Nations and include culturally appropriate ceremonial spaces, art, signage and territorial acknowledgement.",
    original_responsible_parties: ["regional health authorities", "PHSA", "hospital project authorities", "local Indigenous peoples and host Nations"],
    relevant_organizations: ["regional health authorities", "British Columbia Ministry of Health", "Infrastructure BC", "local First Nations"],
    government_or_institutional_response: "Health authorities reported integration of Indigenous design elements in existing and new facilities; later capital reporting documents specific examples developed with local Nations.",
    commitments_made: ["Apply partnership-based Indigenous design practices to health facilities"],
    implementation_actions: [action("2023-11-30", "Regional implementation through art, signage, acknowledgements and cultural spaces was reported.", "operational_implementation", "ips_source_24_month_report"), action("2025-10-17", "The Quw’utsun Valley Hospital update documented culturally safe spaces and dedicated Indigenous program space.", "operational_implementation", "ips_source_cowichan_hospital")],
    implementation_evidence: [evidence("Concrete facility examples are public; no provincewide capital-project compliance inventory was located.", "ips_source_cowichan_hospital")],
    latest_evidence_date: "2025-10-17", source_references: all("ips_source_cowichan_hospital"), evidence_classification: "official_primary_source", public_evidence_coverage: "direct_official_current",
    current_defensible_status: "partially_implemented", confidence: "high", reporting_limitation: "Examples do not establish consistent adoption across all existing and future hospitals.", owner_review_flag: true, owner_review_reason: "The recommendation is system-wide, while accessible evidence is project-specific.",
    remaining_gap_category: "organization_specific_follow_up", stopping_reason: "Multiple official project examples confirm implementation; full coverage would require health-authority capital-program records.", follow_up_signals: ["Later hospital-project reporting provides operational examples but not a system-wide assessment."],
  }),
  rec(11, {
    neutral_recommendation_summary: "The Province should extend Public Interest Disclosure Act protections across health-sector employees to strengthen safe disclosure of wrongdoing, including Indigenous-specific racism.",
    original_responsible_parties: ["Government of British Columbia", "Office of the Ombudsperson", "health authorities"],
    relevant_organizations: ["Office of the Ombudsperson", "regional health authorities", "PHSA", "British Columbia Ministry of Health"],
    government_or_institutional_response: "PIDA coverage was extended to health-authority employees effective June 2023, with Ombudsperson implementation support.",
    commitments_made: ["Extend statutory disclosure protections to health-authority employees"],
    implementation_actions: [action("2023-06-01", "Health-authority employees came within the PIDA coverage described by the official response.", "policy_adoption", "ips_source_24_month_report"), action("2026-09-06", "The current Action 3.07 page continues to report this legislative implementation, although it mislabels the recommendation number.", "reporting", "ips_source_action_307")],
    implementation_evidence: [evidence("The central statutory extension requested by the recommendation is documented as in force for health-authority employees.", "ips_source_24_month_report", "ips_source_action_307")],
    latest_evidence_date: "2026-09-06", source_references: all("ips_source_action_307"), evidence_classification: "official_primary_source", public_evidence_coverage: "direct_official_current",
    current_defensible_status: "implemented", confidence: "high", reporting_limitation: "The statutory change is evidenced; this status does not claim that speak-up culture or reporting outcomes are fully achieved.", owner_review_flag: false, owner_review_reason: null,
    remaining_gap_category: "owner_review", stopping_reason: "The requested legal coverage is established; culture and outcome questions are separate evaluation questions.", follow_up_signals: ["The current Action 3.07 page appears to label the PIDA item as recommendation 2 rather than recommendation 11; original-report numbering controls this ledger."],
  }),
  rec(12, {
    neutral_recommendation_summary: "The B.C. Ombudsperson should prioritize Indigenous-specific racism in health care, seek partner input, improve fairness-related activities and report publicly on progress.",
    original_responsible_parties: ["Office of the Ombudsperson of British Columbia"],
    relevant_organizations: ["Office of the Ombudsperson", "Indigenous communities and organizations"],
    government_or_institutional_response: "The Ombudsperson maintained the racism-reporting line, developed Indigenous community services and appointed regional pathfinders; its current Indigenous initiatives page describes ongoing access and relationship work.",
    commitments_made: ["Strengthen culturally appropriate complaint access and Indigenous engagement"],
    implementation_actions: [action("2023-11-30", "The office reported the dedicated line, community-services planning and regional pathfinders.", "office_or_program_creation", "ips_source_24_month_report"), action("2026-09-06", "The current Indigenous initiatives page documents continuing relationship and access work.", "operational_implementation", "ips_source_ombudsperson_indigenous")],
    implementation_evidence: [evidence("An operational Indigenous initiatives program is public; a recommendation-specific outcome ledger is not.", "ips_source_ombudsperson_indigenous")],
    latest_evidence_date: "2026-09-06", source_references: all("ips_source_ombudsperson_indigenous"), evidence_classification: "official_oversight_source", public_evidence_coverage: "organizational_current_with_official_baseline",
    current_defensible_status: "partially_implemented", confidence: "high", reporting_limitation: "The program is visible, but public reporting does not map all current activities and outcomes specifically to recommendation 12.", owner_review_flag: false, owner_review_reason: null,
    remaining_gap_category: "organization_specific_follow_up", stopping_reason: "The office's public materials establish ongoing implementation; recommendation-specific outcomes would require office-level follow-up.", follow_up_signals: ["The current program continues the recommendation's access and engagement functions beyond the 24-month report."],
  }),
  rec(13, {
    neutral_recommendation_summary: "The Province should create an Associate Deputy Minister for Indigenous Health with authority to support Ministry leadership in implementing the recommendations.",
    original_responsible_parties: ["Government of British Columbia", "British Columbia Ministry of Health"],
    relevant_organizations: ["British Columbia Ministry of Health"],
    government_or_institutional_response: "The Ministry created and filled the Associate Deputy Minister, Indigenous Health and Reconciliation position in 2021.",
    commitments_made: ["Create and staff the senior ministry role"],
    implementation_actions: [action("2021", "The Associate Deputy Minister position was created and filled.", "office_or_program_creation", "ips_source_24_month_report")],
    implementation_evidence: [evidence("The 24-month official report states that the recommended role was created and filled.", "ips_source_24_month_report")],
    latest_evidence_date: "2023-11-30", source_references: all(), evidence_classification: "official_primary_source", public_evidence_coverage: "direct_official_baseline_only",
    current_defensible_status: "implemented", confidence: "high", reporting_limitation: "This status concerns creation of the role, not an evaluation of its authority, continuity or effectiveness.", owner_review_flag: false, owner_review_reason: null,
    remaining_gap_category: "owner_review", stopping_reason: "The bounded recommendation requirement is directly answered by the official report; tenure and effectiveness are separate questions.", follow_up_signals: [],
  }),
  rec(14, {
    neutral_recommendation_summary: "Government, health authorities, post-secondary institutions, regulators and health-service organizations should recruit Indigenous people into senior roles capable of leading system change.",
    original_responsible_parties: ["Government of British Columbia", "PHSA and regional health authorities", "post-secondary health programs", "health regulators", "health-service organizations, providers and facilities"],
    relevant_organizations: ["health authorities", "FNHA", "public post-secondary institutions", "health regulatory colleges"],
    government_or_institutional_response: "The 2023 report documented Indigenous vice-presidents in all provincial health authorities, board appointments and post-secondary recruitment policies; later institutional accountability reports provide selected examples.",
    commitments_made: ["Recruit Indigenous senior leaders across the named sectors"],
    implementation_actions: [action("2023-11-30", "All provincial health authorities reported Indigenous Health vice-presidents and minimum Indigenous board representation.", "workforce_or_training_activity", "ips_source_24_month_report"), action("2025-06-30", "Camosun's accountability report documented Indigenous leadership and governance participation.", "reporting", "ips_source_camosun_iapr")],
    implementation_evidence: [evidence("Strong health-authority examples exist; comprehensive coverage across every named organization class is not public in one source.", "ips_source_24_month_report", "ips_source_camosun_iapr")],
    latest_evidence_date: "2025-06-30", source_references: all("ips_source_camosun_iapr"), evidence_classification: "official_plus_institutional_reporting", public_evidence_coverage: "direct_official_current",
    current_defensible_status: "partially_implemented", confidence: "high", reporting_limitation: "No complete cross-sector roster or retention/outcome measure was located.", owner_review_flag: true, owner_review_reason: "The recommendation spans a much broader institutional set than the health-authority evidence alone.",
    remaining_gap_category: "organization_specific_follow_up", stopping_reason: "The cross-sector scope requires institution-specific workforce reporting; examples are sufficient for partial status only.", follow_up_signals: ["Post-secondary accountability reporting continues to document institution-specific leadership measures rather than a system-wide roll-up."],
  }),
  rec(15, {
    neutral_recommendation_summary: "The Province, Indigenous governing and representative bodies, Métis Nation British Columbia, the PHO and Indigenous Health Officer should create a robust Indigenous pandemic-response structure that resolves jurisdictional issues and upholds the UN Declaration.",
    original_responsible_parties: ["Government of British Columbia", "First Nations governing bodies and representative organizations", "Métis Nation British Columbia", "Provincial Health Officer", "Indigenous Health Officer"],
    relevant_organizations: ["Office of the Provincial Health Officer", "regional health authorities", "First Nations partners", "Métis Nation British Columbia"],
    government_or_institutional_response: "Regional health authorities reported strengthening response capacity and supply chains; the PHO was reviewing policies through an anti-racism lens.",
    commitments_made: ["Strengthen emergency supply chains", "develop anti-racist pandemic-planning approaches"],
    implementation_actions: [action("2023-11-30", "Regional capacity-building and a PHO policy review were reported.", "commitment", "ips_source_24_month_report")],
    implementation_evidence: [evidence("Activity is documented, but the jointly governed provincial structure described by the recommendation is not clearly identified in public reporting.", "ips_source_24_month_report")],
    latest_evidence_date: "2023-11-30", source_references: all(), evidence_classification: "official_primary_source", public_evidence_coverage: "direct_official_baseline_only",
    current_defensible_status: "implementation_evidence_fragmentary", confidence: "medium", reporting_limitation: "Regional practices and a policy review do not by themselves prove establishment of the recommended joint structure.", owner_review_flag: true, owner_review_reason: "The named Indigenous Health Officer role is itself unresolved and the joint governance structure is not public.",
    remaining_gap_category: "FOI_candidate", stopping_reason: "Broad official-source searches found emergency-response activity but no current terms of reference or governance record for the recommended structure.", follow_up_signals: [],
  }),
  rec(16, {
    neutral_recommendation_summary: "The Province should take immediate measures responding to the MMIWG Calls for Justice and the specific health-care experiences and needs of Indigenous women identified by the review.",
    original_responsible_parties: ["Government of British Columbia"],
    relevant_organizations: ["Ministry of Public Safety and Solicitor General", "Ministry of Health", "Office of Gender Equity", "BC Women's Hospital", "Indigenous partners"],
    government_or_institutional_response: "The Province connected Path Forward work, a gender-based violence action plan, universal contraception and training resources to this response.",
    commitments_made: ["Advance the Path Forward priorities and MMIWG Calls for Justice", "support culturally safe gender-based violence response"],
    implementation_actions: [action("2022-07 to 2023-04", "A refreshed health-sector course and universal prescription contraception were implemented among broader initiatives.", "operational_implementation", "ips_source_24_month_report"), action("2024-06-30", "The Province issued a later MMIWG implementation status update.", "reporting", "ips_source_mmiwg_status_2024")],
    implementation_evidence: [evidence("Specific measures are established, while the recommendation's full Calls-for-Justice scope remains broader than those outputs.", "ips_source_mmiwg_status_2024")],
    latest_evidence_date: "2024-06-30", source_references: all("ips_source_mmiwg_status_2024"), evidence_classification: "official_primary_source", public_evidence_coverage: "direct_official_current",
    current_defensible_status: "partially_implemented", confidence: "high", reporting_limitation: "The public sources report a portfolio of measures, not a completion determination for all health-related Calls for Justice or review findings.", owner_review_flag: true, owner_review_reason: "The recommendation is broad and cross-government; selected measures cannot stand for the entire obligation.",
    remaining_gap_category: "organization_specific_follow_up", stopping_reason: "The dedicated status report is authoritative but remains multi-action rather than a completion ledger.", follow_up_signals: ["Later MMIWG reporting continued to describe active implementation and outstanding work."],
  }),
  rec(17, {
    neutral_recommendation_summary: "The Province and FNHA should demonstrate progress in expanding access to culturally safe mental-health, wellness and substance-use services.",
    original_responsible_parties: ["Government of British Columbia", "First Nations Health Authority"],
    relevant_organizations: ["British Columbia Ministry of Health", "First Nations Health Authority", "Ministry responsible for mental health and addictions", "Health Canada"],
    government_or_institutional_response: "Government reported adult and youth treatment capacity, community programs and culturally safe service investments; federal reporting later described an Indigenous Health and Cultural Safety Fund linked to the recommendation.",
    commitments_made: ["Expand culturally safe mental-health, wellness, substance-use and harm-reduction access"],
    implementation_actions: [action("2023-11-30", "The Province reported additional adult beds and youth programs, with Indigenous clients prioritized or Indigenous partners involved.", "operational_implementation", "ips_source_24_month_report"), action("2024-04-01 to 2025-03-31", "Federal reporting identified $171.8 million in program-level Indigenous health and cultural-safety funding connected to the recommendation.", "funding", "ips_source_canada_health_act")],
    implementation_evidence: [evidence("Services and funding are evidenced, but the public record does not provide a complete access, geographic coverage or outcome assessment.", "ips_source_24_month_report", "ips_source_canada_health_act", "ips_source_tfa_evaluation")],
    latest_evidence_date: "2025-03-31", source_references: all("ips_source_canada_health_act", "ips_source_tfa_evaluation"), evidence_classification: "official_plus_indigenous_led_evaluation", public_evidence_coverage: "direct_official_current",
    current_defensible_status: "partially_implemented", confidence: "high", reporting_limitation: "Program funding and service examples do not demonstrate provincewide access or outcomes; the federal amount is not attributable to every activity.", owner_review_flag: true, owner_review_reason: "Access progress and program-level funding require careful scope control.",
    remaining_gap_category: "organization_specific_follow_up", stopping_reason: "Operational examples are sufficient for partial implementation; comprehensive access evidence requires program and regional datasets.", follow_up_signals: ["Later evaluation and annual reporting document continued investment while retaining system-access and sustainability questions."],
  }),
  rec(18, {
    neutral_recommendation_summary: "All B.C. post-secondary health-profession programs should have mandatory strategies and targets for Indigenous recruitment, enrolment, graduation and safer learning environments.",
    original_responsible_parties: ["Government of British Columbia", "B.C. universities and colleges with health-profession programs"],
    relevant_organizations: ["Ministry of Post-Secondary Education and Future Skills", "public post-secondary institutions", "FNHA"],
    government_or_institutional_response: "The Province reported career pathways, dedicated seats and student supports; later institutional accountability reports document program-level recruitment, targets and learning-environment measures.",
    commitments_made: ["Require mandatory recruitment and completion strategies across health programs"],
    implementation_actions: [action("2023-11-30", "Health Career Access pathways, dedicated seats and Indigenous student supports were reported.", "operational_implementation", "ips_source_24_month_report"), action("2025-06-30", "Camosun reported recruitment strategies, targets and culturally safe supports for relevant programs.", "reporting", "ips_source_camosun_iapr")],
    implementation_evidence: [evidence("Institution-level implementation exists, but universal program coverage and provincewide target attainment are not demonstrated.", "ips_source_camosun_iapr")],
    latest_evidence_date: "2025-06-30", source_references: all("ips_source_camosun_iapr"), evidence_classification: "official_institutional_reporting", public_evidence_coverage: "organizational_current_with_official_baseline",
    current_defensible_status: "partially_implemented", confidence: "medium", reporting_limitation: "A sample institutional report cannot establish compliance across every health-profession degree and diploma program.", owner_review_flag: true, owner_review_reason: "The evidence is institution-specific and outcome language may not be consistently measured.",
    remaining_gap_category: "organization_specific_follow_up", stopping_reason: "The Province's institutional accountability mechanism yields examples; a complete roll-up would require all program reports and standardized metrics.", follow_up_signals: ["2024–25 accountability reporting continues to ask institutions to report recommendation-specific activity, showing ongoing rather than closed implementation."],
  }),
  rec(19, {
    neutral_recommendation_summary: "A centre should provide open access to anti-racism, cultural-safety and trauma-informed standards, evidence, tools, policy expertise and collaborative capacity.",
    original_responsible_parties: ["Government of British Columbia and health-system partners"],
    relevant_organizations: ["National Collaborating Centre for Indigenous Health", "First Nations Health Directors Association", "British Columbia health-system partners"],
    government_or_institutional_response: "The 2023 report described NCCIH tool development and a separate FNHDA training-centre initiative; later cross-government reporting continued to describe tools and health-authority teams.",
    commitments_made: ["Develop open-access tools and expertise", "create training-centre capacity"],
    implementation_actions: [action("2023-11-30", "NCCIH and FNHDA initiatives were described as under development.", "commitment", "ips_source_24_month_report"), action("2024-06-30", "Cross-government reporting described continuing tool development and Indigenous-health teams.", "reporting", "ips_source_mmiwg_status_2024")],
    implementation_evidence: [evidence("Tools and institutional activity exist; no single centre matching the complete recommended mandate was confirmed.", "ips_source_24_month_report", "ips_source_mmiwg_status_2024")],
    latest_evidence_date: "2024-06-30", source_references: all("ips_source_mmiwg_status_2024"), evidence_classification: "official_plus_indigenous_organization_reporting", public_evidence_coverage: "organizational_current_with_official_baseline",
    current_defensible_status: "implementation_underway", confidence: "medium", reporting_limitation: "Related organizations and tools should not be treated as proof that the recommended single centre and governance structure were established.", owner_review_flag: true, owner_review_reason: "The identity and mandate of any completed centre remain ambiguous.",
    remaining_gap_category: "organization_specific_follow_up", stopping_reason: "Official sources identify candidate mechanisms but not a completed centre; direct follow-up with NCCIH/FNHDA is the bounded next step.", follow_up_signals: ["Later reporting repeats tool and team development without clearly identifying a completed centre."],
  }),
  rec(20, {
    neutral_recommendation_summary: "The health system should implement a refreshed, co-developed, standardized and mandatory anti-racism, cultural-humility and trauma-informed training approach that absorbs existing San'yas training.",
    original_responsible_parties: ["Government of British Columbia", "First Nations governing and representative bodies", "Métis Nation British Columbia", "health authorities", "health education institutions"],
    relevant_organizations: ["British Columbia Ministry of Health", "regional health authorities", "Health Quality BC", "Office of the Provincial Health Officer", "health professional regulators"],
    government_or_institutional_response: "Many organizations mandated training, government funded training activity, and provincial guidance and mandatory PHO learning tools were developed.",
    commitments_made: ["Develop standardized learning expectations", "make low-barrier components mandatory"],
    implementation_actions: [action("2023-11-30", "Multiple health organizations reported mandatory training and provincial guidance development.", "workforce_or_training_activity", "ips_source_24_month_report"), action("2024-05-31", "The Nursing Policy Secretariat reported expansion of cultural-safety and humility training tied to recommendation 20.", "workforce_or_training_activity", "ips_source_nursing_newsletter"), action("2025-2026", "The PHO published a mandatory Foundational Commitments learning series covering In Plain Sight and related frameworks.", "workforce_or_training_activity", "ips_source_pho_learning_tools")],
    implementation_evidence: [evidence("Mandatory training activity is demonstrable, but no single source proves a standardized co-developed approach for all health workers or its effectiveness.", "ips_source_nursing_newsletter", "ips_source_pho_learning_tools")],
    latest_evidence_date: "2026-09-06", source_references: all("ips_source_nursing_newsletter", "ips_source_pho_learning_tools", "ips_source_mmiwg_status_2024"), evidence_classification: "official_primary_source", public_evidence_coverage: "direct_official_current",
    current_defensible_status: "partially_implemented", confidence: "high", reporting_limitation: "Training availability and mandates do not prove universal completion, standardized outcomes or training effectiveness.", owner_review_flag: true, owner_review_reason: "The recommendation's standardization, co-development and system-wide reach exceed the available activity evidence.",
    remaining_gap_category: "organization_specific_follow_up", stopping_reason: "Current official tools and program reporting establish activity; system-wide completion and evaluation require workforce data.", follow_up_signals: ["Later sources revisit training expansion and guidance, suggesting continuing implementation rather than a closed task."],
  }),
  rec(21, {
    neutral_recommendation_summary: "All B.C. post-secondary health-practitioner programs should include mandatory teaching on Indigenous-specific racism, colonialism, trauma-informed care, Indigenous health and the UN Declaration standard.",
    original_responsible_parties: ["B.C. universities and colleges with health-practitioner programs", "Government of British Columbia"],
    relevant_organizations: ["Ministry of Post-Secondary Education and Future Skills", "public post-secondary institutions", "health-program accreditors"],
    government_or_institutional_response: "Provincial partners developed training guidance; later institutional accountability reports document mandatory components within particular health programs.",
    commitments_made: ["Develop guidance supporting mandatory post-secondary curriculum"],
    implementation_actions: [action("2023-11-30", "A provincial training-in-education strategy and guidance were under development.", "commitment", "ips_source_24_month_report"), action("2025-06-30", "Selkirk reported mandatory Indigenous health, cultural-safety and trauma-informed curriculum components in specified programs.", "operational_implementation", "ips_source_selkirk_iapr")],
    implementation_evidence: [evidence("Program-level mandatory curriculum is documented; universal coverage across all institutions and programs is not.", "ips_source_selkirk_iapr", "ips_source_camosun_iapr")],
    latest_evidence_date: "2025-06-30", source_references: all("ips_source_selkirk_iapr", "ips_source_camosun_iapr"), evidence_classification: "official_institutional_reporting", public_evidence_coverage: "organizational_current_with_official_baseline",
    current_defensible_status: "partially_implemented", confidence: "medium", reporting_limitation: "Institutional reports are heterogeneous and do not form a complete all-program compliance ledger.", owner_review_flag: true, owner_review_reason: "The evidence demonstrates examples, not universal implementation.",
    remaining_gap_category: "organization_specific_follow_up", stopping_reason: "Selected official reports establish partial implementation; a comprehensive determination requires systematic review of all health-program reports.", follow_up_signals: ["The 2024–25 institutional reports continue to label several curriculum changes as ongoing or new."],
  }),
  rec(22, {
    neutral_recommendation_summary: "The Province, with Indigenous peoples, should pursue truth-telling and public education, including age-appropriate resources on Indigenous health and wellness before and after European arrival.",
    original_responsible_parties: ["Government of British Columbia", "Indigenous peoples in British Columbia"],
    relevant_organizations: ["Ministry of Education and Child Care", "British Columbia Ministry of Health", "schools and public education partners"],
    government_or_institutional_response: "Government launched an education anti-racism strategy, introduced an Indigenous-focused graduation requirement and produced teacher resources.",
    commitments_made: ["Expand public and classroom truth-telling resources"],
    implementation_actions: [action("2023-2024 school year", "An Indigenous-focused graduation requirement and teacher resources took effect.", "policy_adoption", "ips_source_24_month_report"), action("2023-2026", "Declaration Act reporting continues to identify these education measures as recommendation activity.", "reporting", "ips_source_action_307")],
    implementation_evidence: [evidence("Concrete education measures are in place, while the broader health-history and all-ages public-education scope is not comprehensively assessed.", "ips_source_24_month_report", "ips_source_action_307")],
    latest_evidence_date: "2026-09-06", source_references: all("ips_source_action_307"), evidence_classification: "official_primary_source", public_evidence_coverage: "direct_official_current",
    current_defensible_status: "partially_implemented", confidence: "high", reporting_limitation: "School requirements and teacher guidance do not by themselves satisfy or measure the recommendation's full public-education scope.", owner_review_flag: true, owner_review_reason: "The evidence is strong for specified elements but not for the whole recommendation.",
    remaining_gap_category: "organization_specific_follow_up", stopping_reason: "Implemented school elements are clear; a cross-government inventory is needed for broader public education.", follow_up_signals: ["Later Action 3.07 reporting repeats the same school measures without a full recommendation-wide evaluation."],
  }),
  rec(23, {
    neutral_recommendation_summary: "The Province and Indigenous partners should establish joint degrees in medicine and Indigenous medicine, and a comparable joint nursing degree.",
    original_responsible_parties: ["Government of British Columbia", "First Nations governing bodies and representative organizations", "Métis Nation British Columbia", "Indigenous physicians and nurses", "post-secondary institutions"],
    relevant_organizations: ["Simon Fraser University", "First Nations Health Authority", "University of British Columbia", "Thompson Rivers University", "University of Victoria", "Trinity Western University"],
    government_or_institutional_response: "Government linked the future SFU medical school and a collaborative Master of Nursing in Indigenous Health to the recommendation; a 2026 SFU–FNHA MOU documents First Nations involvement in the medical school.",
    commitments_made: ["Embed Indigenous knowledge systems in the new medical school", "develop a collaborative Indigenous nursing graduate program"],
    implementation_actions: [action("2023-11-30", "The Province reported development of the SFU medical school and a collaborative Indigenous nursing master's program.", "commitment", "ips_source_24_month_report"), action("2026-01-20", "SFU and FNHA formalized collaboration on the medical school and described Indigenous leadership and knowledge in the program.", "policy_adoption", "ips_source_sfu_fnha_mou")],
    implementation_evidence: [evidence("Program development and governance are evidenced, but the exact joint degrees described in the recommendation are not yet demonstrated as operating.", "ips_source_sfu_fnha_mou", "ips_source_action_307")],
    latest_evidence_date: "2026-01-20", source_references: all("ips_source_sfu_fnha_mou", "ips_source_action_307"), evidence_classification: "official_plus_indigenous_organization_reporting", public_evidence_coverage: "organizational_current_with_official_baseline",
    current_defensible_status: "implementation_underway", confidence: "high", reporting_limitation: "A new medical school with embedded Indigenous knowledge and a proposed nursing program are not equivalent to established joint degrees with the exact recommended form.", owner_review_flag: true, owner_review_reason: "The relationship between the current programs and the report's specific joint-degree design requires owner judgment.",
    remaining_gap_category: "further_web_research", stopping_reason: "Current partnership and development evidence is sufficient; the next meaningful check is program approval/enrolment or launch, not more contemporaneous searching.", follow_up_signals: ["The 2026 MOU confirms continued development and Indigenous partnership but not an operating joint degree."],
  }),
  rec(24, {
    neutral_recommendation_summary: "The Province should establish a task team for at least 24 months to propel implementation, work with senior Ministry leadership, uphold consultation and cooperation standards and report publicly.",
    original_responsible_parties: ["Government of British Columbia", "In Plain Sight Task Team", "British Columbia Ministry of Health", "Indigenous partners"],
    relevant_organizations: ["In Plain Sight Task Team", "British Columbia Ministry of Health", "FNHA", "First Nations Health Council", "Métis Nation British Columbia"],
    government_or_institutional_response: "A 31-member task team operated from May 2021 to June 2023, issued a 24-month report and transferred ongoing monitoring to Declaration Act Action 3.07.",
    commitments_made: ["Operate the task team for 24 months", "continue annual public progress reporting through Action 3.07"],
    implementation_actions: [action("2021-05 to 2023-06", "The task team operated for its 24-month mandate.", "office_or_program_creation", "ips_source_24_month_report"), action("2023-11-30", "The task team published a recommendation-by-recommendation report and transferred monitoring to Action 3.07.", "reporting", "ips_source_24_month_report"), action("2026-09-06", "Action 3.07 continues annual updates but states its framework cannot fully capture progress across all 24 recommendations.", "reporting", "ips_source_action_307")],
    implementation_evidence: [evidence("The time-limited task-team requirement was carried out; the continuing comprehensive-reporting function is only partially satisfied in the current public format.", "ips_source_24_month_report", "ips_source_action_307")],
    latest_evidence_date: "2026-09-06", source_references: all("ips_source_action_307"), evidence_classification: "official_primary_source", public_evidence_coverage: "direct_official_current",
    current_defensible_status: "substantially_implemented", confidence: "high", reporting_limitation: "The Province states that the current framework has limited capacity to capture the breadth and depth of progress across all 24 recommendations and identifies the 2023 report as the last comprehensive public report.", owner_review_flag: true, owner_review_reason: "Task-team completion is clear, but the ongoing public-accountability component has a documented coverage limitation.",
    remaining_gap_category: "FOI_candidate", stopping_reason: "The responsible official page expressly identifies the reporting limitation and says a more comprehensive update is being explored; further web searching has sharply diminishing returns.", follow_up_signals: ["The latest official page acknowledges that current reporting does not comprehensively represent all 24 recommendations.", "No newer comprehensive official 24-row status ledger was located."],
  }),
]

const ledger = {
  schema_version: "farm-knowledge-gap-recommendation-ledger-v1",
  ledger_id: "ips_24_recommendation_public_evidence_ledger_v1",
  research_date: "2026-09-06",
  publication_scope: "private_owner_review",
  production_mutations: 0,
  publication_mutations: 0,
  foi_requests_sent: 0,
  investigation: {
    target_dossier_id: "farm_dossier_miller_north_in_plain_sight_reporting_v1",
    canonical_workflow_id: "farm-research-dossier-v1",
    bounded_question: "What is the strongest defensible current public-evidence status for each of the 24 In Plain Sight recommendations?",
    method: "Original-report numbering and responsible parties were used as anchors; the 2023 official 24-month report supplied a common baseline; later authoritative sources were searched by recommendation subject, responsible organization and named implementation mechanism.",
    stopping_rule: "Stop when authoritative evidence answers the bounded status question, official avenues are exhausted, remaining evidence appears non-public, an information-request candidate is reached, or returns sharply diminish.",
  },
  status_taxonomy_notice: "Statuses describe the strength and depth of located public implementation evidence. Missing or aggregated reporting is not classified as non-implementation.",
  public_reporting_finding: {
    comprehensive_current_24_row_ledger_located: false,
    last_comprehensive_public_report_located: "2023-11-30",
    current_reporting_mode: "distributed_across_action_plan_ministries_health_system_and_indigenous_organizations",
    official_limitation_statement: "The current Action 3.07 page says the present framework has limited capacity to fully capture the breadth and depth of progress across all 24 recommendations and that the Ministry is exploring a more comprehensive update.",
  },
  source_catalog: sourceCatalog,
  recommendations,
}

const workflowValidation = validateCanonicalDossierWorkflow({ dossiers, fixtures, sourceRegistry: registry })
const ledgerValidation = validateInPlainSightLedger(ledger)

const projection = {
  schema_version: "farm-research-dossier-knowledge-update-v1",
  projection_id: "farm_dossier_miller_north_in_plain_sight_reporting_v2",
  version: 2,
  base_dossier_id: "farm_dossier_miller_north_in_plain_sight_reporting_v1",
  canonical_fixture_id: "farm_fixture_north_ips_reporting_limit_v1",
  canonical_workflow_id: "farm-research-dossier-v1",
  ledger_id: ledger.ledger_id,
  research_date: "2026-09-06",
  publication_scope: "private_owner_review",
  production_mutations: 0,
  publication_mutations: 0,
  foi_requests_sent: 0,
  previous_knowledge_state: {
    specifically_evidenced_recommendations: [1, 2, 17, 22, 23, 24],
    unresolved_question: "Current recommendation-level status for the other recommendations and whether a comprehensive current official ledger exists.",
  },
  investigation: ledger.investigation,
  new_evidence: {
    exact_recommendation_records: 24,
    authoritative_source_records: ledgerValidation.sources,
    direct_official_baseline_coverage: 24,
    post_2023_evidence_coverage: ledgerValidation.recommendations_with_post_2023_evidence,
    numbering_conflict: "A current official reporting page labels the PIDA expansion as recommendation 2 although the original report assigns PIDA to recommendation 11; this projection uses the original report numbering.",
  },
  updated_knowledge_state: {
    recommendations_assessed: 24,
    status_counts: ledgerValidation.status_counts,
    strongest_confirmed_elements: ["health-authority PIDA coverage (recommendation 11)", "Associate Deputy Minister role creation (recommendation 13)", "task-team operation and 24-month report (recommendation 24)", "health-system apologies and agreement provisions (recommendation 1)", "Métis health relationship tables and regional agreements (recommendation 7)"],
    material_change: "The dossier now has a source-backed public-evidence record for every recommendation rather than six examples. It still cannot claim a current official comprehensive status ledger or equate incomplete reporting with non-implementation.",
  },
  public_reporting_finding: ledger.public_reporting_finding,
  remaining_high_value_gaps: [
    "Current establishment and statutory status of the proposed Indigenous Health Officer (recommendation 3)",
    "Current establishment, authority and funding of the proposed Indigenous Health Representative and Advocate office (recommendation 4)",
    "A completed public measurement framework/dashboard and Indigenous data-governance status (recommendation 9)",
    "The jointly governed Indigenous pandemic-response structure (recommendation 15)",
    "A current Ministry-held recommendation-by-recommendation status and evidence matrix for all 24 recommendations",
  ],
  owner_review: true,
  owner_review_reason: "Most records support partial or underway status, and recommendation-level scope, current recency and a source-numbering conflict require human review before any publication decision.",
}
const projectionValidation = validateKnowledgeUpdateProjection(projection, ledgerValidation)

const statusRows = recommendations.map(item => `| ${item.recommendation_number} | ${item.neutral_recommendation_summary} | \`${item.current_defensible_status}\` | ${item.latest_evidence_date} | ${item.confidence} | ${item.owner_review_flag ? "Yes" : "No"} |`).join("\n")
const detailSections = recommendations.map(item => `## Recommendation ${item.recommendation_number}\n\n**Summary.** ${item.neutral_recommendation_summary}\n\n**Responsible parties.** ${item.original_responsible_parties.join("; ")}\n\n**Response and commitments.** ${item.government_or_institutional_response} ${item.commitments_made.join("; ")}.\n\n**Located implementation activity.**\n\n${item.implementation_actions.map(entry => `- ${entry.date} — ${entry.summary} [${entry.depth}; ${entry.source_references.join(", ")}]`).join("\n")}\n\n**Current public-evidence status.** \`${item.current_defensible_status}\` (${item.confidence}). ${item.implementation_evidence.map(entry => entry.summary).join(" ")}\n\n**Reporting limit.** ${item.reporting_limitation}\n\n**Remaining gap / stop.** \`${item.remaining_gap_category}\`. ${item.stopping_reason}\n\n**Owner review.** ${item.owner_review_flag ? `Required — ${item.owner_review_reason}` : "Not separately required for the bounded evidence classification."}\n\n**Sources.** ${item.source_references.map(id => `\`${id}\``).join(", ")}`)

const sourceLinks = sourceCatalog.map(source => `- [${source.title}](${source.url}) — ${source.source_organization}; ${source.source_type}; \`${source.source_id}\`.`).join("\n")
const counts = ledgerValidation.status_counts

write("in-plain-sight-24-recommendation-public-evidence-ledger-2026-09-06.json", ledger)
write("in-plain-sight-24-recommendation-public-evidence-ledger-2026-09-06.md", `# In Plain Sight — 24-Recommendation Public-Evidence Ledger\n\n> Private owner-review artifact. Statuses measure located public evidence, not actual performance or legal compliance. Missing reporting is not evidence of non-implementation.\n\n## At a glance\n\n| Recommendation | Neutral subject | Defensible public-evidence status | Latest evidence | Confidence | Owner review |\n|---:|---|---|---|---|---|\n${statusRows}\n\n${detailSections.join("\n\n")}\n\n## Source catalog\n\n${sourceLinks}`)

write("in-plain-sight-source-coverage-review-2026-09-06.md", `# In Plain Sight Source-Coverage Review\n\nThis is a measure of public-evidence coverage, not an implementation-performance score.\n\n- Recommendations with a direct official implementation narrative in the 2023 comprehensive baseline: **24/24**.\n- Recommendations with later evidence dated after 2023: **${ledgerValidation.recommendations_with_post_2023_evidence}/24**.\n- Current evidence classified as direct official: **${ledgerValidation.coverage_counts.direct_official_current || 0}**.\n- Current evidence carried mainly by Indigenous-led or institutional reporting plus the official baseline: **${ledgerValidation.coverage_counts.organizational_current_with_official_baseline || 0}**.\n- Recommendations whose latest disaggregated evidence remains the official 2023 baseline: **${ledgerValidation.coverage_counts.direct_official_baseline_only || 0}**.\n- Recommendations with no disaggregated official evidence at all: **0**; the 2023 report provides a narrative for every recommendation.\n- Owner-review flags: **${ledgerValidation.owner_review}/24**.\n\n## Reporting finding\n\nNo newer comprehensive official 24-row status ledger was located. Current reporting is distributed. Action 3.07 expressly says the present framework has limited capacity to fully capture progress across all 24 recommendations and says a more comprehensive update is being explored. This limitation must not be described as non-implementation.\n\n## Source-quality conflict\n\nThe current Action 3.07 reporting labels the health-authority PIDA expansion as recommendation 2. The original In Plain Sight report assigns that subject to recommendation 11. The ledger uses the original report numbering and flags the mismatch for owner review.`)

const partyMap = recommendations.map(item => `| ${item.recommendation_number} | ${item.original_responsible_parties.join("; ")} | ${item.relevant_organizations.join("; ")} | ${item.commitments_made.join("; ")} | ${item.current_defensible_status} |`).join("\n")
write("in-plain-sight-responsible-party-map-2026-09-06.md", `# In Plain Sight Responsible-Party Map\n\n> Descriptive mapping from the original recommendation language and cited implementation sources. It does not assign blame, legal liability or exclusive responsibility.\n\n| Rec. | Original responsible parties | Current relevant organizations | Commitment/mechanism | Public-evidence status |\n|---:|---|---|---|---|\n${partyMap}`)

const followUps = recommendations.filter(item => item.follow_up_signals.length).map(item => `## Recommendation ${item.recommendation_number}\n\n${item.follow_up_signals.map(signal => `- ${signal}`).join("\n")}\n\nInterpretation: follow-up signal only; it does not independently prove success, failure or non-implementation.`).join("\n\n")
write("in-plain-sight-follow-up-repeated-signal-review-2026-09-06.md", `# In Plain Sight Follow-up and Repeated-Signal Review\n\nLater reports often revisit implementation mechanisms rather than reissue the recommendation verbatim. The signals below are retained cautiously.\n\n${followUps}`)

const gaps = recommendations.filter(item => item.current_defensible_status !== "implemented").map(item => `| ${item.recommendation_number} | ${item.reporting_limitation} | \`${item.remaining_gap_category}\` | ${item.stopping_reason} |`).join("\n")
write("in-plain-sight-remaining-knowledge-gaps-2026-09-06.md", `# In Plain Sight Remaining Knowledge Gaps\n\n| Rec. | Remaining public-evidence gap | Classification | Why research stopped |\n|---:|---|---|---|\n${gaps}\n\nThe investigation stopped at authoritative answers, organization-specific boundaries, likely non-public records, or sharply diminishing returns. No gap was converted into a finding of non-implementation.`)

const foiCandidates = [
  ["ips_foi_current_24_row_ledger", "British Columbia Ministry of Health", "The current recommendation-by-recommendation implementation matrix for recommendations 1–24, including status, responsible organization, status date and source/evidence field.", "2023-12-01 to 2026-09-06", "implementation tracker, briefing table, status matrix or evidence ledger", "Would replace a reconstructed public-evidence ledger with the Ministry's current disaggregated record."],
  ["ips_foi_recs_03_04_institutions", "British Columbia Ministry of Health", "Decision/status records showing whether the recommendation 3 Indigenous Health Officer and recommendation 4 Indigenous Health Representative and Advocate office/function were established, deferred, replaced or remain under consideration.", "2023-07-01 to 2026-09-06", "decision record, options paper, approved mandate, implementation status note or organizational chart", "Would resolve whether preparatory work became the specific institutions recommended."],
  ["ips_foi_rec_09_measurement", "British Columbia Ministry of Health and PHSA", "The current approved status, deliverables and publication plan for the recommendation 9 measurement framework, indicator set and dashboard.", "2023-07-01 to 2026-09-06", "project status report, approved indicator inventory, dashboard release plan or governance terms", "Would distinguish working-group activity from a completed and operational measurement system."],
  ["ips_foi_rec_15_structure", "British Columbia Ministry of Health / Office of the Provincial Health Officer", "Current governance or terms-of-reference records for any joint Indigenous pandemic/emergency response structure established in response to recommendation 15.", "2023-07-01 to 2026-09-06", "terms of reference, governance agreement, committee mandate or status briefing", "Would determine whether regional activity was consolidated into the jointly governed structure specified by the recommendation."],
].map(([candidate_id, organization, exact_missing_information, bounded_date_range, suggested_record_category, why_it_matters]) => ({ candidate_id, status: "draft_not_sent", organization, recommendation_numbers: candidate_id.includes("03_04") ? [3, 4] : candidate_id.includes("09") ? [9] : candidate_id.includes("15") ? [15] : Array.from({ length: 24 }, (_, index) => index + 1), exact_missing_information, bounded_date_range, public_sources_checked: ["In Plain Sight full report", "2023 Task Team 24-Month Report", "Declaration Act Action 3.07", "2024–25 organizational and program reports listed in the ledger"], suggested_record_category, why_it_matters, exclusions: ["private patient information", "individual complaint files", "personnel files", "legally privileged advice"] }))
write("in-plain-sight-draft-information-request-candidates-2026-09-06.md", `# In Plain Sight Draft Information-Request Candidates\n\n> Concepts only. No request was sent. All concepts exclude patient records, individual complaint files, personnel files and privileged legal advice.\n\n${foiCandidates.map(item => `## ${item.candidate_id}\n\n- Status: ${item.status}\n- Likely record holder: ${item.organization}\n- Recommendations: ${item.recommendation_numbers.join(", ")}\n- Missing information: ${item.exact_missing_information}\n- Date range: ${item.bounded_date_range}\n- Suggested record category: ${item.suggested_record_category}\n- Why it matters: ${item.why_it_matters}\n- Public sources checked: ${item.public_sources_checked.join("; ")}\n- Exclusions: ${item.exclusions.join("; ")}`).join("\n\n")}`)

write("research-dossier-in-plain-sight-reporting-knowledge-update-v2-2026-09-06.json", projection)
write("in-plain-sight-knowledge-gap-owner-summary-2026-09-06.md", `# Owner Summary — In Plain Sight Knowledge-Gap Investigation\n\n> Private owner-review artifact. No publication decision.\n\n## What changed\n\n- The canonical dossier workflow now has an explicit regression approval and all four fixtures still validate.\n- The dossier moved from six recommendation examples to exactly **24** recommendation-level public-evidence records.\n- The 2023 official report supplies a baseline narrative for all 24; **${ledgerValidation.recommendations_with_post_2023_evidence}** have later public evidence located.\n- The current comprehensive-ledger gap remains and is now supported by the Province's own description of its reporting limitation.\n- A recommendation-numbering conflict in current official reporting was isolated rather than propagated.\n\n## Why it matters\n\nMiller North can now show what public evidence supports for every recommendation while preserving the difference between an action, an implemented element, system-wide completion and measured outcomes.\n\n## Strongest findings\n\n- Recommendation 11's health-authority PIDA coverage and recommendation 13's senior Ministry role have the clearest evidence for the bounded action requested.\n- Recommendation 1 has official evidence of apologies and agreement changes, but the system-wide transformation remains broader.\n- Recommendation 7 has formal Métis relationship tables and health-authority agreements, with outcome reporting still distributed.\n- Recommendation 24's task team and 24-month report were completed; current comprehensive reporting is nevertheless limited.\n- Most recommendations fall in partial, underway or fragmentary bands because implementation depth and scope differ.\n\n## Biggest remaining gaps\n\n- Whether recommendation 3's legislatively recognized Indigenous Health Officer was established.\n- Whether recommendation 4's legislatively recognized Representative and Advocate office was established and funded.\n- Whether recommendation 9's measurement framework/dashboard is complete and public.\n- Whether recommendation 15's jointly governed emergency-response structure exists in the recommended form.\n- A current, authoritative, 24-row status/evidence ledger.\n\n## Recommended next move\n\nOwner-review the four narrow draft information-request concepts, prioritizing the current 24-recommendation Ministry tracker; do not publish any reconstructed status until the numbering conflict and broad-scope classifications are reviewed.\n\n## Key metrics\n\n- Recommendations: 24\n- Implemented: ${counts.implemented || 0}\n- Substantially implemented: ${counts.substantially_implemented || 0}\n- Partially implemented: ${counts.partially_implemented || 0}\n- Underway: ${counts.implementation_underway || 0}\n- Fragmentary evidence: ${counts.implementation_evidence_fragmentary || 0}\n- Owner review: ${ledgerValidation.owner_review}\n- Production/publication mutations: 0 / 0\n- FOI requests sent: 0`)

write("in-plain-sight-public-evidence-research-brief-2026-09-06.md", `# Tracking Implementation of the 24 In Plain Sight Recommendations: A Public-Evidence Review\n\n> Private research brief for owner review.\n\n## Executive summary\n\nThis review reconstructs the strongest defensible public-evidence status for each of the 24 recommendations issued by the 2020 In Plain Sight review. The official 2023 Task Team report provides a recommendation-by-recommendation baseline. Later evidence is distributed across Declaration Act reporting, ministries, health-system bodies, post-secondary institutions, oversight bodies and Indigenous-led organizations. No newer comprehensive official status ledger covering all 24 was located. The Province's current Action 3.07 page itself says its framework cannot fully capture the breadth and depth of progress and that a more comprehensive update is being explored.\n\nThe ledger classifies ${counts.implemented || 0} recommendations as implemented for the bounded output requested, ${counts.substantially_implemented || 0} as substantially implemented, ${counts.partially_implemented || 0} as partially implemented, ${counts.implementation_underway || 0} as underway and ${counts.implementation_evidence_fragmentary || 0} as supported by fragmentary implementation evidence. These are public-evidence classifications, not findings of legal compliance, effectiveness or institutional performance.\n\n## Scope and method\n\nOriginal recommendation numbering, wording and named responsibility were taken from the 2020 report. The 2023 official report was used as a common baseline. Each recommendation was then searched by subject, responsible organization and likely implementation mechanism through 2026-09-06. Priority was given to government, oversight, health-system and Indigenous-led authoritative sources. Searching stopped when the bounded question was answered, official avenues were exhausted, evidence appeared non-public, or further searching produced sharply diminishing returns.\n\n## Findings\n\n- Every recommendation has at least one direct official implementation narrative in the 2023 baseline.\n- ${ledgerValidation.recommendations_with_post_2023_evidence} recommendations have later dated evidence in this ledger.\n- The clearest bounded outputs are the PIDA extension for health-authority employees (11) and creation of the Associate Deputy Minister role (13).\n- Many recommendations contain multiple elements; a concrete action can support partial status without proving system-wide completion.\n- The public record is strongest for policies, offices, standards, agreements and program activity, and weaker for universal adoption, operational compliance and measured outcomes.\n- Current official reporting contains an apparent recommendation-number mismatch for the PIDA item; this review follows the original report's numbering.\n\n## Evidence highlights\n\nThe 2023 report documents apologies, legal reforms, complaint-process work, tripartite and Métis governance mechanisms, a cultural-safety standard, workforce leadership roles, service investments, educational measures and the task-team transition. Later sources show the HPOA framework in force, continuing patient-feedback design, First Nations governance evaluation, institutional post-secondary reporting, ongoing training mechanisms, hospital-design examples and the SFU–FNHA medical-school partnership.\n\n## Public-reporting limitation\n\nThe current Action 3.07 page identifies the 2023 report as the last comprehensive public update and states that the present framework has limited capacity to represent progress across all 24 recommendations. This is a reporting-gap finding. It is not evidence that recommendations lacking recent disaggregated reporting were unimplemented.\n\n## Limitations\n\nThis review uses public evidence only. It does not test day-to-day compliance, staff completion, patient experience, program effectiveness, causation or legal sufficiency. Institution-level examples cannot establish universal adoption. Program-level funding cannot be allocated to specific recommendations without authoritative attribution. Current web pages may change after the inspection date.\n\n## Unresolved questions\n\n- Current institutional status of recommendations 3 and 4.\n- Completion and publication status of recommendation 9's measurement framework/dashboard.\n- Governance status of recommendation 15's emergency-response structure.\n- Universal adoption and outcome evidence for standards, training, education and facility-design recommendations.\n- Availability and publication timing of a current comprehensive recommendation ledger.\n\n## Sources\n\n${sourceLinks}`)

write("farm-knowledge-gap-investigator-design-2026-09-06.md", `# Farm Knowledge-Gap Investigator — Bounded Design\n\n## Workflow\n\n\`dossier → unresolved question → significance rank → bounded plan → authoritative-source search → evidence-edge validation → versioned knowledge update → remaining gaps → owner synthesis\`\n\n## Deterministic steps\n\n- Validate private scope, immutable lineage, exact record cardinality and source references.\n- Generate queries from recommendation number, subject, responsible organization and named mechanism.\n- Normalize dates, statuses, evidence depth and organization names.\n- Reject completion statuses without operational, institutional-creation or policy-adoption evidence.\n- Record the stop reason and preserve old dossier artifacts.\n\n## Model-assisted opportunities\n\n- A local 3B model could triage recommendation topics, organizations and document classes after deterministic extraction.\n- A local 7B model could compare ambiguous program/recommendation matches or conflicting implementation descriptions, always returning review candidates rather than final statuses.\n- Neither is required for this fixture; no local model was invoked.\n\n## Owner-review gates\n\nOwner review is mandatory for conflicting source numbering, broad multi-part recommendations, legal-effect or effectiveness claims, ambiguous organization responsibility, institution-to-system extrapolation and any publication decision.\n\n## Stopping rules\n\nStop when authoritative evidence answers the bounded question, likely official sources are exhausted, the remaining gap appears non-public, the question becomes a narrow information-request candidate, or successive queries yield only duplicate/low-value material. Each unresolved recommendation carries its stop reason.\n\n## Cost controls\n\nUse the private source registry first, search by named mechanism second, cap recommendation-specific query families, deduplicate documents, reuse a shared baseline report and avoid paid discovery unless an important official source remains inaccessible. Tavily and local/cloud auxiliary models were not used; measurable external API cost was $0.`)

write("farm-research-dossier-v1-canonical-approval-2026-09-06.json", {
  schema_version: "farm-canonical-workflow-approval-v1",
  workflow_id: "farm-research-dossier-v1",
  status: "canonical_private_regression_workflow",
  approval_scope: "validation_fixture_only_not_publication",
  approved_on: "2026-09-06",
  fixture_ids: fixtures.fixtures.map(item => item.fixture_id),
  safeguards: ["domain_separation", "source_bearing_edges", "private_owner_review", "no_production_mutation", "no_publication_mutation", "uncertainty_preservation"],
  validation: workflowValidation,
})

const combinedValidation = {
  schema_version: "farm-knowledge-gap-investigation-validation-v1",
  validated_on: "2026-09-06",
  canonical_workflow: workflowValidation,
  recommendation_ledger: ledgerValidation,
  dossier_projection: projectionValidation,
  artifacts_expected: 13,
  validation_runs: {
    focused_and_shared_farm_node_tests: { passed: 34, failed: 0 },
    canonical_dossier_and_investigator_tests: { passed: 13, failed: 0 },
    lint: "passed",
    production_build: "passed",
    json_artifacts_parsed: 15,
    git_diff_check: "passed",
  },
  migrations_created: 0,
  migrations_applied: 0,
  production_mutations: 0,
  publication_mutations: 0,
  foi_requests_sent: 0,
  tavily_calls: 0,
  local_model_calls: 0,
  cloud_model_calls: 0,
  measurable_external_api_cost_usd: 0,
}
write("in-plain-sight-knowledge-gap-validation-2026-09-06.json", combinedValidation)

process.stdout.write(`${JSON.stringify(combinedValidation)}\n`)
