import { createHash } from "node:crypto"

import {
  evaluateTreaty6PublicationPolicy,
  toTreaty6PublicProjection,
} from "./treaty6ProcurementIntelligence.js"

export const TREATY6_PROCUREMENT_BETA_PUBLICATION_POLICY_V1 = "TREATY6_PROCUREMENT_BETA_PUBLICATION_POLICY_V1"

export const TREATY6_BETA_ACTION_LABELS = Object.freeze({
  OPEN_BID_READY: "OPEN FOR BIDS",
  OPEN_REGISTRATION: "SUPPLIER REGISTRATION",
  PREQUALIFICATION: "PREQUALIFICATION",
  RFI_ONLY: "RFI / PLANNING",
  UPCOMING_PLANNING: "PLANNING",
  MONITOR: "WATCHING",
  CLOSED: "CLOSED",
  UNCLEAR: "WATCHING",
})

export const TREATY6_BETA_INDIGENOUS_LABELS = Object.freeze({
  INDIGENOUS_SET_ASIDE: "INDIGENOUS SET-ASIDE",
  INDIGENOUS_PARTICIPATION_REQUIRED: "INDIGENOUS PARTICIPATION REQUIRED",
  INDIGENOUS_PARTICIPATION_ENCOURAGED: "INDIGENOUS PARTICIPATION ENCOURAGED",
  INDIGENOUS_BENEFIT_REQUIREMENT: "INDIGENOUS BENEFIT REQUIREMENT",
  INDIGENOUS_JOINT_VENTURE_RELEVANT: "INDIGENOUS JOINT-VENTURE RELEVANT",
  TREATY_6_GEOGRAPHIC_OPPORTUNITY: "TREATY 6 REGION",
  GENERAL_OPEN_OPPORTUNITY: "GENERAL PUBLIC OPPORTUNITY",
})

const SAFE_ACTIONABILITY = new Set(["OPEN_BID_READY", "OPEN_REGISTRATION", "PREQUALIFICATION", "RFI_ONLY", "UPCOMING_PLANNING"])
const EXPLICIT_INDIGENOUS = new Set(Object.keys(TREATY6_BETA_INDIGENOUS_LABELS).filter(value => value.startsWith("INDIGENOUS_")))
const SAFE_LICENSES = new Set(["PUBLIC_REUSE_CLEAR", "PUBLIC_LINK_ONLY"])
const ALLOWED_BUYER_STATES = new Set(["OBSERVED_BUYER", "PORTAL_ROUTED"])
const PORTAL_SOURCE_IDS = new Set(["FED-CANADABUYS-NOTICES", "AB-APC", "SK-SASKTENDERS", "SK-ASPEN"])
const BANNED_PUBLIC_KEYS = /private_business|business_profile|company_profile|company_match|qualification_state|internal_notes|restricted_material|confidence_components|campaign_state|evidence_completion|business_id|profile_checksum|match_id|win_probability|source_refs/i

const clean = (value, limit = 2_000) => String(value ?? "").normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
const iso = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
const hash = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")
const unique = values => [...new Set(values.filter(Boolean))]
const words = value => clean(value).replaceAll("_", " ").toLocaleLowerCase("en-CA")

function freshnessDays(value, now) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? (new Date(now).getTime() - timestamp) / 86_400_000 : Number.POSITIVE_INFINITY
}

function keyRequirements(record) {
  return [
    record.set_aside_status ? { type: "INDIGENOUS_ELIGIBILITY", value: record.set_aside_status } : null,
    record.participation_requirements ? { type: "INDIGENOUS_PARTICIPATION", value: record.participation_requirements } : null,
    record.community_benefit_requirement ? { type: "COMMUNITY_BENEFIT", value: record.community_benefit_requirement } : null,
    record.eligibility ? { type: "SUPPLIER_ELIGIBILITY", value: record.eligibility } : null,
  ].filter(Boolean)
}

