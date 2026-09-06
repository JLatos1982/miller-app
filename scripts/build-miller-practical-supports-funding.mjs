import fs from "node:fs"
import path from "node:path"
import rawResources from "../src/vancouver_resources_merged_updated.json" with { type: "json" }
import { stableCuratedResourceId } from "../src/map/mapChat.js"
import { normalizedResourceRows } from "../src/resourceData.js"

const root = path.resolve(new URL("..", import.meta.url).pathname)
const output = path.join(root, "artifacts", "miller")
const runDate = "2026-09-06"
const nextCheck = (status) => status === "open" ? "2026-10-06" : ["recurring", "upcoming", "upcoming_or_periodic", "periodic_intakes", "open_or_ongoing_proposals"].includes(status) ? "2026-11-05" : "2026-12-05"
const official = {
  fnhaBenefits: "https://fnha.ca/benefits/overview/",
  fnhaTransport: "https://fnha.ca/benefits/benefits-guide/medical-transport-ambulance/",
  fnhaMental: "https://fnha.ca/updates-to-mental-health-counselling-programs/",
  federalFunding: "https://www.canada.ca/en/services/indigenous-peoples/funding-for-indigenous-peoples.html",
  federalBenefits: "https://www.canada.ca/en/services/benefits/finder.html",
  psssp: "https://sac-isc.gc.ca/eng/1100100033682/1531933580211",
  iset: "https://www.canada.ca/en/employment-social-development/programs/indigenous-skills-employment-training.html",
  albertaRegistry: "https://www.alberta.ca/indigenous-funding-resources",
  albertaAbif: "https://www.alberta.ca/aboriginal-business-investment-fund",
  albertaEpp: "https://www.alberta.ca/employment-partnerships-program",
  albertaIetp: "https://www.alberta.ca/indigenous-employment-training-partnerships-program",
  albertaNred: "https://www.alberta.ca/northern-and-regional-economic-development-program",
  albertaCapg: "https://www.alberta.ca/canada-alberta-productivity-grant",
  albertaSmall: "https://www.alberta.ca/small-community-opportunity-program",
  bcFirstCitizens: "https://www2.gov.bc.ca/gov/content/governments/indigenous-people/first-citizens-fund",
  bcStudents: "https://www2.gov.bc.ca/gov/content/education-training/post-secondary-education/aboriginal-education-training/information-for-aboriginal-students",
  bcCommunityWorkforce: "https://www.workbc.ca/find-loans-and-grants/community/community-workforce-response-grant/whats-new",
  bcIndigenousResources: "https://www2.gov.bc.ca/assets/gov/employment-business-and-economic-development/business-management/small-business/indigenous_sb_resource_handout.pdf",
  bcIndigenousHousing: "https://www.bchousing.org/sites/default/files/media/documents/IHF-RFP-Fact-Sheet.pdf",
  skBusiness: "https://www.saskatchewan.ca/business/first-nations-metis-and-northern-community-businesses/economic-development/indigenous-business-funding-programs",
  bcHousingSearch: "https://housingsearch.bchousing.org/",
  bcIdSupplement: "https://www2.gov.bc.ca/gov/content/governments/policies-for-government/bcea-policy-and-procedure-manual/general-supplements-and-programs/identification-supplement",
  serviceBc: "https://www2.gov.bc.ca/gov/content/governments/organizational-structure/ministries-organizations/ministries/citizens-services/servicebc",
  workBcNewWest: "https://www.workbc.ca/workbc-centres/workbc-centre-new-westminster",
  legalAidCommunity: "https://info.legalaid.bc.ca/find-resource/organization/legal-help",
}

const funding = (id, name, organization, province, applicantTypes, category, sourceUrl, extra = {}) => {
  const intakeStatus = extra.intake_status || "verify_before_applying"
  return ({
  funding_record_id: `fnfund_${id}`,
  program_name: name,
  funding_organization: organization,
  governance_funder_type: extra.governance_funder_type || "government_program",
  who_can_apply: extra.who_can_apply || "See official program eligibility.",
  province_jurisdiction: province,
  geographic_scope: extra.geographic_scope || province,
  purpose: extra.purpose || category.replaceAll("_", " "),
  amount_or_range: extra.amount_or_range ?? null,
  assistance_type: extra.assistance_type || "grant_or_benefit",
  applicant_types: applicantTypes,
  first_nations_scope: extra.first_nations_scope || "first_nations_specific_or_distinctions_based",
  deadline: extra.deadline ?? null,
  recurring_or_one_time: extra.recurring_or_one_time || "unknown_verify_program_page",
  intake_status: intakeStatus,
  application_method: extra.application_method || "Use the official program page or contact the administering organization.",
  official_application_url: sourceUrl,
  required_documentation: extra.required_documentation ?? null,
  source: { title: extra.source_title || name, url: sourceUrl, authority: organization, source_type: "official_program_page" },
  last_verified_at: runDate,
  next_check_due: nextCheck(intakeStatus),
  confidence: extra.confidence || "moderate",
  owner_review_state: extra.owner_review_state || "review_before_publication",
  freshness_note: extra.freshness_note || "Eligibility, deadlines, and intake availability must be checked on the official page before applying.",
})}

