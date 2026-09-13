import { createHash } from "node:crypto"

import { assessSmallBusinessProcurementFit, createSmallBusinessOpportunity } from "./smallBusinessProcurementPortfolio.js"

export const TREATY6_PROCUREMENT_POLICY = "TREATY6_PROCUREMENT_PUBLICATION_POLICY_V1"
export const TREATY6_GEOGRAPHIC_RELATIONSHIPS = Object.freeze([
  "IN_TREATY_6_TERRITORY",
  "SERVES_TREATY_6_REGION",
  "OPEN_TO_TREATY_6_SUPPLIERS",
  "INDIGENOUS_SPECIFIC",
  "GENERAL_OPEN_OPPORTUNITY",
  "UNCLEAR",
])
export const TREATY6_OPPORTUNITY_CLASSES = Object.freeze([
  "INDIGENOUS_SET_ASIDE",
  "INDIGENOUS_PARTICIPATION_REQUIRED",
  "INDIGENOUS_PARTICIPATION_ENCOURAGED",
  "INDIGENOUS_BENEFIT_REQUIREMENT",
  "INDIGENOUS_JOINT_VENTURE_RELEVANT",
  "TREATY_6_GEOGRAPHIC_OPPORTUNITY",
  "GENERAL_OPEN_OPPORTUNITY",
  "SUPPLIER_REGISTRATION",
  "STANDING_OFFER",
  "RFI_PLANNING_SIGNAL",
  "UNCLEAR",
])
export const TREATY6_ACTIONABILITY = Object.freeze(["OPEN_BID_READY", "OPEN_REGISTRATION", "PREQUALIFICATION", "RFI_ONLY", "UPCOMING_PLANNING", "MONITOR", "CLOSED", "UNCLEAR"])
export const TREATY6_BUSINESS_CATEGORIES = Object.freeze([
  "CONSTRUCTION", "MAINTENANCE", "TRANSPORTATION", "HEALTHCARE", "MEDICAL_SUPPLIES", "IT_DIGITAL", "DATA_RESEARCH",
  "PROFESSIONAL_SERVICES", "PRINTING_SIGNAGE", "FACILITY_SERVICES", "FOOD_CATERING", "TRAINING", "SECURITY",
  "ENVIRONMENTAL", "ENERGY_UTILITIES", "OFFICE_SUPPLIES", "EMPLOYMENT_COMMUNITY_SERVICES",
])
export const TREATY6_SMALL_BUSINESS_FIT = Object.freeze(["SOLO_FRIENDLY", "MICRO_BUSINESS_FRIENDLY", "SMALL_TEAM_FRIENDLY", "MEDIUM_BUSINESS", "CAPITAL_HEAVY", "CREDENTIAL_HEAVY", "EQUIPMENT_HEAVY", "INSUFFICIENT_INFORMATION"])
export const TREATY6_LICENSING_CLASSES = Object.freeze(["PUBLIC_REUSE_CLEAR", "PUBLIC_LINK_ONLY", "LICENSING_REVIEW_REQUIRED", "DO_NOT_REPUBLISH"])
export const TREATY6_PUBLICATION_RESULTS = Object.freeze(["PUBLICATION_SAFE", "PRIVATE_REVIEW", "BLOCKED", "EXPIRED"])
export const TREATY6_REFRESH_STAGES = Object.freeze(["SOURCE_OBSERVATION", "CANDIDATE_OPPORTUNITY", "VALIDATION", "NORMALIZATION", "DEDUPE", "PUBLICATION_SAFE_PROJECTION"])

const clean = (value, limit = 2_000) => String(value ?? "").normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
const safeIso = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
const sha256 = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")
const unique = values => Object.freeze([...new Set(values.filter(Boolean))])

