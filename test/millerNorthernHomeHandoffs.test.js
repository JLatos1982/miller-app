import assert from "node:assert/strict"
import test from "node:test"

import handoffs from "../src/data/miller-northern-home-community-handoffs-2026-09-09.json" with { type: "json" }
import registry from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import { millerMobileCatalog } from "../server/millerMobileCatalog.js"
import { MILLER_HOME_COMMUNITY_HANDOFF_BENCHMARK, runMillerNorthernPathwayBenchmark } from "../server/millerMobileBenchmark.js"
import { buildMillerMobileSearchResponse, buildMillerMobileSharePack } from "../server/millerMobileApi.js"

const now = () => new Date("2026-09-09T12:00:00.000Z")
test("home-community handoffs are canonical, first-party and publication safe", () => {
  assert.equal(handoffs.records.length, 19)
  assert.equal(new Set(handoffs.records.map(record => record.canonical_resource_id)).size, 19)
  assert.ok(handoffs.records.every(record => record.source?.url?.startsWith("https://")))
  assert.ok(handoffs.records.every(record => record.last_verified_date === "2026-09-09"))
  assert.equal(/structural_inequality|disparity|owner_review|accountability|investigation|legal_record/i.test(JSON.stringify(handoffs.records)), false)
  for (const record of handoffs.records) {
    const canonical = registry.records.find(candidate => candidate.canonical_resource_id === record.canonical_resource_id)
    assert.ok(canonical, record.canonical_resource_id)
    assert.ok(canonical.project_visibility.includes("miller"), record.canonical_resource_id)
  }
})

test("eleven home-community scenarios preserve origins and make no false local-facility claims", () => {
  const benchmark = runMillerNorthernPathwayBenchmark(millerMobileCatalog, { now, scenarios: MILLER_HOME_COMMUNITY_HANDOFF_BENCHMARK })
  assert.equal(benchmark.passing_scenarios, 11)
  assert.equal(benchmark.false_local_facility_claims, 0)
  assert.ok(benchmark.rows.filter(row => row.transportation_identified).length >= 8)
  assert.ok(benchmark.rows.filter(row => row.return_home_support).length >= 3)
})

test("local access, regional destination and share wording remain distinct", () => {
  const churchill = buildMillerMobileSearchResponse({ query: "addiction help in Churchill and transportation", limit: 8 }, millerMobileCatalog, { now })
  const local = churchill.results.find(resource => resource.canonical_id === "miller_mb_churchill_health_centre_mha")
  assert.equal(local.location_relationship, "located_here")
  assert.match(local.scope_note, /not a verified fixed-site withdrawal/i)
  assert.equal(churchill.results.some(resource => resource.province === "Newfoundland and Labrador"), false)

  const arviat = buildMillerMobileSearchResponse({ query: "addiction help in Arviat and transportation", limit: 12 }, millerMobileCatalog, { now })
  const access = arviat.results.find(resource => resource.canonical_id === "miller_nu_arviat_health_access")
  assert.equal(access.location_relationship, "located_here")
  assert.match(access.scope_note, /not a verified local withdrawal-management/i)
  const pack = buildMillerMobileSharePack(arviat, [access.canonical_id])
  assert.match(pack.text, /Located in Arviat/)
  assert.doesNotMatch(pack.text, /owner.review|structural.inequality|miller north|palant[ií]r/i)
})

test("Indigenous practical routing remains separate from evidence and accountability", () => {
  const shared = [
    "miller_mb_norway_house_medical_social_work",
    "miller_mb_norway_house_treatment_access",
    "miller_mb_cross_lake_social_development",
    "miller_on_kenora_hart_hub",
    "miller_on_kenora_mobile_mha",
    "miller_nl_nunatsiavut_mental_wellness",
    "miller_nl_nunatsiavut_community_family_services",
  ]
  for (const id of shared) assert.deepEqual(registry.records.find(record => record.canonical_resource_id === id)?.project_visibility, ["miller", "miller_north"])
  assert.equal(registry.records.some(record => /structural|disparity|audit finding|racism score/i.test(`${record.program_name} ${record.description}`)), false)
})