const firstNationsFunding = [
  funding("fnha_health_benefits", "First Nations Health Benefits", "First Nations Health Authority", "British Columbia", ["individual"], "health", official.fnhaBenefits, { who_can_apply: "Eligible First Nations people with Indian status living in B.C.; infant eligibility is described by FNHA.", assistance_type: "health_benefit", intake_status: "recurring", recurring_or_one_time: "recurring", confidence: "high", governance_funder_type: "first_nations_health_governance_body" }),
  funding("fnha_medical_transport", "Medical Transportation Benefit", "First Nations Health Authority", "British Columbia", ["individual"], "medical_travel", official.fnhaTransport, { who_can_apply: "Eligible First Nations people with Indian status living in B.C. who need medically necessary services unavailable in their community.", assistance_type: "reimbursement_or_direct_support", intake_status: "recurring", recurring_or_one_time: "recurring", confidence: "high", governance_funder_type: "first_nations_health_governance_body" }),
  funding("fnha_mental_wellness", "Mental Wellness and Counselling Benefit", "First Nations Health Authority", "British Columbia", ["individual"], "mental_health", official.fnhaMental, { who_can_apply: "Status First Nations people who meet the FNHA residency eligibility described on the program page.", assistance_type: "health_benefit", intake_status: "recurring", recurring_or_one_time: "recurring", confidence: "high", governance_funder_type: "first_nations_health_governance_body" }),
  funding("bc_first_citizens", "First Citizens Fund", "Government of British Columbia", "British Columbia", ["individual", "organization", "nation"], "education_culture_economic_development", official.bcFirstCitizens, { who_can_apply: "Programs are delivered through Indigenous partner organizations; eligibility varies by funded initiative.", recurring_or_one_time: "perpetual_fund_programs_vary", intake_status: "verify_before_applying", confidence: "high" }),
  funding("bc_nursing_tuition", "Nursing Tuition Grant – Indigenous", "StudentAid BC", "British Columbia", ["individual"], "education", official.bcStudents, { who_can_apply: "Eligible self-declared Indigenous students in qualifying B.C. public post-secondary nursing programs.", amount_or_range: "Up to CAD 5,000 per program year", assistance_type: "grant", intake_status: "recurring", recurring_or_one_time: "recurring", confidence: "high" }),
  funding("bc_health_bursary", "Health Programs – Indigenous Student Recruitment Bursary", "StudentAid BC", "British Columbia", ["individual"], "education", official.bcStudents, { who_can_apply: "Eligible self-declared Indigenous students in listed priority health programs.", amount_or_range: "CAD 5,000 per program year", assistance_type: "bursary", intake_status: "recurring", recurring_or_one_time: "recurring", confidence: "high" }),
  funding("bc_adult_upgrading", "Adult Upgrading Grant", "StudentAid BC", "British Columbia", ["individual"], "education_training", official.bcStudents, { who_can_apply: "Eligible low-income domestic students taking adult upgrading at participating institutions.", assistance_type: "grant", intake_status: "recurring", recurring_or_one_time: "recurring", first_nations_scope: "broader_program_relevant_to_first_nations" }),
  funding("bc_istdf", "Indigenous Skills Training Development Fund", "Government of British Columbia", "British Columbia", ["nation", "organization"], "employment_training", official.bcIndigenousResources, { who_can_apply: "Indigenous communities and organizations proposing community-driven skills training; current intake must be confirmed.", assistance_type: "contribution", first_nations_scope: "broader_indigenous", owner_review_state: "freshness_review_required" }),
  funding("bc_community_workforce", "Community Workforce Response Grant", "WorkBC / Government of British Columbia", "British Columbia", ["organization", "nation"], "employment_training", official.bcCommunityWorkforce, { who_can_apply: "Eligible communities, sector organizations, employers, and training partners under the current applicant guide.", deadline: "See 2026/27 key dates", assistance_type: "grant", intake_status: "upcoming_or_periodic", recurring_or_one_time: "periodic_intakes", first_nations_scope: "broader_program_relevant_to_first_nations", confidence: "high" }),
  funding("bc_indigenous_housing", "Indigenous Housing Fund", "BC Housing", "British Columbia", ["organization", "nation"], "housing", official.bcIndigenousHousing, { who_can_apply: "Indigenous nonprofit housing providers, First Nations or Indigenous governments, and eligible partners under an active request for proposals.", assistance_type: "capital_or_operating_program", owner_review_state: "current_intake_follow_up_required" }),
  funding("bc_fncebf", "First Nations Clean Energy Business Fund – Equity Funding", "Government of British Columbia", "British Columbia", ["nation", "organization"], "economic_development", "https://communityclimatefunding.gov.bc.ca/funding/08e10ba0-07c1-ec11-983f-000d3a09e39f/", { who_can_apply: "Eligible Indigenous governing bodies and authorized Indigenous organizations for community-benefit clean-energy projects.", amount_or_range: "Up to CAD 500,000", assistance_type: "capital_grant", deadline: "Next intake anticipated in 2027", intake_status: "upcoming", recurring_or_one_time: "periodic_intake", confidence: "high", freshness_note: "The official registry says applications are not currently accepted and the next intake is anticipated in 2027." }),
  funding("federal_psssp", "Post-Secondary Student Support Program", "Indigenous Services Canada", "Federal", ["individual", "nation", "organization"], "education", official.psssp, { who_can_apply: "Registered First Nations post-secondary students apply through their First Nation, designated organization, or ISC regional office; funding is limited.", assistance_type: "education_financial_assistance", deadline: "Set by administering First Nation or organization", intake_status: "recurring", recurring_or_one_time: "annual", confidence: "high" }),
  funding("federal_iset", "Indigenous Skills and Employment Training Program", "Employment and Social Development Canada", "Federal", ["individual", "organization"], "employment_training", official.iset, { who_can_apply: "Indigenous people access services through Indigenous service-delivery agreement holders; organizational agreements fund local delivery.", assistance_type: "training_and_employment_support", intake_status: "recurring", recurring_or_one_time: "ongoing_program", first_nations_scope: "distinctions_based_and_urban", confidence: "high" }),
  funding("federal_pss_general", "Federal Indigenous Funding Programs Directory", "Government of Canada", "Federal", ["individual", "business", "organization", "nation"], "funding_navigation", official.federalFunding, { who_can_apply: "Varies by program.", assistance_type: "navigation", intake_status: "recurring", recurring_or_one_time: "directory", first_nations_scope: "broader_indigenous", confidence: "high" }),
  funding("federal_benefits_finder", "Benefits Finder – Indigenous Peoples filter", "Government of Canada", "Federal", ["individual", "family"], "benefit_navigation", official.federalBenefits, { who_can_apply: "Eligibility varies by benefit; the tool helps identify federal programs.", assistance_type: "navigation", intake_status: "recurring", recurring_or_one_time: "directory", first_nations_scope: "broader_indigenous", confidence: "high" }),
  funding("federal_new_fiscal", "New Fiscal Relationship Grant", "Indigenous Services Canada", "Federal", ["nation", "organization"], "community_capacity", "https://www.canada.ca/en/indigenous-services-canada/news/2024/10/first-nations-access-greater-flexibility-and-increased-self-determination-through-the-new-fiscal-relationship-grant.html", { who_can_apply: "Eligible First Nations, Tribal Councils, and eligible First Nations-led service-delivery entities under program requirements.", assistance_type: "grant", recurring_or_one_time: "renewable_up_to_10_years", intake_status: "verify_before_applying", confidence: "high" }),
  funding("federal_jordans_principle", "Jordan’s Principle", "Indigenous Services Canada", "Federal", ["individual", "family"], "child_and_family_support", "https://www.sac-isc.gc.ca/eng/1568396042341/1568396159824", { who_can_apply: "First Nations children and families seeking products, services, or supports under current eligibility rules.", assistance_type: "benefit_or_service_funding", intake_status: "recurring", recurring_or_one_time: "ongoing_program" }),
  funding("federal_on_reserve_income", "On-reserve Income Assistance Program", "Indigenous Services Canada", "Federal", ["individual", "family", "nation"], "income", "https://www.sac-isc.gc.ca/eng/1100100035256/1533307528663", { who_can_apply: "Eligible individuals ordinarily resident on reserve; program delivery and eligibility vary by province and administering First Nation.", assistance_type: "income_benefit", intake_status: "recurring", recurring_or_one_time: "ongoing_program" }),
  funding("federal_aep", "Aboriginal Entrepreneurship Program – Access to Capital", "Indigenous Services Canada", "Federal", ["business", "individual", "organization"], "business", "https://www.sac-isc.gc.ca/eng/1375201178602/1610797286236", { who_can_apply: "Eligible Indigenous entrepreneurs, Indigenous-owned businesses, organizations, and associations through participating Indigenous Financial Institutions and Métis Capital Corporations.", amount_or_range: "Up to CAD 99,999 for an individual entrepreneur or CAD 250,000 for an eligible community business", assistance_type: "business_financing_and_non_repayable_equity_contribution", intake_status: "recurring", recurring_or_one_time: "ongoing_program", first_nations_scope: "broader_indigenous", confidence: "high" }),
  funding("federal_aep_business_opportunities", "Aboriginal Entrepreneurship Program – Access to Business Opportunities", "Indigenous Services Canada", "Federal", ["organization"], "business", "https://www.sac-isc.gc.ca/eng/1582037564226/1610797399865", { who_can_apply: "Eligible Indigenous organizations proposing regional or national entrepreneurship-support initiatives; not individual business startups.", assistance_type: "non_repayable_contribution", deadline: "October 31, 2026; project pitch requested by October 17, 2026", intake_status: "open", recurring_or_one_time: "2026_call_for_proposals", first_nations_scope: "broader_indigenous", confidence: "high" }),
  funding("federal_spf", "Skills and Partnership Fund", "Employment and Social Development Canada", "Federal", ["organization", "nation"], "employment_training", "https://www.canada.ca/en/employment-social-development/programs/skills-partnership-fund.html", { who_can_apply: "Eligible Indigenous organizations and partners under active calls for proposals.", assistance_type: "contribution", intake_status: "intake_date_unknown", first_nations_scope: "broader_indigenous" }),
  funding("ab_abif", "Aboriginal Business Investment Fund", "Government of Alberta", "Alberta", ["business", "nation"], "business", official.albertaAbif, { who_can_apply: "Indigenous community-owned businesses in Alberta with shovel-ready capital projects.", amount_or_range: "CAD 150,000–750,000", assistance_type: "grant", deadline: "October 15, 2026", intake_status: "open", recurring_or_one_time: "annual_intake", confidence: "high" }),
  funding("ab_fndf", "First Nations Development Fund", "Government of Alberta", "Alberta", ["nation"], "community_development", official.albertaRegistry, { who_can_apply: "Recognized First Nations with reserve land in Alberta that have signed a grant agreement.", assistance_type: "grant", intake_status: "recurring", recurring_or_one_time: "ongoing_program", confidence: "high" }),
  funding("ab_iri", "Indigenous Reconciliation Initiative – Economic Stream", "Government of Alberta", "Alberta", ["individual", "organization", "nation"], "economic_development", official.albertaRegistry, { who_can_apply: "Eligible Indigenous people, communities, organizations, and governing bodies.", assistance_type: "grant" }),
  funding("ab_epp", "Employment Partnerships Program", "Government of Alberta", "Alberta", ["organization", "nation"], "employment_training", official.albertaEpp, { who_can_apply: "Eligible Indigenous communities and organizations connecting Indigenous people to employment.", deadline: "September 1, 2026", intake_status: "closed", recurring_or_one_time: "annual_intake", confidence: "high", freshness_note: "The 2026 intake deadline has passed. Keep as closed historical context until a new official intake is posted." }),
  funding("ab_ietp", "Indigenous Employment Training Partnerships", "Government of Alberta", "Alberta", ["organization", "nation"], "employment_training", official.albertaIetp, { who_can_apply: "Eligible Indigenous organizations and partners proposing training-to-employment projects.", assistance_type: "grant_or_contribution", intake_status: "open_or_ongoing_proposals", confidence: "high" }),
  funding("ab_iamw", "Indigenous Addiction and Mental Wellness", "Government of Alberta", "Alberta", ["organization"], "mental_health_addictions", official.albertaRegistry, { who_can_apply: "Indigenous-led organizations addressing community mental-health and wellness needs and service gaps.", assistance_type: "grant" }),
  funding("ab_primary_health", "Indigenous Primary Health Care Innovation Fund", "Government of Alberta", "Alberta", ["organization", "nation"], "health", official.albertaRegistry, { who_can_apply: "Eligible Indigenous communities, Indigenous nonprofits, and Inuit organizations registered in Alberta.", assistance_type: "grant" }),
  funding("ab_patient_navigator", "Indigenous Patient Navigator Grant", "Government of Alberta", "Alberta", ["organization"], "patient_navigation", official.albertaRegistry, { who_can_apply: "Indigenous organizations or health-service providers working with Indigenous populations.", assistance_type: "grant" }),
  funding("ab_housing_capital", "Indigenous Housing Capital Program", "Government of Alberta", "Alberta", ["organization", "nation"], "housing", official.albertaRegistry, { who_can_apply: "Indigenous governments or organizations and eligible partners with formal Indigenous partnerships.", assistance_type: "capital_grant" }),
  funding("ab_nred", "Northern and Regional Economic Development Program", "Government of Alberta", "Alberta", ["organization", "nation"], "economic_development", official.albertaNred, { who_can_apply: "Eligible Indigenous communities, nonprofits, and municipalities.", assistance_type: "grant" }),
  funding("ab_small_community", "Small Community Opportunity Program", "Government of Alberta", "Alberta", ["organization", "nation"], "economic_development", official.albertaSmall, { who_can_apply: "Eligible Indigenous communities, small communities, and nonprofits.", assistance_type: "grant" }),
  funding("ab_productivity", "Canada-Alberta Productivity Grant", "Government of Alberta", "Alberta", ["business", "organization", "nation"], "employment_training", official.albertaCapg, { who_can_apply: "Eligible Alberta employers, including First Nations and Métis Settlements, funding approved training for employees.", amount_or_range: "Up to CAD 5,000 per employed trainee or CAD 10,000 per unemployed trainee; employer maximum CAD 100,000/year", assistance_type: "training_grant", intake_status: "recurring", recurring_or_one_time: "ongoing_program", confidence: "high" }),
  funding("ab_indigenous_careers", "Indigenous Careers Award", "Government of Alberta", "Alberta", ["individual"], "education", official.albertaRegistry, { who_can_apply: "Eligible Indigenous students enrolled full-time at an Alberta post-secondary school or First Nations College.", assistance_type: "award" }),
  funding("ab_fmmi_bursary", "First Nations, Métis and Inuit Bursary", "Government of Alberta", "Alberta", ["individual"], "education", official.albertaRegistry, { who_can_apply: "Eligible Indigenous students enrolled full-time in qualifying post-secondary programs and willing to meet the northern service commitment.", assistance_type: "bursary" }),
  funding("ab_rural_transit", "Rural Transit Solutions Fund", "Government of Canada / listed by Alberta", "Alberta", ["organization", "nation"], "transportation", official.albertaRegistry, { who_can_apply: "Eligible Indigenous, rural, remote, and northern communities and organizations.", assistance_type: "planning_or_capital_funding" }),
  funding("sk_sief", "Saskatchewan Indian Equity Foundation financing", "Saskatchewan Indian Equity Foundation", "Saskatchewan", ["business", "individual", "nation"], "business", official.skBusiness, { who_can_apply: "Eligible First Nations entrepreneurs and businesses under SIEF lending and contribution criteria.", assistance_type: "loan_or_business_financing", governance_funder_type: "first_nations_owned_financial_institution" }),
  funding("sk_iset", "Indigenous Skills and Employment Training services – Saskatchewan", "Indigenous ISET agreement holders / ESDC", "Saskatchewan", ["individual", "organization", "nation"], "employment_training", official.iset, { who_can_apply: "Indigenous people access services through local Indigenous agreement holders; organizational funding follows federal agreements.", assistance_type: "training_and_employment_support", intake_status: "recurring", recurring_or_one_time: "ongoing_program", governance_funder_type: "indigenous_service_delivery_with_federal_funding" }),
  funding("sk_pbcn_iset", "Peter Ballantyne Cree Nation ISET services", "Peter Ballantyne Cree Nation", "Saskatchewan", ["individual"], "employment_training", "https://www.canada.ca/en/employment-social-development/news/2026/08/government-of-canada-announces-peter-ballantyne-cree-nation-as-an-indigenous-skills-and-employment-training-program-agreement-holder.html", { who_can_apply: "PBCN citizens and communities under locally designed program criteria.", amount_or_range: "CAD 6.8 million agreement funding (not an individual award amount)", assistance_type: "training_and_employment_services", intake_status: "verify_before_applying", recurring_or_one_time: "agreement_effective_2026", governance_funder_type: "first_nation_delivered_federally_funded", confidence: "high" }),
  funding("sk_business_directory", "Indigenous Business Funding Programs", "Government of Saskatchewan", "Saskatchewan", ["business", "individual", "nation"], "business", official.skBusiness, { who_can_apply: "Varies by listed Indigenous business-financing program.", assistance_type: "funding_navigation", intake_status: "recurring", recurring_or_one_time: "directory", confidence: "high" }),
  funding("sk_siifc", "Saskatchewan Indigenous Investment Finance Corporation loan guarantees", "Saskatchewan Indigenous Investment Finance Corporation", "Saskatchewan", ["nation", "organization"], "economic_development", "https://www.siifc.ca/", { who_can_apply: "Eligible First Nations, Métis communities, and Indigenous organizations investing in qualifying Saskatchewan projects.", assistance_type: "loan_guarantee", intake_status: "verify_before_applying", governance_funder_type: "provincial_crown_corporation", owner_review_state: "current_application_criteria_review" }),
]