export function createTreaty6GeographicReference(input = {}) {
  const referenceId = clean(input.reference_id, 160)
  const sourceUrl = clean(input.source_url, 1_000)
  const sourceRole = clean(input.source_role, 120)
  if (!referenceId || !sourceUrl.startsWith("https://") || !["TREATY_TEXT", "AUTHORITATIVE_BOUNDARY_DATA", "TREATY_COMMISSION_MAP", "FIRST_NATIONS_AUTHORITY"].includes(sourceRole)) throw new Error("treaty6_geographic_reference_invalid")
  return Object.freeze({
    reference_id: referenceId,
    title: clean(input.title, 300),
    source_url: sourceUrl,
    source_role: sourceRole,
    provinces: unique((input.provinces || []).map(value => clean(value, 80))),
    geographic_scope: clean(input.geographic_scope, 1_000),
    limitations: clean(input.limitations, 1_000) || null,
    verified_at: safeIso(input.verified_at),
    public_source: true,
  })
}

export function createTreaty6GeographicModel({ references = [] } = {}) {
  if (references.length < 3 || !references.some(item => item.source_role === "TREATY_TEXT") || !references.some(item => item.source_role === "AUTHORITATIVE_BOUNDARY_DATA") || !references.some(item => item.provinces.includes("Saskatchewan"))) throw new Error("treaty6_geographic_model_evidence_incomplete")
  const core = {
    schema_version: "treaty6-geographic-reference-model-v1",
    model_id: "TREATY6_GEOGRAPHIC_REFERENCE_V1",
    provinces: Object.freeze(["Alberta", "Saskatchewan"]),
    classification_method: "source_backed_relationship_assertions_against_authoritative_treaty_text_boundary_data_or_treaty_commission_map",
    geometry_rule: "No bounding rectangle, proximity-only inference, or city-list shortcut is permitted.",
    eligibility_rule: "Treaty 6 geography never implies Indigenous identity, supplier eligibility, set-aside eligibility, or qualification.",
    references: Object.freeze(references),
    private_only: true,
  }
  return Object.freeze({ ...core, model_checksum: sha256(core) })
}

export function classifyTreaty6Geography(input = {}, model) {
  if (model?.model_id !== "TREATY6_GEOGRAPHIC_REFERENCE_V1") throw new Error("treaty6_geographic_model_required")
  const knownReferences = new Set(model.references.map(item => item.reference_id))
  const evidence = (input.evidence || []).map(item => Object.freeze({ relationship: clean(item.relationship, 100), source_ref: clean(item.source_ref, 160), reason: clean(item.reason, 1_000) }))
  for (const item of evidence) {
    if (!TREATY6_GEOGRAPHIC_RELATIONSHIPS.includes(item.relationship) || !knownReferences.has(item.source_ref) || item.reason.length < 12) throw new Error("treaty6_geographic_evidence_invalid")
  }
  const relationships = unique(evidence.map(item => item.relationship))
  const priority = ["INDIGENOUS_SPECIFIC", "OPEN_TO_TREATY_6_SUPPLIERS", "IN_TREATY_6_TERRITORY", "SERVES_TREATY_6_REGION", "GENERAL_OPEN_OPPORTUNITY", "UNCLEAR"]
  return Object.freeze({
    primary: priority.find(value => relationships.includes(value)) || "UNCLEAR",
    relationships: relationships.length ? relationships : Object.freeze(["UNCLEAR"]),
    evidence: Object.freeze(evidence),
    geographic_relevance_established: relationships.some(value => ["IN_TREATY_6_TERRITORY", "SERVES_TREATY_6_REGION", "OPEN_TO_TREATY_6_SUPPLIERS"].includes(value)),
    indigenous_eligibility_inferred: false,
  })
}

