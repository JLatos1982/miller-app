import { normalizeAddress } from "./addressEvidence.js"

export const BC_GEOCODER_PROVIDER = "bc_address_geocoder"
export const BC_GEOCODER_DEFAULT_BASE_URL = "https://geocoder.api.gov.bc.ca"
export const BC_GEOCODER_MIN_SCORE = 90
export const BC_GEOCODER_MIN_PRECISION_POINTS = 95
export const BC_EXACT_PRECISIONS = Object.freeze(new Set(["civic_number", "unit", "site", "occupant"]))
export const BC_EXACT_LOCATION_DESCRIPTORS = Object.freeze(new Set(["parcelpoint", "accesspoint", "frontdoorpoint", "rooftoppoint"]))

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim()
const token = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, "")
const civicNumber = (value) => clean(value).replace(/^\s*(?:unit|suite|office|apt|#)\s*[a-z0-9-]+\s*(?:,|--|–|—|-)\s*/i, "").match(/\b(\d+[a-z]?)\s+[A-Za-z]/i)?.[1]?.toLowerCase() || ""
const streetKey = (value) => clean(value).toLowerCase().replace(/\b(street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|drive|dr\.?|highway|hwy\.?|lane|ln\.?|crescent|cres\.?)\b/g, "").replace(/[^a-z0-9]/g, "")

export function bcGeocoderConfiguration(env = process.env) {
  return Object.freeze({
    enabled: env.BC_GEOCODER_ENABLED === "true",
    keyConfigured: Boolean(clean(env.BC_GEOCODER_API_KEY)),
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
    addressString: [submittedAddress, municipality, clean(address?.province || "BC")].filter(Boolean).join(", "),
    maxResults: "1",
    minScore: "1",
    echo: "true",
    outputSRS: "4326",
  })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${config.baseUrl.replace(/\/$/, "")}/addresses.geojson?${query}`, {
      method: "GET",
      headers: { accept: "application/geo+json, application/json", apikey: clean(env.BC_GEOCODER_API_KEY) },
      signal: controller.signal,
    })
    if (!response.ok) return Object.freeze({ ok: false, status: "provider_error", http_status: response.status, features: [] })
    const payload = await response.json()
    const features = Array.isArray(payload?.features) ? payload.features : []
    return Object.freeze({ ok: features.length > 0, status: features.length ? "matched" : "no_match", http_status: response.status, features })
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
  const returnedStreet = clean(properties.streetName || properties.streetAddress || fullAddress)
  const precision = clean(properties.matchPrecision).toLowerCase().replace(/\s+/g, "_")
  const descriptor = clean(properties.locationDescriptor).toLowerCase().replace(/[^a-z]/g, "")
  const faults = Array.isArray(properties.faults) ? properties.faults.map((fault) => ({ value: clean(fault.value), element: clean(fault.element), fault: clean(fault.fault), penalty: Number(fault.penalty || 0) })) : []
  const locality = clean(properties.localityName || properties.locality)
  const province = clean(properties.provinceCode || properties.province || "BC")
  const score = Number(properties.score)
  const precisionPoints = Number(properties.precisionPoints)
  const latitude = Number(coordinates?.[1]), longitude = Number(coordinates?.[0])
  return Object.freeze({
    provider: BC_GEOCODER_PROVIDER, query: submittedAddress, normalized_address: fullAddress,
    returned_address: fullAddress, score, precision, precision_points: precisionPoints,
    faults, location_descriptor: descriptor, interpolation: clean(properties.interpolation).toLowerCase(), site_id: clean(properties.siteID), locality,
    latitude, longitude, result_count: Number(submitted.result_count || 1),
    civic_number_match: Boolean(civicNumber(submittedAddress) && civicNumber(submittedAddress) === civicNumber(fullAddress)),
    street_match: Boolean(streetKey(submittedAddress) && returnedStreet && streetKey(submittedAddress).includes(streetKey(returnedStreet).slice(0, 8))),
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