const text = (row) => [row.name, row.organization, row.serviceType, row.category, row.population, row.eligibility, row.description, row.accessType, row.notes].join(" ").toLowerCase()
const practicalCategory = (row) => {
  const value = text(row)
  if (/shelter|housing|rent|homeless/.test(value)) return "housing"
  if (/\bworkbc\b|employment|job|vocational|work clothing/.test(value)) return "employment"
  if (/training|education|certificate|skills/.test(value)) return "training_education"
  if (/identification|\bid help\b|birth certificate/.test(value)) return "identification"
  if (/income|benefit|tax clinic|disability assistance/.test(value)) return "income_benefits"
  if (/transport|driver program|transit/.test(value)) return "transportation"
  if (/legal|advocacy|advocate|complaint|tenancy/.test(value)) return "legal_advocacy"
  if (/food|clothing|hygiene|phone/.test(value)) return "basic_needs"
  if (/outreach|case management|navigation|family support|community support/.test(value)) return "navigation_outreach"
  return null
}
const lowerMainland = /burnaby|new westminster|coquitlam|port coquitlam|port moody|maple ridge|pitt meadows|surrey|lower mainland|fraser region/i
const normalized = normalizedResourceRows(rawResources)
const isHttp = (value) => /^https?:\/\//i.test(String(value || ""))
const practicalQuotas = { housing: 14, employment: 10, training_education: 8, transportation: 8, legal_advocacy: 7, basic_needs: 7, navigation_outreach: 6 }
const practicalPool = normalized
  .map((resource) => ({ resource, support_category: practicalCategory(resource) }))
  .filter((item) => item.support_category)
  .sort((a, b) => Number(lowerMainland.test(b.resource.city)) - Number(lowerMainland.test(a.resource.city)) || Number(Boolean(b.resource.website)) - Number(Boolean(a.resource.website)) || a.resource.name.localeCompare(b.resource.name))
