import { createHash } from "node:crypto"

export const SMALL_BUSINESS_FIT_CLASSES = Object.freeze([
  "SOLO_FRIENDLY",
  "MICRO_BUSINESS_FRIENDLY",
  "SMALL_TEAM_FRIENDLY",
  "EQUIPMENT_HEAVY",
  "CREDENTIAL_HEAVY",
  "CAPITAL_HEAVY",
  "TOO_LARGE_OR_COMPLEX",
  "INSUFFICIENT_INFORMATION",
])
export const SAMWISE_LEVERAGE_CLASSES = Object.freeze(["SAMWISE_LEVERAGE_HIGH", "SAMWISE_LEVERAGE_MODERATE", "SAMWISE_LEVERAGE_LOW"])
export const PROCUREMENT_ACTIONS = Object.freeze(["PURSUE", "WATCH", "SKIP", "INSUFFICIENT_INFORMATION"])
export const PROCUREMENT_OPPORTUNITY_STATES = Object.freeze(["OPEN_NOW", "UPCOMING_PLANNED", "RECURRING_CATEGORY", "POSSIBLE_RETENDER_WATCH", "SUPPLIER_LIST_STANDING_OFFER", "HISTORICAL_SIGNAL_ONLY"])
export const REQUIREMENT_LEVELS = Object.freeze(["NONE", "LOW", "MODERATE", "HIGH", "UNKNOWN"])
export const REQUIREMENT_STATUSES = Object.freeze(["SATISFIED", "UNVERIFIED", "NOT_SATISFIED", "UNKNOWN"])
export const COMPETITION_VISIBILITY = Object.freeze(["LOW_VISIBILITY", "MODERATE_VISIBILITY", "HIGH_VISIBILITY"])
export const AUTOMATION_CLASSES = Object.freeze(["FULLY_AUTOMATABLE", "MOSTLY_AUTOMATABLE", "HUMAN_REVIEW_REQUIRED", "MANUAL"])

const clean = (value, limit = 2_000) => String(value ?? "").normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
const sha256 = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")
const safeIso = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
const finite = value => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null
const enumValue = (value, allowed, fallback) => allowed.includes(value) ? value : fallback

const dimensionNames = Object.freeze([
  "capital_requirement",
  "special_equipment_requirement",
  "professional_credentials",
  "insurance_bonding_requirement",
  "geographic_delivery_burden",
  "past_performance_requirement",
  "proposal_complexity",
  "security_clearance",
  "inventory_requirement",
])

function normalizeRequirements(input = {}) {
  return Object.freeze(Object.fromEntries(dimensionNames.map(name => [name, enumValue(input[name], REQUIREMENT_LEVELS, "UNKNOWN")])))
}

export function createSmallBusinessOpportunity(input = {}) {
  const buyer = clean(input.buyer, 300)
  const title = clean(input.title, 500)
  const jurisdiction = clean(input.jurisdiction, 120)
  const sourceUrl = clean(input.source_url, 1_000)
  const verifiedAt = safeIso(input.verification_date)
  const state = enumValue(input.opportunity_state, PROCUREMENT_OPPORTUNITY_STATES, null)
  if (!buyer || !title || !jurisdiction || !sourceUrl.startsWith("https://") || !verifiedAt || !state) throw new Error("small_business_procurement_opportunity_invalid")
  const identity = `${jurisdiction}|${buyer}|${clean(input.source_id, 240) || title}|${sourceUrl}`.toLocaleLowerCase("en-CA")
  return Object.freeze({
    schema_version: "small-business-procurement-opportunity-v1",
    opportunity_id: clean(input.source_id, 240) || `sbp-opportunity-${sha256(identity).slice(0, 20)}`,
    buyer,
    title,
    jurisdiction,
    category: clean(input.category, 240) || null,
    description: clean(input.description, 2_000) || null,
    posted_date: safeIso(input.posted_date),
    close_date: safeIso(input.close_date),
    value: finite(input.value),
    contract_duration: clean(input.contract_duration, 240) || null,
    staffing_capacity: enumValue(input.staffing_capacity, ["SOLO", "MICRO_2_TO_5", "SMALL_6_TO_20", "OVER_20", "UNKNOWN"], "UNKNOWN"),
    estimated_contract_scale: enumValue(input.estimated_contract_scale, ["MICRO_UNDER_25K", "SMALL_25K_TO_100K", "MEDIUM_100K_TO_500K", "LARGE_OVER_500K", "UNKNOWN"], "UNKNOWN"),
    requirements: normalizeRequirements(input.requirements),
    mandatory_requirements: Object.freeze((input.mandatory_requirements || []).map(value => clean(value, 500)).filter(Boolean)),
    mandatory_requirements_status: enumValue(input.mandatory_requirements_status, REQUIREMENT_STATUSES, "UNKNOWN"),
    location_requirements: clean(input.location_requirements, 500) || null,
    digital_remote_deliverability: enumValue(input.digital_remote_deliverability, ["HIGH", "MODERATE", "LOW", "NONE", "UNKNOWN"], "UNKNOWN"),
    recurrence_potential: enumValue(input.recurrence_potential, ["HIGH", "MODERATE", "LOW", "UNKNOWN"], "UNKNOWN"),
    opportunity_state: state,
    source_url: sourceUrl,
    verification_date: verifiedAt,
    capability_tags: Object.freeze([...new Set((input.capability_tags || []).map(value => clean(value, 120).toLocaleLowerCase("en-CA")).filter(Boolean))]),
    evidence_notes: Object.freeze((input.evidence_notes || []).map(value => clean(value, 1_000)).filter(Boolean)),
    private_only: true,
    publication_authority: false,
  })
}

