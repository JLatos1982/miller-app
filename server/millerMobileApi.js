import { buildMillerPracticalIntelligence, detectMillerPracticalIntents, isMillerPracticalPublicResource } from "../src/millerPracticalIntelligence.js"
import { millerResourceSearchText } from "../src/millerPublicSearchResources.js"
import { conciseResourceDescription } from "../src/millerResultPresentation.js"
import { buildMobileReadinessIndex, mobileReadinessSummary } from "./millerMobileReadiness.js"

export const MILLER_MOBILE_API_VERSION = "miller-mobile-search-v1"
export const MILLER_MOBILE_RESULT_LIMIT = 20

const PROVINCES = Object.freeze({
  bc: "British Columbia",
  "british columbia": "British Columbia",
  ab: "Alberta",
  alberta: "Alberta",
  sk: "Saskatchewan",
  saskatchewan: "Saskatchewan",
  canada: "Canada-wide",
  national: "Canada-wide",
  "canada wide": "Canada-wide",
})

const INTENT_TERMS = Object.freeze({
  housing: ["housing", "shelter", "homeless", "supportive housing", "recovery housing"],
  detox: ["detox", "withdrawal", "withdrawal management"],
  treatment: ["treatment", "residential", "outpatient", "rehab", "recovery program"],
  oat: ["oat", "opioid agonist", "methadone", "suboxone", "sublocade", "buprenorphine"],
  counselling: ["counselling", "counseling", "therapy", "mental health"],
  harm_reduction: ["harm reduction", "naloxone", "overdose prevention", "safer use"],
  meetings: ["meeting", "peer support", "smart recovery", "alcoholics anonymous", "narcotics anonymous"],
  legal: ["legal", "legal aid", "advocacy", "tenancy", "rights", "courtworker"],
  funding: ["funding", "financial assistance", "benefit", "subsidy", "grant"],
  mental_health: ["mental health", "counselling", "psychiatric", "crisis"],
  basic_needs: ["basic needs", "food", "clothing", "identification", "income"],
  transportation: ["transportation", "transport", "medical travel", "transit", "ride"],
  reentry: ["corrections reentry", "re entry", "reentry", "reintegration", "release planning"],
})

const WESTERN_CITY_PROVINCES = Object.freeze({
  abbotsford: "British Columbia",
  burnaby: "British Columbia",
  kelowna: "British Columbia",
  nanaimo: "British Columbia",
  surrey: "British Columbia",
  vancouver: "British Columbia",
  victoria: "British Columbia",
  calgary: "Alberta",
  edmonton: "Alberta",
  lethbridge: "Alberta",
  "medicine hat": "Alberta",
  "red deer": "Alberta",
  lloydminster: "Alberta",
  "moose jaw": "Saskatchewan",
  "north battleford": "Saskatchewan",
  "prince albert": "Saskatchewan",
  regina: "Saskatchewan",
  saskatoon: "Saskatchewan",
})

const clean = value => String(value ?? "").replace(/\s+/g, " ").trim()
const normalized = value => clean(value).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9]+/g, " ").trim()

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
  })
}

function provinceFor(resource) {
  const explicit = normalizeMobileProvince(resource?.province)
  if (explicit) return explicit
  const haystack = normalized(`${resource?.region || ""} ${resource?.service_area || ""}`)
  if (/\balberta\b|\bab\b/.test(haystack)) return "Alberta"
  if (/\bsaskatchewan\b|\bsk\b/.test(haystack)) return "Saskatchewan"
  if (/\bcanada\b|federal|national/.test(haystack)) return "Canada-wide"
  return "British Columbia"
}

function cityFor(resource) {
  return clean(resource?.city || resource?.city_community)
}

function detectedLocation(query, resources) {
  const haystack = ` ${normalized(query)} `
  const cities = [...new Set([...resources.map(cityFor).filter(Boolean), ...Object.keys(WESTERN_CITY_PROVINCES)])]
    .sort((left, right) => right.length - left.length)
  const match = cities.find(city => haystack.includes(` ${normalized(city)} `)) || ""
  if (!match || !Object.hasOwn(WESTERN_CITY_PROVINCES, normalized(match))) return match
  return normalized(match).split(" ").map(word => `${word[0].toUpperCase()}${word.slice(1)}`).join(" ")
}

