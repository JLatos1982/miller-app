import { buildMillerPracticalIntelligence, detectMillerPracticalIntents, isMillerPracticalPublicResource } from "../src/millerPracticalIntelligence.js"
import { millerResourceSearchText } from "../src/millerPublicSearchResources.js"
import { conciseResourceDescription } from "../src/millerResultPresentation.js"
import { buildMobileReadinessIndex, mobileReadinessSummary } from "./millerMobileReadiness.js"
import { MILLER_CANADIAN_COMMUNITY_SERVICE_AREAS, MILLER_CANADIAN_LOCATION_LABELS, MILLER_CANADIAN_LOCATION_PROVINCES, MILLER_COVERAGE_MATURITY } from "./millerWesternCommunities.js"
import { buildMillerAccessPathway, decomposeMillerProfessionalNeeds, explainMillerProfessionalResults, millerProfessionalWorkflowIntent, recommendedMillerPackIds } from "./millerProfessionalWorkflow.js"
import { createMillerTavilySearcher } from "./millerExternalSearch.js"
import { accessLocationHeading, accessLocationPurpose } from "../src/navigatorPresentation.js"

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
  treatment: ["treatment", "residential", "outpatient", "rehab", "recovery program", "supportive recovery", "raac", "raam", "rapid access addiction medicine"],
  oat: ["oat", "opioid agonist", "methadone", "suboxone", "sublocade", "buprenorphine"],
  counselling: ["counselling", "counseling", "therapy"],
  harm_reduction: ["harm reduction", "naloxone", "overdose prevention", "safer use"],
  meetings: ["meeting", "peer support", "smart recovery", "alcoholics anonymous", "narcotics anonymous"],
  legal: ["legal", "legal aid", "advocacy", "tenancy", "rights", "courtworker"],
  recreation_support: ["recreation", "leisure", "sport", "aquatic"],
  emergency_support: ["emergency support", "evacuation", "disaster support"],
  dental_support: ["dental", "dentist", "oral health"],
  vision_support: ["vision", "optical", "glasses", "eye exam"],
  funding: ["funding", "financial assistance", "benefit", "benefits", "subsidy", "grant"],
  mental_health: ["mental health", "counselling", "psychiatric", "crisis"],
  safe_beds: ["safe bed", "safe beds", "crisis stabilization"],
  basic_needs: ["basic needs", "food", "clothing", "identification", "income"],
  transportation: ["transportation", "transport", "medical travel", "transit", "ride"],
  reentry: ["corrections reentry", "re entry", "reentry", "reintegration", "release planning"],
  primary_care: ["primary care", "family doctor", "nurse practitioner", "community health centre"],
  employment: ["employment", "job training", "skills training", "work readiness", "vocational"],
  indigenous_supports: ["indigenous support", "first nations support", "métis support", "metis support", "inuit support"],
  family_support: ["family support", "youth support", "caregiver support", "parent support"],
  disability: ["disability support", "accessibility support", "persons with disabilities"],
})

const INTENT_LABELS = Object.freeze({
  housing: "Housing", detox: "Detox", treatment: "Treatment", oat: "Opioid agonist treatment",
  counselling: "Counselling", harm_reduction: "Harm reduction", meetings: "Peer support",
  legal: "Legal navigation", funding: "Funding support", mental_health: "Mental-health support", safe_beds: "Safe-bed crisis stabilization",
  recreation_support: "Recreation support", emergency_support: "Emergency support",
  dental_support: "Dental support", vision_support: "Vision support",
  basic_needs: "Basic needs", transportation: "Transportation", reentry: "Re-entry support",
  primary_care: "Primary-care navigation", employment: "Employment or training support",
  indigenous_supports: "Indigenous-specific support", family_support: "Family or caregiver support",
  disability: "Disability support",
})