export function evaluateTreaty6BetaPublicationPolicy(record, monitorRecord = {}, { now = new Date() } = {}) {
  const base = evaluateTreaty6PublicationPolicy(record, { now })
  const reasons = [...base.reasons]
  if (!SAFE_ACTIONABILITY.has(record?.actionability)) reasons.push("beta_actionability_not_public")
  if (!SAFE_LICENSES.has(record?.licensing_class)) reasons.push("source_reuse_not_cleared_for_record_projection")
  if (freshnessDays(record?.verified_at, now) > 14) reasons.push("verification_too_old_for_beta")
  if (EXPLICIT_INDIGENOUS.has(record?.indigenous_relevance_class)) {
    if (monitorRecord.explicit_indigenous_relevance !== true || clean(monitorRecord.relevance_evidence).length < 20) reasons.push("explicit_indigenous_source_language_missing")
  }
  if (record?.actionability === "RFI_ONLY" && !/request for information|rfi/i.test(clean(monitorRecord.procurement_method))) reasons.push("rfi_identity_not_supported")
  const publishable = base.publishable && reasons.length === 0
  return Object.freeze({
    policy: TREATY6_PROCUREMENT_BETA_PUBLICATION_POLICY_V1,
    result: publishable ? "PUBLICATION_SAFE" : base.result === "EXPIRED" ? "EXPIRED" : reasons.some(reason => /restricted|prohibits|do_not/i.test(reason)) ? "BLOCKED" : "PRIVATE_REVIEW",
    publishable,
    projection_mode: base.projection_mode,
    reasons: Object.freeze(unique(reasons)),
    owner_activation_required: true,
  })
}

export function toTreaty6BetaOpportunity(record, monitorRecord, decision) {
  if (!decision?.publishable) throw new Error("treaty6_beta_projection_not_authorized")
  const base = toTreaty6PublicProjection(record, decision)
  const planning = ["RFI_ONLY", "UPCOMING_PLANNING"].includes(base.actionability)
  const requirements = keyRequirements(base)
  return Object.freeze({
    ...base,
    action_label: TREATY6_BETA_ACTION_LABELS[base.actionability],
    indigenous_label: TREATY6_BETA_INDIGENOUS_LABELS[base.indigenous_relevance_class] || "GENERAL PUBLIC OPPORTUNITY",
    plain_language_summary: planning
      ? "This is a public planning or market-information notice, not an open contract bid."
      : "This is a validated public procurement notice. Confirm every detail at the official source.",
    why_watch: clean(monitorRecord.relevance_evidence, 600) || `Samwise is monitoring this ${words(base.actionability)} notice because its Treaty 6 relevance is source-supported.`,
    key_requirements: Object.freeze(requirements),
    requirements_note: requirements.length ? null : "See the official tender for full requirements.",
    personal_business_recommendation: false,
    business_qualification_claim: false,
  })
}

function publicPortal(source) {
  const reuse = source.licensing_reuse_status === "PUBLIC_SOURCE_REUSE_DOCUMENTED" ? "PUBLIC_REUSE_CLEAR" : "PUBLIC_LINK_ONLY"
  return Object.freeze({
    portal_id: source.source_id,
    title: source.title,
    jurisdiction: source.jurisdiction,
    source_url: source.url,
    description: source.source_id === "FED-CANADABUYS-NOTICES"
      ? "Federal tender notices, awards and procurement history. Search and notice-following tools are available."
      : source.source_id === "AB-APC"
        ? "Alberta public-sector opportunities. A supplier account can support saved filters and notifications."
        : source.source_id === "SK-SASKTENDERS"
          ? "Saskatchewan public-sector procurement notices and notification guidance."
          : "A SaskPower project page with public work-opportunity and awarded-contract pathways.",
    registration_or_alerts: clean(source.alerts_or_subscriptions, 500) || "Check the official portal for registration and alert options.",
    full_documents_may_require_account: source.authentication_for_full_documents === true,
    reuse_class: reuse,
  })
}

function publicBuyer(buyer, records) {
  const categories = unique(records.filter(record => record.buyer === buyer.name).flatMap(record => record.categories || []))
  return Object.freeze({
    buyer_id: buyer.buyer_id,
    name: buyer.name,
    province: buyer.province,
    buyer_type: buyer.buyer_type,
    healthcare_lane: buyer.healthcare_lane === true,
    categories,
    why_watch: categories.length
      ? `The current monitored sample includes ${categories.map(words).join(", ")} activity from this buyer.`
      : "This public buyer or procurement pathway is in the Treaty 6 monitoring registry; category history is still developing.",
    source_url: buyer.procurement_source_url,
    indigenous_preference_claimed: false,
  })
}

function categorySummary(records) {
  const counts = new Map()
  for (const record of records) for (const category of record.categories || []) counts.set(category, (counts.get(category) || 0) + 1)
  return [...counts].map(([category, observed_records]) => Object.freeze({
    category,
    label: words(category).replace(/\b\w/g, letter => letter.toUpperCase()),
    observed_records,
    history_status: observed_records > 1 ? "REPEATED_IN_CURRENT_SAMPLE" : "CURRENTLY_OBSERVED",
  })).sort((a, b) => b.observed_records - a.observed_records || a.label.localeCompare(b.label))
}