export function createTreaty6Buyer(input = {}) {
  const name = clean(input.name, 300)
  const sourceUrl = clean(input.procurement_source_url, 1_000)
  const status = clean(input.registry_status, 80)
  if (!name || !sourceUrl.startsWith("https://") || !["OBSERVED_BUYER", "PORTAL_ROUTED", "MONITOR_TARGET_SOURCE_CONFIRMATION_REQUIRED"].includes(status)) throw new Error("treaty6_buyer_invalid")
  return Object.freeze({
    buyer_id: clean(input.buyer_id, 160) || `t6-buyer-${sha256(`${name}|${sourceUrl}`).slice(0, 18)}`,
    name,
    province: clean(input.province, 80),
    buyer_type: clean(input.buyer_type, 120),
    healthcare_lane: input.healthcare_lane === true,
    registry_status: status,
    procurement_source_url: sourceUrl,
    procurement_authority_claimed: status !== "MONITOR_TARGET_SOURCE_CONFIRMATION_REQUIRED",
    treaty6_service_relation: TREATY6_GEOGRAPHIC_RELATIONSHIPS.includes(input.treaty6_service_relation) ? input.treaty6_service_relation : "UNCLEAR",
    notes: clean(input.notes, 1_000) || null,
    private_only: true,
  })
}

const categoryMatchers = Object.freeze([
  ["HEALTHCARE", /health|clinical|medical|hospital|care\b/i], ["MEDICAL_SUPPLIES", /medical (?:equipment|suppl)|clinical (?:equipment|suppl)|diagnostic/i],
  ["CONSTRUCTION", /construction|building|civil|engineering/i], ["MAINTENANCE", /maintenance|repair/i], ["TRANSPORTATION", /transport|courier|delivery/i],
  ["IT_DIGITAL", /software|digital|information technology|\bit\b/i], ["DATA_RESEARCH", /data|research|monitoring|report/i], ["PRINTING_SIGNAGE", /print|signage/i],
  ["FACILITY_SERVICES", /facility|janitorial|cleaning/i], ["FOOD_CATERING", /food|catering/i], ["TRAINING", /training|facilitation/i],
  ["SECURITY", /security/i], ["ENVIRONMENTAL", /environment|remediation/i], ["ENERGY_UTILITIES", /energy|power|utility/i],
  ["OFFICE_SUPPLIES", /office suppl/i], ["EMPLOYMENT_COMMUNITY_SERVICES", /employment|community service|reintegration/i], ["PROFESSIONAL_SERVICES", /professional|consult|design|audit/i],
])

export function classifyTreaty6BusinessCategories(input = {}) {
  const text = [input.title, input.category, input.subcategory, input.description].map(value => clean(value, 2_000)).join(" ")
  return unique(categoryMatchers.filter(([, pattern]) => pattern.test(text)).map(([category]) => category))
}

const actionabilityMap = Object.freeze({ BID_READY: "OPEN_BID_READY", SUPPLIER_REGISTRATION: "OPEN_REGISTRATION", STANDING_OFFER_QUALIFICATION: "PREQUALIFICATION", RFI_ONLY: "RFI_ONLY", PLANNING_ONLY: "UPCOMING_PLANNING", MONITOR_ONLY: "MONITOR", CLOSED: "CLOSED", UNCLEAR: "UNCLEAR" })
const relevanceMap = Object.freeze({
  INDIGENOUS_SET_ASIDE: "INDIGENOUS_SET_ASIDE",
  INDIGENOUS_PARTICIPATION_REQUIRED: "INDIGENOUS_PARTICIPATION_REQUIRED",
  INDIGENOUS_PARTICIPATION_ENCOURAGED: "INDIGENOUS_PARTICIPATION_ENCOURAGED",
  INDIGENOUS_BENEFIT_REQUIREMENT: "INDIGENOUS_BENEFIT_REQUIREMENT",
  INDIGENOUS_JOINT_VENTURE_RELEVANT: "INDIGENOUS_JOINT_VENTURE_RELEVANT",
})