export function assessSmallBusinessProcurementFit(opportunity = {}) {
  const requirements = normalizeRequirements(opportunity.requirements)
  const high = dimensionNames.filter(name => requirements[name] === "HIGH")
  const unknown = dimensionNames.filter(name => requirements[name] === "UNKNOWN")
  const reasons = []
  let classification
  if (opportunity.staffing_capacity === "OVER_20" || opportunity.estimated_contract_scale === "LARGE_OVER_500K" || (requirements.proposal_complexity === "HIGH" && high.length >= 3)) {
    classification = "TOO_LARGE_OR_COMPLEX"
    reasons.push("An explicit scale, staffing, or multi-factor complexity signal exceeds a small-team profile.")
  } else if (requirements.capital_requirement === "HIGH" || requirements.inventory_requirement === "HIGH") {
    classification = "CAPITAL_HEAVY"
    reasons.push("The retained source evidence identifies a high capital or inventory burden.")
  } else if (requirements.special_equipment_requirement === "HIGH") {
    classification = "EQUIPMENT_HEAVY"
    reasons.push("The retained source evidence identifies specialized equipment as a material requirement.")
  } else if ([requirements.professional_credentials, requirements.past_performance_requirement, requirements.security_clearance].includes("HIGH")) {
    classification = "CREDENTIAL_HEAVY"
    reasons.push("The retained source evidence identifies credentials, past performance, or security clearance as a high requirement.")
  } else if (unknown.length >= 4 || opportunity.staffing_capacity === "UNKNOWN" || opportunity.estimated_contract_scale === "UNKNOWN") {
    classification = "INSUFFICIENT_INFORMATION"
    reasons.push(`The source summary leaves ${unknown.length} qualification dimensions plus scale or staffing unresolved.`)
  } else if (opportunity.staffing_capacity === "SOLO" && !high.length && ["MICRO_UNDER_25K", "SMALL_25K_TO_100K"].includes(opportunity.estimated_contract_scale)) {
    classification = "SOLO_FRIENDLY"
    reasons.push("Published scope supports a solo delivery model without a high capital, equipment, credential, or security burden.")
  } else if (["SOLO", "MICRO_2_TO_5"].includes(opportunity.staffing_capacity) && !high.length) {
    classification = "MICRO_BUSINESS_FRIENDLY"
    reasons.push("Published staffing and requirement evidence fits a team of five or fewer.")
  } else if (opportunity.staffing_capacity === "SMALL_6_TO_20" && !high.includes("security_clearance")) {
    classification = "SMALL_TEAM_FRIENDLY"
    reasons.push("Published evidence supports a small team, but not a solo or micro operator.")
  } else {
    classification = "INSUFFICIENT_INFORMATION"
    reasons.push("The available evidence does not support a positive small-business fit classification.")
  }
  return Object.freeze({ policy: "SMALL_BUSINESS_PROCUREMENT_FIT_V1", classification, reasons: Object.freeze(reasons), high_requirements: Object.freeze(high), unknown_requirements: Object.freeze(unknown), inferred_missing_requirements: false })
}

