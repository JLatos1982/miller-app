import assert from "node:assert/strict"
import test from "node:test"

import comparison from "../src/data/miller-north-accountability-comparison-public-v1.json" with { type: "json" }
import { validateAccountabilityComparisonProjection } from "../server/millerNorthAccountabilityComparisonPublic.js"

test("cross-province accountability comparison sources every cell without ranking", () => {
  assert.deepEqual(validateAccountabilityComparisonProjection(comparison), { valid: true, provinces: 3, fields_per_province: 12, sourced_cells: 36 })
  assert.equal(comparison.mechanisms.every(item => item.fields.every(field => field.source_ids.length > 0)), true)
})
test("cross-province accountability comparison rejects private fields and evaluative rankings", () => {
  assert.throws(() => validateAccountabilityComparisonProjection({ ...comparison, private_note: "not allowed" }), /private_field/)
  assert.throws(() => validateAccountabilityComparisonProjection({ ...comparison, title: "The best province" }), /ranking/)
})
