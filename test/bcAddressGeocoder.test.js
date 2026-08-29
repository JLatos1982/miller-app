import test from "node:test"
import assert from "node:assert/strict"
import { bcGeocoderConfiguration, bcResultMeetsExactPinStandard, canonicalCivicAddress, classifyBcAddressResults, normalizeBcAddressResult, requestBcAddressGeocode } from "../server/bcAddressGeocoder.js"

const exactFeature = { geometry: { coordinates: [-122.9501, 49.2184] }, properties: { fullAddress: "7155 Kingsway, Burnaby, BC", streetName: "Kingsway", localityName: "Burnaby", provinceCode: "BC", score: 100, precisionPoints: 100, matchPrecision: "CIVIC_NUMBER", locationDescriptor: "accessPoint", siteID: "fixture-site", faults: [] } }
const submitted = { street_address: "Unit 320, 7155 Kingsway", city: "Burnaby", result_count: 1 }

function exactCivicFeature({ fullAddress, civicNumber, streetName, streetType, streetDirection = "", localityName = "New Westminster", score = 100, precisionPoints = 100, matchPrecision = "CIVIC_NUMBER", locationDescriptor = "parcelPoint" }) {
  return { geometry: { coordinates: [-122.91, 49.2] }, properties: { fullAddress, civicNumber, streetName, streetType, streetDirection, localityName, provinceCode: "BC", score, precisionPoints, matchPrecision, locationDescriptor, faults: [] } }
}

test("BC configuration remains unusable unless explicitly enabled with a server key", () => {
  assert.deepEqual(bcGeocoderConfiguration({}), { enabled: false, keyConfigured: false, clientIdConfigured: false, baseUrlConfigured: false, baseUrl: "https://geocoder.api.gov.bc.ca", usable: false })
  assert.equal(bcGeocoderConfiguration({ BC_GEOCODER_ENABLED: "true", BC_GEOCODER_API_KEY: "fixture" }).usable, true)
})
test("BC provider normalization retains score, precision, descriptor, faults, site and coordinates", () => {
  const item = normalizeBcAddressResult(exactFeature, submitted)
  assert.equal(item.score, 100); assert.equal(item.precision, "civic_number"); assert.equal(item.precision_points, 100)
  assert.equal(item.location_descriptor, "accesspoint"); assert.equal(item.site_id, "fixture-site"); assert.equal(item.locality, "Burnaby")
  assert.equal(item.civic_number_match, true); assert.equal(item.municipality_match, true); assert.equal(item.valid_coordinate, true)
  assert.equal(bcResultMeetsExactPinStandard(item), true)
})
test("mismatch, material faults, parcel/centroid precision, weak score, and competing results fail closed", () => {
  const cases = [
    { ...exactFeature, properties: { ...exactFeature.properties, fullAddress: "7156 Kingsway, Burnaby, BC" } },
    { ...exactFeature, properties: { ...exactFeature.properties, faults: [{ value: "7155", element: "CIVIC_NUMBER", fault: "notMatched", penalty: 10 }] } },
    { ...exactFeature, properties: { ...exactFeature.properties, matchPrecision: "LOCALITY", locationDescriptor: "parcelPoint" } },
    { ...exactFeature, properties: { ...exactFeature.properties, score: 89 } },
  ]
  for (const feature of cases) assert.equal(bcResultMeetsExactPinStandard(normalizeBcAddressResult(feature, submitted)), false)
  assert.equal(bcResultMeetsExactPinStandard(normalizeBcAddressResult(exactFeature, { ...submitted, result_count: 2 })), false)
})
test("BC request uses only the documented server-side apikey header", async () => {
  let captured
  const response = await requestBcAddressGeocode({ street_address: "569 Powell Street", city: "Vancouver" }, {
    env: { BC_GEOCODER_ENABLED: "true", BC_GEOCODER_API_KEY: "fixture-secret", BC_GEOCODER_CLIENT_ID: "fixture-client" },
    fetchImpl: async (url, options) => {
      captured = { url, options }
      return { ok: true, status: 200, json: async () => ({ type: "FeatureCollection", features: [exactFeature] }) }
    },
  })
  assert.equal(response.status, "matched")
  assert.equal(captured.options.headers.apikey, "fixture-secret")
  assert.equal(Object.keys(captured.options.headers).some((name) => /client/i.test(name)), false)
  assert.match(captured.url, /\/addresses\.geojson\?/)
  assert.match(captured.url, /maxResults=5/)
})
test("BC result classification distinguishes exact, approximate, ambiguous, and no-match outcomes", () => {
  assert.equal(classifyBcAddressResults([exactFeature], submitted).classification, "exact_civic")
  const approximate = { ...exactFeature, properties: { ...exactFeature.properties, score: 80, matchPrecision: "STREET", interpolation: "adaptive" } }
  assert.equal(classifyBcAddressResults([approximate], submitted).classification, "approximate")
  const competing = { ...exactFeature, geometry: { coordinates: [-122.951, 49.219] }, properties: { ...exactFeature.properties, siteID: "other", score: 99 } }
  assert.equal(classifyBcAddressResults([exactFeature, competing], submitted).classification, "ambiguous")
  assert.equal(classifyBcAddressResults([], submitted).classification, "no_match")
})

