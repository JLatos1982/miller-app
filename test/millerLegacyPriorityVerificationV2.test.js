import assert from "node:assert/strict"
import test from "node:test"

import refresh from "../src/data/miller-legacy-priority-verification-v2-2026-09-08.json" with { type: "json" }
import { millerMobileCatalog } from "../server/millerMobileCatalog.js"
import { buildMobileReadinessIndex } from "../server/millerMobileReadiness.js"

test("second legacy refresh batch enriches nine high-use records from current first-party sources", () => {
  assert.equal(refresh.records.length, 9)
  assert.equal(refresh.deferred.length, 1)
  assert.ok(refresh.records.every(record => record.source.url.startsWith("https://")))
  assert.ok(refresh.records.every(record => record.last_verified_date === "2026-09-08"))
  assert.equal(new Set(refresh.records.map(record => record.canonical_resource_id)).size, 9)
  assert.equal(/owner_review|canonical_event_id|investigation|accountability_watch/i.test(JSON.stringify(refresh)), false)
})

test("refreshed legacy records project once and meet the mobile-ready verification gate", () => {
  const readiness = buildMobileReadinessIndex(millerMobileCatalog, { now: new Date("2026-09-08T12:00:00.000Z") })
  for (const record of refresh.records) {
    assert.equal(millerMobileCatalog.filter(resource => resource.id === record.canonical_resource_id).length, 1, record.canonical_resource_id)
    assert.equal(readiness.get(record.canonical_resource_id)?.mobile_ready, true, record.canonical_resource_id)
  }
})