function possibleFit(categories) {
  const map = {
    TRANSPORTATION: "transportation businesses", CONSTRUCTION: "construction/trades", MAINTENANCE: "construction/trades", HEALTHCARE: "medical suppliers",
    MEDICAL_SUPPLIES: "medical suppliers", IT_DIGITAL: "IT/data firms", DATA_RESEARCH: "IT/data firms", PROFESSIONAL_SERVICES: "consultants",
    PRINTING_SIGNAGE: "printing/signage firms", EMPLOYMENT_COMMUNITY_SERVICES: "Indigenous economic-development corporations", TRAINING: "training providers",
    FACILITY_SERVICES: "facility-service companies",
  }
  return unique(categories.map(category => map[category]))
}

export function assessTreaty6SmallBusinessFit(input = {}) {
  if (!input.small_business_evidence) return Object.freeze({ classification: "INSUFFICIENT_INFORMATION", reason: "Contract scale, staffing, qualification, or delivery requirements were not sufficiently supported in the public summary." })
  const opportunity = createSmallBusinessOpportunity(input.small_business_evidence)
  const assessed = assessSmallBusinessProcurementFit(opportunity)
  const mapped = assessed.classification === "TOO_LARGE_OR_COMPLEX" ? "MEDIUM_BUSINESS" : assessed.classification
  return Object.freeze({ classification: TREATY6_SMALL_BUSINESS_FIT.includes(mapped) ? mapped : "INSUFFICIENT_INFORMATION", reason: assessed.reasons.join(" "), source_policy: assessed.policy })
}

export function createTreaty6Opportunity({ monitored_record, geography, licensing_class, small_business_evidence = null, source_current = true, source_conflict = false, public_fields_complete = true, restricted_material = false } = {}) {
  if (!monitored_record?.opportunity_id || !geography?.relationships || !TREATY6_LICENSING_CLASSES.includes(licensing_class)) throw new Error("treaty6_opportunity_invalid")
  const actionability = actionabilityMap[monitored_record.actionability] || "UNCLEAR"
  let opportunityClass = relevanceMap[monitored_record.indigenous_relevance_class]
  if (!opportunityClass && actionability === "RFI_ONLY") opportunityClass = "RFI_PLANNING_SIGNAL"
  if (!opportunityClass && actionability === "OPEN_REGISTRATION") opportunityClass = "SUPPLIER_REGISTRATION"
  if (!opportunityClass && actionability === "PREQUALIFICATION") opportunityClass = "STANDING_OFFER"
  if (!opportunityClass && geography.geographic_relevance_established) opportunityClass = "TREATY_6_GEOGRAPHIC_OPPORTUNITY"
  if (!opportunityClass && monitored_record.indigenous_relevance_class === "GENERAL_OPPORTUNITY") opportunityClass = "GENERAL_OPEN_OPPORTUNITY"
  if (!opportunityClass) opportunityClass = "UNCLEAR"
  const categories = classifyTreaty6BusinessCategories(monitored_record)
  const core = {
    schema_version: "treaty6-procurement-opportunity-v1",
    opportunity_id: monitored_record.opportunity_id,
    buyer: clean(monitored_record.buyer, 300), title: clean(monitored_record.title, 500), province: clean(monitored_record.jurisdiction, 120),
    community_region: clean(monitored_record.region, 300) || null, treaty6_relevance: geography, categories,
    posted_date: safeIso(monitored_record.posted_date), close_date: safeIso(monitored_record.close_date), status: clean(monitored_record.status, 120),
    estimated_value: Number.isFinite(monitored_record.estimated_value) ? monitored_record.estimated_value : null,
    indigenous_relevance_class: opportunityClass, actionability, eligibility: clean(monitored_record.supplier_eligibility, 1_000) || null,
    participation_requirements: clean(monitored_record.participation_requirement, 1_000) || null,
    set_aside_status: clean(monitored_record.set_aside_requirement, 1_000) || null,
    community_benefit_requirement: clean(monitored_record.benefit_requirement, 1_000) || null,
    supplier_registration_requirement: actionability === "OPEN_REGISTRATION" ? "Official supplier registration path" : null,
    source_url: clean(monitored_record.source_url, 1_000), verified_at: safeIso(monitored_record.verified_at), observed_at: safeIso(monitored_record.observed_at),
    last_changed_at: safeIso(monitored_record.last_changed_at) || safeIso(monitored_record.observed_at), licensing_class,
    source_current: source_current === true, source_conflict: source_conflict === true, public_fields_complete: public_fields_complete === true,
    restricted_material: restricted_material === true, small_business_fit: assessTreaty6SmallBusinessFit({ small_business_evidence }), possible_fit_for: possibleFit(categories),
    official_source_controls: true, private_only: true, publication_authority: false,
  }
  return Object.freeze({ ...core, record_checksum: sha256(core) })
}