// These are deterministic request refinements, not a free-form client ontology.
// They let Navigator remove an interpretation chip without continuing to use it
// in retrieval or workflow decomposition.
const EXCLUDABLE_INTENTS = new Set([
  ...Object.keys(INTENT_TERMS),
  "family_support", "continuity", "access_navigation", "hospital_discharge",
  "primary_care", "wound_care", "infectious_disease", "pharmacy", "perinatal",
])

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
  const excluded_intents = Array.isArray(body.excluded_intents)
    ? [...new Set(body.excluded_intents.map(value => boundedString(value, 60, "excluded_intent")).filter(Boolean))].slice(0, 8)
    : []
  if (excluded_intents.some(intent => !EXCLUDABLE_INTENTS.has(intent))) throw new Error("excluded_intent_invalid")
  const requestedLimit = Number(body.limit ?? 12)
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) throw new Error("limit_invalid")
  return Object.freeze({
    query,
    location,
    province,
    categories,
    excluded_intents,
    ignore_detected_location: body.ignore_detected_location === true,
    limit: Math.min(requestedLimit, MILLER_MOBILE_RESULT_LIMIT),
    broaden_nearby: body.broaden_nearby === true || body.broaden_access === true,
    search_more_broadly: body.search_more_broadly === true,
  })
}

function removeExcludedIntentTerms(query, excludedIntents = []) {
  let result = clean(query)
  for (const intent of excludedIntents) {
    for (const term of INTENT_TERMS[intent] || []) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")
      result = result.replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ")
    }
  }
  return clean(result.replace(/\s+(and|or|with|for)\s*(?=$|[,.])/gi, " ").replace(/\s{2,}/g, " "))
}