function publicBusinessWatchlists(profiles, matches, opportunities, generatedAt) {
  const visibleById = new Map(opportunities.map(item => [item.opportunity_id, item]))
  const retained = new Map()
  for (const match of matches || []) {
    if (!visibleById.has(match?.opportunity_id) || !new Set(["STRONG_PLAUSIBLE_MATCH", "REASONABLE_MATCH", "WATCH"]).has(match?.classification)) continue
    retained.set(match.business_id, [...(retained.get(match.business_id) || []), match])
  }
  return Object.freeze((profiles || []).map(profile => {
    const entries = retained.get(profile.business_id) || []
    const watchlist = entries.map(match => {
      const opportunity = visibleById.get(match.opportunity_id)
      const overlap = (profile.capabilities || []).filter(capability => (opportunity.categories || []).includes(capability))
      return Object.freeze({
        opportunity_id: opportunity.opportunity_id,
        title: opportunity.title,
        buyer: opportunity.buyer,
        province: opportunity.province,
        close_date: opportunity.close_date,
        actionability: opportunity.actionability,
        action_label: opportunity.action_label,
        indigenous_label: opportunity.indigenous_label,
        source_url: opportunity.source_url,
        verified_at: opportunity.verified_at,
        relevance_label: match.classification === "STRONG_PLAUSIBLE_MATCH" ? "STRONG CATEGORY RELEVANCE" : match.classification === "REASONABLE_MATCH" ? "REASONABLE CATEGORY RELEVANCE" : "EARLY SIGNAL",
        why_watch: overlap.length ? `Publicly documented ${overlap.map(words).join(" and ")} capability overlaps the public notice category.` : "The public notice topic overlaps a documented capability; the official tender controls all requirements.",
        requirements_note: opportunity.requirements_note || "See the official tender for full requirements.",
      })
    })
    const source = profile.source_refs?.find(item => item?.source_url?.startsWith("https://"))
    if (!source) throw new Error("treaty6_beta_business_source_missing")
    return Object.freeze({
      canonical_name: clean(profile.business_name, 200),
      public_affiliation: clean(profile.public_affiliation, 500),
      province: clean(profile.province, 80),
      region: unique(profile.geographic_delivery_area || []).join(", "),
      website: clean(profile.website, 1_000),
      capabilities: Object.freeze(unique(profile.capabilities || [])),
      source_url: clean(source.source_url, 1_000),
      last_verified_at: iso(profile.verified_at || generatedAt),
      current_opportunity_count: watchlist.length,
      watchlist: Object.freeze(watchlist),
      no_current_match_note: watchlist.length ? null : "No current monitored opportunity has passed the public watchlist gate for this business. Check the official portals for new notices.",
      qualification_disclaimer: "This appears here only where Samwise found overlap with publicly documented capabilities. It does not establish qualification or suggest that a business should bid. Confirm insurance, bonding, staffing, experience, certifications and all tender requirements directly with the official source.",
    })
  }))
}

function changeProjection(changeFeed, opportunities) {
  const known = new Map(opportunities.map(item => [item.opportunity_id, item]))
  return Object.freeze((changeFeed?.events || []).filter(event => known.has(event.opportunity_id)).map(event => Object.freeze({
    event_id: clean(event.event_id, 200),
    event_type: clean(event.feed_type || event.event_type, 120),
    opportunity_id: event.opportunity_id,
    title: known.get(event.opportunity_id).title,
    observed_at: iso(event.observed_at || changeFeed.observed_at),
    source_url: known.get(event.opportunity_id).source_url,
  })))
}

function containsBannedKey(value) {
  if (Array.isArray(value)) return value.some(containsBannedKey)
  if (!value || typeof value !== "object") return false
  return Object.entries(value).some(([key, child]) => BANNED_PUBLIC_KEYS.test(key) || containsBannedKey(child))
}