function provinceForLocation(location) {
  return WESTERN_CITY_PROVINCES[normalized(location)] || ""
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

function scoreResource(resource, { query, location, province, categories, intents, readiness }) {
  const text = millerResourceSearchText(resource)
  const intentText = intentSearchText(resource)
  const name = normalized(resource.name)
  const resourceCity = normalized(cityFor(resource))
  const resourceProvince = provinceFor(resource)
  let score = resource.approved === false ? -1000 : 10
  for (const token of keywordTokens(query)) {
    if (includesTerm(text, token)) score += 8
    if (includesTerm(name, token)) score += 14
  }
  let intentMatched = false
  for (const intent of intents) {
    if ((INTENT_TERMS[intent] || []).some(term => includesTerm(intentText, term))) {
      intentMatched = true
      score += intent === intents[0] ? 48 : 18
    }
  }
  for (const category of categories) if (includesTerm(text, category)) score += 35
  if (location && resourceCity === normalized(location)) score += 70
  else if (location && text.includes(normalized(location))) score += 30
  if (province && resourceProvince === province) score += 28
  if (resourceProvince === "Canada-wide") score += 4
  if (readiness?.mobile_ready) score += 18
  if (/\bfamil(?:y|ies)\b/.test(normalized(query)) && /family|caregiver|loved one/.test(normalized(intentText))) score += 42
  if (/indigenous|first nations|métis|metis|inuit/.test(normalized(query)) && /indigenous|first nations|métis|metis|inuit/.test(normalized(intentText))) score += 42
  if (intents.length && !intentMatched) score -= 100
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

function normalizedCard(resource, readiness) {
  const source = compactSource(resource)
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
  if (!location) return false
  if (normalized(cityFor(resource)) === normalized(location)) return true
  return includesTerm(`${resource.region || ""} ${(resource.searchLocations || []).join(" ")}`, location)
}

function isNavigationResource(resource) {
  return /navigation|helpline|access line|service finder|211|811/.test(normalized(millerResourceSearchText(resource)))
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
  const exactLocation = ranked.filter(({ resource }) => isExactLocationResource(resource, location))
  const geographicallyRelevant = ranked.filter(({ resource }) => {
    if (isExactLocationResource(resource, location)) return true
    if (province && [province, "Canada-wide"].includes(provinceFor(resource))) return true
    return !location && !province
  })
  const navigationFallback = resources
    .filter(resource => isNavigationResource(resource) && (!province || [province, "Canada-wide"].includes(provinceFor(resource))))
    .map(resource => ({ resource, score: scoreResource(resource, { ...request, location, province, intents, readiness: readiness.get(clean(resource.id)) }) }))
    .sort((left, right) => right.score - left.score || clean(left.resource.name).localeCompare(clean(right.resource.name)))
  const pool = geographicallyRelevant.length ? geographicallyRelevant : ranked.length ? ranked : navigationFallback
  const selected = pool.slice(0, request.limit).map(item => item.resource)
  const intelligence = buildMillerPracticalIntelligence({
    query: request.query,
    results: selected,
    resources,
  })
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
    search_scope: {
      exact_location_matches: exactLocation.length,
      geography_broadened: Boolean(location && exactLocation.length < Math.min(3, selected.length)),
      mode: !location
        ? province ? "province" : "western_and_canada_wide"
        : exactLocation.length >= Math.min(3, selected.length) ? "local_first" : "province_broadened",
      message: location && exactLocation.length < Math.min(3, selected.length)
        ? `Exact matches in ${location} are limited, so verified ${province || "regional"} and Canada-wide navigation options are also included.`
        : "",
    },
    result_count: pool.length,
    returned_count: selected.length,
    results: selected.map(resource => normalizedCard(resource, readiness.get(clean(resource.id)))),
    privacy: {
      query_stored: false,
      client_record_created: false,
      patient_identifiers_requested: false,
    },
    source_policy: "verified_original_miller_practical_resources_only",
  })
}

export function buildMillerMobileInventory(catalog) {
  const counts = { "British Columbia": 0, Alberta: 0, Saskatchewan: 0, "Canada-wide": 0 }
  for (const resource of catalog.filter(isMillerPracticalPublicResource)) {
    const province = provinceFor(resource)
    counts[province] = (counts[province] || 0) + 1
  }
  const publicCatalog = catalog.filter(isMillerPracticalPublicResource)
  return Object.freeze({
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    by_province: counts,
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
      location: clean([resource.address, resource.city, resource.province].filter(Boolean).join(" · ")),
      phone: clean(resource.phone),
      website: clean(resource.website),
      access_note: clean(resource.referral_note || resource.access_note),
    }))
  const heading = resources.length === 1 ? "A resource that may help" : `${resources.length} resources that may help`
  const lines = [heading, clean(response?.guidance?.next_step), ""]
  resources.forEach((resource, index) => {
    lines.push(`${index + 1}. ${resource.name}${resource.organization ? ` — ${resource.organization}` : ""}`)
    if (resource.location) lines.push(resource.location)
    if (resource.phone) lines.push(`Phone: ${resource.phone}`)
    if (resource.website) lines.push(`Website: ${resource.website}`)
    if (resource.access_note) lines.push(`Access: ${resource.access_note}`)
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