export function evaluateTreaty6PublicationPolicy(record, { now = new Date() } = {}) {
  const close = record?.close_date ? Date.parse(record.close_date) : null
  const expired = Number.isFinite(close) && close < new Date(now).getTime()
  if (expired || record?.actionability === "CLOSED") return Object.freeze({ policy: TREATY6_PROCUREMENT_POLICY, result: "EXPIRED", publishable: false, reasons: Object.freeze(["The opportunity is closed or its supported deadline has passed."]) })
  const reasons = []
  if (!record?.source_url?.startsWith("https://")) reasons.push("authoritative_public_source_missing")
  if (!record?.source_current) reasons.push("source_not_current")
  if (!record?.opportunity_id || !record?.title || !record?.buyer) reasons.push("identity_incomplete")
  if (["MONITOR", "UNCLEAR"].includes(record?.actionability)) reasons.push("actionability_not_established")
  if (record?.actionability === "OPEN_BID_READY" && !record?.close_date) reasons.push("bid_deadline_missing")
  if (!record?.public_fields_complete) reasons.push("public_fields_incomplete")
  if (record?.source_conflict) reasons.push("source_conflict")
  if (record?.restricted_material) reasons.push("restricted_material")
  if (!record?.treaty6_relevance?.geographic_relevance_established) reasons.push("treaty6_relevance_not_established")
  if (record?.licensing_class === "LICENSING_REVIEW_REQUIRED") reasons.push("licensing_review_required")
  if (record?.licensing_class === "DO_NOT_REPUBLISH") reasons.push("source_prohibits_republication")
  const blocked = reasons.includes("restricted_material") || reasons.includes("source_prohibits_republication")
  const result = reasons.length ? blocked ? "BLOCKED" : "PRIVATE_REVIEW" : "PUBLICATION_SAFE"
  return Object.freeze({ policy: TREATY6_PROCUREMENT_POLICY, result, publishable: result === "PUBLICATION_SAFE", projection_mode: record?.licensing_class === "PUBLIC_LINK_ONLY" ? "MINIMAL_METADATA_AND_LINK" : "SAFE_METADATA_AND_LINK", reasons: Object.freeze(reasons), owner_activation_required: true })
}

export function toTreaty6PublicProjection(record, decision) {
  if (!decision?.publishable) throw new Error("treaty6_public_projection_not_authorized")
  const projection = {
    opportunity_id: record.opportunity_id, buyer: record.buyer, title: record.title, province: record.province, community_region: record.community_region,
    treaty6_relevance: record.treaty6_relevance.primary, categories: record.categories, posted_date: record.posted_date, close_date: record.close_date,
    status: record.status, indigenous_relevance_class: record.indigenous_relevance_class, actionability: record.actionability,
    small_business_fit: record.small_business_fit.classification, possible_fit_for: record.possible_fit_for, source_url: record.source_url,
    verified_at: record.verified_at, last_changed_at: record.last_changed_at,
    disclaimer: "Confirm eligibility, requirements, status and deadlines in the official tender. The official source controls.",
  }
  if (decision.projection_mode !== "MINIMAL_METADATA_AND_LINK") {
    projection.eligibility = record.eligibility
    projection.participation_requirements = record.participation_requirements
    projection.set_aside_status = record.set_aside_status
    projection.community_benefit_requirement = record.community_benefit_requirement
  }
  return Object.freeze(projection)
}