export function validateTreaty6ProcurementBetaPublic(model, { now = new Date() } = {}) {
  const errors = []
  if (model?.schema_version !== "treaty6-procurement-beta-public-v1") errors.push("schema_invalid")
  if (model?.publication_policy !== TREATY6_PROCUREMENT_BETA_PUBLICATION_POLICY_V1) errors.push("publication_policy_invalid")
  if (model?.route !== "/north/procurement") errors.push("route_invalid")
  if (model?.beta !== true || model?.owner_approval_required !== true) errors.push("beta_owner_gate_missing")
  if (containsBannedKey(model)) errors.push("private_or_matching_fields_present")
  for (const record of [...(model?.sections?.current_opportunities || []), ...(model?.sections?.watching || [])]) {
    if (!record.source_url?.startsWith("https://")) errors.push(`source_invalid:${record.opportunity_id}`)
    if (record.actionability === "OPEN_BID_READY" && (!record.close_date || Date.parse(record.close_date) <= new Date(now).getTime())) errors.push(`open_deadline_invalid:${record.opportunity_id}`)
    if (record.actionability === "RFI_ONLY" && record.action_label === "OPEN FOR BIDS") errors.push(`rfi_mislabelled:${record.opportunity_id}`)
    if (EXPLICIT_INDIGENOUS.has(record.indigenous_relevance_class) && !record.why_watch) errors.push(`indigenous_evidence_missing:${record.opportunity_id}`)
  }
  const knownOpportunities = new Set([...(model?.sections?.current_opportunities || []), ...(model?.sections?.watching || []), ...(model?.sections?.registration_prequalification || [])].map(item => item.opportunity_id))
  for (const business of model?.sections?.business_watchlists || []) {
    const name = clean(business.canonical_name, 80) || "unknown"
    if (!clean(business.canonical_name) || !business.website?.startsWith("https://") || !business.source_url?.startsWith("https://") || !iso(business.last_verified_at)) errors.push(`business_profile_invalid:${name}`)
    if (!(business.capabilities || []).length) errors.push(`business_capabilities_missing:${name}`)
    if (!/does not establish qualification|does not establish/i.test(business.qualification_disclaimer || "")) errors.push(`business_disclaimer_missing:${name}`)
    for (const item of business.watchlist || []) if (!knownOpportunities.has(item.opportunity_id) || !item.source_url?.startsWith("https://")) errors.push(`business_watch_invalid:${name}`)
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) })
}

