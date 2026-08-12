import test from "node:test"
import assert from "node:assert/strict"
import { analyzeServiceAccess, coordinateKey, filterMapResources, groupResourcesByCoordinate, nearestService, normalizeMapResource, resetMapFilters } from "../src/map/geography.js"
import fs from "node:fs"
import { addressCacheKey, createGeocoder, isPublicGeocodeCandidate, normalizeAddressParts, parseNominatimResult } from "../server/geocoding.js"

test("normalizes geographic fields and service categories", () => {
  const item = normalizeMapResource({ id: 1, name: "Clinic", serviceType: "OAT clinic", latitude: "49.2", longitude: "-123.1", approved: true })
  assert.equal(item.mappable, true)
  assert.deepEqual(item.serviceTypes, ["OAT", "Outpatient"])
})

test("blank coordinates never create an ocean pin at zero zero", () => {
  for (const latitude of ["", "   ", null, undefined]) {
    const item = normalizeMapResource({ name: "No coordinate", latitude, longitude: "" })
    assert.equal(item.mappable, false)
    assert.equal(item.latitude, null)
    assert.equal(item.longitude, null)
  }
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
  const geocoder = createGeocoder({ minIntervalMs: 0, contactEmail: "admin@example.org", fetchImpl: async () => ({ ok: true, json: async () => { calls += 1; return [{ lat: "49", lon: "-123" }] } }) })
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

test("nearest service is deterministic from the explicit reference point", () => {
  const resources = [
    normalizeMapResource({ id: "b", name: "West", approved: true, latitude: 49, longitude: -123.01 }),
    normalizeMapResource({ id: "a", name: "East", approved: true, latitude: 49, longitude: -122.99 }),
  ]
  const result = nearestService(resources, { latitude: 49, longitude: -123 })
  assert.equal(result.resource.id, "a")
  assert.ok(result.distance > 0)
})

test("shared coordinates expose every service in stable name order", () => {
  const resources = [
    normalizeMapResource({ id: 2, name: "Zulu", approved: true, latitude: 49.1, longitude: -123.1 }),
    normalizeMapResource({ id: 1, name: "Alpha", approved: true, latitude: 49.1, longitude: -123.1 }),
  ]
  const groups = groupResourcesByCoordinate(resources)
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].map((item) => item.name), ["Alpha", "Zulu"])
})

test("show-all reset clears category and city filters", () => {
  assert.deepEqual(resetMapFilters(), { serviceTypes: [], city: "All cities" })
})

test("approved-only map filtering excludes hidden and unapproved resources", () => {
  const resources = [
    normalizeMapResource({ id: 1, approved: true }),
    normalizeMapResource({ id: 2, approved: false }),
    normalizeMapResource({ id: 3, approved: true, hidden: true }),
  ]
  assert.deepEqual(filterMapResources(resources, { approvedOnly: true }).map((item) => item.id), [1])
})

test("map UI states privacy reference and marker keyboard labels", () => {
  const source = fs.readFileSync(new URL("../src/map/ServiceMap.jsx", import.meta.url), "utf8")
  assert.match(source, /current map centre/)
  assert.match(source, /approximate straight-line distances, not travel distances/)
  assert.match(source, /does not receive or store that starting point/)
  assert.match(source, /keyboard: true/)
  assert.match(source, /aria-label.*, label/)
})
