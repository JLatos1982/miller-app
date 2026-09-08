import { buildMillerPracticalIntelligence, detectMillerPracticalIntents, isMillerPracticalPublicResource } from "../src/millerPracticalIntelligence.js"
import { millerResourceSearchText } from "../src/millerPublicSearchResources.js"
import { conciseResourceDescription } from "../src/millerResultPresentation.js"
import { buildMobileReadinessIndex, mobileReadinessSummary } from "./millerMobileReadiness.js"
import { MILLER_CANADIAN_LOCATION_LABELS, MILLER_CANADIAN_LOCATION_PROVINCES, MILLER_COVERAGE_MATURITY } from "./millerWesternCommunities.js"
import { buildMillerAccessPathway, decomposeMillerProfessionalNeeds, explainMillerProfessionalResults, millerProfessionalWorkflowIntent, recommendedMillerPackIds } from "./millerProfessionalWorkflow.js"

export const MILLER_MOBILE_API_VERSION = "miller-mobile-search-v1"
export const MILLER_MOBILE_RESULT_LIMIT = 20

const PROVINCES = Object.freeze({
  bc: "British Columbia",
  "british columbia": "British Columbia",
  ab: "Alberta",
  alberta: "Alberta",
  sk: "Saskatchewan",
  saskatchewan: "Saskatchewan",
  mb: "Manitoba",
  manitoba: "Manitoba",
  on: "Ontario",
  ontario: "Ontario",
  qc: "Quebec",
  pq: "Quebec",
  quebec: "Quebec",
  "québec": "Quebec",
  nb: "New Brunswick",
  "new brunswick": "New Brunswick",
  ns: "Nova Scotia",
  "nova scotia": "Nova Scotia",
  pe: "Prince Edward Island",
  pei: "Prince Edward Island",
  "prince edward island": "Prince Edward Island",
  nl: "Newfoundland and Labrador",
  "newfoundland and labrador": "Newfoundland and Labrador",
  newfoundland: "Newfoundland and Labrador",
  labrador: "Newfoundland and Labrador",
  yt: "Yukon",
  yukon: "Yukon",
  nt: "Northwest Territories",
  nwt: "Northwest Territories",
  "northwest territories": "Northwest Territories",
  nu: "Nunavut",
  nunavut: "Nunavut",
  canada: "Canada-wide",
  national: "Canada-wide",
  "canada wide": "Canada-wide",
})

const INTENT_TERMS = Object.freeze({
  housing: ["housing", "shelter", "homeless", "supportive housing", "recovery housing"],
  detox: ["detox", "withdrawal", "withdrawal management"],
  treatment: ["treatment", "residential", "outpatient", "rehab", "recovery program"],
  oat: ["oat", "opioid agonist", "methadone", "suboxone", "sublocade", "buprenorphine"],
  counselling: ["counselling", "counseling", "therapy"],
  harm_reduction: ["harm reduction", "naloxone", "overdose prevention", "safer use"],
  meetings: ["meeting", "peer support", "smart recovery", "alcoholics anonymous", "narcotics anonymous"],
  legal: ["legal", "legal aid", "advocacy", "tenancy", "rights", "courtworker"],
  funding: ["funding", "financial assistance", "benefit", "subsidy", "grant"],
  mental_health: ["mental health", "counselling", "psychiatric", "crisis"],
  basic_needs: ["basic needs", "food", "clothing", "identification", "income"],
  transportation: ["transportation", "transport", "medical travel", "transit", "ride"],
  reentry: ["corrections reentry", "re entry", "reentry", "reintegration", "release planning"],
})

const clean = value => String(value ?? "").replace(/\s+/g, " ").trim()
const normalized = value => clean(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "'").replace(/[^a-z0-9]+/g, " ").trim()

function boundedString(value, maximum, field) {
  const result = clean(value)
  if (result.length > maximum) throw new Error(`${field}_too_long`)
  return result
}

export function normalizeMobileProvince(value) {
  return PROVINCES[normalized(value)] || ""
}

