import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { classifyLocationReview } from "../server/locationReview.js"

const location = { latitude: 49.28, longitude: -123.1, location_type: "fixed", geocode_status: "matched" }
const evidence = { street_number_match: true, municipality_match: true, province_country_match: true, building_level: true, warnings: [] }

test("a deterministic exact fixed public office is Tier 1 and selectable", () => {
  assert.deepEqual(classifyLocationReview({ location, evidence, resource: { display_name: "Public office" } }), { tier: 1, label: "Ready for quick review", selectable: true, warnings: [] })
})

test("shared addresses and omitted units require individual Tier 2 review", () => {
  const shared = classifyLocationReview({ location, evidence, addressPeerCount: 2 })
  assert.equal(shared.tier, 2)
  assert.equal(shared.selectable, false)
  assert.ok(shared.warnings.includes("shared_address"))
  const unit = classifyLocationReview({ location, evidence: { ...evidence, submitted_has_unit: true, returned_has_unit: false } })
  assert.equal(unit.tier, 2)
  assert.ok(unit.warnings.includes("unit_not_returned"))
})

test("mismatched, non-fixed, suspicious, or sensitive locations are Tier 3", () => {
  for (const candidate of [
    { location: { ...location, latitude: 0 } },
    { location: { ...location, location_type: "mobile" } },
    { location, evidence: { ...evidence, municipality_match: false } },
    { location, evidence, resource: { display_name: "Confidential residential shelter" } },
  ]) {
    const result = classifyLocationReview(candidate)
    assert.equal(result.tier, 3)
    assert.equal(result.selectable, false)
  }
})

test("fast-review UI exposes explicit selection, evidence links, and confirmation", () => {
  const source = requireSource("../src/map/PendingLocationReview.jsx")
  for (const text of ["Select visible eligible", "Fit selected", "OpenStreetMap evidence", "Google Maps evidence", "confirmed_public_statement", "I confirm that every selected service"]) assert.match(source, new RegExp(text))
})

function requireSource(relative) {
  return fs.readFileSync(new URL(relative, import.meta.url), "utf8")
}