const selected = Object.entries(practicalQuotas)
  .flatMap(([category, quota]) => practicalPool.filter((item) => item.support_category === category).slice(0, quota))
  .map(({ resource, support_category }, index) => ({
    support_record_id: `mps_${String(index + 1).padStart(3, "0")}`,
    miller_resource_id: stableCuratedResourceId(resource),
    match_state: "exact_existing_resource",
    resource_program_name: resource.name,
    organization: resource.organization,
    support_category,
    city_region: resource.city || resource.region,
    delivery_mode: resource.virtual_service ? "virtual" : resource.mobile_service ? "mobile" : "physical_or_unspecified",
    eligibility: resource.eligibility || null,
    referral_requirements: resource.accessType || null,
    cost: resource.fundingType || null,
    hours: resource.hours || null,
    phone: resource.phone || null,
    website: resource.website || null,
    description: resource.description || null,
    source: isHttp(resource.website) ? { type: "existing_miller_public_source", url: resource.website } : { type: "existing_miller_curated_record", url: null },
    last_verified_at: resource.location_last_verified || null,
    next_check_due: isHttp(resource.website) ? "2026-12-05" : "2026-10-06",
    freshness_state: isHttp(resource.website) ? "verify_current_access_information" : "source_follow_up_required",
    confidence: isHttp(resource.website) ? "moderate" : "low",
    owner_review_state: "review_before_practical_support_publication",
  }))

