import assert from "node:assert/strict"
import test from "node:test"

import northern from "../src/data/miller-northern-remote-pathways-2026-09-08.json" with { type: "json" }
import registry from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import { millerMobileCatalog } from "../server/millerMobileCatalog.js"
import {
  MILLER_NATIONAL_QUERY_BENCHMARK,
  MILLER_NORTHERN_QUERY_BENCHMARK,
  runMillerMobileQueryBenchmark,
  runMillerNorthernPathwayBenchmark,
} from "../server/millerMobileBenchmark.js"
import { buildMillerMobileSearchResponse, buildMillerMobileSharePack } from "../server/millerMobileApi.js"

const now = () => new Date("2026-09-08T12:00:00.000Z")

test("northern resource batch is official-source, canonical and publication safe", () => {
  assert.equal(northern.records.length, 25)
  assert.equal(northern.candidate_outcomes.accepted_new, 17)
  assert.equal(northern.candidate_outcomes.enriched_existing, 8)
  assert.equal(new Set(northern.records.map(record => record.canonical_resource_id)).size, 25)
  assert.ok(northern.records.every(record => record.source?.url?.startsWith("https://")))
  assert.ok(northern.records.every(record => record.last_verified_date === "2026-09-08"))
  assert.equal(/canonical_event_id|legal_record_id|owner_review|accountability_watch|investigation_id/i.test(JSON.stringify(northern)), false)
  for (const record of northern.records) {
    assert.ok(registry.records.some(candidate => candidate.canonical_resource_id === record.canonical_resource_id), record.canonical_resource_id)
  }
})

test("national weak seams are repaired and northern pathways make no false local claims", () => {
  const national = runMillerMobileQueryBenchmark(millerMobileCatalog, { now, scenarios: MILLER_NATIONAL_QUERY_BENCHMARK })
  const northernBenchmark = runMillerNorthernPathwayBenchmark(millerMobileCatalog, { now, scenarios: MILLER_NORTHERN_QUERY_BENCHMARK })
  assert.equal(national.passing_queries, 15)
  assert.equal(northernBenchmark.passing_scenarios, 10)
  assert.equal(northernBenchmark.false_local_facility_claims, 0)
  assert.ok(northernBenchmark.rows.filter(row => row.transportation_identified).length >= 4)
  assert.ok(northernBenchmark.rows.filter(row => row.return_home_support).length >= 2)
})

test("Nunavut uses region-specific access and medical-travel contacts", () => {
  const rankin = buildMillerMobileSearchResponse({ query: "addiction help in Rankin Inlet", limit: 8 }, millerMobileCatalog, { now })
  assert.equal(rankin.interpreted.location, "Rankin Inlet")
  assert.equal(rankin.interpreted.province, "Nunavut")
  assert.equal(rankin.results[0].name, "Kivalliq Community Health Access")
  assert.equal(rankin.results[0].phone, "867-645-8300")
  assert.match(rankin.results[0].scope_note, /regional hub/i)
  assert.equal(rankin.results.find(resource => resource.name === "Qikiqtaaluk Community Health Access")?.location_relationship, "location_not_established")
  assert.equal(rankin.broaden_nearby.label, "Show regional options")
  assert.equal(rankin.broaden_nearby.behavior, "broaden_access")
  const rankinTravel = buildMillerMobileSearchResponse({ query: "treatment and transportation from Rankin Inlet", limit: 10 }, millerMobileCatalog, { now })
  assert.equal(rankinTravel.results.find(resource => resource.name === "Kivalliq Medical Travel")?.phone, "1-844-886-8020")
  assert.equal(rankinTravel.results.find(resource => resource.name === "Qikiqtaaluk Medical Travel")?.location_relationship, "location_not_established")

  const cambridge = buildMillerMobileSearchResponse({ query: "mental health and addiction access in Cambridge Bay", limit: 8 }, millerMobileCatalog, { now })
  assert.equal(cambridge.results[0].name, "Kitikmeot Community Health Access")
  assert.equal(cambridge.results[0].phone, "867-983-4500")
  assert.equal(cambridge.search_scope.incorrect_local_facility_claims, undefined)
})

test("return-home workflow is deterministic and share packs preserve only practical pathway details", () => {
  const response = buildMillerMobileSearchResponse({ query: "coming home to Prince Rupert after treatment and need housing and counselling", limit: 10 }, millerMobileCatalog, { now })
  assert.equal(response.workflow.intent, "return_home_after_treatment")
  assert.ok(response.workflow.needs.some(need => need.need_id === "continuity"))
  assert.match(response.guidance.context, /return home/i)
  assert.ok(response.workflow.pathway.some(step => step.step_id === "return_home_support"))

  const comingBack = buildMillerMobileSearchResponse({ query: "coming back to Prince Rupert after treatment and need counselling", limit: 8 }, millerMobileCatalog, { now })
  assert.equal(comingBack.workflow.intent, "return_home_after_treatment")

  const labrador = buildMillerMobileSearchResponse({ query: "treatment and medical travel from Labrador", limit: 8 }, millerMobileCatalog, { now })
  const selected = labrador.results.filter(resource => resource.access_pathway).slice(0, 3).map(resource => resource.canonical_id)
  const pack = buildMillerMobileSharePack(labrador, selected)
  assert.match(pack.text, /Regional intake:|Travel support:|After returning home:/)
  assert.equal(/owner_review|accountability|canonical_event|palant[ií]r|miller north/i.test(JSON.stringify(pack)), false)
})

test("broaden_access remains compatible with broaden_nearby request semantics", () => {
  const response = buildMillerMobileSearchResponse({ query: "addiction treatment from Churchill", broaden_access: true, limit: 8 }, millerMobileCatalog, { now })
  assert.equal(response.broaden_nearby.applied, true)
  assert.equal(response.search_scope.geography_broadened, true)
  assert.equal(response.broaden_nearby.behavior, "broaden_access")
})