export function filterAndSortTreaty6Opportunities(records = [], filters = {}, sort = "CLOSING_SOON", now = new Date()) {
  const values = records.filter(record => {
    if (filters.province && record.province !== filters.province) return false
    if (filters.category && !record.categories.includes(filters.category)) return false
    if (filters.indigenous_relevance && record.indigenous_relevance_class !== filters.indigenous_relevance) return false
    if (filters.actionability && record.actionability !== filters.actionability) return false
    if (filters.small_business_fit && record.small_business_fit !== filters.small_business_fit && record.small_business_fit?.classification !== filters.small_business_fit) return false
    if (filters.buyer && record.buyer !== filters.buyer) return false
    if (filters.region && !clean(record.community_region).toLocaleLowerCase("en-CA").includes(clean(filters.region).toLocaleLowerCase("en-CA"))) return false
    if (filters.closing_soon && (!record.close_date || Date.parse(record.close_date) - new Date(now).getTime() > 7 * 86_400_000)) return false
    return true
  })
  const timestamp = (record, field) => record[field] ? Date.parse(record[field]) : Number.POSITIVE_INFINITY
  const sorted = [...values].sort((a, b) => {
    if (sort === "NEWEST") return timestamp(b, "posted_date") - timestamp(a, "posted_date")
    if (sort === "RECENTLY_CHANGED") return timestamp(b, "last_changed_at") - timestamp(a, "last_changed_at")
    if (sort === "INDIGENOUS_PARTICIPATION") return Number(!b.indigenous_relevance_class.startsWith("GENERAL")) - Number(!a.indigenous_relevance_class.startsWith("GENERAL")) || a.title.localeCompare(b.title)
    if (sort === "SMALL_BUSINESS_ACCESSIBLE") return ["SOLO_FRIENDLY", "MICRO_BUSINESS_FRIENDLY", "SMALL_TEAM_FRIENDLY"].indexOf(a.small_business_fit?.classification || a.small_business_fit) - ["SOLO_FRIENDLY", "MICRO_BUSINESS_FRIENDLY", "SMALL_TEAM_FRIENDLY"].indexOf(b.small_business_fit?.classification || b.small_business_fit)
    return timestamp(a, "close_date") - timestamp(b, "close_date")
  })
  return Object.freeze(sorted)
}

export function createTreaty6Signal(input = {}) {
  const signalType = clean(input.signal_type, 120)
  if (!["REPEAT_BUYER", "RECURRING_CATEGORY", "KNOWN_PRIOR_AWARD", "CONTRACT_EXPIRY_WATCH", "POSSIBLE_RETENDER_WINDOW"].includes(signalType) || !(input.evidence_refs || []).length || !clean(input.reason, 1_000)) throw new Error("treaty6_signal_evidence_required")
  return Object.freeze({ signal_id: `t6-signal-${sha256(input).slice(0, 18)}`, signal_type: signalType, buyer: clean(input.buyer, 300), category: clean(input.category, 160), reason: clean(input.reason, 1_000), evidence_refs: unique(input.evidence_refs.map(value => clean(value, 1_000))), label: signalType === "KNOWN_PRIOR_AWARD" ? "PUBLICLY_OBSERVED_PRIOR_AWARD" : signalType, confidence: clean(input.confidence, 80) || "SUPPORTED", no_complete_competitor_claim: true, private_only: true })
}

