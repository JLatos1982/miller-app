import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { approveEvidenceForGeocoding, classifyAddressEvidence, classifySource, extractNumberedAddresses, groupSharedAddresses } from "../server/addressEvidence.js"

const resource = { name: "Burnaby Public OAT Clinic", organization: "Fraser Health", address: "Unit 320, 7155 Kingsway", city: "Burnaby", service_type: "OAT clinic" }
const page = { text: "Burnaby Public OAT Clinic is located at Unit 320, 7155 Kingsway in Burnaby." }

test("authoritative source priority recognizes health, government, municipal, directory, and first-party sources", () => {
  assert.deepEqual([classifySource("https://fraserhealth.ca/a").priority, classifySource("https://www2.gov.bc.ca/a").priority, classifySource("https://vancouver.ca/a").priority, classifySource("https://bc.211.ca/a").priority], [2, 3, 4, 5])
  assert.equal(classifySource("https://archway.ca/program", "Archway Community Services").type, "first_party")
})

test("one authoritative page with program and address support reaches E1", () => {
  const result = classifyAddressEvidence({ resource, source: classifySource("https://fraserhealth.ca/program"), page })
  assert.equal(result.tier, "E1")
})

test("search snippets, parent offices, conflicts, and sensitive services never silently reach E1", () => {
  assert.equal(classifyAddressEvidence({ resource, source: classifySource("https://fraserhealth.ca/program"), page: { text: "" } }).tier, "E3")
  assert.equal(classifyAddressEvidence({ resource, source: classifySource("https://fraserhealth.ca/program"), page, conflicts: ["suite_conflict"] }).tier, "E2")
  assert.equal(classifyAddressEvidence({ resource: { ...resource, service_type: "Residential recovery home" }, source: classifySource("https://fraserhealth.ca/program"), page }).tier, "E3")
})

test("an established directory remains E2 until authoritative confirmation", () => {
  assert.equal(classifyAddressEvidence({ resource, source: classifySource("https://bc.211.ca/result/program"), page }).tier, "E2")
})

test("shared buildings retain independent canonical identities", () => {
  const groups = groupSharedAddresses([{ canonical_uuid: "a", resource_name: "One", proposed_address: "7155 Kingsway", municipality: "Burnaby" }, { canonical_uuid: "b", resource_name: "Two", proposed_address: "7155 Kingsway", municipality: "Burnaby" }])
  assert.deepEqual(groups[0].resources.map((item) => item.canonical_uuid), ["a", "b"])
})

test("numbered public addresses can be proposed from opened page content", () => {
  assert.deepEqual(extractNumberedAddresses("Visit the clinic at Unit 320, 7155 Kingsway today."), ["Unit 320, 7155 Kingsway"])
})

test("evidence approval is only permission for future geocoding", () => {
  const approved = approveEvidenceForGeocoding({ tier: "E1", canonical_uuid: "a" })
  assert.equal(approved.evidence_review_status, "approved_for_future_geocoding")
  assert.equal(approved.public_map, false)
  assert.equal(approved.coordinates, null)
  assert.throws(() => approveEvidenceForGeocoding({ tier: "E2" }))
})

test("runner is bounded, cached, deterministic in ordering, and contains no geography writes", () => {
  const source = fs.readFileSync(new URL("../scripts/address-evidence-1n.mjs", import.meta.url), "utf8")
  assert.match(source, /MAX = 150/)
  assert.match(source, /CACHE_DIR/)
  assert.match(source, /\.sort\(/)
  assert.doesNotMatch(source, /from\("resource_locations"\)\.(?:insert|update|upsert|delete)/)
  assert.doesNotMatch(source, /geocode\(/)
})

test("administrator evidence workflow is protected, bounded to fifty E1 IDs, and geography-free", () => {
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  const ui = fs.readFileSync(new URL("../src/map/AddressEvidenceReview.jsx", import.meta.url), "utf8")
  assert.match(server, /app\.get\("\/api\/admin\/address-evidence", requireAdmin/)
  assert.match(server, /app\.post\("\/api\/admin\/address-evidence\/bounded-approve", requireAdmin/)
  assert.match(server, /ids\.length > 50/)
  assert.match(server, /coordinates_created: 0, public_locations_created: 0/)
  assert.match(ui, /Select visible E1/)
  assert.match(ui, /Maximum 50\. This cannot publish a location/)
  assert.match(ui, /confirmed_geocoding_only: true/)
})
