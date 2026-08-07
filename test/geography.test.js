import test from "node:test"
import assert from "node:assert/strict"
import { analyzeServiceAccess, coordinateKey, filterMapResources, normalizeMapResource } from "../src/map/geography.js"
import { addressCacheKey, createGeocoder, isPublicGeocodeCandidate, normalizeAddressParts, parseNominatimResult } from "../server/geocoding.js"

test("normalizes geographic fields and service categories", () => {
  const item = normalizeMapResource({ id: 1, name: "Clinic", serviceType: "OAT clinic", latitude: "49.2", longitude: "-123.1", approved: true })
  assert.equal(item.mappable, true)
  assert.deepEqual(item.serviceTypes, ["OAT", "Outpatient"])
})

test("virtual and mobile services are never forced onto fixed markers", () => {
  for (const field of ["virtual_service", "mobile_service"]) {
    const item = normalizeMapResource({ name: "Remote", [field]: true, latitude: 49, longitude: -123 })
    assert.equal(item.mappable, false)
    assert.equal(coordinateKey(item), "")
  }
})

test("filters categories, city, and approved Tavily exposure", () => {
  const rows = [
    normalizeMapResource({ name: "A", city: "Surrey", serviceType: "Detox", source: "curated", approved: true }),
    normalizeMapResource({ name: "B", city: "Burnaby", serviceType: "Detox", source: "tavily", approved: false }),
  ]
  assert.deepEqual(filterMapResources(rows, { city: "Surrey", serviceTypes: ["Detox / withdrawal"], approvedOnly: true }).map((item) => item.name), ["A"])
})

test("distance analysis uses deterministic radius bands", () => {
  const origin = { latitude: 49, longitude: -123 }
  const rows = [normalizeMapResource({ name: "Near", serviceType: "OAT", latitude: 49.005, longitude: -123 })]
  const result = analyzeServiceAccess(rows, origin)
  assert.equal(result.within[1], 1)
  assert.equal(result.nearestByType.OAT.resource.name, "Near")
})

test("duplicate coordinate key supports decluttering", () => {
  const a = normalizeMapResource({ latitude: 49.123456, longitude: -123.123456 })
  const b = normalizeMapResource({ latitude: 49.123459, longitude: -123.123459 })
  assert.equal(coordinateKey(a), coordinateKey(b))
})

test("normalizes Canadian address input and stable cache keys", () => {
  assert.deepEqual(normalizeAddressParts({ address: " 1 Main St ", city: " Surrey ", postal_code: "v3t 1a1" }), { street_address: "1 Main St", city: "Surrey", province: "BC", postal_code: "V3T 1A1", country: "Canada" })
  assert.equal(addressCacheKey({ address: "1 MAIN ST", city: "Surrey" }), addressCacheKey({ street_address: "1 main st", city: "surrey" }))
})

test("parses geocoder results and rejects invalid coordinates", () => {
  assert.equal(parseNominatimResult({ lat: "999", lon: "1" }), null)
  assert.equal(parseNominatimResult({ lat: "49.2", lon: "-123.1", importance: 2 }).geocode_confidence, 1)
})

test("geocoder caches identical normalized addresses", async () => {
  let calls = 0
  const geocoder = createGeocoder({ minIntervalMs: 0, fetchImpl: async () => ({ ok: true, json: async () => { calls += 1; return [{ lat: "49", lon: "-123" }] } }) })
  await geocoder.geocode({ address: "1 Main", city: "Surrey" })
  const second = await geocoder.geocode({ street_address: "1 main", city: "surrey" })
  assert.equal(calls, 1); assert.equal(second.cached, true)
})

test("protects hidden, private, PO box, virtual, and mobile addresses", () => {
  assert.equal(isPublicGeocodeCandidate({ address: "Private address", city: "Surrey" }), false)
  assert.equal(isPublicGeocodeCandidate({ address: "PO Box 2", city: "Surrey" }), false)
  assert.equal(isPublicGeocodeCandidate({ address: "1 Main", city: "Surrey", virtual_service: true }), false)
  assert.equal(isPublicGeocodeCandidate({ address: "1 Main", city: "Surrey", mobile_service: true }), false)
  assert.equal(isPublicGeocodeCandidate({ address: "1 Main", city: "Surrey" }), true)
})
