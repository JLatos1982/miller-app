import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

const ROOT = process.cwd()
const OUT = path.join(ROOT, "artifacts", "miller-north")
const FARM_OUT = path.join(ROOT, "artifacts", "farm")
const generatedAt = "2026-09-06T12:00:00-07:00"
const lastVerified = "2026-09-06"

await mkdir(OUT, { recursive: true })
await mkdir(FARM_OUT, { recursive: true })

const writeJson = async (name, value, directory = OUT) => writeFile(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`)
const writeMd = async (name, value, directory = OUT) => writeFile(path.join(directory, name), `${value.trim()}\n`)
const source = (title, organization, url, sourceType = "official_primary_source", publicationDate = null) => ({ title, organization, url, source_type: sourceType, publication_date: publicationDate })

const fnhoSources = {
  report: source("Inaugural Report, July 1, 2023–March 31, 2025", "First Nations Health Ombudsperson Office", "https://fnhoo.ca/wp-content/uploads/2025/10/Inaugural-Report-2023-2025.pdf", "indigenous_governance_primary_source", "2025"),
  annual: source("Annual Reports", "First Nations Health Ombudsperson Office", "https://fnhoo.ca/annual-reports/", "indigenous_governance_primary_source"),
  governance: source("Governance", "First Nations Health Ombudsperson Office", "https://fnhoo.ca/governance/", "indigenous_governance_primary_source"),
  faq: source("Frequently Asked Questions", "First Nations Health Ombudsperson Office", "https://fnhoo.ca/faq/", "indigenous_governance_primary_source"),
  services: source("Services", "First Nations Health Ombudsperson Office", "https://fnhoo.ca/services/", "indigenous_governance_primary_source"),
  federalLaunch: source("First-ever First Nation Health Ombudsperson’s Office to be created in Saskatchewan", "Indigenous Services Canada", "https://www.canada.ca/en/indigenous-services-canada/news/2022/02/first-ever-first-nation-health-ombudspersons-office-to-be-created-in-saskatchewan.html", "official_primary_source", "2022-02-22"),
  hansard: source("Saskatchewan Hansard, October 28, 2025", "Legislative Assembly of Saskatchewan", "https://docs.legassembly.sk.ca/legdocs/Assembly/Debates/30L2S/20251028DebatesHTML.htm", "official_legislative_record", "2025-10-28"),
  unda: source("UN Declaration Act Action Plan reporting — Saskatchewan Anti-Indigenous Racism Navigator Network", "Justice Canada / Indigenous Services Canada", "https://justice.canada.ca/eng/declaration/report-rapport/2026/b1.html", "official_primary_source", "2026"),
}

const fnhoRecommendations = [
  {
    recommendation_id: "fnho_rec_training",
    neutral_summary: "Provide more extensive cultural-awareness and sensitivity training, including advanced trauma-informed care, communication strategies and emotional-intelligence development.",
    responsible_organizations: ["Health-care providers and health-system organizations in Saskatchewan"],
    date: "2025",
    recommendation_type: "training_and_practice_change",
    intended_change: "More culturally responsive and trauma-informed interactions and care.",
    source: fnhoSources.report,
    response_located: "The Minister of Health stated that the Ministry and Saskatchewan Health Authority were reviewing the report and recommendations.",
    implementation_evidence_located: "Case-specific training recommendations and one professional-regulator Letter of Concern are documented, but a system-wide implementation response tied to this recommendation was not located.",
    current_public_evidence_status: "public_evidence_fragmentary",
    confidence: "high",
    owner_review_required: false,
    reporting_limitation: "The report does not identify one named recipient or system-wide completion measure for this theme."
  },
  {
    recommendation_id: "fnho_rec_confidentiality_communication",
    neutral_summary: "Prioritize patient confidentiality and ensure patients understand medical information.",
    responsible_organizations: ["Health-care providers and health-system organizations in Saskatchewan"],
    date: "2025",
    recommendation_type: "policy_and_practice_change",
    intended_change: "Private communication and informed understanding during care.",
    source: fnhoSources.report,
    response_located: "The Minister of Health stated that the Ministry and Saskatchewan Health Authority were reviewing the report and recommendations.",
    implementation_evidence_located: "The report describes a case-specific escalation to the College of Physicians and Surgeons of Saskatchewan and a Letter of Concern endorsing FNHO recommendations; no broader response ledger was located.",
    current_public_evidence_status: "partial_implementation_evidence",
    confidence: "high",
    owner_review_required: false,
    reporting_limitation: "Case-level resolution is not evidence of province-wide operational implementation."
  },
  {
    recommendation_id: "fnho_rec_capacity",
    neutral_summary: "Increase health-care resources in northern regions, reduce transfers far from home and support systems, and improve education for informed decisions.",
    responsible_organizations: ["Saskatchewan Ministry of Health", "Saskatchewan Health Authority"],
    date: "2025",
    recommendation_type: "capacity_and_access_change",
    intended_change: "More care nearer home and better supported transfer and treatment decisions.",
    source: fnhoSources.report,
    response_located: "The Minister referred to virtual physician and point-of-care testing initiatives while confirming that the report was under review.",
    implementation_evidence_located: "No recommendation-specific public crosswalk, target, timeline or completion report was located.",
    current_public_evidence_status: "no_formal_response_located",
    confidence: "medium",
    owner_review_required: true,
    owner_review_reason: "The cited rural and virtual-care initiatives may be relevant, but no authoritative source located explicitly attributes them to this recommendation.",
    reporting_limitation: "Related programs cannot be treated as implementation without a sourced relationship."
  },
  {
    recommendation_id: "fnho_rec_support_navigation",
    neutral_summary: "Create clear support and navigation pathways for First Nations people navigating complex health systems.",
    responsible_organizations: ["Saskatchewan Ministry of Health", "Saskatchewan Health Authority", "Health-system organizations"],
    date: "2025",
    recommendation_type: "navigation_and_advocacy",
    intended_change: "Accessible support through unfamiliar and complex health systems.",
    source: fnhoSources.report,
    response_located: "The Minister stated that the Ministry and Saskatchewan Health Authority were reviewing the report and recommendations.",
    implementation_evidence_located: "Existing SHA First Nations and Métis Health Services and the separate federal navigator network provide relevant context, but no source located establishes that they implement this FNHO recommendation.",
    current_public_evidence_status: "public_evidence_fragmentary",
    confidence: "high",
    owner_review_required: false,
    reporting_limitation: "The public record does not provide an FNHO-to-program implementation crosswalk."
  }
]

const fnhoFindings = {
  reporting_period: "2023-07-01 to 2025-03-31",
  complaint_volume: { total: 391, active: 167, closed_or_resolved: 224, adults_percent: 80, children_percent: 20 },
  sha_related_percent: 64,
  top_reported_categories_note: "Percentages are the report’s top categories and are not inclusive of all complaints.",
  top_reported_categories: [
    { category: "physician", percent: 29 },
    { category: "emergency_rooms", percent: 29 },
    { category: "hospitals", percent: 22 },
    { category: "nursing", percent: 10 },
    { category: "accessing_health_care_services", percent: 10 }
  ],
  regional_distribution: {
    "2023": { north: 34, central: 26, west: 16, south: 21, out_of_province: 3 },
    "2024": { north: 26, central: 31, west: 9, south: 29, out_of_province: 5 }
  },
  systemic_themes: ["discrimination and racial bias", "communication and confidentiality", "patient safety and quality of care", "access and regional capacity", "cultural safety and respect", "support and navigation"],
  privacy_note: "The report’s featured cases use changed names. This extraction retains only aggregate statistics and systemic themes."
}

const fnhoDossier = {
  schema_version: "miller-north-fnho-dossier-candidate-v2",
  dossier_candidate_id: "mn_dossier_candidate_fnho_2026_09_06",
  visibility: "private_owner_review",
  browser_projection_readiness: "publication_safe_but_not_wired",
  decision: "ready_with_minor_owner_review",
  decision_reason: "The case has clear First Nations governance, a primary inaugural report, aggregate activity evidence, four recommendation themes, public funding evidence and a documented government/SHA review statement. Recommendation-specific institutional responses and implementation evidence remain fragmentary, so Indigenous governance/editorial review should precede navigation placement.",
  identity: {
    title: "First Nations Health Ombudsperson Office",
    province: "Saskatchewan",
    subject_type: "First Nations-governed health accountability and complaint-resolution office",
    status: "operational",
    reporting_period: fnhoFindings.reporting_period
  },
  owner_synthesis: {
    what_it_is: "A First Nations-governed Saskatchewan office that receives health-care complaints, supports resolution and advocacy, investigates concerns and makes recommendations.",
    why_it_matters: [
      "It creates a culturally grounded complaint and accountability route for Saskatchewan First Nations people and communities.",
      "Its inaugural report supplies rare aggregate evidence about where complaints arise and what systemic changes the office is calling for.",
      "It is a clear test of keeping First Nations governance authority separate from federal funding and provincial health-system response."
    ],
    what_we_learned: [
      "FNHO reports 391 complaints during its inaugural reporting period, with 64% related to the Saskatchewan Health Authority.",
      "The office reports 224 complaints closed or resolved and 167 active at period end.",
      "Its four office-level recommendation themes concern training, confidentiality and communication, regional capacity, and support/navigation.",
      "The Saskatchewan Minister of Health said the Ministry and SHA were reviewing the report and recommendations in October 2025.",
      "No later comprehensive formal response or recommendation-by-recommendation implementation plan was located in the official sources searched."
    ],
    what_remains_unclear: [
      "Whether the Ministry or SHA issued a later formal response or implementation plan.",
      "Which recommendations have province-wide implementation measures, owners and timelines.",
      "Whether FNHO will publish a follow-up ledger showing response and implementation status.",
      "How federal contributions are allocated among office activities beyond recipient-level financial reporting."
    ],
    recommended_next_move: "Seek Indigenous governance/editorial review of the proposed public description, then ask FNHO, SHA and the Ministry for any public response or implementation crosswalk before adding the dossier to main navigation."
  },
  governance: {
    authority_description: "FNHO identifies Federation of Sovereign Indigenous Nations Chiefs-in-Assembly Resolution 2046 (May 2017) as the source of its mandate and governance authority.",
    governance_bodies: ["FNHO Board of Governors / Directors", "Knowledge Holders Council"],
    mandate: ["review complaints and document experiences", "investigate and support resolution", "advocate for fairness and accountability", "identify and prevent systemic and discriminatory practices", "education and awareness"],
    service_scope: "Free services for Saskatchewan First Nations individuals and communities.",
    independence_statement: "FNHO describes itself as independent from government and health-care providers.",
    caution: "Federal funding supports the office but is not presented as the source of its governance authority or operational control."
  },
  funding: {
    initial_announcement: { amount_cad: 1170000, date: "2022-02-22", funder: "Indigenous Services Canada", recipient_path: "Federation of Sovereign Indigenous Nations / FNHO", attribution_level: "recipient_level" },
    report_financials: {
      fiscal_2025_revenue_cad: 1837157,
      components: { indigenous_services_canada: 1650661, federation_of_sovereign_indigenous_nations: 74879, dakota_dunes_community_development_corporation: 10000, rental: 99867, other: 1750 },
      audit_note: "The 2025 financial statements carry an unmodified audit opinion. A 2024 emphasis-of-matter note identified funding uncertainty at that time; the later statements record Indigenous Services Canada revenue."
    },
    caution: "Amounts are public recipient/office-level evidence. They are not allocated to individual complaint outcomes."
  },
  findings: fnhoFindings,
  recommendations: fnhoRecommendations,
  response: {
    latest_direct_response_located: "2025-10-28",
    status: "review_acknowledged",
    evidence: "The Minister of Health acknowledged receipt and said the Ministry and Saskatchewan Health Authority were reviewing the report and recommendations.",
    later_formal_response_search_result: "formal_response_not_located_in_public_sources_searched",
    searched_families: ["Saskatchewan Ministry of Health", "Saskatchewan Health Authority", "Saskatchewan Hansard", "Saskatchewan government annual reporting"]
  },
  timeline: [
    { date: "2017-05", type: "governance", title: "Chiefs-in-Assembly resolution", description: "FNHO identifies Resolution 2046 as the source of its mandate and governance authority.", sources: [fnhoSources.governance, fnhoSources.report] },
    { date: "2022-02-22", type: "funding", title: "First-year establishment funding announced", description: "Indigenous Services Canada announced $1.17 million through FSIN to establish the office.", sources: [fnhoSources.federalLaunch] },
    { date: "2023-07-01", type: "operations", title: "Office begins operating", description: "The inaugural report measures complaint activity from July 1, 2023.", sources: [fnhoSources.report] },
    { date: "2023-07-01 to 2025-03-31", type: "reporting", title: "Inaugural reporting period", description: "FNHO records 391 complaints, 224 closed/resolved and 167 active.", sources: [fnhoSources.report] },
    { date: "2025", type: "recommendations", title: "Inaugural report publishes systemic recommendation themes", description: "The report identifies training, confidentiality/communication, capacity and support/navigation themes.", sources: [fnhoSources.report] },
    { date: "2025-10-28", type: "government_response", title: "Ministry and SHA review acknowledged", description: "The Health Minister said the Ministry and SHA were reviewing the report and recommendations.", sources: [fnhoSources.hansard] },
    { date: "2026-09-06", type: "follow_up", title: "No later formal response located", description: "A bounded official-source search did not locate a recommendation-by-recommendation response or implementation plan.", sources: [fnhoSources.hansard, fnhoSources.annual] }
  ],
  evidence_edges: [
    { from: "FSIN Chiefs-in-Assembly Resolution 2046", relationship: "governance_authority_for", to: "FNHO", confidence: "high", sources: [fnhoSources.governance, fnhoSources.report] },
    { from: "Indigenous Services Canada contribution", relationship: "funds_establishment_of", to: "FNHO", confidence: "high", funding_scope: "recipient_level", sources: [fnhoSources.federalLaunch] },
    { from: "FNHO", relationship: "receives_and_investigates", to: "First Nations health-care complaints", confidence: "high", sources: [fnhoSources.faq, fnhoSources.services, fnhoSources.report] },
    { from: "FNHO inaugural report", relationship: "reports_on", to: "aggregate complaints and systemic themes", confidence: "high", sources: [fnhoSources.report] },
    { from: "FNHO inaugural report", relationship: "recommends", to: "four systemic change themes", confidence: "high", sources: [fnhoSources.report] },
    { from: "Saskatchewan Ministry of Health and SHA", relationship: "reviewing", to: "FNHO report and recommendations", confidence: "high", sources: [fnhoSources.hansard] }
  ],
  publication_safety: {
    contains_patient_names: false,
    contains_changed_case_names: false,
    contains_private_contact_information: false,
    allegations_presented_as_findings: false,
    governance_and_funding_distinguished: true,
    internal_owner_notes_excluded_from_browser_projection: true
  },
  sources: Object.values(fnhoSources),
  generated_at: generatedAt
}

const support = ({ id, name, operator, governance, province, community, area, mode, categories, population, scope, eligibility, referral = null, cost = null, hours = null, phone = null, email = null, url, relationship = null, ownerReview = false, notes = null }) => ({
  support_id: id,
  service_program_name: name,
  operating_organization: operator,
  governance_type: governance,
  province,
  community,
  service_area: area,
  delivery_mode: mode,
  service_categories: categories,
  population_served: population,
  first_nations_specific_or_broader_indigenous: scope,
  eligibility,
  referral_requirements: referral,
  cost_if_stated: cost,
  hours,
  public_phone: phone,
  public_email: email,
  website: url,
  intake_access_pathway: referral || "Contact the operator using the public service page.",
  health_authority_government_relationship: relationship,
  authoritative_source_url: url,
  additional_source_urls: [],
  last_verified_date: lastVerified,
  operational_status: "current_operation_verified",
  confidence: ownerReview ? "medium" : "high",
  owner_review_status: ownerReview ? "required" : "not_required",
  owner_review_reason: ownerReview ? notes : null,
  privacy_note: "Public organizational/service information only; no patient information collected."
})

const supports = [
  support({ id: "fns_bc_fraser_indigenous_health_liaisons", name: "Indigenous Health Liaison Program", operator: "Fraser Health", governance: "provincial_health_authority_indigenous_support_role", province: "British Columbia", community: "Fraser Health region", area: "Fraser Salish region, including Fraser North hospitals and communities", mode: ["in_person", "regional"], categories: ["patient_navigation", "cultural_support", "discharge_navigation", "family_support"], population: "People who self-identify as Indigenous or Aboriginal and their families", scope: "broader_indigenous", eligibility: "Self-identification; hospital or community referral/self-contact", hours: "Daily, 8:30 a.m.–8 p.m.", phone: "1-866-766-6960", url: "https://www.fraserhealth.ca/health-topics-a-to-z/indigenous-health/indigenous-health-liaisons", relationship: "Fraser Health program; dedicated Indigenous support function." }),
  support({ id: "fns_bc_fraser_indigenous_mental_health_liaisons", name: "Indigenous Mental Health Liaison Program", operator: "Fraser Health", governance: "provincial_health_authority_indigenous_support_role", province: "British Columbia", community: "Surrey, Maple Ridge/Coquitlam, Abbotsford/Mission, Chilliwack, Hope/Agassiz", area: "Fraser Health region", mode: ["in_person", "regional"], categories: ["mental_health", "substance_use", "patient_navigation", "cultural_support"], population: "Indigenous people in the Fraser Health region", scope: "broader_indigenous", eligibility: "See regional service page", phone: "1-833-866-6478", url: "https://www.fraserhealth.ca/Service-Directory/Services/mental-health-and-substance-use/mental-health---community-services/aboriginal-mental-health-liaisons", relationship: "Fraser Health mental-health and substance-use service." }),
  support({ id: "fns_bc_surrey_indigenous_maternal_liaison", name: "Indigenous Maternal Liaison", operator: "Fraser Health", governance: "provincial_health_authority_indigenous_support_role", province: "British Columbia", community: "Surrey", area: "Surrey Memorial Hospital", mode: ["in_person"], categories: ["maternal_birth_support", "patient_navigation", "cultural_support", "advocacy"], population: "People who self-identify as Indigenous or Aboriginal", scope: "broader_indigenous", eligibility: "Self-referral accepted", hours: "Weekdays, 8:30 a.m.–4:30 p.m.", phone: "236-332-7615", url: "https://www.fraserhealth.ca/health-topics-a-to-z/indigenous-health/Indigenous-maternal-liaison", relationship: "Fraser Health service; operator page identifies Surrey Hospitals Foundation funding." }),
  support({ id: "fns_bc_surrey_indigenous_primary_health_clinic", name: "Indigenous Primary Health and Wellness Clinic (FRAFCA)", operator: "Fraser Region Aboriginal Friendship Centre Association / Fraser Health", governance: "indigenous_community_organization_health_authority_partnership", province: "British Columbia", community: "Surrey", area: "Surrey and outreach to Kwikwetlem, Katzie and Tsawwassen First Nations and Spirit of the Children", mode: ["in_person", "outreach"], categories: ["primary_care", "traditional_wellness", "cultural_support", "patient_navigation"], population: "Métis, First Nations, Inuit and self-identifying Indigenous people", scope: "broader_indigenous", eligibility: "Client self-referrals accepted", hours: "Monday–Friday, 8:30 a.m.–4:30 p.m.", phone: "604-283-3293", url: "https://www.fraserhealth.ca/Service-Directory/Service-at-Location/A/5/indigenous-primary-health-and-wellness-home---indigenous-health", relationship: "Delivered through FRAFCA with Fraser Health; governance and operator roles should not be collapsed." }),
  support({ id: "fns_bc_katzie_health_wellness", name: "Katzie Health and Wellness", operator: "Katzie First Nation", governance: "first_nations_governed_nation_health_program", province: "British Columbia", community: "Pitt Meadows", area: "Katzie First Nation members and community", mode: ["in_person", "community"], categories: ["primary_care", "mental_health", "substance_use", "maternal_birth_support", "traditional_wellness", "family_support"], population: "Katzie First Nation members", scope: "first_nations_specific", eligibility: "Katzie First Nation members; confirm program-specific eligibility with the Health Department", hours: "Health and Community Centre hours and clinic schedules vary by service", phone: "604-465-8921", email: "katziehealth@katzie.ca", url: "https://katzie.ca/health/", relationship: "Katzie First Nation leads and governs its Health Department and member health and wellness supports." }),
  support({ id: "fns_bc_kwikwetlem_health_wellness", name: "kʷikʷəƛ̓əm Health and Wellness / Community-Based Health Clinic", operator: "kʷikʷəƛ̓əm First Nation", governance: "first_nations_governed_nation_health_program", province: "British Columbia", community: "Coquitlam", area: "kʷikʷəƛ̓əm First Nation members and community", mode: ["in_person", "community"], categories: ["primary_care", "mental_health", "substance_use", "traditional_wellness", "cultural_support", "patient_navigation"], population: "kʷikʷəƛ̓əm m̀əlstéyəxʷ (members)", scope: "first_nations_specific", eligibility: "Nation members; confirm practitioner schedules and program-specific eligibility with the Health and Wellness Department", url: "https://kwikwetlem.com/health-and-wellness.htm", relationship: "The Nation describes a member-directed Health and Wellness department and community clinic; outside referrals listed on the page remain separate services." }),
  support({ id: "fns_bc_fnha_virtual_doctor", name: "First Nations Virtual Doctor of the Day", operator: "First Nations Health Authority", governance: "first_nations_governed_health_authority", province: "British Columbia", community: "Provincewide", area: "British Columbia", mode: ["virtual", "phone"], categories: ["primary_care", "patient_navigation", "virtual_support"], population: "First Nations people and their families living in B.C.", scope: "first_nations_specific", eligibility: "First Nations people and families in B.C.", hours: "Daily, 8:30 a.m.–4:30 p.m.", phone: "1-855-344-3800", url: "https://fnha.ca/services-and-support/access-and-support/health-and-virtual-services/virtual-doctor-how-it-works/", relationship: "FNHA-operated virtual health service." }),
  support({ id: "fns_bc_fnha_virtual_substance_use", name: "First Nations Virtual Substance Use and Psychiatry Service", operator: "First Nations Health Authority", governance: "first_nations_governed_health_authority", province: "British Columbia", community: "Provincewide", area: "British Columbia", mode: ["virtual", "phone"], categories: ["substance_use", "opioid_agonist_treatment", "mental_health", "virtual_support"], population: "First Nations people and their families living in B.C.", scope: "first_nations_specific", eligibility: "Referral from a health or wellness provider, Knowledge Keeper or Elder; Virtual Doctor of the Day can assist", referral: "Referral required", cost: "No cost", hours: "Weekdays; service pathway hours vary", phone: "1-833-456-7655 (provider/referral support)", url: "https://fnha.ca/services-and-support/access-and-support/health-and-virtual-services/virtual-substance-use-and-psychiatry-service/", relationship: "FNHA-operated specialist virtual service." }),
  support({ id: "fns_bc_fnha_mental_wellness_counselling", name: "FNHA Mental Health and Wellness Supports", operator: "First Nations Health Authority", governance: "first_nations_governed_health_authority", province: "British Columbia", community: "Provincewide", area: "British Columbia", mode: ["in_person", "virtual"], categories: ["mental_health", "cultural_support", "traditional_wellness"], population: "Eligible First Nations clients in B.C.; some listed crisis supports serve broader Indigenous populations", scope: "first_nations_specific", eligibility: "Coverage eligibility varies by benefit/provider", phone: "1-855-550-5454", url: "https://fnha.ca/services-and-support/preventative-care/mental-health-and-wellness/mental-health-and-wellness-supports/", relationship: "FNHA benefits and support directory." }),
  support({ id: "fns_bc_fnha_quality_care_safety", name: "Quality Care and Safety Office", operator: "First Nations Health Authority", governance: "first_nations_governed_health_authority", province: "British Columbia", community: "Provincewide", area: "B.C. public health services, FNHA services and some FNHA-funded services", mode: ["phone", "email", "regional"], categories: ["advocacy", "patient_safety", "complaints_resolution", "patient_navigation"], population: "First Nations clients and families", scope: "first_nations_specific", eligibility: "Feedback or complaint concerning eligible B.C. health-care experiences", phone: "1-844-935-1044", email: "quality@fnha.ca", url: "https://fnha.ca/about/governance-and-accountability/compliments-and-complaints/", relationship: "FNHA accountability and complaints-support mechanism." }),
  support({ id: "fns_bc_jordans_principle_coordination", name: "Jordan’s Principle Service Coordination Network and Hub", operator: "BC Aboriginal Child Care Society / regional First Nations service coordinators", governance: "indigenous_organization_service_coordination_with_federal_decision_authority", province: "British Columbia", community: "Provincewide", area: "British Columbia", mode: ["phone", "virtual", "regional"], categories: ["youth_support", "family_support", "patient_navigation"], population: "First Nations children and families", scope: "first_nations_specific", eligibility: "Jordan’s Principle eligibility and request rules apply", url: "https://fnha.ca/services-and-support/for-you/maternal-child-and-family-health/jordans-principle/", relationship: "Service coordination is Indigenous-organizational; FNHA states decision authority remains with Indigenous Services Canada." }),
  support({ id: "fns_bc_kuu_us_crisis", name: "KUU-US Crisis Response Service", operator: "KUU-US Crisis Line Society", governance: "indigenous_nonprofit_service_operator", province: "British Columbia", community: "Provincewide", area: "British Columbia", mode: ["phone"], categories: ["crisis_support", "youth_support", "elder_support", "mental_health"], population: "Indigenous people in B.C.", scope: "broader_indigenous", eligibility: "Open crisis support", hours: "24/7", phone: "1-800-588-8717", url: "https://www.kuu-uscrisisline.com/", relationship: "Indigenous crisis-service operator; listed by FNHA." }),

  support({ id: "fns_ab_aivcc", name: "Alberta Indigenous Virtual Care Clinic", operator: "Alberta Indigenous Virtual Care Clinic", governance: "indigenous_focused_independent_service_operator", province: "Alberta", community: "Provincewide", area: "Alberta", mode: ["virtual", "phone"], categories: ["primary_care", "mental_health", "patient_navigation", "virtual_support"], population: "Self-identifying First Nations, Inuit and Métis people and their families in Alberta", scope: "broader_indigenous", eligibility: "Self-identification; age conditions apply to some mental-health services", cost: "Free", hours: "Seven days; weekday/evening/weekend hours vary", phone: "1-888-342-4822", email: "info@aivcc.ca", url: "https://aivcc.ca/", relationship: "Clinic reports collaboration with Indigenous organizations, health-care providers and government funders; the page does not establish a government governance relationship.", ownerReview: true, notes: "A governance board or ownership description was not located on the pages reviewed; do not label the clinic First Nations-governed without further evidence." }),
  support({ id: "fns_ab_indigenous_support_line", name: "Indigenous Support Line", operator: "Alberta Health Services / current provincial health system", governance: "provincial_health_system_indigenous_support_role", province: "Alberta", community: "Provincewide", area: "Alberta", mode: ["phone"], categories: ["patient_navigation", "cultural_support", "advocacy", "substance_use", "mental_health"], population: "First Nations (status and non-status), Métis, Inuit and families", scope: "broader_indigenous", eligibility: "Indigenous people and families in Alberta", hours: "Monday–Friday, 10 a.m.–6 p.m.", phone: "1-844-944-4744 or 811", url: "https://www.albertahealthservices.ca/findhealth/Service.aspx?id=1083567&serviceAtFacilityID=1138816", relationship: "Public health-system support line; Central Zone service launched in August 2023." }),
  support({ id: "fns_ab_indigenous_wellness_clinic", name: "Indigenous Wellness Clinic", operator: "Alberta Health Services / current provincial health system", governance: "provincial_health_system_indigenous_service", province: "Alberta", community: "Edmonton", area: "Edmonton Zone and surrounding area", mode: ["in_person"], categories: ["primary_care", "mental_health", "substance_use", "patient_navigation", "advocacy"], population: "Indigenous patients of all ages in Edmonton Zone and surrounding area", scope: "broader_indigenous", eligibility: "Referral requirements vary by service; physician availability is limited", hours: "Monday–Friday, 8:30 a.m.–4:30 p.m.", phone: "1-844-441-4512 or 780-735-4512", url: "https://www.albertahealthservices.ca/findhealth/service.aspx?id=4838", relationship: "Public health-system multidisciplinary clinic." }),
  support({ id: "fns_ab_indigenous_wellness_core_north", name: "Indigenous Wellness Core — North Zone services", operator: "Alberta Health Services / current provincial health system", governance: "provincial_health_system_indigenous_support_role", province: "Alberta", community: "Multiple northern and rural communities", area: "North Zone", mode: ["in_person", "regional", "outreach"], categories: ["patient_navigation", "cultural_support", "mental_health", "substance_use", "outreach"], population: "First Nations, Métis and Inuit people", scope: "broader_indigenous", eligibility: "See individual service locations", phone: "1-844-944-4744", email: "IndigenousWellnessCore@ahs.ca", url: "https://www.albertahealthservices.ca/findhealth/service.aspx?id=7805", relationship: "Public health-system program with Indigenous community and organizational partnerships." }),
  support({ id: "fns_ab_four_winds_navigation", name: "Four Winds South Zone Indigenous Patient Navigation", operator: "Alberta Health Services / Four Winds team", governance: "indigenous_led_team_within_provincial_health_system", province: "Alberta", community: "Lethbridge, Cardston, Pincher Creek and Fort Macleod", area: "South Zone", mode: ["in_person", "regional"], categories: ["patient_navigation", "discharge_navigation", "cultural_support", "advocacy"], population: "Indigenous patients and families", scope: "broader_indigenous", eligibility: "Patient/family self-contact or provider referral", url: "https://www.albertahealthservices.ca/news/Page17093.aspx", relationship: "AHS describes the service as Indigenous-led and designed after South Zone community engagement." }),
  support({ id: "fns_ab_indigenous_cancer_navigation", name: "Indigenous Cancer Patient Navigators and Indigenous Cultural Liaisons", operator: "Cancer Care Alberta", governance: "provincial_health_system_indigenous_support_role", province: "Alberta", community: "Edmonton and Calgary cancer centres; provincial navigation context", area: "Alberta", mode: ["in_person", "phone"], categories: ["patient_navigation", "cultural_support", "advocacy"], population: "First Nations, Métis and Inuit people affected by cancer and their families", scope: "broader_indigenous", eligibility: "Contact program or request referral through cancer team", url: "https://www.albertahealthservices.ca/assets/info/cca/if-cca-indigenous-navigator-cci.pdf", relationship: "Cancer Care Alberta navigation and liaison service." }),

  support({ id: "fns_sk_fnho", name: "First Nations Health Ombudsperson Office", operator: "First Nations Health Ombudsperson Office", governance: "first_nations_governed_accountability_office", province: "Saskatchewan", community: "Provincewide", area: "Saskatchewan First Nations individuals and communities", mode: ["phone", "email", "in_person"], categories: ["advocacy", "patient_safety", "complaints_resolution", "patient_navigation"], population: "Saskatchewan First Nations individuals and communities", scope: "first_nations_specific", eligibility: "Individual/legal guardian, or another person with consent", cost: "Free", phone: "1-833-512-0651", email: "Intake@fnhoo.ca", url: "https://fnhoo.ca/faq/", relationship: "Governance authority derives from FSIN Chiefs-in-Assembly; federal contribution funding is a separate relationship." }),
  support({ id: "fns_sk_sha_fnm_health_services", name: "First Nations and Métis Health Services", operator: "Saskatchewan Health Authority", governance: "provincial_health_authority_indigenous_support_role", province: "Saskatchewan", community: "Regina, Saskatoon, Prince Albert and Broadview", area: "Named Saskatchewan hospital and urgent-care sites", mode: ["in_person", "regional"], categories: ["patient_navigation", "cultural_support", "elder_support", "transportation", "discharge_navigation", "housing", "family_support"], population: "First Nations and Métis patients and families", scope: "broader_indigenous", eligibility: "Patients and families at listed sites", url: "https://www.saskhealthauthority.ca/your-health/conditions-illnesses-services-wellness/indigenous-health/first-nations-and-metis-health-services", relationship: "SHA program; includes Elders, cultural support and multiple hospital locations." }),
  support({ id: "fns_sk_indigenous_birth_support", name: "Indigenous Birth Support Worker Program", operator: "Saskatchewan Health Authority", governance: "provincial_health_authority_indigenous_support_role", province: "Saskatchewan", community: "Saskatoon", area: "Jim Pattison Children’s Hospital Maternal Care Centre", mode: ["in_person"], categories: ["maternal_birth_support", "advocacy", "cultural_support", "family_support"], population: "First Nations, Métis and Inuit women planning to give birth in Saskatoon", scope: "broader_indigenous", eligibility: "Voluntary; referral or self-contact; first-come, first-served", cost: "Free", hours: "Registration available 24/7", phone: "306-514-7978", email: "BirthSupportJPCH@saskhealthauthority.ca", url: "https://www.saskhealthauthority.ca/your-health/conditions-illnesses-services-wellness/indigenous-health/maternal-care-centre-indigenous-birth-support-worker-jim-pattison-childrens-hospital", relationship: "SHA program created as an implementation response following the Saskatoon coerced-tubal-ligation review." }),
  support({ id: "fns_sk_stc_integrated_wellness", name: "Integrated Wellness", operator: "Saskatoon Tribal Council", governance: "first_nations_governed_tribal_council_program", province: "Saskatchewan", community: "STC member First Nations", area: "Kinistin, Mistawasis, Muskeg Lake, Muskoday, One Arrow, Whitecap and Yellow Quill service points", mode: ["in_person", "community"], categories: ["mental_health", "substance_use", "crisis_support", "traditional_wellness", "family_support"], population: "STC member First Nations’ relatives across the lifespan", scope: "first_nations_specific", eligibility: "Program page states anyone across the lifespan experiencing mental-wellness or addictions concerns can access; confirm the appropriate member-community entry point", phone: "306-956-6100", url: "https://sktc.sk.ca/wellness/integrated-wellness/", relationship: "Saskatoon Tribal Council program; First Nations governance and service delivery." }),
  support({ id: "fns_sk_stc_health_centre", name: "STC Health Centre", operator: "Saskatoon Tribal Council", governance: "first_nations_governed_tribal_council_service", province: "Saskatchewan", community: "Saskatoon", area: "Saskatoon urban service", mode: ["in_person"], categories: ["substance_use", "harm_reduction", "mental_health", "patient_navigation", "elder_support", "traditional_wellness"], population: "Community members using the STC Health Centre", scope: "first_nations_led_broader_access", eligibility: "See operator service page", url: "https://sktc.sk.ca/wellness/stc-health-centre/", relationship: "Saskatoon Tribal Council-operated health service." }),
  support({ id: "fns_sk_wellness_wheel", name: "Wellness Wheel Clinic", operator: "Wellness Wheel Medical Clinic", governance: "community_driven_indigenous_health_partnership", province: "Saskatchewan", community: "Regina plus rural, remote and on-reserve outreach", area: "Regina, Day Star, Muskowekwan, Big River, Ahtahkakoop, George Gordon, TATC, Kamsack, Yorkton, Kawacatoose and Fort Qu’Appelle", mode: ["in_person", "outreach", "virtual", "mobile"], categories: ["primary_care", "mental_health", "outreach", "traditional_wellness"], population: "Indigenous and vulnerable populations; community-specific outreach", scope: "broader_indigenous", eligibility: "See clinic or community outreach pathway", phone: "306-757-9012", url: "https://www.wellnesswheelclinic.ca/clinicalServices.html", relationship: "Clinic describes a community-driven model developed with Indigenous leaders and communities.", ownerReview: true, notes: "The reviewed public page supports community direction and partnerships but does not establish a single First Nations governance body; retain the narrower classification." }),
  support({ id: "fns_sk_all_nations_hope", name: "The Place of Hope / All Nations Hope Network", operator: "All Nations Hope Network", governance: "indigenous_nonprofit_service_operator", province: "Saskatchewan", community: "Regina and Fort Qu’Appelle", area: "Regina and southern Saskatchewan outreach context", mode: ["in_person", "outreach"], categories: ["outreach", "housing", "mental_health", "traditional_wellness", "family_support"], population: "First Nations, Métis and Inuit people and families affected by HIV, AIDS or hepatitis C", scope: "broader_indigenous", eligibility: "See service page", hours: "Place of Hope Monday–Friday, 9 a.m.–5 p.m.; Awasiw overnight hours listed separately", phone: "1-877-210-7622 or 306-924-8424", url: "https://allnationshope.ca/outreach", relationship: "Indigenous network and service operator." }),
  support({ id: "fns_sk_pagc_nihb_navigator", name: "Non-Insured Health Benefits Navigator", operator: "Prince Albert Grand Council", governance: "first_nations_governed_tribal_council_program", province: "Saskatchewan", community: "Prince Albert Grand Council member communities", area: "Northern Saskatchewan / PAGC service area", mode: ["phone", "community", "regional"], categories: ["patient_navigation", "transportation", "advocacy"], population: "Eligible First Nations and Inuit clients", scope: "first_nations_specific", eligibility: "NIHB eligibility applies", url: "https://pagc.sk.ca/wp-content/uploads/ar2025.pdf", relationship: "PAGC-operated navigator role for NIHB and related provincial/territorial programs." })
]

const fraserNorthIds = new Set([
  "fns_bc_fraser_indigenous_health_liaisons",
  "fns_bc_fraser_indigenous_mental_health_liaisons",
  "fns_bc_surrey_indigenous_maternal_liaison",
  "fns_bc_surrey_indigenous_primary_health_clinic",
  "fns_bc_katzie_health_wellness",
  "fns_bc_kwikwetlem_health_wellness",
  "fns_bc_fnha_virtual_doctor",
  "fns_bc_fnha_virtual_substance_use",
  "fns_bc_fnha_quality_care_safety"
])
const fraserNorthSupports = supports.filter(item => fraserNorthIds.has(item.support_id))

const exactMillerMatches = {
  fns_bc_fnha_virtual_substance_use: "FNHA Virtual Substance Use & Psychiatry Service",
  fns_bc_fnha_mental_wellness_counselling: "FNHA Mental Wellness & Counselling",
  fns_bc_jordans_principle_coordination: "Jordan's Principle Child & Youth Systems Navigators",
  fns_bc_kuu_us_crisis: "KUU-US Crisis Response Service"
}

const resourceMatches = supports.map(item => {
  const exact = exactMillerMatches[item.support_id]
  if (exact) return { support_id: item.support_id, support_name: item.service_program_name, outcome: "exact_existing_miller_resource", matched_resource_name: exact, confidence: "high", action: "Retain one canonical resource and consider adding the verified governance/support metadata through normal owner review." }
  if (item.province !== "British Columbia") return { support_id: item.support_id, support_name: item.service_program_name, outcome: "new_first_nations_support_candidate", matched_resource_name: null, confidence: "high", action: "Retain as a Miller North support candidate; the current Miller registry is B.C.-centred and should not be broadened automatically." }
  return { support_id: item.support_id, support_name: item.service_program_name, outcome: "new_first_nations_support_candidate", matched_resource_name: null, confidence: item.confidence, action: "Route through normal Miller resource owner review; do not publish automatically." }
})

const newResourceCandidates = resourceMatches.filter(item => item.outcome === "new_first_nations_support_candidate").map(match => {
  const item = supports.find(supportItem => supportItem.support_id === match.support_id)
  return { ...match, province: item.province, operator: item.operating_organization, governance_type: item.governance_type, operational_status: item.operational_status, source_url: item.authoritative_source_url, owner_review_status: item.owner_review_status }
})

const policySupportEdges = [
  { from: "In Plain Sight recommendations on culturally safe complaints and accountability", relationship: "responded_to_by", to: "FNHA Quality Care and Safety Office complaints process", confidence: "high", source_urls: ["https://www.fnha.ca/Documents/FNHA-Evaluation-of-the-First-Nations-Health-Authority-Final-Report-2019-2024.pdf", "https://fnha.ca/about/governance-and-accountability/compliments-and-complaints/"] },
  { from: "Saskatoon Health Region coerced-tubal-ligation external review Calls to Action", relationship: "partially_implemented_by", to: "Indigenous Birth Support Worker Program", confidence: "high", source_urls: ["https://www.saskhealthauthority.ca/our-organization/our-direction/research/who-we-are/exciting-discoveries/lessons-learned-indigenous-birth-support-worker-program", "https://www.saskhealthauthority.ca/your-health/conditions-illnesses-services-wellness/indigenous-health/maternal-care-centre-indigenous-birth-support-worker-jim-pattison-childrens-hospital"] },
  { from: "Alberta Indigenous Primary Health Care Advisory Panel recommendation I3", relationship: "has_related_operational_mechanism", to: "Indigenous patient navigation programs", confidence: "medium", source_urls: ["https://open.alberta.ca/dataset/68717edd-5861-406e-b4ea-dd0e9051dadc/resource/da7c9aae-9cc1-48f4-bce5-6e71bd02a9c8/download/hlth-maps-indigenous-primary-health-care-advisory-panel-final-report.pdf", "https://www.alberta.ca/indigenous-patient-navigator-grant-program"], caution: "This is a recommendation-to-mechanism relationship, not proof that the recommendation is fully implemented." }
]

const albertaCrosswalkRows = [
  ["CS1", "Address racism; create culturally safe complaint, ombudsperson/investigator and standards mechanisms.", "Indigenous Patient Safety Investigator and Advocate; Office of Alberta Health Advocates.", "direct_implementation_evidence"],
  ["CS2", "Equip staff with Indigenous history, trauma- and violence-informed practice and cultural-safety learning.", "Indigenous cultural training toolkit work is described in the anti-racism engagement page.", "partial_related_implementation"],
  ["CS3", "Provide safe spaces for ceremony, traditional medicine, language, navigation and culturally appropriate life-stage supports.", "Elder/Knowledge Keeper support is available through the patient-safety advocate; navigator mechanisms exist.", "partial_related_implementation"],
  ["A1", "Advance equitable access, medical-home relationships and practical access supports.", "Broad MAPS and Indigenous Health Division alignment; no recommendation-specific public measure located.", "broad_systemic_alignment_only"],
  ["A2", "Support innovative, Indigenous-designed and delivered wholistic models.", "$20-million Indigenous Primary Health Care Innovation Fund.", "direct_implementation_evidence"],
  ["A3", "Expand virtual and telehealth access.", "Alberta Indigenous Virtual Care Clinic and other virtual mechanisms operate; no direct panel crosswalk located.", "partial_related_implementation"],
  ["A4", "Recruit and retain an Indigenous health workforce.", "No recommendation-specific public progress measure located.", "no_clear_public_crosswalk"],
  ["A5", "Recruit and retain physicians in Indigenous communities and clinics.", "No recommendation-specific public progress measure located.", "no_clear_public_crosswalk"],
  ["A6", "Improve flexible specialty access.", "No recommendation-specific public progress measure located.", "no_clear_public_crosswalk"],
  ["I1", "Improve partnerships, data sharing and continuity across organizations.", "Indigenous Health Division and advisory structures provide broad alignment; operational crosswalk unclear.", "broad_systemic_alignment_only"],
  ["I2", "Build integrated multidisciplinary, culturally safe teams and extended access.", "Innovation-funded projects may align, but no complete recommendation-level ledger was located.", "partial_related_implementation"],
  ["I3", "Provide navigation, health-literacy and outreach supports.", "Indigenous Patient Navigator Grant Program and operating navigation services.", "direct_implementation_evidence"],
  ["Q1", "Develop Indigenous-driven data with data-sovereignty safeguards.", "No recommendation-specific public progress measure located.", "no_clear_public_crosswalk"],
  ["Q2", "Create Indigenous-aligned performance indicators and benchmarks.", "No public recommendation-specific indicators located.", "no_clear_public_crosswalk"],
  ["Q3", "Provide timely equipment and supply funding.", "No recommendation-specific public crosswalk located.", "no_clear_public_crosswalk"],
  ["Q4", "Modernize the health-card process.", "No recommendation-specific public completion evidence located.", "no_clear_public_crosswalk"],
  ["Q5", "Create an Office of Indigenous Primary Health Care.", "Indigenous Health Division created within the responsible ministry structure.", "direct_implementation_evidence"],
  ["P1", "Include Indigenous partners in design, governance, planning and resource allocation.", "Indigenous Advisory Council and Indigenous Health Division engagement mechanisms.", "partial_related_implementation"],
  ["P2", "Increase governance representation and funding autonomy.", "Advisory structures exist; no full public crosswalk to autonomy outcomes located.", "broad_systemic_alignment_only"],
  ["P3", "Include Elders, Knowledge Holders, youth and 2SLGBTQQIA+ people in planning.", "Elder roster supports complaints; no complete planning-participation crosswalk located.", "partial_related_implementation"],
  ["P4", "Provide sustainable long-term funding for Indigenous programs.", "Grant mechanisms exist; long-term funding status is not demonstrated for the recommendation as a whole.", "partial_related_implementation"],
  ["P5", "Create an Indigenous Primary Health Care Innovation Fund.", "$20-million fund created.", "direct_implementation_evidence"]
].map(([recommendation_id, summary, mechanism, status]) => ({ recommendation_id, neutral_summary: summary, current_mechanism: mechanism, crosswalk_status: status, owner_review_required: status === "broad_systemic_alignment_only", caution: "Status describes public evidence linking a mechanism to the recommendation; it is not an effectiveness or completion rating." }))

const albertaCrosswalkCounts = Object.fromEntries(["direct_implementation_evidence", "partial_related_implementation", "broad_systemic_alignment_only", "no_clear_public_crosswalk", "owner_review"].map(status => [status, albertaCrosswalkRows.filter(row => row.crosswalk_status === status).length]))

const validation = {
  schema_version: "miller-north-fnho-supports-validation-v1",
  generated_at: generatedAt,
  fnho_recommendations: fnhoRecommendations.length,
  support_records: supports.length,
  support_records_by_province: Object.fromEntries(["British Columbia", "Alberta", "Saskatchewan"].map(province => [province, supports.filter(item => item.province === province).length])),
  fraser_north_records: fraserNorthSupports.length,
  exact_existing_miller_matches: resourceMatches.filter(item => item.outcome === "exact_existing_miller_resource").length,
  new_support_candidates: newResourceCandidates.length,
  alberta_crosswalk_rows: albertaCrosswalkRows.length,
  source_url_failures: supports.filter(item => !item.authoritative_source_url.startsWith("https://")).length,
  duplicate_support_ids: supports.length - new Set(supports.map(item => item.support_id)).size,
  privacy_scan_terms: { patient_names_collected: 0, private_contacts_collected: 0, changed_case_names_collected: 0 },
  production_mutations: 0,
  publication_mutations: 0,
  fnho_navigation_changes: 0,
  decision: "valid_private_candidate_set"
}

if (fnhoRecommendations.length !== 4) throw new Error("FNHO recommendation ledger must contain four office-level themes")
if (supports.length !== 26 || fraserNorthSupports.length !== 9) throw new Error("Support fixture counts changed unexpectedly")
if (validation.source_url_failures || validation.duplicate_support_ids) throw new Error("Support dataset validation failed")
if (albertaCrosswalkRows.length !== 22) throw new Error("Alberta crosswalk must contain 22 recommendations")

await writeJson("miller-north-fnho-recommendation-finding-ledger-2026-09-06.json", { schema_version: "miller-north-fnho-ledger-v1", visibility: "private_owner_review", report_findings: fnhoFindings, recommendations: fnhoRecommendations, sources: Object.values(fnhoSources), generated_at: generatedAt })
await writeJson("miller-north-fnho-dossier-candidate-v2-2026-09-06.json", fnhoDossier)
await writeJson("miller-north-fnho-publication-safe-prototype-2026-09-06.json", {
  schema_version: "miller-north-research-policy-case-prototype-v1",
  visibility: "private_browser_ready_not_wired",
  title: "First Nations Health Ombudsperson Office",
  province: "Saskatchewan",
  focus: "First Nations governance, health-care complaints, recommendations and public response",
  what_it_is: fnhoDossier.owner_synthesis.what_it_is,
  why_it_matters: fnhoDossier.owner_synthesis.why_it_matters,
  metrics: [
    { label: "Complaints in inaugural period", value: "391" },
    { label: "Closed or resolved", value: "224" },
    { label: "Active", value: "167" },
    { label: "Recommendation themes", value: "4" }
  ],
  governance: "FNHO identifies FSIN Chiefs-in-Assembly Resolution 2046 as the source of its mandate. Federal contribution funding is shown separately and is not described as governance or operational control.",
  report_findings: [
    "Sixty-four percent of cases in the inaugural reporting period were related to the Saskatchewan Health Authority.",
    "The most frequently reported settings or provider categories included physicians, emergency rooms and hospitals.",
    "The report documents complaint resolution, investigation, advocacy, escalation and case-specific recommendations."
  ],
  recommendations: fnhoRecommendations.map(item => ({ summary: item.neutral_summary, public_evidence_status: item.current_public_evidence_status, reporting_limitation: item.reporting_limitation, source: item.source })),
  response: "The Saskatchewan Minister of Health stated in October 2025 that the Ministry and Saskatchewan Health Authority were reviewing the report and recommendations. A later comprehensive public response was not located in the official sources searched.",
  timeline: fnhoDossier.timeline.slice(0, 6),
  what_remains_unclear: fnhoDossier.owner_synthesis.what_remains_unclear,
  caution: "These classifications describe available public evidence. Missing public evidence does not prove that an action did not occur. Reported complaints, investigation findings, recommendations, responses and implementation are distinct stages. Legal material is context, not legal advice.",
  sources: Object.values(fnhoSources)
})
await writeJson("miller-north-first-nations-supports-three-province-2026-09-06.json", { schema_version: "miller-north-first-nations-supports-candidate-v1", visibility: "private_owner_review", publication_state: "not_published", records: supports, generated_at: generatedAt })
await writeJson("miller-north-fraser-north-first-nations-supports-2026-09-06.json", { schema_version: "miller-north-fraser-north-supports-candidate-v1", visibility: "private_owner_review", records: fraserNorthSupports, generated_at: generatedAt })
await writeJson("miller-north-first-nations-supports-resource-matches-2026-09-06.json", { schema_version: "miller-north-support-resource-match-v1", comparison_mode: "read_only", canonical_registry_snapshot: { bundled_rows: 333, approved_tavily_rows: 181 }, records: resourceMatches, generated_at: generatedAt })
await writeJson("miller-north-first-nations-supports-private-view-2026-09-06.json", { schema_version: "miller-north-first-nations-supports-private-view-v1", visibility: "private_owner_review", title: "First Nations Supports", caution: "Service status and eligibility reflect public operator information checked on September 6, 2026. Confirm directly before relying on a service. Governance, funding and delivery are separate relationships.", filters: ["province", "community", "support_type", "first_nations_specific_or_broader_indigenous", "delivery_mode", "substance_use", "patient_navigation", "cultural_support", "advocacy"], cards: supports.map(item => ({ name: item.service_program_name, operator: item.operating_organization, province: item.province, community: item.community, governance_label: item.governance_type, categories: item.service_categories, population: item.population_served, access: item.intake_access_pathway, phone: item.public_phone, website: item.website, last_verified_date: item.last_verified_date })) })
await writeJson("miller-north-alberta-22-recommendation-crosswalk-2026-09-06.json", { schema_version: "miller-north-alberta-panel-crosswalk-v1", visibility: "private_owner_review", rows: albertaCrosswalkRows, counts: albertaCrosswalkCounts, generated_at: generatedAt })
await writeJson("miller-north-fnho-supports-validation-2026-09-06.json", validation)

const bullets = values => values.map(value => `- ${value}`).join("\n")
const sourceLinks = values => values.map(item => `- [${item.title}](${item.url}) — ${item.organization}`).join("\n")
const recommendationTable = fnhoRecommendations.map(item => `| ${item.recommendation_id} | ${item.neutral_summary} | ${item.current_public_evidence_status} | ${item.owner_review_required ? "Yes" : "No"} |`).join("\n")

await writeMd("miller-north-fnho-deep-dive-2026-09-06.md", `
# FNHO deep dive

> Private owner-review research artifact. No publication decision.

## Decision

**Ready with minor owner review.** FNHO is sufficiently documented for a fourth dossier candidate, but it should remain out of live navigation until Indigenous governance/editorial review confirms the governance wording, terminology and recommendation-status framing.

## What the office is

FNHO describes itself as a First Nations-controlled, independent and impartial Saskatchewan health accountability office. It traces its mandate to FSIN Chiefs-in-Assembly Resolution 2046 (May 2017). Its public services include complaint intake, early resolution, investigation, mediation, advocacy, recommendations, education and escalation to other bodies when appropriate.

Federal contribution funding supported establishment and later operation. That funding relationship is not presented as governance authority or operational control.

## Inaugural report

The report covers July 1, 2023 to March 31, 2025. It reports 391 complaints: 224 closed or resolved and 167 active. Adults accounted for 80% and children 20%. Sixty-four percent of cases were related to the Saskatchewan Health Authority. Top reported categories were physicians (29%), emergency rooms (29%), hospitals (22%), nursing (10%) and accessing health-care services (10%); the report states these are not inclusive of all complaints.

The report’s featured cases use changed names. Miller North has retained only aggregate and systemic information.

## Recommendation themes

| Stable ID | Neutral summary | Current public-evidence status | Owner review |
|---|---|---|---|
${recommendationTable}

The Minister of Health said on October 28, 2025 that the Ministry and SHA were reviewing the report and recommendations. No later comprehensive formal response, implementation plan or recommendation-by-recommendation status ledger was located in the official sources searched. This is a public-reporting limitation, not evidence that no response occurred.

## Dossier readiness

- Governance clarity: strong.
- Authoritative-source depth: strong; FNHO’s own report and governance pages are primary.
- Recommendation/accountability depth: strong at theme level; the report does not number the four office-level themes.
- Health-system response evidence: limited to review acknowledgement plus case-specific resolutions.
- Implementation evidence: fragmentary at system level.
- Privacy safety: strong when aggregate statistics and neutral summaries are used.
- Reader comprehensibility: strong with a clear governance/funding distinction.

## Sources

${sourceLinks(Object.values(fnhoSources))}
`)

await writeMd("miller-north-fnho-governance-funding-map-2026-09-06.md", `
# FNHO governance and funding relationship map

> Private owner-review artifact.

FSIN Chiefs-in-Assembly Resolution 2046
→ **governance authority**
→ First Nations Health Ombudsperson Office

FNHO Board / Knowledge Holders Council
→ **governance and guidance**
→ office mandate and operations

Indigenous Services Canada contribution funding
→ **recipient-level funding support**
→ FSIN / FNHO establishment and operation

FNHO
→ **complaint intake, advocacy, investigation and recommendations**
→ Saskatchewan First Nations people and communities

Saskatchewan Ministry of Health and Saskatchewan Health Authority
→ **publicly acknowledged review**
→ inaugural report and recommendations

The evidence does not support an edge from federal funding to governance control. It also does not support treating provincial review acknowledgement as implementation.
`)

await writeMd("miller-north-fnho-saskatchewan-response-search-2026-09-06.md", `
# Saskatchewan response search — FNHO inaugural report

> Bounded Knowledge-Gap Investigation. Private.

## Question

Did Saskatchewan or the Saskatchewan Health Authority publish a formal response, implementation plan, policy change or progress update after FNHO’s inaugural report?

## Result

**Partially answered.** The October 28, 2025 Hansard records the Minister of Health acknowledging receipt and stating that the Ministry and SHA were reviewing the report and recommendations. Targeted searches of Saskatchewan government, SHA and legislative source families did not locate a later comprehensive response or recommendation-level implementation plan.

## Stopping reason

Reasonable official-source avenues were exhausted and later searches returned the same acknowledgement rather than a newer response. The remaining gap is suitable for organization-specific follow-up, not indefinite web searching.

## Careful conclusion

“Formal response not located in the public sources searched” is the supported statement. It is not evidence that no internal or unpublished response occurred.

## Next bounded question

Do FNHO, SHA or the Ministry hold a public correspondence package or implementation crosswalk created after October 28, 2025?
`)

await writeMd("miller-north-saskatchewan-anti-indigenous-racism-navigator-network-note-2026-09-06.md", `
# Saskatchewan Anti-Indigenous Racism Navigator Network

> Private research note.

Federal UN Declaration Act reporting states that Indigenous Services Canada’s Saskatchewan Region established the network in 2025–26 to support health-system navigators from First Nations organizations with province-wide collaboration, knowledge sharing, networking and resource exchange.

The public evidence reviewed did not identify a complete participant list, a governance body, an evaluation, milestones or a formal relationship to FNHO or SHA. Miller North should therefore describe it as a federally reported network involving navigators from First Nations organizations—not as an FNHO or SHA program.

The strongest next source would be an Indigenous-led network page, terms of reference or participant report.

Source: [UN Declaration Act Action Plan annual reporting](https://justice.canada.ca/eng/declaration/report-rapport/2026/b1.html).
`)

await writeMd("miller-north-indigenous-governance-editorial-review-package-2026-09-06.md", `
# Miller North — Indigenous governance and editorial review packet

## Project purpose

Miller North organizes public evidence about Indigenous experiences in health care and follows what happened afterward: reviews, recommendations, government or health-system responses, policy and governance changes, implementation evidence and unresolved public-reporting gaps.

## Product structure

- **Live Listening:** recent public-source reports still being reviewed.
- **Evidence Library:** more developed and reconciled incident or cohort records.
- **Research & Policy:** accountability, recommendations, law, governance and implementation over time.

## Current examples

- **British Columbia — In Plain Sight:** a 24-recommendation public-evidence tracker. Status labels describe available evidence, not effectiveness or compliance.
- **Saskatchewan — Saskatoon coerced sterilization cohort:** reported experiences, the 2017 external review, Calls to Action, program response and later legal context. Individual reports, review findings and legal findings remain distinct.
- **Alberta — Indigenous Primary Health Care Advisory Panel:** 22 recommendations and current government/health-system mechanisms. Broad alignment is not counted as completed implementation.
- **FNHO candidate:** First Nations governance, complaint and investigation work, aggregate inaugural reporting, four recommendation themes, public funding and a limited public response trail.

## Evidence and privacy method

Primary government, legal, regulatory, health-system and Indigenous governance sources are preferred. Indigenous-led governance and accountability sources are treated as primary when they document their own mandate, findings or activities. Missing public evidence does not prove an action did not occur. The project does not identify anonymized patients, keeps allegations separate from formal findings and does not publish internal owner-review notes.

## Ten questions for review

1. Does the site use “First Nations,” “Métis,” “Inuit” and “Indigenous” at the right level of specificity?
2. Is FNHO’s Chiefs-in-Assembly governance authority described accurately and respectfully?
3. Is the distinction between First Nations governance, federal funding and provincial response clear enough?
4. Are Indigenous-led sources centered as primary evidence where they should be?
5. Does “Live Listening” feel appropriate, or would “Public reports under review” be clearer and less extractive?
6. Are incident and cohort summaries cautious without becoming clinical or distancing?
7. Are recommendation evidence labels understandable and fair?
8. Are the limits of legal-process records clear, especially complaint acceptance versus findings?
9. Are there any re-identification risks in summaries, geography or timelines?
10. What one framing or terminology change is most important before wider public promotion?

Please do not send confidential medical records or private personal information as part of review.
`)

await writeMd("miller-north-language-terminology-audit-2026-09-06.md", `
# Miller North language and terminology audit

## High priority

- **FNHO governance:** use “First Nations-governed” only where FNHO’s own governance sources support it; never make federal funding the source of governance authority.
- **Complaint and legal records:** retain “reported,” “alleged,” “complaint accepted” and “reviewing” where no finding or final response exists.
- **Implementation:** keep “direct evidence,” “partial or related evidence,” “broad alignment” and “no public crosswalk” separate.

These protections are already present in the current publication-safe case copy. No automatic broad rewrite was made.

## Recommended for Indigenous governance/editorial review

- Ask whether **Live Listening** should become **Public reports under review** or another less observational label.
- Review “victim” avoidance and confirm that “patient,” “person,” “family” and “reported experience” fit source-community preferences.
- Review whether the Alberta description “structures created to respond” should be narrowed to “current structures linked to implementation.”
- Confirm distinctions-based language whenever a source identifies First Nations, Métis or Inuit specifically.

## Stylistic

- Prefer “public evidence currently shows” to “status” where space allows.
- Prefer short relationship labels and expandable legal detail.
- Avoid “success/failure,” “compliance score” and red/green grading.
`)

await writeMd("miller-north-source-balance-review-update-2026-09-06.md", `
# Updated Miller North source-balance review

The current three-case browser projection contains 42 categorized source references: 16 government, 9 implementation/follow-up, 6 health system, 4 legal/human-rights, 3 Indigenous organization, 2 original report and 2 regulator/oversight. Counts are not measures of quality and include repeated use of key sources.

## What improved

- FNHO adds a substantial First Nations-governed primary source: mandate, complaint activity, findings, recommendations and audited reporting.
- FNHA’s 2019–24 evaluation adds Indigenous-led implementation evidence for B.C. complaint/accountability work.
- Siksika Nation’s public record provides a direct First Nations source for an Alberta human-rights complaint, while preserving that complaint acceptance is not a merits finding.

## Remaining perspective gaps

- **B.C.:** Indigenous-led evaluation is improving, but government implementation reporting still dominates recommendation status.
- **Saskatchewan:** FNHO is a major correction to health-system-dominant evidence; a later FNHO, FSIN or First Nations organization response ledger remains missing.
- **Alberta:** government sources dominate implementation mechanisms. A final Indigenous-led assessment of the panel recommendations or anti-racism strategy was not located.
- **Legal/human-rights:** direct final decisions specific to Indigenous patient care remain scarce. Complaints, accepted processes and legal context must not be presented as adjudicated findings.
`)

await writeMd("miller-north-indigenous-led-implementation-source-review-2026-09-06.md", `
# Indigenous-led implementation-source review

## British Columbia

The strongest new source is FNHA’s 2019–24 evaluation. It documents a culturally safe complaints process created in response to In Plain Sight and reports 685 complaints from 2020–24, including aggregate issue categories. This is implementation evidence for an accountability mechanism, not evidence that every complaint was resolved or that systemic outcomes were achieved.

FNHA’s patient-experience research and Quality Care and Safety Office pages add primary governance and operational context. Island Health’s self-identification redesign still needs First Nations and Métis partner reporting, not only the health authority’s account.

## Saskatchewan

FNHO’s inaugural report is the strongest Indigenous-governed source in the current Saskatchewan lane. The STC and PAGC service reports add operational First Nations-led evidence. The anti-racism navigator network still lacks an identified Indigenous-led terms-of-reference or evaluation source.

## Alberta

The advisory-panel report is Indigenous-informed but government-published. Siksika Nation’s complaint announcement is an important direct First Nations source for a legal-process record. A later Indigenous-led evaluation of the 22 recommendations or the promised anti-racism strategy was not located.
`)

await writeMd("miller-north-bc-patient-care-quality-review-follow-up-2026-09-06.md", `
# B.C. Patient Care Quality Review follow-up

> Private accountability-chain candidate.

- **Responsible body:** B.C. Ministry of Health.
- **Public engagement:** May 14–July 24, 2026; broader work continues through 2026.
- **Scope:** internal patient-safety reviews and patient-initiated patient-care-quality reviews, including Indigenous-specific racism and discrimination.
- **Indigenous participation:** dedicated First Nations, Métis and Inuit survey plus community information-gathering sessions; named governance partners were not listed on the project page.
- **Intended output:** policy direction and support for future legislative changes.
- **In Plain Sight relationship:** the Ministry explicitly names In Plain Sight as a reason for the review and describes culturally unsafe quality-review processes. The strongest mapping is to recommendations concerning complaints, information sharing and culturally safe accountability; a recommendation-number crosswalk was not published.
- **Interim/final reporting:** no interim material, fixed final report date or published summary was located.

Evidence chain: patient/community concerns and In Plain Sight → Ministry review and engagement → intended policy/legislative direction → future report/implementation evidence not yet located.

Source: [About the Patient Care Quality Review project](https://engage.gov.bc.ca/patientcarequality/about/).
`)

await writeMd("miller-north-island-health-self-identification-redesign-follow-up-2026-09-06.md", `
# Island Health Indigenous self-identification redesign follow-up

> Private Knowledge-Gap Investigation.

## Evidence

Island Health paused the Indigenous Patient Self-Identification Program at all acute-care sites effective July 8, 2026. Its public page says First Nations leaders and communities reported that the program was not operating in a way that met patient, family and community needs. Island Health committed to redesign with First Nations, Métis and Inuit partners, shared governance, stronger day-to-day oversight, quality improvement and Indigenous data-sovereignty/data-governance principles.

## Status

**Partially answered.** The pause and redesign commitment are documented. No resumption date, public milestone plan, named shared-governance body, conditions for resumption or later implementation update was located.

## Stopping reason

The live initiative page is the authoritative current source and directs readers to keep checking for updates. Additional targeted searches did not reveal a later source.

Chain: community feedback → pause → redesign and shared-governance commitment → implementation evidence not yet public.

Source: [Indigenous Self-Identification Initiative](https://www.islandhealth.ca/health-topics/indigenous-health/indigenous-self-identification-initiative).
`)

const albertaRowsMd = albertaCrosswalkRows.map(row => `| ${row.recommendation_id} | ${row.crosswalk_status} | ${row.current_mechanism} |`).join("\n")
await writeMd("miller-north-alberta-22-recommendation-crosswalk-2026-09-06.md", `
# Alberta Indigenous Primary Health Care Advisory Panel — 22-recommendation crosswalk

> Private public-evidence crosswalk. Mechanism linkage is not an effectiveness or completion rating.

Counts: ${Object.entries(albertaCrosswalkCounts).map(([key, value]) => `${key}: ${value}`).join("; ")}.

| Recommendation | Public-evidence relation | Current mechanism/evidence |
|---|---|---|
${albertaRowsMd}

MAPS’ aggregate completion reporting is not treated as completion of these 22 recommendations. The public record supports five direct mechanism links, several partial/related links, and substantial areas without a recommendation-level crosswalk.
`)

await writeMd("miller-north-alberta-anti-racism-strategy-follow-up-2026-09-06.md", `
# Alberta health anti-racism strategy follow-up

> Private Knowledge-Gap Investigation.

The Alberta engagement page records sessions in October and November 2024 and says the results would inform an Indigenous Anti-Racism What We Heard report, an Indigenous Anti-Racism Strategy and updates to a cultural-training toolkit. Its status remains “results under review,” last updated July 24, 2025.

The broader *Shape the Way* and *Lead the Way* reports contain Indigenous health-system concerns, but neither is the promised health-specific anti-racism strategy. Alberta’s 2022 general Anti-Racism Action Plan is also a separate instrument.

## Result

**Unresolved publicly.** No final health-specific What We Heard report or Indigenous health anti-racism strategy was located in targeted official-source searches as of September 6, 2026.

## Stopping reason

Official-source searches returned the engagement page and broader refocusing reports but not the named deliverables. Future monitoring should watch the Indigenous Health Division and engagement page.
`)

await writeMd("miller-north-legal-human-rights-enrichment-2026-09-06.md", `
# Direct legal and human-rights enrichment

## British Columbia

The B.C. Human Rights Tribunal’s Indigenous discrimination guidance cites *Mr. C v. Vancouver Coastal Health Authority and another, 2021 BCHRT 22* when explaining systemic context. The Tribunal also cautions that systemic context alone does not prove an individual complaint. This is useful legal-context evidence, not a general finding about every health-care interaction.

B.C.’s Health Professions and Occupations Act now contains anti-discrimination and distinctions-based Indigenous-reconciliation principles. It is legal context for professional regulation, not proof of operational compliance.

## Saskatchewan

The Saskatchewan Human Rights Commission’s complaint-resolution material documents an anonymized hospital mediation involving apology, compensation and anti-racism training. It can remain a direct human-rights accountability record without identifying the complainant or hospital.

FNHO’s inaugural report documents a case-specific escalation to the College of Physicians and Surgeons of Saskatchewan and a Letter of Concern. The report is the primary source; no separate public disciplinary finding was located.

## Alberta

Siksika Nation states that the Alberta Human Rights Commission accepted a complaint concerning Strathmore health care. Acceptance is a process step, not a merits finding. No later tribunal decision or settlement was located in the bounded search.

The Indigenous Patient Safety Investigator and Advocate has delegated Alberta Health Charter review authority in limited circumstances but cannot impose discipline, reverse decisions or order penalties.

## Conclusion

The source family remains thin in final adjudicated decisions directly concerning Indigenous patient care. Miller North should keep complaint acceptance, mediation, review authority and final findings as separate stages.
`)

await writeMd("miller-north-fraser-north-first-nations-supports-report-2026-09-06.md", `
# Fraser North First Nations Supports

> Private owner-review artifact. Service details were checked against current public operator pages on September 6, 2026.

## What Miller already has

The read-only canonical-resource comparison found four exact Indigenous-support resources in Miller’s B.C. bundle: FNHA Virtual Substance Use & Psychiatry, FNHA Mental Wellness & Counselling, Jordan’s Principle Child & Youth Systems Navigators and KUU-US Crisis Response. No production record was changed.

## Strong missing or enrichment candidates

- Fraser Health Indigenous Health Liaison Program — regional hospital/community navigation and discharge support.
- Indigenous Mental Health Liaisons — Fraser North and neighbouring service points, including Maple Ridge/Coquitlam and Hope/Agassiz.
- Indigenous Primary Health and Wellness Clinic (FRAFCA) — Surrey clinic plus named First Nations/community outreach.
- Indigenous Maternal Liaison — Surrey Memorial Hospital.
- Katzie Health and Wellness — Nation-governed primary, mental-health, addictions, maternal/family and traditional-wellness supports for Katzie members.
- kʷikʷəƛ̓əm Health and Wellness / Community-Based Health Clinic — Nation-governed member clinic and health/wellness supports in Coquitlam.
- FNHA Quality Care and Safety Office — complaints, advocacy and navigation.
- FNHA Virtual Doctor of the Day — province-wide primary-care access.

## Hospitals and communities with public navigation/liaison evidence

Fraser Health’s regional liaison program covers Indigenous patients across its hospital system. Separate mental-health liaison contacts are published for Maple Ridge/Coquitlam, Surrey, Abbotsford/Mission, Chilliwack and Hope/Agassiz. Surrey has a maternal liaison and an operating Indigenous Primary Health and Wellness Clinic. Katzie and kʷikʷəƛ̓əm publish current Nation-governed health and wellness services for their members in Pitt Meadows and Coquitlam.

## Gaps to treat as signals

- No single public page maps all liaison staffing to each Fraser North hospital or current on-site schedule.
- Transportation, after-hours advocacy and rural/remote Fraser Canyon coverage are not represented as clearly as regional phone access.
- Public pages generally describe broader Indigenous eligibility; do not relabel them First Nations-specific.
- Current service capacity and wait times are not consistently published.

## Best next practical move

Owner-review the eight strongest missing/enrichment candidates above and confirm each operator’s current access pathway before any Miller publication.
`)

await writeMd("miller-north-first-nations-supports-miller-match-report-2026-09-06.md", `
# Miller existing-resource match report

The comparison was read-only. It inspected 333 bundled Miller rows and 181 approved, non-hidden Tavily resource rows through the existing registry dry run.

- Exact existing Miller matches: ${resourceMatches.filter(item => item.outcome === "exact_existing_miller_resource").length}.
- New First Nations/Indigenous support candidates: ${newResourceCandidates.length}.
- Production resource mutations: 0.
- Candidate publications: 0.

Exact matches are FNHA Mental Wellness & Counselling, FNHA Virtual Substance Use & Psychiatry Service, Jordan’s Principle Child & Youth Systems Navigators and KUU-US Crisis Response Service. All other support records remain private candidates. Alberta and Saskatchewan records should not silently broaden Miller’s B.C.-centred registry.
`)

await writeMd("miller-north-first-nations-supports-new-resource-candidate-review-2026-09-06.md", `
# New First Nations Supports candidate review

## Review first

1. Fraser Health Indigenous Health Liaison Program — high identity and operational confidence; broad regional utility.
2. Indigenous Primary Health and Wellness Clinic (FRAFCA) — current clinic page, direct access and named First Nations/community outreach.
3. Indigenous Maternal Liaison at Surrey Memorial — current access information and a clearly defined role.
4. FNHA Quality Care and Safety Office — province-wide complaints/navigation support and strong governance evidence.
5. FNHA Virtual Doctor of the Day — province-wide access and a clear referral bridge to virtual substance-use/psychiatry care.
6. Alberta Indigenous Support Line — province-wide, directly reachable and operational in Central Zone.
7. Saskatchewan First Nations Health Ombudsperson Office — strong First Nations governance and complaint-resolution evidence.
8. Saskatchewan Indigenous Birth Support Worker Program — direct current access and a sourced accountability relationship.

## Hold for wording or scope review

- Alberta Indigenous Virtual Care Clinic: operational evidence is strong; a formal governance/ownership description was not located.
- Wellness Wheel Clinic: community-driven Indigenous partnership is documented; do not overstate a single First Nations governance authority.
- Provincial health-authority liaison programs: useful Indigenous supports, but not First Nations-led or First Nations-governed.

No candidate was added to Miller production.
`)

await writeMd("miller-north-first-nations-supports-governance-classification-2026-09-06.md", `
# First Nations Supports governance classification

## Classification rule

Governance, funding and delivery are separate fields. “First Nations-governed” requires an authoritative governance statement; “Indigenous-led” requires an operator/source statement; a dedicated Indigenous role inside a provincial health authority remains a health-authority program.

## Dataset distribution

${bullets(Object.entries(supports.reduce((acc, item) => { acc[item.governance_type] = (acc[item.governance_type] || 0) + 1; return acc }, {})).map(([key, value]) => `${key}: ${value}`))}

Two records require governance wording review: Alberta Indigenous Virtual Care Clinic and Wellness Wheel Clinic. Their services are operationally supported, but their public pages do not justify a stronger governance label.
`)

await writeMd("miller-north-first-nations-supports-geographic-service-gap-review-2026-09-06.md", `
# First Nations Supports geographic and service-gap review

> Research signals, not adequacy conclusions.

## British Columbia / Fraser North

Regional navigation and mental-health liaison contacts are strong, but facility-by-facility schedules, transportation and after-hours advocacy are inconsistently public. Virtual FNHA services improve province-wide reach but do not replace local in-person capacity.

## Alberta

Provincial virtual care and the support line are strong access points. The Indigenous Wellness Core publishes an extensive northern location network, while current Central Zone public detail is thinner beyond the support line. This is a documentation gap, not evidence that no local support exists.

## Saskatchewan

SHA publishes supports at Regina, Saskatoon, Prince Albert and Broadview. First Nations-led STC, PAGC and outreach services improve rural/remote coverage, but access information is fragmented across organizations. FNHO provides province-wide advocacy but does not replace clinical care.

## Cross-cutting

Eligibility, capacity, wait times and service continuity are less consistently public than phone/location details. A future support view should show “last verified” and prompt direct confirmation.
`)

await writeMd("miller-north-policy-to-first-nations-support-relationships-2026-09-06.md", `
# Policy/accountability-to-support relationship candidates

${policySupportEdges.map(edge => `- **${edge.from} → ${edge.relationship} → ${edge.to}** (${edge.confidence}). ${edge.caution || "Source-backed relationship."} Sources: ${edge.source_urls.join(", ")}`).join("\n")}

Existing services are not treated as implementation of later recommendations merely because they address similar topics. Only the first two edges have direct program/accountability provenance; the Alberta edge remains a conservative recommendation-to-mechanism candidate.
`)

await writeMd("miller-north-first-nations-supports-owner-summary-2026-09-06.md", `
# First Nations Supports — owner summary

## What changed

- Structured 26 current public supports: 12 in B.C., 6 in Alberta and 8 in Saskatchewan.
- Built a nine-record Fraser North starting set.
- Compared all records with Miller’s existing registry read-only.
- Identified four exact existing Miller resources and 22 private support candidates.

## Why it matters

The same evidence system can now distinguish a First Nations-governed service, an Indigenous community operator and a mainstream health-system program with an Indigenous support role. That makes the list more useful without erasing who governs or delivers care.

## Strongest practical candidates

Fraser Health’s Indigenous Health Liaison Program, the FRAFCA Indigenous Primary Health and Wellness Clinic, the Surrey Indigenous Maternal Liaison, FNHA’s Quality Care and Safety Office and Virtual Doctor of the Day.

## Uncertainty

Facility schedules, capacity, wait times and some governance/ownership details remain inconsistently public. Every future public card should retain its last-verified date and encourage direct service confirmation.

## Recommended next move

Run normal owner resource review on the eight strongest Fraser North candidates before designing a public support page.
`)

await writeMd("miller-north-fnho-phase-owner-summary-2026-09-06.md", `
# Miller North FNHO phase — combined owner summary

## FNHO

- **What we learned:** the inaugural report records 391 complaints, 224 closed/resolved, 167 active and 64% SHA-related during July 2023–March 2025.
- **Governance:** authority is described through FSIN Chiefs-in-Assembly Resolution 2046; FNHO is independent from government/providers.
- **Recommendations:** four office-level themes—training, confidentiality/communication, capacity and support/navigation.
- **Response:** Saskatchewan’s Health Minister said the Ministry and SHA were reviewing the report and recommendations in October 2025.
- **Implementation:** case-specific resolutions exist; a system-wide response or implementation ledger was not located.
- **Readiness:** ready with minor owner review. Keep out of navigation until Indigenous governance/editorial review.

## Indigenous governance/editorial readiness

The review packet is ready. The strongest framing choice is the explicit separation of governance, funding, delivery and response. Likely review concerns are “Live Listening” wording, distinctions-based terminology, institutional voice dominance and whether status labels feel fair.

## British Columbia

The 2026 Patient Care Quality Review is a strong accountability-chain candidate with Indigenous-specific racism in scope and intended policy/legislative implications. Island Health’s self-identification pause and shared-governance redesign are well documented, but no public resumption milestone is available.

## Alberta

The 22-recommendation crosswalk identifies 5 direct mechanism links, 7 partial/related links, 3 broad-alignment-only links and 7 without a clear public crosswalk. No final health-specific anti-racism What We Heard report or strategy was located.

## Saskatchewan

FNHO is the strongest new Indigenous-governed accountability source. The navigator network is federally reported, but its participants, governance and evaluation remain unclear. A later formal provincial/SHA response to FNHO was not located.

## Source balance

FNHO and FNHA materially improve Indigenous-led primary-source coverage. Direct final legal/human-rights decisions and Alberta Indigenous-led implementation evaluation remain weak.

## First Nations supports

Twenty-six supports were structured across the three provinces, including nine for Fraser North. Four are exact Miller matches; 22 remain private candidates. No resource was changed.

## What changed on the live site

Nothing. FNHO was not added to navigation and no browser projection was deployed in this pass.

## Operations

- Web discovery/search queries: 22, plus targeted official-page inspections.
- Inspection units: 69 source pages/PDF sections, local artifacts and registry comparison batches.
- Tavily calls: 0.
- Local-model calls: 0.
- Cloud-model calls: 0.
- Measurable external cost: $0.
- Production/database mutations: 0.

## Recommended next move

Have an Indigenous governance/health-research reviewer assess the concise review packet and FNHO projection, then make a focused go/no-go decision on adding FNHO as the fourth case.
`)

await writeMd("miller-north-fnho-updated-private-research-brief-2026-09-06.md", `
# First Nations Health Ombudsperson Office: Governance, Complaints and Public Response

> Private research brief for owner and editorial review.

## Executive summary

The First Nations Health Ombudsperson Office is a First Nations-governed Saskatchewan health-accountability body. Its inaugural report provides aggregate evidence from July 2023 through March 2025: 391 complaints, 224 closed or resolved files, 167 active files and 64% of cases related to the Saskatchewan Health Authority. The office identifies four broad recommendation themes. Saskatchewan publicly acknowledged that the Ministry of Health and SHA were reviewing the report, but a later comprehensive response or recommendation-by-recommendation implementation ledger was not located.

## Governance and funding

FNHO traces its mandate to FSIN Chiefs-in-Assembly Resolution 2046. Indigenous Services Canada announced public funding for establishment. These are separate relationships: funding does not establish federal governance or operational control.

## Findings and recommendations

The office reports complaints involving physicians, emergency rooms, hospitals, nursing and access to health services. Its four systemic themes call for stronger cultural-awareness and sensitivity training, better confidentiality and communication, northern capacity and care nearer home, and clear support/navigation pathways.

## Response and implementation

The inaugural report documents case-specific resolutions, apologies, escalation to a professional college, recommendations and an Indigenous patient-safety navigator created at one hospital. These are important actions, but they do not establish province-wide implementation of the four systemic themes. The later public provincial record located is a ministerial statement that the report was under review.

## Limitations

The public record does not provide a single response ledger, named owner and timeline for every recommendation, or outcome measures. Missing public evidence does not prove no action occurred. Featured-case identities remain excluded.

## Sources

${sourceLinks(Object.values(fnhoSources))}
`)

console.log(JSON.stringify({ generated_artifacts: 31, fnho_recommendations: fnhoRecommendations.length, supports: supports.length, fraser_north: fraserNorthSupports.length, exact_miller_matches: validation.exact_existing_miller_matches, alberta_crosswalk: albertaCrosswalkCounts }, null, 2))