export function validateMillerMobileSearchRequest(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_request")
  const query = boundedString(body.query ?? body.free_text, 500, "query")
  if (!query) throw new Error("query_required")
  const location = boundedString(body.location, 100, "location")
  const suppliedProvince = boundedString(body.province, 30, "province")
  const province = suppliedProvince ? normalizeMobileProvince(suppliedProvince) : ""
  if (suppliedProvince && !province) throw new Error("province_invalid")
  const categories = Array.isArray(body.categories)
    ? [...new Set(body.categories.map(value => boundedString(value, 60, "category")).filter(Boolean))].slice(0, 8)
    : []
  const requestedLimit = Number(body.limit ?? 12)
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) throw new Error("limit_invalid")
  return Object.freeze({
    query,
    location,
    province,
    categories,
    limit: Math.min(requestedLimit, MILLER_MOBILE_RESULT_LIMIT),
    broaden_nearby: body.broaden_nearby === true || body.broaden_access === true,
  })
}

function provinceFor(resource) {
  const explicit = normalizeMobileProvince(resource?.province)
  if (explicit) return explicit
  const haystack = normalized(`${resource?.region || ""} ${resource?.service_area || ""}`)
  for (const [alias, province] of Object.entries(PROVINCES)) {
    if (new RegExp(`(^| )${alias}( |$)`).test(haystack)) return province
  }
  if (/\bcanada\b|federal|national/.test(haystack)) return "Canada-wide"
  return "British Columbia"
}

function cityFor(resource) {
  return clean(resource?.city || resource?.city_community)
}

function detectedLocation(query, resources) {
  const haystack = ` ${normalized(query)} `
  const cities = [...new Set([...resources.map(cityFor).filter(Boolean), ...Object.keys(MILLER_CANADIAN_LOCATION_PROVINCES)])]
    .sort((left, right) => right.length - left.length)
  const match = cities.find(city => haystack.includes(` ${normalized(city)} `)) || ""
  if (!match || !Object.hasOwn(MILLER_CANADIAN_LOCATION_PROVINCES, normalized(match))) return match
  return MILLER_CANADIAN_LOCATION_LABELS[normalized(match)] || match
}

function provinceForLocation(location) {
  return MILLER_CANADIAN_LOCATION_PROVINCES[normalized(location)] || ""
}

function detectedProvince(query) {
  const haystack = normalized(query)
  for (const [alias, province] of Object.entries(PROVINCES)) {
    if (new RegExp(`(^| )${alias.replace(/ /g, " ")}( |$)`).test(haystack)) return province
  }
  return ""
}

function keywordTokens(query) {
  const stop = new Set(["and", "for", "from", "help", "need", "near", "options", "someone", "that", "the", "this", "with"])
  return normalized(query).split(" ").filter(token => token.length > 2 && !stop.has(token))
}

function includesTerm(text, term) {
  const haystack = ` ${normalized(text)} `
  const needle = normalized(term)
  return Boolean(needle && haystack.includes(` ${needle} `))
}

function intentSearchText(resource) {
  return [
    resource?.serviceType,
    resource?.category,
    resource?.description,
    resource?.population,
    resource?.eligibility,
    resource?.accessType,
    resource?.fundingType,
    resource?.transportationNote,
    ...(resource?.tags || []),
  ].map(clean).join(" ")
}

function matchesAnyIntent(resource, intents) {
  if (!intents.length) return true
  const text = intentSearchText(resource)
  return intents.some(intent => (INTENT_TERMS[intent] || []).some(term => includesTerm(text, term)))
}

function directlyRepresentsIntent(resource, intent) {
  if (!intent) return true
  const text = [resource?.name, resource?.serviceType, resource?.category, ...(resource?.tags || [])].map(clean).join(" ")
  return (INTENT_TERMS[intent] || []).some(term => includesTerm(text, term))
}

function scopeFor(resource) {
  const physical = resource?.physicalLocation && typeof resource.physicalLocation === "object"
    ? resource.physicalLocation
    : resource?.address && cityFor(resource)
      ? { community: cityFor(resource), address: clean(resource.address), province: provinceFor(resource) }
      : null
  return {
    physical_location: physical,
    local_service_area: Array.isArray(resource?.localServiceArea) ? resource.localServiceArea.map(clean).filter(Boolean) : [],
    regional_service_area: Array.isArray(resource?.regionalServiceArea) ? resource.regionalServiceArea.map(clean).filter(Boolean) : [],
    province_wide: resource?.provinceWide === true,
    canada_wide: resource?.canadaWide === true || provinceFor(resource) === "Canada-wide",
    virtual: resource?.virtual_service === true,
    navigation_only: resource?.navigationOnly === true,
    travel_required: resource?.travelRequired === true,
    scope_note: clean(resource?.scopeNote),
  }
}

