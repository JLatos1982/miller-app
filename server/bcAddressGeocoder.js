import { addressComponents, normalizeAddress, normalizedGeocodingQuery } from "./addressEvidence.js"

export const BC_GEOCODER_PROVIDER = "bc_address_geocoder"
export const BC_GEOCODER_DEFAULT_BASE_URL = "https://geocoder.api.gov.bc.ca"
export const BC_GEOCODER_MIN_SCORE = 90
export const BC_GEOCODER_MIN_PRECISION_POINTS = 95
export const BC_EXACT_PRECISIONS = Object.freeze(new Set(["civic_number", "unit", "site", "occupant"]))
export const BC_EXACT_LOCATION_DESCRIPTORS = Object.freeze(new Set(["parcelpoint", "accesspoint", "frontdoorpoint", "rooftoppoint"]))

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim()
const token = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, "")

// This is intentionally bounded to ordinary English ordinal names used in civic
// street names. It is comparison-only: source and provider display strings are
// retained unchanged in the normalized result.
const ORDINAL_WORDS = Object.freeze(new Map([
  ["first", "1"], ["second", "2"], ["third", "3"], ["fourth", "4"], ["fifth", "5"], ["sixth", "6"], ["seventh", "7"], ["eighth", "8"], ["ninth", "9"], ["tenth", "10"],
  ["eleventh", "11"], ["twelfth", "12"], ["thirteenth", "13"], ["fourteenth", "14"], ["fifteenth", "15"], ["sixteenth", "16"], ["seventeenth", "17"], ["eighteenth", "18"], ["nineteenth", "19"],
  ["twentieth", "20"], ["thirtieth", "30"], ["fortieth", "40"], ["fiftieth", "50"], ["sixtieth", "60"], ["seventieth", "70"], ["eightieth", "80"], ["ninetieth", "90"],
]))
const ORDINAL_TENS = Object.freeze(new Map([["twenty", 20], ["thirty", 30], ["forty", 40], ["fifty", 50], ["sixty", 60], ["seventy", 70], ["eighty", 80], ["ninety", 90]]))
const ORDINAL_ONES = Object.freeze(new Map([["first", 1], ["second", 2], ["third", 3], ["fourth", 4], ["fifth", 5], ["sixth", 6], ["seventh", 7], ["eighth", 8], ["ninth", 9]]))
const STREET_SUFFIXES = Object.freeze(new Map([
  ["street", "st"], ["st", "st"], ["avenue", "ave"], ["ave", "ave"], ["road", "rd"], ["rd", "rd"], ["boulevard", "blvd"], ["blvd", "blvd"], ["highway", "hwy"], ["hwy", "hwy"], ["drive", "dr"], ["dr", "dr"], ["lane", "ln"], ["ln", "ln"], ["court", "ct"], ["ct", "ct"], ["crescent", "cres"], ["cres", "cres"], ["place", "pl"], ["pl", "pl"], ["way", "way"], ["terrace", "ter"], ["ter", "ter"],
]))
const DIRECTIONS = Object.freeze(new Map([["north", "n"], ["n", "n"], ["south", "s"], ["s", "s"], ["east", "e"], ["e", "e"], ["west", "w"], ["w", "w"], ["northeast", "ne"], ["ne", "ne"], ["northwest", "nw"], ["nw", "nw"], ["southeast", "se"], ["se", "se"], ["southwest", "sw"], ["sw", "sw"]]))

function comparisonTokens(value) {
  return clean(value).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u2010-\u2015]/g, "-").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean)
}

function canonicalOrdinalTokens(tokens) {
  const canonical = []
  for (let index = 0; index < tokens.length; index++) {
    const tens = ORDINAL_TENS.get(tokens[index]), one = ORDINAL_ONES.get(tokens[index + 1])
    if (tens && one) { canonical.push(String(tens + one)); index++; continue }
    canonical.push(ORDINAL_WORDS.get(tokens[index]) || tokens[index].replace(/^(\d+)(?:st|nd|rd|th)$/i, "$1"))
  }
  return canonical
}