const highLeverageTags = new Set(["data_research", "data_cleanup", "directory_maintenance", "resource_verification", "public_record_monitoring", "structured_dataset", "procurement_monitoring", "report_generation", "information_management", "community_service_research", "healthcare_research"])
const moderateLeverageTags = new Set(["web_content", "training", "facilitation", "business_analysis", "data_management", "software_support", "digital_strategy"])

export function assessSamwiseLeverage(opportunity = {}) {
  const tags = new Set(opportunity.capability_tags || [])
  const highMatches = [...tags].filter(tag => highLeverageTags.has(tag))
  const moderateMatches = [...tags].filter(tag => moderateLeverageTags.has(tag))
  const classification = highMatches.length >= 2 ? "SAMWISE_LEVERAGE_HIGH" : highMatches.length || moderateMatches.length ? "SAMWISE_LEVERAGE_MODERATE" : "SAMWISE_LEVERAGE_LOW"
  return Object.freeze({ classification, matched_capabilities: Object.freeze([...highMatches, ...moderateMatches].sort()), reason: classification === "SAMWISE_LEVERAGE_HIGH" ? "At least two source-supported work elements match current Samwise capabilities." : classification === "SAMWISE_LEVERAGE_MODERATE" ? "One relevant capability or adjacent digital-service element is supported." : "The retained scope does not materially use current Samwise capabilities." })
}

export function classifyProcurementAction({ opportunity, fit, leverage, companyProfile = {}, observedAt = new Date().toISOString() } = {}) {
  if (!opportunity || !fit || !leverage) throw new Error("small_business_procurement_action_input_missing")
  const deadline = opportunity.close_date ? Math.ceil((Date.parse(opportunity.close_date) - Date.parse(observedAt)) / 86_400_000) : null
  const geographySupported = !companyProfile.jurisdictions?.length || companyProfile.jurisdictions.includes(opportunity.jurisdiction) || opportunity.jurisdiction === "Federal Canada"
  const friendly = ["SOLO_FRIENDLY", "MICRO_BUSINESS_FRIENDLY", "SMALL_TEAM_FRIENDLY"].includes(fit.classification)
  if (!geographySupported || opportunity.mandatory_requirements_status === "NOT_SATISFIED" || ["EQUIPMENT_HEAVY", "CAPITAL_HEAVY", "TOO_LARGE_OR_COMPLEX"].includes(fit.classification)) return Object.freeze({ action: "SKIP", reason: !geographySupported ? "Delivery geography is outside the company profile." : opportunity.mandatory_requirements_status === "NOT_SATISFIED" ? "A mandatory requirement is not satisfied." : `The objective fit class is ${fit.classification}.`, deadline_days: deadline })
  if (friendly && opportunity.mandatory_requirements_status === "SATISFIED" && deadline !== null && deadline >= 7 && leverage.classification !== "SAMWISE_LEVERAGE_LOW") return Object.freeze({ action: "PURSUE", reason: "Capability, qualification, geography, and deadline gates are all supported; this is a screening recommendation, not a win forecast.", deadline_days: deadline })
  if (["SUPPLIER_LIST_STANDING_OFFER", "RECURRING_CATEGORY", "POSSIBLE_RETENDER_WATCH"].includes(opportunity.opportunity_state) || leverage.classification !== "SAMWISE_LEVERAGE_LOW") return Object.freeze({ action: "WATCH", reason: opportunity.mandatory_requirements_status !== "SATISFIED" ? "Strategic fit exists, but mandatory requirements are not yet verified." : "The source supports monitoring or future qualification rather than a present pursue decision.", deadline_days: deadline })
  return Object.freeze({ action: "INSUFFICIENT_INFORMATION", reason: "Available public summary evidence is insufficient for pursue, watch, or objective skip.", deadline_days: deadline })
}

export function classifyCompetition(input = {}) {
  const competitors = finite(input.known_competitor_count)
  const awards = finite(input.award_records_observed)
  if (competitors !== null && competitors >= 5 || awards !== null && awards >= 5) return Object.freeze({ classification: "HIGH_VISIBILITY", completeness_claimed: false, reason: "At least five public competitor or award observations are available; the field is still not assumed complete." })
  if (competitors !== null && competitors >= 2 || awards !== null && awards >= 2) return Object.freeze({ classification: "MODERATE_VISIBILITY", completeness_claimed: false, reason: "Multiple public competitor or award observations are available, but the field is incomplete." })
  return Object.freeze({ classification: "LOW_VISIBILITY", completeness_claimed: false, reason: "Fewer than two public competitor or award observations are available." })
}

