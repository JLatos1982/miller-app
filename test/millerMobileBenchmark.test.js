import assert from "node:assert/strict"
import test from "node:test"

import { millerMobileCatalog } from "../server/millerMobileCatalog.js"
import {
  auditMillerMobileSharePacks,
  buildMillerMobileCoverageMatrix,
  MILLER_MOBILE_QUERY_BENCHMARK,
  runMillerMobileQueryBenchmark,
} from "../server/millerMobileBenchmark.js"
import { assessMobileResourceReadiness } from "../server/millerMobileReadiness.js"

const fixedNow = () => new Date("2026-09-08T12:00:00.000Z")

test("frontline benchmark contains all required scenarios and returns explainable quality metrics", () => {
  const report = runMillerMobileQueryBenchmark(millerMobileCatalog, { now: fixedNow })
  assert.equal(report.query_count, 12)
  assert.equal(report.rows.length, MILLER_MOBILE_QUERY_BENCHMARK.length)
  assert.ok(report.rows.every(row => row.returned_count > 0))
  assert.ok(report.rows.every(row => typeof row.top_result_relevant === "boolean"))
  assert.ok(report.rows.every(row => row.payload_bytes > 0 && row.latency_ms >= 0))
  assert.equal(report.rows.find(row => row.id === "oat_edmonton").top_result_relevant, true)
  assert.equal(report.rows.find(row => row.id === "counselling_calgary").province_accuracy, 1)
  assert.equal(report.rows.find(row => row.id === "detox_burnaby").geography_mode, "province_broadened")
})

test("coverage matrix separates province, city, category, and mobile readiness", () => {
  const report = buildMillerMobileCoverageMatrix(millerMobileCatalog)
  assert.ok(report.catalog.total > 100)
  assert.ok(report.catalog.mobile_ready > 0)
  assert.ok(report.by_province.Alberta.oat.total > 0)
  assert.ok(report.by_province.Saskatchewan.transportation.total > 0)
  assert.ok(report.by_city.Calgary.total > 0)
  assert.ok(report.by_city.Saskatoon.categories.family_youth > 0)
})

test("mobile-ready requires current source, contact path, geography, access, and conflict-free identity", () => {
  const ready = assessMobileResourceReadiness({
    id: "resource-1",
    name: "Verified service",
    province: "Alberta",
    region: "Alberta",
    phone: "211",
    website: "https://example.org/service",
    sourceUrl: "https://example.org/service",
    accessType: "Call for current intake.",
    verification_status: "verified_active",
    location_last_verified: "2026-09-08",
  }, { now: fixedNow(), conflicts: [] })
  assert.equal(ready.mobile_ready, true)
  assert.equal(assessMobileResourceReadiness({ id: "resource-2" }, { now: fixedNow(), conflicts: ["resource-3"] }).mobile_ready, false)
})

test("representative share packs are useful and contain no private intelligence metadata", () => {
  const rows = auditMillerMobileSharePacks(millerMobileCatalog, { now: fixedNow })
  assert.equal(rows.length, 3)
  assert.ok(rows.every(row => row.resource_count >= 2 && row.resource_count <= 3 && row.has_guidance && row.all_have_contact))
  assert.ok(rows.every(row => row.internal_metadata_exposed === false))
})