function physicallyLocatedIn(resource, location) {
  if (!location) return false
  const scope = scopeFor(resource)
  return normalized(scope.physical_location?.community) === normalized(location)
}

function servesLocation(resource, location) {
  if (!location) return false
  const scope = scopeFor(resource)
  if (physicallyLocatedIn(resource, location)) return true
  const locationProvince = provinceForLocation(location)
  const resourceProvince = provinceFor(resource)
  if (locationProvince && resourceProvince !== locationProvince) return false
  const areas = [...scope.local_service_area, ...scope.regional_service_area, ...(resource?.searchLocations || [])]
  if (areas.some(area => includesTerm(area, location))) return true
  if (includesTerm(resource?.region, location)) return true
  return scope.province_wide && !scope.canada_wide && locationProvince === resourceProvince
}

function locationRelationship(resource, location) {
  const scope = scopeFor(resource)
  if (location && physicallyLocatedIn(resource, location)) return { code: "located_here", label: `Located in ${location}` }
  if (location && servesLocation(resource, location)) {
    if (scope.navigation_only) return {
      code: "regional_intake",
      label: scope.province_wide ? `Province-wide navigation for ${location}` : `Regional intake serving ${location}`,
    }
    const physicalCommunity = clean(scope.physical_location?.community)
    return {
      code: "serves_community",
      label: physicalCommunity ? `Located in ${physicalCommunity} · serves ${location}` : `Serves ${location}`,
    }
  }
  if (scope.canada_wide) return { code: "canada_wide", label: "Canada-wide service" }
  if (scope.navigation_only && scope.province_wide) return { code: "province_navigation", label: "Province-wide navigation" }
  if (scope.province_wide) return { code: "province_wide", label: "Province-wide service" }
  if (scope.virtual) return { code: "virtual", label: "Virtual service" }
  return { code: "location_not_established", label: clean(scope.scope_note) }
}

function scoreResource(resource, { query, location, province, categories, intents, readiness }) {
  const text = millerResourceSearchText(resource)
  const intentText = intentSearchText(resource)
  const name = normalized(resource.name)
  const resourceProvince = provinceFor(resource)
  let score = resource.approved === false ? -1000 : 10
  for (const token of keywordTokens(query)) {
    if (includesTerm(text, token)) score += 8
    if (includesTerm(name, token)) score += 14
  }
  let intentMatched = false
  let primaryIntentMatched = false
  for (const intent of intents) {
    if ((INTENT_TERMS[intent] || []).some(term => includesTerm(intentText, term))) {
      intentMatched = true
      if (intent === intents[0]) primaryIntentMatched = true
      score += intent === intents[0] ? 48 : 18
    }
  }
  for (const category of categories) if (includesTerm(text, category)) score += 35
  if (location && physicallyLocatedIn(resource, location)) score += 70
  else if (location && servesLocation(resource, location)) score += 42
  else if (location && text.includes(normalized(location))) score += 22
  if (province && resourceProvince === province) score += 28
  if (resourceProvince === "Canada-wide") score += 4
  if (readiness?.mobile_ready) score += 18
  if (/\bfamil(?:y|ies)\b/.test(normalized(query)) && /family|caregiver|loved one/.test(normalized(intentText))) score += 42
  if (/indigenous|first nations|métis|metis|inuit/.test(normalized(query)) && /indigenous|first nations|métis|metis|inuit/.test(normalized(intentText))) score += 42
  if (intents.length && !intentMatched) score -= 100
  else if (intents.length > 1 && !primaryIntentMatched) score -= 40
  return score
}

function compactSource(resource) {
  const source = resource?.source && typeof resource.source === "object" ? resource.source : {}
  return {
    authority: clean(source.authority || resource.sourceAuthority || resource.organization),
    url: clean(source.url || resource.sourceUrl || resource.website),
    verification_status: clean(resource.verification_status || "verified_public"),
    last_verified: clean(resource.location_last_verified || resource.last_verified),
  }
}

