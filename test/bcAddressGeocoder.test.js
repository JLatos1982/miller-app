import test from "node:test"
import assert from "node:assert/strict"
import { bcGeocoderConfiguration, bcResultMeetsExactPinStandard, normalizeBcAddressResult } from "../server/bcAddressGeocoder.js"

const exactFeature = { geometry: { coordinates: [-122.9501, 49.2184] }, properties: { fullAddress: "7155 Kingsway, Burnaby, BC", streetName: "Kingsway", localityName: "Burnaby", provinceCode: "BC", score: 100, precisionPoints: 100, matchPrecision: "CIVIC_NUMBER", locationDescriptor: "accessPoint", siteID: "fixture-site", faults: [] } }
const submitted = { street_address: "Unit 320, 7155 Kingsway", city: "Burnaby", result_count: 1 }

test("BC configuration remains unusable unless explicitly enabled with a server key", () => {
  assert.deepEqual(bcGeocoderConfiguration({}), { enabled: false, keyConfigured: false, baseUrlConfigured: false, baseUrl: "https://geocoder.api.gov.bc.ca", usable: false })
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