test("exact civic comparison canonicalizes bounded English ordinals and harmless typography", () => {
  const cases = [
    ["323 8th Street", "323 Eighth St"],
    ["100 First Avenue", "100 1st Ave"],
    ["201 Twenty-First St", "201 21st Street"],
    ["45 Twelfth Ave", "45 12th Avenue"],
    ["201 Twenty First St", "201 Twenty-First Street"],
    ["123 Main Street", "123 Main St"],
    ["50 King Road", "50 King Rd"],
    ["8 Oak Boulevard", "8 Oak Blvd"],
    ["9 Pine Highway", "9 Pine Hwy"],
    ["10 Cedar Drive", "10 Cedar Dr"],
    ["11 Fir Lane", "11 Fir Ln"],
    ["12 Elm Court", "12 Elm Ct"],
    ["13 Maple Crescent", "13 Maple Cres"],
    ["14 Ash Place", "14 Ash Pl"],
    ["15 River Terrace", "15 River Ter"],
  ]
  for (const [left, right] of cases) {
    const leftKey = canonicalCivicAddress(left), rightKey = canonicalCivicAddress(right)
    assert.deepEqual(leftKey, rightKey, `${left} should be canonically equivalent to ${right}`)
  }
  assert.deepEqual(canonicalCivicAddress("  201 Twenty-First Street.  "), canonicalCivicAddress("201 Twenty First St"))
})

test("BC exact-civic QC accepts ordinal equivalents using structured provider components", () => {
  const feature = exactCivicFeature({ fullAddress: "323 Eighth St, New Westminster, BC", civicNumber: "323", streetName: "Eighth", streetType: "St" })
  const result = normalizeBcAddressResult(feature, { street_address: "323 8th Street", city: "New Westminster" })
  assert.equal(result.civic_number_match, true)
  assert.equal(result.street_match, true)
  assert.equal(result.municipality_match, true)
  assert.equal(result.province_match, true)
  assert.equal(bcResultMeetsExactPinStandard(result), true)
  assert.equal(classifyBcAddressResults([feature], { street_address: "323 8th Street", city: "New Westminster" }).classification, "exact_civic")
})

test("BC exact-civic QC remains strict for civic, ordinal, suffix, direction, place, and precision", () => {
  const submittedAddress = { street_address: "323 8th St E", city: "New Westminster" }
  const rejected = [
    exactCivicFeature({ fullAddress: "325 Eighth St E, New Westminster, BC", civicNumber: "325", streetName: "Eighth", streetType: "St", streetDirection: "E" }),
    exactCivicFeature({ fullAddress: "323 Ninth St E, New Westminster, BC", civicNumber: "323", streetName: "Ninth", streetType: "St", streetDirection: "E" }),
    exactCivicFeature({ fullAddress: "323 Eighth Ave E, New Westminster, BC", civicNumber: "323", streetName: "Eighth", streetType: "Ave", streetDirection: "E" }),
    exactCivicFeature({ fullAddress: "323 Eighth St W, New Westminster, BC", civicNumber: "323", streetName: "Eighth", streetType: "St", streetDirection: "W" }),
    exactCivicFeature({ fullAddress: "323 Eighth St E, Burnaby, BC", civicNumber: "323", streetName: "Eighth", streetType: "St", streetDirection: "E", localityName: "Burnaby" }),
    exactCivicFeature({ fullAddress: "323 Eighth St E, New Westminster, BC", civicNumber: "323", streetName: "Eighth", streetType: "St", streetDirection: "E", matchPrecision: "STREET", locationDescriptor: "parcelPoint" }),
    exactCivicFeature({ fullAddress: "323 Eighth St E, New Westminster, BC", civicNumber: "323", streetName: "Eighth", streetType: "St", streetDirection: "E", matchPrecision: "LOCALITY", locationDescriptor: "parcelPoint" }),
  ]
  for (const feature of rejected) assert.equal(bcResultMeetsExactPinStandard(normalizeBcAddressResult(feature, submittedAddress)), false)
  assert.notDeepEqual(canonicalCivicAddress("323 8th St"), canonicalCivicAddress("323 9th St"))
  assert.notDeepEqual(canonicalCivicAddress("323 8th St E"), canonicalCivicAddress("323 8th St W"))
  assert.notDeepEqual(canonicalCivicAddress("323 8th St"), canonicalCivicAddress("323 8th Ave"))
  assert.equal(canonicalCivicAddress("8th Street").civic_number, "")
})
test("BC request fails closed for invalid input and provider failures", async () => {
  const env = { BC_GEOCODER_ENABLED: "true", BC_GEOCODER_API_KEY: "fixture-secret" }
  assert.equal((await requestBcAddressGeocode({}, { env })).status, "invalid_input")
  const failed = await requestBcAddressGeocode({ street_address: "invalid", city: "invalid" }, { env, fetchImpl: async () => ({ ok: false, status: 401 }) })
  assert.deepEqual(failed, { ok: false, status: "provider_error", http_status: 401, features: [] })
})