function removeQueryPhrase(query, phrase) {
  const cleanedPhrase = clean(phrase)
  if (!cleanedPhrase) return clean(query)
  const escaped = cleanedPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")
  return clean(clean(query).replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ").replace(/\s{2,}/g, " "))
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
  // New canonical resources frequently carry their physical community through
  // normalized access locations rather than a legacy record-level city field.
  // Include those public, fixed-site city labels in location detection so a
  // newly verified small-community pathway is eligible for the same local
  // ranking as older records. This deliberately reads only public access
  // locations; it does not turn a regional claim into a fixed site.
  const accessLocationCities = resources.flatMap(resource => Array.isArray(resource?.accessLocations)
    ? resource.accessLocations.map(accessLocation => clean(accessLocation?.city)).filter(Boolean)
    : [])
  const cities = [...new Set([...resources.map(cityFor).filter(Boolean), ...accessLocationCities, ...Object.keys(MILLER_CANADIAN_LOCATION_PROVINCES)])]
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
    // "on" is common prose and must not silently narrow a request to Ontario.
    // Keep the abbreviation usable when it is written as the conventional
    // uppercase province code; explicit request.province continues to accept
    // either case through normalizeMobileProvince().
    if (alias === "on" && !/(^|\s)ON(?=\s|$|[,.;:])/u.test(clean(query))) continue
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

function directIntentSearchText(resource) {
  // Access instructions can mention another service as a referral option.
  // Keep that helpful prose searchable, but do not let it redefine the
  // program's own clinical identity for an explicit specialty query.
  return [
    resource?.name,
    resource?.serviceType,
    resource?.category,
    ...(resource?.tags || []),
  ].map(clean).join(" ")
}

function matchesAnyIntent(resource, intents) {
  if (!intents.length) return true
  const text = intentSearchText(resource)
  return intents.some(intent => (INTENT_TERMS[intent] || []).some(term => includesTerm(text, term)))
}

const HEALTHCARE_ADJACENT_QUERY_TERMS = Object.freeze([
  "family doctor", "primary care", "nurse practitioner", "hospital discharge", "discharged from hospital",
  "leaving hospital", "patient navigator", "wound", "abscess", "skin infection", "hepatitis", "hep c",
  "hiv", "infectious disease", "stbbi", "pharmacy", "pharmacist", "pregnant", "pregnancy", "perinatal",
  "medical travel", "health system navigation",
])

function healthcareAdjacentQueryMatch(resource, query) {
  if (resource?.resourceLayer !== "healthcare_adjacent_support") return false
  const resourceText = intentSearchText(resource)
  return HEALTHCARE_ADJACENT_QUERY_TERMS.some(term => includesTerm(query, term) && includesTerm(resourceText, term))
}

function healthcareAdjacentRelevant(resource, query, intents) {
  if (resource?.resourceLayer !== "healthcare_adjacent_support") return true
  const queryText = normalized(query)
  if (HEALTHCARE_ADJACENT_QUERY_TERMS.some(term => queryText.includes(normalized(term)))) return true
  const resourceText = intentSearchText(resource)
  return intents.some(intent => ["detox", "oat", "treatment", "harm_reduction", "mental_health"].includes(intent)
    && (INTENT_TERMS[intent] || []).some(term => includesTerm(resourceText, term)))
}

function directlyRepresentsIntent(resource, intent) {
  if (!intent) return true
  const text = directIntentSearchText(resource)
  if ((INTENT_TERMS[intent] || []).some(term => includesTerm(text, term))) return true
  // A verified local addiction/withdrawal intake can be the frontline entry
  // pathway for an explicit OAT request even when the public facility page
  // does not promise or name OAT itself. This only affects prioritization of
  // a fixed local pathway; it does not label the service as OAT.
  return intent === "oat" && /addiction|substance use|withdrawal/.test(normalized(`${resource?.description || ""} ${resource?.population || ""} ${resource?.accessType || ""} ${text}`))
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

function isVariableOrNonfixedAccessLocation(accessLocation) {
  const type = normalized(accessLocation?.type)
  // A scheduled distribution can still be a fixed, useful site (for example a
  // food bank with weekly hours). Exclude mobile/variable routes and stops,
  // but retain a type that explicitly identifies a fixed scheduled site.
  return /\b(mobile|variable)\b/.test(type) || (/\bscheduled\b/.test(type) && !/\bfixed\b/.test(type))
}

function physicallyLocatedIn(resource, location) {
  if (!location) return false
  const scope = scopeFor(resource)
  if (normalized(scope.physical_location?.community) === normalized(location)) return true
  // Canonical access locations are the public, normalized representation of a
  // program's fixed client sites. Treat them as genuinely local for ranking,
  // while leaving scheduled/mobile stops out so a variable route is never
  // turned into a permanent local clinic.
  if (scope.virtual || scope.navigation_only) return false
  return (resource?.accessLocations || []).some(accessLocation => {
    return normalized(accessLocation?.city) === normalized(location)
      && !isVariableOrNonfixedAccessLocation(accessLocation)
  })
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
  const serviceAreaAliases = MILLER_CANADIAN_COMMUNITY_SERVICE_AREAS[normalized(location)] || []
  if (areas.some(area => serviceAreaAliases.some(alias => normalized(area) === normalized(alias)))) return true
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
  if (scope.virtual && scope.local_service_area.length) return { code: "local_pathway", label: `Local pathway in ${scope.local_service_area.join(", ")}` }
  if (scope.virtual && scope.regional_service_area.length) return { code: "regional_service", label: `Regional service: ${scope.regional_service_area.join(", ")}` }
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
  // A query naming a specific continuity-of-care need (for example wound
  // care) should retain the matching supporting service when a larger
  // verified clinical layer would otherwise crowd it out. This remains
  // query-gated and does not promote adjacent services for ordinary
  // addiction searches.
  if (healthcareAdjacentQueryMatch(resource, query)) score += 300
  if (/\bfamil(?:y|ies)\b/.test(normalized(query)) && /family|caregiver|loved one/.test(normalized(intentText))) score += 42
  if (/indigenous|first nations|métis|metis|inuit/.test(normalized(query)) && /indigenous|first nations|métis|metis|inuit/.test(normalized(intentText))) score += 42
  // When a query expressly asks for a young person, prioritize a pathway
  // whose published population is youth. Conversely, a youth-only route
  // should not displace a local general/adult pathway for an age-unspecified
  // addiction request merely because both mention substance use. This is a
  // relevance adjustment only: youth pathways remain available in results.
  const queryText = normalized(query)
  const youthQuery = /\b(?:youth|teen|teens|adolescent|adolescents|child|children|young person|young people)\b/.test(queryText)
  const youthSpecific = /\b(?:youth|teen|teens|adolescent|adolescents|child|children)\b/.test(normalized(`${resource?.serviceType || ""} ${resource?.name || ""} ${(resource?.tags || []).join(" ")}`))
  if (youthQuery && youthSpecific) score += 42
  if (!youthQuery && youthSpecific) score -= 30
  // A query explicitly asking for mobile outreach should favor an actually
  // mobile pathway over a fixed program that merely offers referrals. This
  // is a relevance adjustment only; the result card still states whether
  // the route is variable and requires current confirmation.
  if (/\bmobile\b/.test(normalized(query)) && /\bmobile\b/.test(normalized(intentText))) score += 30
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
  // A program can be correctly modeled without a single parent street address
  // while still having a verified normalized fixed access location. When a
  // requested community matches one of those sites, surface that actual site
  // on the card rather than leaving a misleading "located here" label with no
  // physical location detail. Variable/scheduled/mobile stops remain excluded.
  const localAccessLocation = !scope.physical_location && location && !scope.virtual && !scope.navigation_only
    ? (resource?.accessLocations || []).find(accessLocation => normalized(accessLocation?.city) === normalized(location)
      && !isVariableOrNonfixedAccessLocation(accessLocation))
    : null
  const cardPhysicalLocation = scope.physical_location || (localAccessLocation ? {
    community: clean(localAccessLocation.city),
    address: clean(localAccessLocation.address),
    province: clean(localAccessLocation.province || provinceFor(resource)),
  } : null)
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
    physical_location: cardPhysicalLocation ? {
      community: clean(cardPhysicalLocation.community),
      address: clean(cardPhysicalLocation.address),
      province: clean(cardPhysicalLocation.province),
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
    resource_layer: clean(resource.resourceLayer || "core"),
    workflow_relevance: Array.isArray(resource.workflowRelevance) ? resource.workflowRelevance.map(clean).filter(Boolean) : [],
    languages: Array.isArray(resource.languages) ? resource.languages.map(clean).filter(Boolean) : [],
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
    collection_links: Array.isArray(resource.collectionLinks) ? resource.collectionLinks.map(link => ({ href: clean(link?.href), label: clean(link?.label) })).filter(link => link.href && link.label) : [],
    access_locations: Array.isArray(resource.accessLocations) ? resource.accessLocations.map(location => ({
      id: clean(location.id),
      name: clean(location.name),
      type: clean(location.type),
      address: clean(location.address),
      city: clean(location.city),
      province: clean(location.province),
      access_role: clean(location.accessRole),
      source_url: clean(location.sourceUrl),
      last_verified: clean(location.lastVerified),
      map_status: clean(location.mapStatus),
    })).filter(location => location.id && location.name && location.address) : [],
    source,
    result_origin: "verified_miller",
    external_label: "",
  }
}

function queryConceptCoverage(resource, query) {
  const generic = new Set(["adult", "fictional", "service", "services", "support", "program", "programs", "want", "looking", "entering"])
  const concepts = keywordTokens(query).filter(concept => !generic.has(concept))
  if (!concepts.length) return 0
  const text = millerResourceSearchText(resource)
  return concepts.filter(concept => includesTerm(text, concept)).length / concepts.length
}

function deterministicMatchState({ item, query, location, intents, direct }) {
  const resource = item.resource
  const primaryMatched = intents.length > 0 && directlyRepresentsIntent(resource, intents[0])
  const local = !location || isExactLocationResource(resource, location)
  const serves = !location || servesLocation(resource, location)
  const coverage = queryConceptCoverage(resource, query)
  if (direct && primaryMatched && local && coverage >= 0.5) return "strong_match"
  if (direct && primaryMatched && serves && coverage >= 0.5) return "reasonable_match"
  return "broader_alternative"
}

// This is intentionally a short field-level explanation, not a score or an
// eligibility conclusion. It is emitted only for a direct deterministic match.
function directMatchReasons({ resource, query, location, intents, matchState }) {
  if (!["strong_match", "reasonable_match"].includes(matchState)) return []
  const reasons = []
  const relationship = locationRelationship(resource, location)
  if (location && relationship?.label) reasons.push(relationship.label)
  const primaryIntent = intents[0]
  if (primaryIntent && directlyRepresentsIntent(resource, primaryIntent)) reasons.push(`Matches ${INTENT_LABELS[primaryIntent] || primaryIntent.replaceAll("_", " ")}`)
  const queryText = normalized(query)
  if (scopeFor(resource).virtual && /\b(virtual|online|by phone|telephone)\b/.test(queryText)) reasons.push("Virtual service information")
  if (primaryIntent === "transportation" && clean(resource.transportationNote)) reasons.push("Transportation information available")
  if (primaryIntent === "funding" && clean(resource.fundingType)) reasons.push("Funding information available")
  return [...new Set(reasons)].slice(0, 3)
}

function matchPresentation({ selectedItems, query, location, intents }) {
  const labelled = selectedItems.map(item => ({ ...item, match_state: deterministicMatchState({ item, query, location, intents, direct: intents.length > 0 && (!location || servesLocation(item.resource, location)) }) }))
  const direct = labelled.filter(item => item.match_state !== "broader_alternative")
  const broader = labelled.filter(item => item.match_state === "broader_alternative")
  const state = direct.some(item => item.match_state === "strong_match") ? "strong_match"
    : direct.length ? "reasonable_match"
      : "no_verified_match"
  const message = state === "no_verified_match"
    ? "No strong verified match was found in Miller's current public resources. Broader verified options are shown separately and may still be useful."
    : state === "reasonable_match"
      ? "Miller found verified options that match the need and service area, but not an exact local match."
      : "Miller found verified options that directly match the need and location."
  return { state, message, direct, broader }
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
  const detectedQueryLocation = detectedLocation(request.query, resources)
  const withoutExcludedIntents = removeExcludedIntentTerms(request.query, request.excluded_intents)
  const effectiveQuery = request.ignore_detected_location
    ? removeQueryPhrase(withoutExcludedIntents, detectedQueryLocation)
    : withoutExcludedIntents
  const location = request.location || (request.ignore_detected_location ? "" : detectedQueryLocation)
  const locationResource = location
    ? resources.find(resource => normalized(cityFor(resource)) === normalized(location) || physicallyLocatedIn(resource, location))
    : null
  const locationProvince = locationResource ? provinceFor(locationResource) : ""
  const province = request.province || (request.ignore_detected_location ? "" : detectedProvince(request.query)) || locationProvince || provinceForLocation(location)
  const rawIntents = detectMillerPracticalIntents(request.query)
  const intents = rawIntents.filter(intent => !request.excluded_intents.includes(intent))
  const explicitRaamQuery = /\b(?:raam|rapid access addiction medicine)\b/i.test(effectiveQuery)
  if (rawIntents.length && !intents.length) throw new Error("effective_intent_required")
  const evaluatedAt = now()
  const readiness = buildMobileReadinessIndex(resources, { now: evaluatedAt })
  const ranked = resources
    .filter(resource => healthcareAdjacentRelevant(resource, effectiveQuery, intents))
    .map(resource => ({ resource, score: scoreResource(resource, { ...request, query: effectiveQuery, location, province, intents, readiness: readiness.get(clean(resource.id)) }) }))
    // Keep a verified fixed local addiction/withdrawal intake in contention for
    // an explicit local OAT request even when its public wording does not name
    // OAT. This is an access-ranking exception, not an assertion that the
    // service itself provides OAT; the card continues to show only its
    // source-backed description and intake instructions.
    .filter(item => item.score > 10 && (matchesAnyIntent(item.resource, intents)
      || healthcareAdjacentQueryMatch(item.resource, effectiveQuery)
      || (location && isExactLocationResource(item.resource, location) && directlyRepresentsIntent(item.resource, intents[0]))))
    .sort((left, right) => right.score - left.score || clean(left.resource.name).localeCompare(clean(right.resource.name)))
  const exactLocation = ranked.filter(({ resource }) => resource?.navigationOnly !== true
    && isExactLocationResource(resource, location)
    && directlyRepresentsIntent(resource, intents[0])
    // A general counselling or navigation record can mention a separate RAAM
    // in its access instructions. For an explicit RAAM query, that incidental
    // reference must not outrank the actual local RAAM pathway.
    && (!explicitRaamQuery || /\b(?:raam|rapid access addiction medicine)\b/i.test(normalized(directIntentSearchText(resource)))))
  // Keep the stricter measure for the coverage message: a local
  // addiction/withdrawal intake may be the best first referral for OAT, but
  // it must not be presented as a verified local OAT clinic unless the
  // service's published fields actually match the OAT intent.
  const explicitIntentExactLocation = ranked.filter(({ resource }) => resource?.navigationOnly !== true
    && isExactLocationResource(resource, location)
    && matchesAnyIntent(resource, intents)
    && (!explicitRaamQuery || /\b(?:raam|rapid access addiction medicine)\b/i.test(normalized(directIntentSearchText(resource)))))
  const directlyRelevant = ranked.filter(({ resource }) => {
    if (isExactLocationResource(resource, location)) return !explicitRaamQuery || /\b(?:raam|rapid access addiction medicine)\b/i.test(normalized(directIntentSearchText(resource)))
    if (servesLocation(resource, location)) return true
    return !location && (!province || [province, "Canada-wide"].includes(provinceFor(resource)))
  })
  const geographicallyRelevant = ranked.filter(({ resource }) => {
    if (directlyRelevant.some(item => item.resource === resource)) return true
    if (province && [province, "Canada-wide"].includes(provinceFor(resource))) return true
    return !location && !province
  })
  const navigationFallback = resources
    .filter(resource => healthcareAdjacentRelevant(resource, effectiveQuery, intents)
      && isNavigationResource(resource)
      && (!province || [province, "Canada-wide"].includes(provinceFor(resource))))
    .map(resource => ({ resource, score: scoreResource(resource, { ...request, query: effectiveQuery, location, province, intents, readiness: readiness.get(clean(resource.id)) }) }))
    .sort((left, right) => right.score - left.score || clean(left.resource.name).localeCompare(clean(right.resource.name)))
  const localNavigationFallback = location
    ? navigationFallback.filter(({ resource }) => servesLocation(resource, location))
    : []
  // For an explicit community query, a verified fixed/local pathway that
  // directly represents the requested service must lead broader regional or
  // province-wide coverage. `exactLocation` is deliberately intent-gated, so
  // this does not override age, eligibility, or service-type matching.
  const prioritizedDirectlyRelevant = location && exactLocation.length
    ? [...exactLocation, ...directlyRelevant.filter(item => !exactLocation.some(exact => exact.resource === item.resource))]
    : directlyRelevant
  const orderedNavigationFallback = [
    ...localNavigationFallback,
    ...navigationFallback.filter(item => !localNavigationFallback.some(existing => existing.resource === item.resource)),
  ]
  const basePool = location && !request.broaden_nearby
    ? [...prioritizedDirectlyRelevant, ...orderedNavigationFallback.filter(item => !prioritizedDirectlyRelevant.some(existing => existing.resource === item.resource))]
    : geographicallyRelevant
  const pool = basePool.length ? basePool : ranked.length ? ranked : orderedNavigationFallback
  // Preserve a directly matching healthcare-adjacent route in the finite
  // result window for an explicitly related query. The normal addiction
  // search has no such match, so it remains focused on core services.
  const matchingAdjacent = pool.filter(item => healthcareAdjacentQueryMatch(item.resource, effectiveQuery))
  const presentationPool = matchingAdjacent.length
    ? [...matchingAdjacent, ...pool.filter(item => !matchingAdjacent.includes(item))]
    : pool
  const selectedItems = presentationPool.slice(0, request.limit)
  const selected = selectedItems.map(item => item.resource)
  const serviceAreaMatches = ranked.filter(({ resource }) => !isExactLocationResource(resource, location) && servesLocation(resource, location))
  const intelligence = buildMillerPracticalIntelligence({
    query: effectiveQuery,
    results: selected,
    resources,
  })
  const presentation = matchPresentation({ selectedItems, query: effectiveQuery, location, intents })
  const needs = decomposeMillerProfessionalNeeds(effectiveQuery, intents, { excludedNeedIds: request.excluded_intents })
  const cardsById = new Map(explainMillerProfessionalResults(selected.map(resource => normalizedCard(resource, readiness.get(clean(resource.id)), location)), needs).map(card => [card.canonical_id, card]))
  const cards = selectedItems.map(item => {
    const match_state = presentation.direct.some(candidate => candidate.resource === item.resource)
      ? deterministicMatchState({ item, query: effectiveQuery, location, intents, direct: true })
      : "broader_alternative"
    return {
      ...cardsById.get(clean(item.resource.id)),
      match_state,
      match_reasons: directMatchReasons({ resource: item.resource, query: effectiveQuery, location, intents, matchState: match_state }),
    }
  })
  const searchScope = {
    exact_location_matches: exactLocation.length,
    physical_location_matches: explicitIntentExactLocation.length,
    service_area_matches: serviceAreaMatches.length,
    no_verified_local_facility: Boolean(location && explicitIntentExactLocation.length === 0),
    geography_broadened: request.broaden_nearby,
    mode: !location
      ? province ? "province" : "canadian_foundation"
      : request.broaden_nearby ? "broadened_nearby"
        : exactLocation.length ? "local_first"
          : serviceAreaMatches.length ? "regional_pathway" : "navigation_only",
    message: location && explicitIntentExactLocation.length === 0
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
    match_state: {
      state: presentation.state,
      message: presentation.message,
      direct_result_count: presentation.direct.length,
      broader_alternative_count: presentation.broader.length,
      rules_version: "deterministic-public-match-v1",
    },
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
    direct_results: cards.filter(card => card.match_state !== "broader_alternative"),
    broader_alternatives: cards.filter(card => card.match_state === "broader_alternative"),
    privacy: {
      query_stored: false,
      client_record_created: false,
      patient_identifiers_requested: false,
    },
    source_policy: "verified_original_miller_practical_resources_only",
  })
}

const EXTERNAL_GAP_NEEDS = new Set(["housing", "transportation", "funding", "counselling", "legal", "basic_needs", "reentry"])

export function assessMillerExternalSearchGate(response, request = {}) {
  const verified = Array.isArray(response?.results) ? response.results : []
  const needs = Array.isArray(response?.workflow?.needs) ? response.workflow.needs.map(item => item.need_id).filter(Boolean) : []
  const covered = new Set(verified.flatMap(item => item.matched_needs || []))
  const hasLocalOrRegionalPathway = verified.some(item => ["located_here", "serves_community", "regional_intake"].includes(item.location_relationship))
  const primary = response?.interpreted?.primary_intent
  const hasPrimaryMatch = !primary || verified.some(item => item.matched_needs?.includes(primary))
  const reasons = []
  if (request.search_more_broadly) reasons.push("user_requested_broader_search")
  if (response?.interpreted?.location && !hasLocalOrRegionalPathway) reasons.push("no_verified_local_results")
  if (["foundation", "exploratory"].includes(response?.coverage_maturity?.level) && (!hasLocalOrRegionalPathway || !hasPrimaryMatch)) reasons.push("low_coverage_region")
  if (needs.some(need => EXTERNAL_GAP_NEEDS.has(need) && !covered.has(need))) reasons.push("missing_need_category")
  if (!hasPrimaryMatch || !verified.length) reasons.push("weak_match_confidence")
  if (verified.length && !verified.some(item => item.phone || item.website || item.access_note || item.referral_note)) reasons.push("insufficient_access_information")
  return Object.freeze({
    should_search: reasons.length > 0,
    reasons: [...new Set(reasons)],
    verified_result_count: verified.length,
    has_local_or_regional_pathway: hasLocalOrRegionalPathway,
    primary_intent_match: hasPrimaryMatch,
  })
}

function hybridExternalNotice(external) {
  if (!external?.attempted) return ""
  if (external.status === "unavailable") return external.public_message || "I couldn’t complete the broader search, but the verified Miller resources are still available."
  if (!external.results?.length) return "I searched more broadly but did not find an additional public result suitable to show before verification."
  return "I found verified Miller options and searched more broadly because coverage or access information was limited. External results have not yet been verified by Miller."
}

export async function buildMillerHybridSearchResponse(input, catalog, {
  now = () => new Date(),
  externalSearcher = createMillerTavilySearcher(),
} = {}) {
  const request = validateMillerMobileSearchRequest(input)
  const internal = buildMillerMobileSearchResponse(request, catalog, { now })
  const gate = assessMillerExternalSearchGate(internal, request)
  const context = {
    location: internal.interpreted.location || "",
    province: internal.interpreted.province || "",
    intents: internal.workflow.needs.map(item => item.need_id),
  }
  const external = gate.should_search
    ? await externalSearcher.search(context, catalog)
    : { attempted: false, status: "not_needed", cache_status: "not_used", latency_ms: 0, results: [], estimated_cost_usd: 0, cost_status: "not_incurred" }
  const verifiedResults = internal.results.map(resource => ({ ...resource, result_origin: "verified_miller", external_label: "" }))
  const results = [...verifiedResults, ...(external.results || [])]
  return Object.freeze({
    ...internal,
    result_count: results.length,
    returned_count: results.length,
    results,
    verified_result_count: verifiedResults.length,
    external_result_count: external.results?.length || 0,
    search_strategy: {
      mode: external.attempted ? "verified_then_external" : "verified_deterministic",
      external_search_required: gate.should_search,
      external_search_reasons: gate.reasons,
      external_search_notice: hybridExternalNotice(external),
      deterministic_components: ["canonical_resource_lookup", "geography_semantics", "intent_matching", "verified_access_pathways", "pathway_sequencing", "resource_pack_selection"],
    },
    external_search: {
      attempted: external.attempted,
      status: external.status,
      cache_status: external.cache_status,
      latency_ms: external.latency_ms,
      result_count: external.results?.length || 0,
      estimated_cost_usd: external.estimated_cost_usd,
      cost_status: external.cost_status,
      failure_message: external.status === "unavailable" ? external.public_message : "",
      raw_query_retained: false,
    },
    privacy: {
      ...internal.privacy,
      external_query_stored: false,
      external_cache_uses_normalized_geography_and_needs_only: true,
    },
    source_policy: external.attempted
      ? "verified_miller_resources_plus_clearly_labeled_external_discovery"
      : "verified_original_miller_practical_resources_only",
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
      verification_status: clean(resource.verified_status || "verified_public"),
      access_locations: Array.isArray(resource.access_locations) ? resource.access_locations.map(location => ({
        name: clean(location.name),
        address: clean(location.address),
        city: clean(location.city),
        access_role: clean(location.access_role),
      })).filter(location => location.name && location.address) : [],
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
    if (resource.verification_status === "external_unverified") lines.push("External result — not yet verified by Miller")
    if (resource.location) lines.push(resource.location)
    if (resource.physical_location && !resource.location.includes(resource.physical_location)) lines.push(`Physical location: ${resource.physical_location}`)
    if (resource.service_scope) lines.push(`Service area: ${resource.service_scope}`)
    if (resource.phone) lines.push(`Phone: ${resource.phone}`)
    if (resource.website) lines.push(`Website: ${resource.website}`)
    if (resource.access_note) lines.push(`Access: ${resource.access_note}`)
    if (resource.access_locations?.length) {
      lines.push(`${accessLocationHeading(resource.access_locations)}:`)
      for (const location of resource.access_locations) lines.push(`- ${location.name}: ${location.address} — ${accessLocationPurpose(location)}`)
    }
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