export function buildTreaty6ProcurementBeta({ dataset, monitor_snapshot, source_registry, buyer_registry, geography_model, change_feed, business_profiles = [], business_matches = [], generated_at = new Date() } = {}) {
  if (dataset?.schema_version !== "treaty6-procurement-private-dataset-v1" || !Array.isArray(monitor_snapshot?.records)) throw new Error("treaty6_beta_private_inputs_invalid")
  const monitored = new Map(monitor_snapshot.records.map(record => [record.opportunity_id, record]))
  const decisions = dataset.records.map(record => ({ record, monitor: monitored.get(record.opportunity_id) || {}, decision: evaluateTreaty6BetaPublicationPolicy(record, monitored.get(record.opportunity_id), { now: generated_at }) }))
  const opportunities = decisions.filter(item => item.decision.publishable).map(item => toTreaty6BetaOpportunity(item.record, item.monitor, item.decision))
  const current = opportunities.filter(record => record.actionability === "OPEN_BID_READY")
  const watching = opportunities.filter(record => ["RFI_ONLY", "UPCOMING_PLANNING"].includes(record.actionability))
  const registrations = opportunities.filter(record => ["OPEN_REGISTRATION", "PREQUALIFICATION"].includes(record.actionability))
  const supportPaths = (dataset.supports || []).filter(item => SAFE_LICENSES.has(item.licensing_class)).map(item => Object.freeze({
    support_id: item.support_id,
    support_type: item.support_type,
    title: item.title,
    summary: item.summary,
    source_url: item.source_url,
    reuse_class: item.licensing_class,
  }))
  const relevantRecords = dataset.records.filter(record => /Alberta|Saskatchewan|Federal/.test(record.province))
  const portals = source_registry.filter(source => PORTAL_SOURCE_IDS.has(source.source_id)).map(publicPortal)
  const buyers = buyer_registry.filter(buyer => ALLOWED_BUYER_STATES.has(buyer.registry_status)).map(buyer => publicBuyer(buyer, relevantRecords))
  const categories = categorySummary(relevantRecords)
  const changes = changeProjection(change_feed, opportunities)
  const businessWatchlists = publicBusinessWatchlists(business_profiles, business_matches, opportunities, generated_at)
  const sourceFamilies = unique(source_registry.map(source => source.organization))
  const contextReferences = geography_model.references.map(reference => Object.freeze({ title: reference.title, source_url: reference.source_url, limitation: reference.limitations }))
  const metrics = Object.freeze({
    open_bid_ready_count: current.length,
    indigenous_specific_count: opportunities.filter(item => EXPLICIT_INDIGENOUS.has(item.indigenous_relevance_class)).length,
    planning_watch_count: watching.length,
    supplier_prequalification_count: registrations.length + supportPaths.filter(item => item.support_type === "SUPPLIER_REGISTRATION" || item.support_type === "PREQUALIFICATION").length,
    source_family_count: sourceFamilies.length,
    buyer_count: buyers.length,
    category_count: categories.length,
    business_watchlist_count: businessWatchlists.length,
  })
  const thinSections = [
    current.length === 0 ? "CURRENT_OPPORTUNITIES" : null,
    changes.length === 0 ? "WHAT_CHANGED" : null,
    registrations.length === 0 ? "LIVE_PREQUALIFICATION" : null,
    !(dataset.historical_signals || []).length ? "RECURRING_BUYER_HISTORY" : null,
  ].filter(Boolean)
  const model = {
    schema_version: "treaty6-procurement-beta-public-v1",
    publication_policy: TREATY6_PROCUREMENT_BETA_PUBLICATION_POLICY_V1,
    route: "/north/procurement",
    title: "Treaty 6 Procurement & Business Opportunities",
    subtitle: "Public procurement opportunities, supplier programs and market signals relevant to Treaty 6 businesses and organizations.",
    description: "Public procurement opportunities, supplier programs and procurement signals relevant to Treaty 6 businesses and organizations in Alberta and Saskatchewan.",
    generated_at: iso(generated_at),
    beta: true,
    owner_approval_required: true,
    comprehensive_coverage_claimed: false,
    disclosures: Object.freeze([
      "Beta — this data is still being refined.",
      "Samwise monitors authoritative public procurement sources, but listings can change.",
      "Not every opportunity is Indigenous-specific. Eligibility and requirements must be confirmed with the official source.",
      "Planning and RFI notices are labelled separately from open bids.",
      "Please check back — this page is actively improving.",
    ]),
    sections: Object.freeze({
      current_opportunities: Object.freeze(current),
      watching: Object.freeze(watching),
      registration_prequalification: Object.freeze(registrations),
      portals: Object.freeze(portals),
      supports: Object.freeze(supportPaths),
      buyers: Object.freeze(buyers),
      categories: Object.freeze(categories),
      recently_changed: changes,
      business_watchlists: businessWatchlists,
      treaty6_context: Object.freeze({
        summary: "This page focuses on public procurement relevant to Treaty 6 territory and Treaty 6 businesses and organizations across Alberta and Saskatchewan.",
        boundary_caveat: "These references support regional context; this webpage does not define legal Treaty boundaries or supplier eligibility.",
        references: Object.freeze(contextReferences),
      }),
    }),
    who_this_may_help: Object.freeze(["Nation-owned businesses", "Economic-development corporations", "Indigenous entrepreneurs", "Construction and trades firms", "Transport and logistics providers", "Medical suppliers", "IT and data firms", "Consultants", "Environmental firms", "Facility-service companies", "Training and community-service organizations"]),
    feedback: Object.freeze({ heading: "Help shape this beta", prompt: "Know a Treaty 6 business, buyer or procurement source we should be watching? What would be most useful here: current tenders, supplier registration, upcoming opportunities, prior awards or renewal signals?", collection_enabled: false }),
    accountability_boundary: "This practical page does not assess procurement equity or discrimination. Low award share does not by itself establish discrimination.",
    metrics,
    thin_sections: Object.freeze(thinSections),
    refresh: Object.freeze({ source: "INDIGENOUS_PROCUREMENT_OPPORTUNITY_MONITOR_30D_V1", pipeline: Object.freeze(["MONITOR", "TEMPORAL_EVENT", "PUBLICATION_SAFE_PROJECTION", "PAGE_DATA"]), duplicate_scraper: false, automatic_production_publication: false }),
  }
  const validation = validateTreaty6ProcurementBetaPublic(model, { now: generated_at })
  if (!validation.valid) throw new Error(`treaty6_beta_public_validation_failed:${validation.errors.join(",")}`)
  const readiness = current.length > 0 || (watching.length > 0 && supportPaths.length >= 3 && portals.length >= 3 && buyers.length >= 5)
  return Object.freeze({ model: Object.freeze(model), decisions: Object.freeze(decisions.map(item => Object.freeze({ opportunity_id: item.record.opportunity_id, ...item.decision }))), validation, readiness: readiness ? "TREATY6_PROCUREMENT_BETA_READY_FOR_OWNER_APPROVAL" : "TREATY6_PROCUREMENT_BETA_NEEDS_MORE_LIVE_DATA", public_projection_checksum: hash(model) })
}
