import assert from "node:assert/strict"
import test from "node:test"

import verification from "../src/data/miller-legacy-priority-verification-2026-09-08.json" with { type: "json" }
import { millerMobileCatalog } from "../server/millerMobileCatalog.js"
import { assessMobileResourceReadiness } from "../server/millerMobileReadiness.js"

test("bounded legacy refresh contains 25 current first-party or official HTTPS records", () => {
  assert.equal(verification.records.length, 25)
  assert.equal(new Set(verification.records.map(record => record.canonical_resource_id)).size, 25)
  assert.ok(verification.records.every(record => record.website.startsWith("https://")))
  assert.ok(verification.records.every(record => record.last_verified_date === "2026-09-08"))
  assert.ok(verification.records.every(record => record.project_visibility.length === 1 && record.project_visibility[0] === "miller"))
})

test("legacy refresh enriches existing identities instead of adding parallel mobile records", () => {
  const ids = new Set(verification.records.map(record => record.canonical_resource_id))
  assert.equal(millerMobileCatalog.filter(resource => ids.has(resource.id)).length, 25)
  for (const id of ids) {
    const resource = millerMobileCatalog.find(item => item.id === id)
    assert.equal(resource.verification_status, "verified_active", id)
    assert.equal(resource.location_last_verified, "2026-09-08", id)
    assert.equal(assessMobileResourceReadiness(resource, { now: new Date("2026-09-08T12:00:00Z") }).mobile_ready, true, id)
  }
})