function canonicalStreet(value, structured = {}) {
  // A street name alone is insufficient when the provider also supplied the
  // full address: parsing the full address preserves its suffix/direction.
  const hasStructuredStreet = clean(structured.street_name) && (clean(structured.street_type) || clean(structured.street_direction))
  const streetSource = hasStructuredStreet ? [structured.street_name, structured.street_type, structured.street_direction].filter(Boolean).join(" ") : addressComponents(value).street_address.replace(/^\s*\d+[A-Za-z]?\b\s*/, "")
  const tokens = comparisonTokens(streetSource)
  let direction = "", suffix = ""
  if (DIRECTIONS.has(tokens.at(-1))) direction = DIRECTIONS.get(tokens.pop())
  if (STREET_SUFFIXES.has(tokens.at(-1))) suffix = STREET_SUFFIXES.get(tokens.pop())
  return { name: canonicalOrdinalTokens(tokens).join(" "), suffix, direction }
}

export function canonicalCivicAddress(value, structured = {}) {
  const parsed = addressComponents(value)
  const streetAddress = parsed.street_address
  const civic = clean(structured.civic_number) || streetAddress.match(/^\s*(\d+[A-Za-z]?)\b/)?.[1] || ""
  const street = canonicalStreet(streetAddress, structured)
  return Object.freeze({ civic_number: civic.toLowerCase(), street_name: street.name, street_type: street.suffix, street_direction: street.direction })
}

export function bcGeocoderConfiguration(env = process.env) {
  return Object.freeze({
    enabled: env.BC_GEOCODER_ENABLED === "true",
    keyConfigured: Boolean(clean(env.BC_GEOCODER_API_KEY)),
    clientIdConfigured: Boolean(clean(env.BC_GEOCODER_CLIENT_ID)),
    baseUrlConfigured: Boolean(clean(env.BC_GEOCODER_BASE_URL)),
    baseUrl: clean(env.BC_GEOCODER_BASE_URL) || BC_GEOCODER_DEFAULT_BASE_URL,
    usable: env.BC_GEOCODER_ENABLED === "true" && Boolean(clean(env.BC_GEOCODER_API_KEY)),
  })
}

export async function requestBcAddressGeocode(address, { env = process.env, fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  const config = bcGeocoderConfiguration(env)
  if (!config.usable) return Object.freeze({ ok: false, status: "not_configured", http_status: null, features: [] })
  const submittedAddress = clean(address?.street_address || address?.address)
  const municipality = clean(address?.city)
  if (!submittedAddress) return Object.freeze({ ok: false, status: "invalid_input", http_status: null, features: [] })
  const query = new URLSearchParams({
    addressString: normalizedGeocodingQuery(submittedAddress, { city: municipality, postal_code: address?.postal_code }),
    maxResults: "5",
    minScore: "1",
    echo: "true",
    outputSRS: "4326",
  })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let response
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetchImpl(`${config.baseUrl.replace(/\/$/, "")}/addresses.geojson?${query}`, { method: "GET", headers: { accept: "application/geo+json, application/json", apikey: clean(env.BC_GEOCODER_API_KEY) }, signal: controller.signal })
      if (![429, 502, 503, 504].includes(response.status) || attempt === 2) break
      await new Promise((resolve) => setTimeout(resolve, 150 * (2 ** attempt)))
    }
    if (!response.ok) return Object.freeze({ ok: false, status: "provider_error", http_status: response.status, features: [] })
    const payload = await response.json()
    const features = Array.isArray(payload?.features) ? payload.features : []
    return Object.freeze({ ok: features.length > 0, status: features.length ? "matched" : "no_match", http_status: response.status, features, retry_after: response.headers?.get?.("retry-after") || null })
  } catch (error) {
    return Object.freeze({ ok: false, status: error?.name === "AbortError" ? "timeout" : "request_failed", http_status: null, features: [] })
  } finally {
    clearTimeout(timeout)
  }
}