const newPracticalCandidates = [
  { id: "bc_housing_search", name: "BC Housing Search", organization: "BC Housing", category: "housing", geography: "British Columbia", url: official.bcHousingSearch, purpose: "Search subsidized, supportive, and market-rent housing listings; listings are not vacancy confirmations." },
  { id: "bc_id_supplement", name: "Identification Supplement", organization: "Government of British Columbia", category: "identification", geography: "British Columbia", url: official.bcIdSupplement, purpose: "Helps eligible assistance recipients cover direct costs of obtaining identification." },
  { id: "service_bc", name: "Service BC", organization: "Government of British Columbia", category: "identification", geography: "British Columbia", url: official.serviceBc, purpose: "In-person and phone navigation for provincial services, identity documents, income assistance, and related applications." },
  { id: "workbc_new_west", name: "WorkBC Centre – New Westminster", organization: "WorkBC", category: "employment", geography: "New Westminster", url: official.workBcNewWest, purpose: "Employment services and application access for local job seekers." },
  { id: "legal_aid_community", name: "Legal Aid BC Community Resources", organization: "Legal Aid BC", category: "legal_advocacy", geography: "British Columbia", url: official.legalAidCommunity, purpose: "Directory of public legal and advocacy supports, including tenancy and income-assistance help." },
  { id: "federal_benefits", name: "Federal Benefits Finder", organization: "Government of Canada", category: "income_benefits", geography: "British Columbia / Canada", url: official.federalBenefits, purpose: "Navigation tool for federal income, disability, housing, education, and family benefits." },
].map((item) => ({ ...item, support_record_id: `mps_candidate_${item.id}`, match_state: "new_candidate_requires_reconciliation", source: { type: "official_primary", url: item.url }, last_verified_at: runDate, next_check_due: "2026-12-05", freshness_state: "current_page_verified", confidence: "high", owner_review_state: "normal_miller_resource_review" }))