function normalizedCard(resource, readiness, location = "") {
  const source = compactSource(resource)
  const scope = scopeFor(resource)
  const relationship = locationRelationship(resource, location)
  return {
    canonical_id: clean(resource.id),
    name: clean(resource.name),
    organization: clean(resource.organization),
    category: clean(resource.category || resource.serviceType || "Practical support"),
    service_type: clean(resource.serviceType),
    description: conciseResourceDescription(resource.description),
    province: provinceFor(resource),
    city: cityFor(resource),
    region: clean(resource.region),
    address: clean(resource.address),
    physical_location: scope.physical_location ? {
      community: clean(scope.physical_location.community),
      address: clean(scope.physical_location.address),
      province: clean(scope.physical_location.province),
    } : null,
    local_service_area: scope.local_service_area,
    regional_service_area: scope.regional_service_area,
    province_wide: scope.province_wide,
    canada_wide: scope.canada_wide,
    virtual: scope.virtual,
    navigation_only: scope.navigation_only,
    travel_required: scope.travel_required,
    scope_note: scope.scope_note,
    access_pathway: resource?.accessPathway && typeof resource.accessPathway === "object" ? resource.accessPathway : null,
    location_relationship: relationship.code,
    location_label: relationship.label,
    phone: clean(resource.phone),
    email: clean(resource.email),
    website: clean(resource.website),
    access_note: clean(resource.accessType),
    access_type: clean(resource.accessType),
    referral_note: clean(resource.referralNote),
    eligibility_note: clean(resource.eligibility),
    funding_note: clean(resource.fundingType),
    transportation_note: clean(resource.transportationNote),
    verified_status: source.verification_status,
    last_verified: source.last_verified,
    source_url: source.url,
    mobile_ready: Boolean(readiness?.mobile_ready),
    tags: [...new Set([resource.serviceType, resource.category, ...(resource.tags || [])].map(clean).filter(Boolean))].slice(0, 8),
    source,
  }
}

function isExactLocationResource(resource, location) {
  return physicallyLocatedIn(resource, location)
}

function isNavigationResource(resource) {
  return resource?.navigationOnly === true || /navigation|helpline|access line|service finder|211|811/.test(normalized(millerResourceSearchText(resource)))
}

function guidancePayload(intelligence) {
  const guidance = intelligence.guidance || {}
  return {
    title: clean(guidance.heading || "Miller's practical guidance"),
    interpretation: clean(guidance.interpretation),
    context: clean(intelligence.combined_context || guidance.explanation),
    next_step: clean(guidance.next_step),
    access_note: clean(guidance.access_note?.text || guidance.access_note),
    navigation_note: clean(guidance.navigation_note?.text || guidance.navigation_note),
    related_collections: intelligence.related_collections || [],
    safeguards: [
      "Confirm current intake, eligibility, and availability with the service.",
      "Miller does not make clinical or legal decisions.",
    ],
  }
}

