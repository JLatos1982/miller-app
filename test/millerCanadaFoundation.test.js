import assert from "node:assert/strict"
import test from "node:test"

import foundation from "../src/data/miller-canada-foundation-2026-09-08.json" with { type: "json" }
import registry from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import { millerMobileCatalog } from "../server/millerMobileCatalog.js"
import {
  buildMillerCanadianCommunityCoverageMatrix,
  MILLER_NATIONAL_QUERY_BENCHMARK,
  runMillerMobileQueryBenchmark,
} from "../server/millerMobileBenchmark.js"
import { buildMillerMobileInventory, buildMillerMobileSearchResponse } from "../server/millerMobileApi.js"

const now = () => new Date("2026-09-08T12:00:00.000Z")

test("Canadian foundation uses bounded official-source resources and preserves consumer boundaries", () => {
  assert.equal(foundation.records.length, 25)
  assert.equal(new Set(foundation.records.map(record => record.canonical_resource_id)).size, 25)
  assert.ok(foundation.records.every(record => record.source?.url?.startsWith("https://")))
  assert.ok(foundation.records.every(record => record.last_verified_date === "2026-09-08"))
  assert.equal(/canonical_event_id|legal_record_id|owner_review|accountability_watch|investigation_id/i.test(JSON.stringify(foundation)), false)
  assert.equal(foundation.candidate_outcomes.duplicate, 3)
  assert.equal(foundation.candidate_outcomes.deferred, 2)
  assert.equal(foundation.records.filter(record => record.project_visibility.includes("miller_north")).length, 2)
})

test("national resources reconcile canonically and retain local, regional and Canada-wide scope", () => {
  for (const record of foundation.records) {
    const canonical = registry.records.find(item => item.canonical_resource_id === record.canonical_resource_id)
    assert.ok(canonical, record.canonical_resource_id)
    assert.equal(canonical.project_visibility.includes("miller"), true)
    assert.equal(canonical.verification_status, "verified_active")
  }
  const recovery = registry.records.find(record => record.canonical_resource_id === "miller_nl_recovery_centre")
  assert.equal(recovery.service_scope.physical_location.community, "St. John's")
  assert.ok(recovery.service_scope.regional_service_area.includes("Newfoundland and Labrador"))
  const national = registry.records.find(record => record.province === "Canada-wide")
  assert.equal(national.service_scope.canada_wide, true)
  assert.ok(registry.records.some(record => record.program_name === "Drogue : aide et référence"))
})

test("national benchmark is source-backed, preserves Western behavior and makes no false local-facility claims", () => {
  const benchmark = runMillerMobileQueryBenchmark(millerMobileCatalog, { now, scenarios: MILLER_NATIONAL_QUERY_BENCHMARK })
  assert.equal(benchmark.query_count, 15)
  assert.ok(benchmark.passing_queries >= 13)
  assert.equal(benchmark.rows.reduce((sum, row) => sum + row.incorrect_local_facility_claims, 0), 0)
  assert.ok(benchmark.rows.every(row => row.returned_count > 0))

  const burnaby = buildMillerMobileSearchResponse({ query: "detox in Burnaby", limit: 8 }, millerMobileCatalog, { now })
  assert.equal(burnaby.search_scope.no_verified_local_facility, true)
  assert.equal(burnaby.results.some(resource => resource.location_relationship === "located_here" && /detox|withdrawal/i.test(`${resource.name} ${resource.service_type}`)), false)
})

test("immature geographies expose coverage maturity without claiming completeness", () => {
  const ontario = buildMillerMobileSearchResponse({ query: "treatment help in Ottawa", limit: 6 }, millerMobileCatalog, { now })
  assert.equal(ontario.coverage_maturity.level, "foundation")
  assert.match(ontario.coverage_maturity.message, /coverage.*foundation.*verified options/i)
  assert.ok(ontario.results.every(resource => ["Ontario", "Canada-wide"].includes(resource.province) || resource.location_relationship === "serves_community"))

  const nunavut = buildMillerMobileSearchResponse({ query: "mental health and addiction help in Nunavut", limit: 6 }, millerMobileCatalog, { now })
  assert.equal(nunavut.coverage_maturity.level, "exploratory")
  assert.ok(nunavut.results.every(resource => ["Nunavut", "Canada-wide"].includes(resource.province)))

  const matrix = buildMillerCanadianCommunityCoverageMatrix(millerMobileCatalog, { now: now() })
  assert.ok(matrix.community_count > 150)
  assert.equal(matrix.by_province.Ontario.find(row => row.community === "Thunder Bay").maturity, "foundation")
  assert.equal(matrix.by_province.Nunavut.find(row => row.community === "Iqaluit").maturity, "exploratory")
  const inventory = buildMillerMobileInventory(millerMobileCatalog)
  assert.equal(inventory.coverage_maturity["British Columbia"], "deep")
  assert.equal(inventory.coverage_maturity.Yukon, "exploratory")
})