const practicalSupports = [...selected, ...newPracticalCandidates]
const millerFunding = [
  { id: "bc_id_supplement", name: "Identification Supplement", category: "identification", applicant: "Eligible recipients of B.C. income, disability, or hardship assistance", status: "recurring", url: official.bcIdSupplement },
  { id: "canada_benefits_finder", name: "Benefits Finder", category: "income_benefits", applicant: "People seeking federal benefit navigation", status: "recurring", url: official.federalBenefits },
  { id: "workbc_training", name: "WorkBC employment and training supports", category: "employment_training", applicant: "Eligible B.C. job seekers; supports vary by stream", status: "recurring", url: official.workBcNewWest },
  { id: "community_workforce", name: "Community Workforce Response Grant participant supports", category: "training", applicant: "Participants in approved projects; applicants are eligible organizations", status: "periodic_intakes", url: official.bcCommunityWorkforce },
  { id: "fnha_transport", name: "FNHA Medical Transportation Benefit", category: "transportation", applicant: "Eligible First Nations clients in B.C.", status: "recurring", url: official.fnhaTransport },
  { id: "psssp", name: "Post-Secondary Student Support Program", category: "education", applicant: "Eligible registered First Nations post-secondary students", status: "annual_local_deadlines", url: official.psssp },
  { id: "iset", name: "Indigenous Skills and Employment Training services", category: "employment_training", applicant: "Indigenous people through local service-delivery organizations", status: "recurring", url: official.iset },
].map((item) => ({ funding_assistance_id: `mfa_${item.id}`, ...item, last_verified_at: runDate, verify_before_applying: true, source_type: "official_primary" }))

const extension = {
  schema_version: "farm-source-registry-extension-v1",
  private: true,
  run_date: runDate,
  source_families: [
    ["fogs_workbc", "WorkBC", "British Columbia", "employment_training"],
    ["fogs_bc_housing", "BC Housing", "British Columbia", "housing"],
    ["fogs_bc_social_development", "B.C. Ministry of Social Development and Poverty Reduction", "British Columbia", "income_identification"],
    ["fogs_service_bc", "Service BC", "British Columbia", "government_service_navigation"],
    ["fogs_legal_aid_bc", "Legal Aid BC", "British Columbia", "legal_advocacy"],
    ["fogs_canada_benefits", "Government of Canada Benefits Finder", "Federal", "benefit_navigation"],
    ["fogs_fnha_benefits", "First Nations Health Authority Health Benefits", "British Columbia", "first_nations_health_benefits"],
    ["fogs_isc_programs", "Indigenous Services Canada Programs", "Federal", "first_nations_program_funding"],
    ["fogs_alberta_indigenous_funding", "Government of Alberta Indigenous Funding Resources", "Alberta", "indigenous_program_funding"],
    ["fogs_sask_indigenous_business", "Government of Saskatchewan Indigenous Business Funding", "Saskatchewan", "indigenous_business_financing"],
  ].map(([source_family_id, authority, jurisdiction, expected_document_class]) => ({ source_family_id, authority, jurisdiction, expected_document_class, usefulness_to_miller: "high", discovery_method: "official program index and bounded site search" })),
}

const fundingCounts = firstNationsFunding.reduce((acc, item) => { acc[item.province_jurisdiction] = (acc[item.province_jurisdiction] || 0) + 1; return acc }, {})
const practicalCounts = practicalSupports.reduce((acc, item) => { acc[item.support_category || item.category] = (acc[item.support_category || item.category] || 0) + 1; return acc }, {})
const lowerMainlandCount = practicalSupports.filter((item) => lowerMainland.test(item.city_region || item.geography || "")).length