export function buildTreaty6PageSimulation({ projections = [], supports = [], signals = [], generated_at } = {}) {
  const active = projections.filter(record => record.actionability !== "CLOSED")
  return Object.freeze({
    schema_version: "treaty6-procurement-page-simulation-v1", route_concept: "/north/procurement", activated: false, owner_review_required: true,
    title: "Treaty 6 Procurement Opportunities", subtitle: "Public opportunities, supplier programs and procurement signals relevant to Treaty 6 businesses and organizations.",
    disclosures: Object.freeze(["Sourced from public procurement systems.", "Not every listing is Indigenous-specific.", "Eligibility must be confirmed from the official tender.", "Listings may change; the official source controls."]),
    sections: Object.freeze({
      open_opportunities: Object.freeze(active.filter(record => record.actionability === "OPEN_BID_READY")),
      indigenous_specific_participation: Object.freeze(active.filter(record => record.indigenous_relevance_class.startsWith("INDIGENOUS_"))),
      supplier_registration_prequalification: Object.freeze(supports.filter(item => ["SUPPLIER_REGISTRATION", "PREQUALIFICATION", "INDIGENOUS_PROGRAM"].includes(item.support_type))),
      recurring_buyers_categories: Object.freeze(signals), procurement_supports: Object.freeze(supports),
      recently_changed: Object.freeze(active.filter(record => record.last_changed_at).sort((a, b) => Date.parse(b.last_changed_at) - Date.parse(a.last_changed_at))),
    }),
    filters: Object.freeze(["PROVINCE", "REGION_COMMUNITY", "CATEGORY", "INDIGENOUS_RELEVANCE", "ACTIONABILITY", "SMALL_BUSINESS_FIT", "CLOSING_SOON", "BUYER"]),
    sorts: Object.freeze(["CLOSING_SOON", "NEWEST", "RECENTLY_CHANGED", "INDIGENOUS_PARTICIPATION", "SMALL_BUSINESS_ACCESSIBLE"]),
    generated_at: safeIso(generated_at), private_simulation: true, publication_authority: false,
  })
}

export function bindTreaty6ProjectionToMonitor(campaign, { projection_checksum, record_count, public_safe_count } = {}) {
  if (campaign?.campaign_id !== "INDIGENOUS_PROCUREMENT_OPPORTUNITY_MONITOR_30D_V1" || campaign.status !== "ACTIVE") throw new Error("treaty6_monitor_binding_requires_active_campaign")
  const binding = Object.freeze({ projection_id: "TREATY6_PROCUREMENT_OPPORTUNITIES_V1", geography_model: "TREATY6_GEOGRAPHIC_REFERENCE_V1", publication_policy: TREATY6_PROCUREMENT_POLICY, projection_checksum, records_tagged: record_count, publication_safe_records: public_safe_count, no_duplicate_campaign: true, publication_authority: false })
  const existing = (campaign.projection_bindings || []).filter(item => item.projection_id !== binding.projection_id)
  const core = { ...campaign, projection_bindings: Object.freeze([...existing, binding]), treaty6_completion_metrics_enabled: true }
  const { campaign_checksum: _oldChecksum, ...withoutChecksum } = core
  return Object.freeze({ ...withoutChecksum, campaign_checksum: sha256(withoutChecksum) })
}

export function projectTemporalEventToTreaty6(event, record) {
  if (!event?.event_id || !event?.entity_id || !record?.opportunity_id || !event.entity_id.includes(record.opportunity_id)) throw new Error("treaty6_temporal_event_identity_mismatch")
  if (!record.treaty6_relevance?.geographic_relevance_established) throw new Error("treaty6_temporal_event_geography_unresolved")
  return Object.freeze({
    temporal_event_id: event.event_id,
    opportunity_id: record.opportunity_id,
    event_type: event.event_type,
    observed_at: event.observed_at,
    published_at: event.published_at,
    effective_at: event.effective_at,
    verified_at: event.verified_at,
    source_refs: Object.freeze(event.source_refs || []),
    treaty6_projection_only: true,
    source_event_unchanged: true,
    publication_authority: false,
  })
}

export function treaty6RefreshPlan() {
  return Object.freeze({ stages: TREATY6_REFRESH_STAGES, fast_source_cadence: "DAILY_SOURCE_AWARE", slow_source_cadence: "WEEKLY_OR_CHANGE_TRIGGERED", raw_html_diff_can_publish: false, temporal_event_validation_required: true, expired_default_public_visibility: false, no_competing_scheduler: true })
}