export function normalizeBcAddressResult(feature = {}, submitted = {}) {
  const properties = feature.properties || feature, coordinates = feature.geometry?.coordinates || [feature.longitude, feature.latitude]
  const fullAddress = clean(properties.fullAddress || properties.addressString)
  const submittedAddress = normalizeAddress(submitted.street_address || submitted.address || "")
  const submittedParts = addressComponents(submitted.street_address || submitted.address || "", submitted)
  const submittedCivic = canonicalCivicAddress(submitted.street_address || submitted.address || "")
  const returnedCivic = canonicalCivicAddress(fullAddress, {
    civic_number: clean(properties.civicNumber), street_name: clean(properties.streetName || properties.streetAddress), street_type: clean(properties.streetType), street_direction: clean(properties.streetDirection || properties.streetDirectionPrefix || properties.streetDirectionSuffix),
  })
  const precision = clean(properties.matchPrecision).toLowerCase().replace(/\s+/g, "_")
  const descriptor = clean(properties.locationDescriptor).toLowerCase().replace(/[^a-z]/g, "")
  const faults = Array.isArray(properties.faults) ? properties.faults.map((fault) => ({ value: clean(fault.value), element: clean(fault.element), fault: clean(fault.fault), penalty: Number(fault.penalty || 0) })) : []
  const locality = clean(properties.localityName || properties.locality)
  const province = clean(properties.provinceCode || properties.province || "BC")
  const score = Number(properties.score)
  const precisionPoints = Number(properties.precisionPoints)
  const latitude = Number(coordinates?.[1]), longitude = Number(coordinates?.[0])
  return Object.freeze({
    provider: BC_GEOCODER_PROVIDER, query: submittedAddress, normalized_query: normalizedGeocodingQuery(submitted.street_address || submitted.address || "", submitted), normalized_address: fullAddress,
    returned_address: fullAddress, score, precision, precision_points: precisionPoints,
    faults, location_descriptor: descriptor, interpolation: clean(properties.interpolation).toLowerCase(), site_id: clean(properties.siteID), locality,
    standardized_components: Object.freeze({ unit: clean(properties.unitNumber), unit_designator: clean(properties.unitDesignator), civic_number: clean(properties.civicNumber), street_name: clean(properties.streetName), street_type: clean(properties.streetType), locality, province, postal_code: clean(properties.postalCode) }), submitted_unit: submittedParts.unit,
    latitude, longitude, result_count: Number(submitted.result_count || 1),
    civic_number_match: Boolean(submittedCivic.civic_number && submittedCivic.civic_number === returnedCivic.civic_number),
    street_match: Boolean(submittedCivic.street_name && submittedCivic.street_name === returnedCivic.street_name && submittedCivic.street_type === returnedCivic.street_type && submittedCivic.street_direction === returnedCivic.street_direction),
    municipality_match: token(submitted.city) === token(locality), province_match: province.toUpperCase() === "BC",
    exact_precision: BC_EXACT_PRECISIONS.has(precision), exact_descriptor: BC_EXACT_LOCATION_DESCRIPTORS.has(descriptor),
    valid_coordinate: Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= 48 && latitude <= 60 && longitude >= -140 && longitude <= -114 && latitude !== 0 && longitude !== 0,
    materially_faulted: faults.some((fault) => fault.penalty > 0),
    storage_licensed: true, display_licensed: true,
    attribution: "Contains information licensed under the Open Government Licence – British Columbia.",
  })
}

export function bcResultMeetsExactPinStandard(result = {}) {
  return result.score >= BC_GEOCODER_MIN_SCORE && result.precision_points >= BC_GEOCODER_MIN_PRECISION_POINTS && result.exact_precision === true && result.exact_descriptor === true && result.civic_number_match === true && result.street_match === true && result.municipality_match === true && result.province_match === true && result.valid_coordinate === true && result.materially_faulted === false && result.result_count === 1 && result.storage_licensed === true && result.display_licensed === true
}

export function classifyBcAddressResults(features = [], submitted = {}) {
  const normalized = features.map((feature) => normalizeBcAddressResult(feature, { ...submitted, result_count: features.length }))
  if (!normalized.length) return Object.freeze({ classification: "no_match", best: null, alternatives: [] })
  const best = normalized[0], viable = normalized.filter((item) => item.valid_coordinate && item.province_match && item.municipality_match)
  if (viable.length > 1 && Number(viable[1].score) >= Number(best.score) - 2 && viable[1].precision === best.precision && viable[1].site_id !== best.site_id) return Object.freeze({ classification: "ambiguous", best, alternatives: normalized.slice(1) })
  if (bcResultMeetsExactPinStandard({ ...best, result_count: 1 })) return Object.freeze({ classification: "exact_civic", best, alternatives: normalized.slice(1) })
  if (best.score >= 90 && best.precision_points >= 95 && best.civic_number_match && best.municipality_match) return Object.freeze({ classification: "high_confidence_close", best, alternatives: normalized.slice(1) })
  if (/interpolat/i.test(best.interpolation) || ["block", "street"].includes(best.precision)) return Object.freeze({ classification: "approximate", best, alternatives: normalized.slice(1) })
  if (["locality", "province"].includes(best.precision)) return Object.freeze({ classification: "locality_only", best, alternatives: normalized.slice(1) })
  return Object.freeze({ classification: "low_confidence", best, alternatives: normalized.slice(1) })
}