const writeJson = (name, value) => fs.writeFileSync(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`)
const writeMd = (name, value) => fs.writeFileSync(path.join(output, name), `${value.trim()}\n`)

writeJson(`miller-first-nations-funding-assistance-${runDate}.json`, { schema_version: "miller-first-nations-funding-v1", private: true, publication_state: "owner_review_required", generated_at: `${runDate}T12:00:00Z`, records: firstNationsFunding })
writeJson(`miller-practical-supports-${runDate}.json`, { schema_version: "miller-practical-supports-v1", private: true, publication_state: "candidate_only", generated_at: `${runDate}T12:00:00Z`, records: practicalSupports })
writeJson(`miller-funding-assistance-${runDate}.json`, { schema_version: "miller-funding-assistance-v1", private: true, publication_state: "candidate_only", generated_at: `${runDate}T12:00:00Z`, records: millerFunding })
writeJson(`miller-practical-source-registry-extension-${runDate}.json`, extension)

writeMd(`miller-first-nations-funding-assistance-benchmark-${runDate}.md`, `# First Nations Funding & Assistance benchmark\n\nPrivate, review-gated benchmark. ${firstNationsFunding.length} current, recurring, periodic, or explicitly verify-before-applying program records were structured from official sources. Coverage: ${Object.entries(fundingCounts).map(([key, value]) => `${key} ${value}`).join("; ")}.\n\n## Strongest practical opportunities\n\n- FNHA Health Benefits and Medical Transportation provide durable, directly navigable individual supports in B.C.\n- ISC Post-Secondary Student Support and ISET are recurring federal program frameworks delivered through First Nations or Indigenous service-delivery organizations.\n- Alberta's official Indigenous funding registry is the strongest single provincial program index, with health, housing, training, business, and community streams.\n- Saskatchewan Indian Equity Foundation and Saskatchewan's official business-funding directory provide a strong business-financing seam; practical individual assistance is less centrally indexed.\n\n## Safeguard\n\nFunding source is not governance authority. Records default to verify-before-applying unless an authoritative page establishes an open, recurring, or scheduled intake.`)

writeMd(`miller-first-nations-funding-freshness-review-${runDate}.md`, `# First Nations funding freshness review\n\n- Last verified for this benchmark: ${runDate}.\n- Durable benefits/directories: monthly automated link check plus quarterly content review.\n- Periodic grants and bursaries: verify monthly while intake is open or upcoming; otherwise every 90 days.\n- One-time announcements: retain only as closed historical context, never as current opportunity.\n- Every public card should show intake state and last verified date.\n- An unchanged webpage does not prove funds remain available; use **verify before applying** when the current intake cannot be established.`)

writeMd(`miller-practical-supports-benchmark-${runDate}.md`, `# Miller Practical Supports benchmark\n\n${practicalSupports.length} private candidate records were assembled: ${selected.length} exact existing Miller resource matches and ${newPracticalCandidates.length} new or program-level candidates requiring reconciliation. Categories: ${Object.entries(practicalCounts).map(([key, value]) => `${key} ${value}`).join("; ")}.\n\nThe benchmark deliberately treats existing directory presence as identity evidence, not proof that hours, eligibility, or intake remain current. ${lowerMainlandCount} records have Lower Mainland or Fraser-region relevance.`)

writeMd(`miller-fraser-north-lower-mainland-practical-supports-${runDate}.md`, `# Fraser North / Lower Mainland practical supports\n\nThe strongest existing Miller matches include the Burnaby Housing & Outreach Hub, Douglas Shelter, Ledger Place, Norland Place, BC Housing's Supportive Housing Registration Service, Fraser Health outreach/navigation records, employment-clothing supports, and transport-to-care programs.\n\n## Immediate owner value\n\n1. Reconcile the official WorkBC centre set for Burnaby, New Westminster, Tri-Cities, and Maple Ridge/Pitt Meadows.\n2. Verify direct ID-clinic capacity rather than treating Service BC or the provincial ID supplement as hands-on document replacement.\n3. Add income/benefit advocacy and rent-bank operators with current intake pages.\n4. Preserve the distinction between a searchable housing registry and an actual vacancy.`)

writeMd(`miller-existing-resource-match-report-${runDate}.md`, `# Existing Miller resource match report\n\n- Exact existing Miller resource matches: ${selected.length}\n- New or program-level candidates requiring reconciliation: ${newPracticalCandidates.length}\n- Automatic production mutations: 0\n- Duplicate resources created: 0\n\nMatching used stable curated Miller IDs. No fuzzy match was promoted to an exact match.`)

writeMd(`miller-new-support-candidate-review-${runDate}.md`, `# New Miller support candidate review\n\n${newPracticalCandidates.map((item) => `- **${item.name}** — ${item.geography}; ${item.category}; high-authority source; normal Miller reconciliation/review required.`).join("\n")}\n\nThese are private candidates. Program-level navigation tools should not be mistaken for a local operating service.`)

writeMd(`miller-funding-assistance-report-${runDate}.md`, `# Miller Funding & Assistance\n\nThe initial ${millerFunding.length}-record seam covers ID costs, benefits navigation, training, medical transport, and education supports. The most reusable interface fields are applicant type, need, intake state, application path, official page, and last verified date.\n\nCommon eligibility is program-specific. Miller should navigate users to the official decision-maker and should not determine entitlement.`)

writeMd(`miller-legal-government-addictions-update-${runDate}.md`, `# Miller Legal & Government addictions research update\n\nThe existing Miller accountability corpus remains the right research layer for OAT, toxic-drug response, decriminalization, prescribed alternatives, treatment capacity, coroner recommendations, professional standards, and supportive-recovery regulation. This pass adds practical projections above that evidence rather than duplicating the policy tables.\n\nThe strongest generalization from Miller North is an evidence-bearing chain: recommendation → commitment → funding → recipient → service → operational evidence. Legal material remains contextual and is not legal advice.`)

writeMd(`miller-public-money-to-service-update-${runDate}.md`, `# Miller public money-to-service update\n\nThe public-money branch can now distinguish assistance paid to an individual, funding delivered to an Indigenous service organization, and program funding received by an operator. These must remain separate attribution levels.\n\nNo new service-level funding attribution was asserted in this pass. Funding opportunities are linked to their administering program, not allocated down to a specific Miller service without authoritative evidence.`)

writeMd(`miller-legal-human-rights-source-enrichment-${runDate}.md`, `# Legal and human-rights source enrichment\n\nHigh-value source families for the next bounded addictions pass are the BC Human Rights Tribunal, Legal Aid BC, provincial legislation, professional-regulator decisions, the B.C. Coroners Service, and the Auditor General.\n\nDirect decisions should preserve complaint ≠ mediation ≠ finding ≠ judgment ≠ settlement. No new legal conclusion or individualized advice was created in this practical-support benchmark.`)

writeMd(`miller-practical-supports-user-facing-spec-${runDate}.md`, `# Miller practical-support and funding prototype specification\n\n## Proposed navigation\n\n- Find Treatment\n- Practical Supports\n- Funding & Assistance\n- Research & Policy\n\n## Practical Supports\n\nMobile-first cards with need, location, access, eligibility, phone, official link, and last verified date. Filters: housing, employment, training, ID, income, transportation, advocacy, and basic needs.\n\n## Funding & Assistance\n\nFilters: province, applicant type, need, First Nations-specific/broader Indigenous, open/current intake, and grant/loan/benefit. Cards must always expose freshness.\n\n## Lightweight pathways\n\nShow related steps such as treatment → housing → ID → income → employment. These are navigation suggestions, not case plans.\n\n## Email results\n\nEmail selected result IDs through a server allowlist. Preview and explicit confirmation are mandatory. The email includes resource facts only and excludes raw search text.`)

writeMd(`miller-practical-supports-owner-summary-${runDate}.md`, `# Owner summary\n\n## What changed\n\n- Structured ${firstNationsFunding.length} First Nations funding/assistance candidates across B.C., Alberta, Saskatchewan, and federal programs.\n- Structured ${practicalSupports.length} practical-support candidates, including ${selected.length} exact existing Miller matches.\n- Added a secure Email My Results workflow that stays disabled until a server-side provider is configured.\n\n## Why it matters\n\nMiller can reuse its existing directory and Farm evidence machinery to help with housing, work, training, ID, income, transport, and assistance without merging Miller North data or lowering resource gates.\n\n## Strongest evidence\n\nFNHA benefit pages, ISC program pages, Alberta's Indigenous funding registry, WorkBC, BC Housing, Service BC, and Legal Aid BC offer durable public navigation anchors.\n\n## Uncertainty / caution\n\nFunding freshness changes quickly; existing Miller records also need access-detail reverification before a broad practical-support launch. Program funding is not governance authority or proof of a service-level allocation.\n\n## Recommended next move\n\nOwner-review and reverify the Fraser North practical-support shortlist, then configure one transactional email sender for a small live clinician pilot.\n\n## Key metrics\n\n- First Nations funding candidates: ${firstNationsFunding.length}\n- Practical-support candidates: ${practicalSupports.length}\n- Exact existing Miller matches: ${selected.length}\n- New/program-level candidates: ${newPracticalCandidates.length}\n- Production resource mutations: 0\n- Database migrations: 0`)

writeMd(`miller-practical-supports-research-brief-${runDate}.md`, `# Miller: Practical Supports, Funding & Assistance, and Evidence-Grounded System Context\n\n## Executive summary\n\nThis private pilot applies Farm capabilities developed through Miller North to Miller's addictions-resource mission. It demonstrates a cautious way to add practical supports and funding navigation while retaining official sources, freshness states, governance distinctions, review gates, and policy/public-money context.\n\n## Scope and findings\n\nThe pilot covers ${firstNationsFunding.length} First Nations funding opportunities/frameworks and ${practicalSupports.length} practical-support candidates. Existing Miller identity matching worked well; freshness and local access verification remain the main owner-review burden.\n\n## Method\n\nOfficial program pages were preferred. Existing Miller records were matched using stable curated IDs. A page or announcement was not treated as an open intake unless the source supported that state.\n\n## Email delivery\n\nA server-only, structured-result email seam was added. It rejects arbitrary content, limits sends and selections, omits raw search text, and remains disabled without complete server credentials.\n\n## Limitations\n\nThis is a candidate benchmark, not a publication decision. No benefit entitlement, funding award, current vacancy, or service effectiveness is inferred.\n\n## Recommended next step\n\nReverify the highest-value Fraser North records and run an owner-reviewed live pilot of practical-support search plus email delivery.`)

console.log(JSON.stringify({ first_nations_funding: firstNationsFunding.length, practical_supports: practicalSupports.length, exact_miller_matches: selected.length, new_candidates: newPracticalCandidates.length, lower_mainland: lowerMainlandCount, source_families: extension.source_families.length }, null, 2))
