import assert from "node:assert/strict"
import test from "node:test"

import eastern from "../src/data/miller-eastern-pathways-2026-09-08.json" with { type: "json" }
import registry from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import { millerMobileCatalog } from "../server/millerMobileCatalog.js"
import {
  MILLER_EASTERN_QUERY_BENCHMARK,
  MILLER_HEALTHCARE_ADJACENT_QUERY_BENCHMARK,
  runMillerHealthcareAdjacentBenchmark,
  runMillerMobileQueryBenchmark,
} from "../server/millerMobileBenchmark.js"
import { buildMillerMobileSearchResponse, buildMillerMobileSharePack } from "../server/millerMobileApi.js"

const now = () => new Date("2026-09-08T12:00:00.000Z")

test("Eastern resource batch is canonical, official-source and publication safe", () => {
  assert.equal(eastern.records.length, 32)
  assert.equal(eastern.candidate_outcomes.accepted_new, 28)
  assert.equal(eastern.candidate_outcomes.enriched_existing, 4)
  assert.equal(eastern.healthcare_adjacent_review.accepted_supporting_layer, 6)
  assert.equal(new Set(eastern.records.map(record => record.canonical_resource_id)).size, eastern.records.length)
  assert.ok(eastern.records.every(record => record.source?.url?.startsWith("https://")))
  assert.ok(eastern.records.every(record => record.last_verified_date === "2026-09-08"))
  assert.equal(/canonical_event_id|legal_record_id|owner_review|accountability_watch|investigation_id/i.test(JSON.stringify(eastern)), false)
  for (const record of eastern.records) {
    assert.ok(registry.records.some(candidate => candidate.canonical_resource_id === record.canonical_resource_id), record.canonical_resource_id)
  }
})

test("Eastern benchmark passes without false local facilities", () => {
  const report = runMillerMobileQueryBenchmark(millerMobileCatalog, { now, scenarios: MILLER_EASTERN_QUERY_BENCHMARK })
  assert.equal(report.passing_queries, 15)
  assert.equal(report.rows.reduce((sum, row) => sum + row.incorrect_local_facility_claims, 0), 0)
})

test("healthcare-adjacent support is query-gated and keeps ordinary addiction search focused", () => {
  const report = runMillerHealthcareAdjacentBenchmark(millerMobileCatalog, { now, scenarios: MILLER_HEALTHCARE_ADJACENT_QUERY_BENCHMARK })
  assert.equal(report.passing_scenarios, 5)
  assert.deepEqual(report.ordinary_addiction_query_adjacent_results, [])

  const hospital = buildMillerMobileSearchResponse({ query: "discharged from hospital in PEI and no primary care, need mental health support", limit: 10 }, millerMobileCatalog, { now })
  assert.equal(hospital.workflow.intent, "hospital_to_community")
  assert.ok(hospital.workflow.needs.some(need => need.need_id === "hospital_discharge"))
  assert.ok(hospital.results.some(resource => resource.resource_layer === "healthcare_adjacent_support"))
})

test("French names and language metadata survive the canonical and mobile projections", () => {
  const response = buildMillerMobileSearchResponse({ query: "addiction help in Montreal", limit: 10 }, millerMobileCatalog, { now })
  assert.equal(response.interpreted.location, "Montréal")
  assert.equal(response.interpreted.province, "Quebec")
  assert.ok(response.results.some(resource => /Accès aux services en dépendance/.test(resource.name)))
  assert.ok(response.results.some(resource => resource.languages.includes("French")))
})

test("telephone contact does not turn regional in-person programs into virtual services", () => {
  const response = buildMillerMobileSearchResponse({ query: "francophone addiction support in Bathurst", province: "New Brunswick", location: "Bathurst", limit: 10 }, millerMobileCatalog, { now })
  const vitalite = response.results.find(resource => resource.canonical_id === "miller_nb_vitalite_addictions")
  assert.ok(vitalite)
  assert.equal(vitalite.virtual, false)
  assert.equal(vitalite.location_relationship, "serves_community")
  assert.equal(vitalite.location_label, "Serves Bathurst")
})

test("Eastern share packs contain practical data but no supporting-layer internals", () => {
  const response = buildMillerMobileSearchResponse({ query: "Indigenous patient needs health system navigation in Labrador after hospital discharge", limit: 10 }, millerMobileCatalog, { now })
  const pack = buildMillerMobileSharePack(response, response.workflow.recommended_pack_ids)
  assert.match(pack.text, /resource/i)
  assert.equal(/resource_layer|workflow_relevance|owner_review|accountability|palant[ií]r|miller north/i.test(JSON.stringify(pack)), false)
})