export function buildMillerMobileSearchResponse(input, catalog, { now = () => new Date() } = {}) {
  const request = validateMillerMobileSearchRequest(input)
  const resources = catalog.filter(isMillerPracticalPublicResource)
  const location = request.location || detectedLocation(request.query, resources)
  const locationResource = location
    ? resources.find(resource => normalized(cityFor(resource)) === normalized(location))
    : null
  const locationProvince = locationResource ? provinceFor(locationResource) : ""
  const province = request.province || detectedProvince(request.query) || locationProvince || provinceForLocation(location)
  const intents = detectMillerPracticalIntents(request.query)
  const evaluatedAt = now()
  const readiness = buildMobileReadinessIndex(resources, { now: evaluatedAt })
  const ranked = resources
    .map(resource => ({ resource, score: scoreResource(resource, { ...request, location, province, intents, readiness: readiness.get(clean(resource.id)) }) }))
    .filter(item => item.score > 10 && matchesAnyIntent(item.resource, intents))
    .sort((left, right) => right.score - left.score || clean(left.resource.name).localeCompare(clean(right.resource.name)))
  const exactLocation = ranked.filter(({ resource }) => resource?.navigationOnly !== true && isExactLocationResource(resource, location) && directlyRepresentsIntent(resource, intents[0]))
  const directlyRelevant = ranked.filter(({ resource }) => {
    if (isExactLocationResource(resource, location)) return true
    if (servesLocation(resource, location)) return true
    return !location && (!province || [province, "Canada-wide"].includes(provinceFor(resource)))
  })
  const geographicallyRelevant = ranked.filter(({ resource }) => {
    if (directlyRelevant.some(item => item.resource === resource)) return true
    if (province && [province, "Canada-wide"].includes(provinceFor(resource))) return true
    return !location && !province
  })
  const navigationFallback = resources
    .filter(resource => isNavigationResource(resource) && (!province || [province, "Canada-wide"].includes(provinceFor(resource))))
    .map(resource => ({ resource, score: scoreResource(resource, { ...request, location, province, intents, readiness: readiness.get(clean(resource.id)) }) }))
    .sort((left, right) => right.score - left.score || clean(left.resource.name).localeCompare(clean(right.resource.name)))
  const localNavigationFallback = location
    ? navigationFallback.filter(({ resource }) => servesLocation(resource, location))
    : []
  const orderedNavigationFallback = [
    ...localNavigationFallback,
    ...navigationFallback.filter(item => !localNavigationFallback.some(existing => existing.resource === item.resource)),
  ]
  const basePool = location && !request.broaden_nearby
    ? [...directlyRelevant, ...orderedNavigationFallback.filter(item => !directlyRelevant.some(existing => existing.resource === item.resource))]
    : geographicallyRelevant
  const pool = basePool.length ? basePool : ranked.length ? ranked : orderedNavigationFallback
  const selected = pool.slice(0, request.limit).map(item => item.resource)
  const serviceAreaMatches = ranked.filter(({ resource }) => !isExactLocationResource(resource, location) && servesLocation(resource, location))
  const intelligence = buildMillerPracticalIntelligence({
    query: request.query,
    results: selected,
    resources,
  })
  const cards = explainMillerProfessionalResults(selected.map(resource => normalizedCard(resource, readiness.get(clean(resource.id)), location)), decomposeMillerProfessionalNeeds(request.query, intents))
  const needs = decomposeMillerProfessionalNeeds(request.query, intents)
  const searchScope = {
    exact_location_matches: exactLocation.length,
    physical_location_matches: exactLocation.length,
    service_area_matches: serviceAreaMatches.length,
    no_verified_local_facility: Boolean(location && exactLocation.length === 0),
    geography_broadened: request.broaden_nearby,
    mode: !location
      ? province ? "province" : "canadian_foundation"
      : request.broaden_nearby ? "broadened_nearby"
        : exactLocation.length ? "local_first"
          : serviceAreaMatches.length ? "regional_pathway" : "navigation_only",
    message: location && exactLocation.length === 0
      ? `I didn't find a verified ${clean(intelligence.primary_intent || "service").replaceAll("_", " ")} facility physically located in ${location} in Miller's current data. ${serviceAreaMatches.length ? "The regional services and intake options below serve the community or can help identify the appropriate option." : `Verified ${province || "provincial"} navigation options are included instead.`}`
      : request.broaden_nearby
        ? `Results were broadened beyond ${location} using verified service areas and other ${province || "provincial"} options.`
        : "",
  }
  const broadenCandidates = location ? geographicallyRelevant.filter(item => !directlyRelevant.some(existing => existing.resource === item.resource)) : []
  const coverageLevel = MILLER_COVERAGE_MATURITY[province] || "foundation"
  const accessBroadening = Boolean(location && (cards.some(card => card.travel_required || card.access_pathway?.transportation_pathway)
    || ["Yukon", "Northwest Territories", "Nunavut"].includes(province)))
  const coverageMessage = ["foundation", "exploratory"].includes(coverageLevel)
    ? `Miller's coverage in ${province || "this region"} is ${coverageLevel}. These are the verified options currently available.`
    : ""
  return Object.freeze({
    contract: MILLER_MOBILE_API_VERSION,
    generated_at: evaluatedAt.toISOString(),
    interpreted: {
      primary_intent: intelligence.primary_intent,
      secondary_intents: intelligence.secondary_intents,
      location: location || null,
      province: province || null,
    },
    guidance: guidancePayload(intelligence),
    search_scope: searchScope,
    coverage_maturity: {
      level: coverageLevel,
      message: coverageMessage,
    },
    broaden_nearby: {
      available: Boolean(!request.broaden_nearby && broadenCandidates.length),
      applied: request.broaden_nearby,
      additional_match_count: broadenCandidates.length,
      label: request.broaden_nearby ? "Showing broader access options" : accessBroadening ? "Show regional options" : "Broaden nearby",
      behavior: accessBroadening ? "broaden_access" : "broaden_nearby",
    },
    workflow: {
      intent: millerProfessionalWorkflowIntent(request.query, needs),
      needs,
      pathway: buildMillerAccessPathway({ results: cards, needs, searchScope }),
      recommended_pack_ids: recommendedMillerPackIds(cards, needs),
      target: "understand_navigate_handoff",
    },
    result_count: pool.length,
    returned_count: selected.length,
    results: cards,
    privacy: {
      query_stored: false,
      client_record_created: false,
      patient_identifiers_requested: false,
    },
    source_policy: "verified_original_miller_practical_resources_only",
  })
}