export function createCompanyCapabilityProfile(input = {}) {
  const name = clean(input.name, 240)
  if (!name) throw new Error("procurement_company_profile_name_missing")
  return Object.freeze({
    profile_id: `sbp-profile-${sha256(name).slice(0, 16)}`,
    name,
    capabilities: Object.freeze([...new Set((input.capabilities || []).map(value => clean(value, 120).toLocaleLowerCase("en-CA")).filter(Boolean))]),
    jurisdictions: Object.freeze([...new Set((input.jurisdictions || []).map(value => clean(value, 120)).filter(Boolean))]),
    staff_capacity: finite(input.staff_capacity),
    credentials: Object.freeze((input.credentials || []).map(value => clean(value, 240)).filter(Boolean)),
    equipment: Object.freeze((input.equipment || []).map(value => clean(value, 240)).filter(Boolean)),
    past_experience: Object.freeze((input.past_experience || []).map(value => clean(value, 240)).filter(Boolean)),
    preferred_contract_scale: clean(input.preferred_contract_scale, 120) || null,
    industries: Object.freeze((input.industries || []).map(value => clean(value, 120)).filter(Boolean)),
    delivery_model: clean(input.delivery_model, 120) || null,
    synthetic: input.synthetic !== false,
    private_only: true,
  })
}

export function buildProcurementPortfolioStrategy({ companyProfile, opportunities = [], buyerHistory = [], observedAt = new Date().toISOString() } = {}) {
  if (!companyProfile?.profile_id) throw new Error("procurement_portfolio_company_profile_invalid")
  const assessed = opportunities.map(opportunity => {
    const fit = assessSmallBusinessProcurementFit(opportunity)
    const leverage = assessSamwiseLeverage(opportunity)
    const disposition = classifyProcurementAction({ opportunity, fit, leverage, companyProfile, observedAt })
    return Object.freeze({ opportunity, fit, leverage, disposition })
  })
  const byAction = action => Object.freeze(assessed.filter(item => item.disposition.action === action))
  const buyers = [...new Set(assessed.filter(item => item.disposition.action !== "SKIP").map(item => item.opportunity.buyer))].sort()
  const categories = [...new Set(assessed.filter(item => item.disposition.action !== "SKIP").map(item => item.opportunity.category).filter(Boolean))].sort()
  return Object.freeze({
    policy: "PROCUREMENT_PORTFOLIO_STRATEGY_V1",
    company_profile: companyProfile,
    target_buyers: Object.freeze(buyers),
    target_categories: Object.freeze(categories),
    open_opportunities: Object.freeze(assessed.filter(item => item.opportunity.opportunity_state === "OPEN_NOW")),
    recurring_opportunities: Object.freeze(assessed.filter(item => item.opportunity.opportunity_state === "RECURRING_CATEGORY")),
    supplier_lists: Object.freeze(assessed.filter(item => item.opportunity.opportunity_state === "SUPPLIER_LIST_STANDING_OFFER")),
    historical_buying_patterns: Object.freeze(buyerHistory),
    retender_watches: Object.freeze(assessed.filter(item => item.opportunity.opportunity_state === "POSSIBLE_RETENDER_WATCH")),
    pursue: byAction("PURSUE"), watch: byAction("WATCH"), skip: byAction("SKIP"), insufficient_information: byAction("INSUFFICIENT_INFORMATION"),
    next_actions: Object.freeze(["Verify mandatory requirements for WATCH records before any bid decision.", "Configure official portal alerts for target buyers and categories.", "Recheck deadlines and amendments; do not rely on this private snapshot as current bid advice."]),
    no_win_probability_claim: true,
    private_only: true,
  })
}

export function procurementAutomationAssessment() {
  return Object.freeze({
    source_monitoring: "FULLY_AUTOMATABLE",
    initial_filtering: "MOSTLY_AUTOMATABLE",
    company_opportunity_matching: "HUMAN_REVIEW_REQUIRED",
    buyer_history: "MOSTLY_AUTOMATABLE",
    award_history: "MOSTLY_AUTOMATABLE",
    timeline_construction: "FULLY_AUTOMATABLE",
    deadline_monitoring: "FULLY_AUTOMATABLE",
    brief_generation: "MOSTLY_AUTOMATABLE",
    qualification_confirmation: "HUMAN_REVIEW_REQUIRED",
    final_pursue_decision: "MANUAL",
  })
}
