import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

const preview = readFileSync(new URL("../src/admin/MillerNorthIncidentReview.jsx", import.meta.url), "utf8")
const store = readFileSync(new URL("../server/millerNorthIncidentStore.js", import.meta.url), "utf8")

test("private admin preview exposes bounded accountability, commitment, policy and later-signal sections", () => {
  assert.match(preview, /Accountability &amp; follow-up/)
  assert.match(preview, /Recommendations &amp; commitments/)
  assert.match(preview, /Policy &amp; law/)
  assert.match(preview, /Later signal:/)
  assert.match(preview, /does not establish legal effect for this incident/)
  assert.match(store, /miller_north_accountability_commitments/)
  assert.match(store, /miller_north_policy_legal_instrument_incident_links/)
  assert.match(store, /\["42P01", "PGRST205"\]/)
})