export function buildMillerMobileInventory(catalog) {
  const counts = Object.fromEntries(Object.keys(MILLER_COVERAGE_MATURITY).map(province => [province, 0]))
  for (const resource of catalog.filter(isMillerPracticalPublicResource)) {
    const province = provinceFor(resource)
    counts[province] = (counts[province] || 0) + 1
  }
  const publicCatalog = catalog.filter(isMillerPracticalPublicResource)
  return Object.freeze({
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    by_province: counts,
    coverage_maturity: MILLER_COVERAGE_MATURITY,
    readiness: mobileReadinessSummary(publicCatalog),
  })
}

export function buildMillerMobileSharePack(response, selectedCanonicalIds = []) {
  const allowed = new Set(selectedCanonicalIds.map(clean).filter(Boolean))
  const resources = (response?.results || [])
    .filter(resource => !allowed.size || allowed.has(clean(resource.canonical_id)))
    .map(resource => ({
      name: clean(resource.name),
      organization: clean(resource.organization),
      location: clean(resource.location_label || [resource.address, resource.city, resource.province].filter(Boolean).join(" · ")),
      physical_location: clean(resource.physical_location?.community
        ? [resource.physical_location.address, resource.physical_location.community, resource.physical_location.province].filter(Boolean).join(", ")
        : ""),
      service_scope: clean(resource.scope_note || resource.regional_service_area?.join(", ") || resource.local_service_area?.join(", ") || (resource.province_wide ? `${resource.province} province-wide` : "")),
      phone: clean(resource.phone),
      website: clean(resource.website),
      access_note: clean(resource.referral_note || resource.access_note),
      pathway: resource.access_pathway ? {
        local_access_point: clean(resource.access_pathway.local_access_point),
        regional_intake: clean(resource.access_pathway.regional_intake),
        destination_service: clean(resource.access_pathway.destination_service),
        transportation_pathway: clean(resource.access_pathway.transportation_pathway),
        funding_pathway: clean(resource.access_pathway.funding_pathway),
        return_home_support: Array.isArray(resource.access_pathway.return_home_support) ? resource.access_pathway.return_home_support.map(clean).filter(Boolean) : [],
        travel_required: resource.access_pathway.travel_required === true,
      } : null,
    }))
  const heading = resources.length === 1 ? "A resource that may help" : `${resources.length} resources that may help`
  const lines = [heading, clean(response?.guidance?.next_step), ""]
  resources.forEach((resource, index) => {
    lines.push(`${index + 1}. ${resource.name}${resource.organization ? ` — ${resource.organization}` : ""}`)
    if (resource.location) lines.push(resource.location)
    if (resource.physical_location && !resource.location.includes(resource.physical_location)) lines.push(`Physical location: ${resource.physical_location}`)
    if (resource.service_scope) lines.push(`Service area: ${resource.service_scope}`)
    if (resource.phone) lines.push(`Phone: ${resource.phone}`)
    if (resource.website) lines.push(`Website: ${resource.website}`)
    if (resource.access_note) lines.push(`Access: ${resource.access_note}`)
    if (resource.pathway?.regional_intake) lines.push(`Regional intake: ${resource.pathway.regional_intake}`)
    if (resource.pathway?.transportation_pathway) lines.push(`Travel support: ${resource.pathway.transportation_pathway}`)
    if (resource.pathway?.return_home_support?.length) lines.push(`After returning home: ${resource.pathway.return_home_support.join("; ")}`)
    lines.push("")
  })
  lines.push("Confirm current intake, eligibility and availability directly with each service.")
  return Object.freeze({
    title: heading,
    guidance: clean(response?.guidance?.next_step),
    resources,
    text: lines.join("\n").trim(),
  })
}
