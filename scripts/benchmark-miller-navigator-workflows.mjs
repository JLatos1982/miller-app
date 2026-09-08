import { performance } from "node:perf_hooks"
import { millerMobileCatalog } from "../server/millerMobileCatalog.js"
import { buildMillerMobileSearchResponse } from "../server/millerMobileApi.js"

const scenarios = [
  ["detox_housing_surrey", "Someone needs detox and somewhere to stay in Surrey", "Surrey", "British Columbia", ["detox", "housing"]],
  ["detox_discharge_transport_surrey", "Someone is leaving detox Friday, has nowhere to stay and doesn't drive in Surrey", "Surrey", "British Columbia", ["detox", "housing", "transportation", "continuity"]],
  ["oat_no_doctor_edmonton", "Client wants OAT in Edmonton but doesn't have a family doctor", "Edmonton", "Alberta", ["oat", "access_navigation"]],
  ["treatment_funding", "Someone can't afford treatment", null, null, ["treatment", "funding"]],
  ["counselling_affordability_calgary", "Need low-cost counselling in Calgary", "Calgary", "Alberta", ["counselling", "funding"]],
  ["housing_after_treatment_calgary", "Looking for housing after treatment in Calgary", "Calgary", "Alberta", ["housing", "treatment", "continuity"]],
  ["rural_withdrawal_yorkton", "Detox in Yorkton", "Yorkton", "Saskatchewan", ["detox"]],
  ["northern_withdrawal_laronge", "Withdrawal help in La Ronge", "La Ronge", "Saskatchewan", ["detox"]],
  ["mental_housing_saskatoon", "Mental health and housing help in Saskatoon", "Saskatoon", "Saskatchewan", ["mental_health", "housing"]],
  ["counselling_transport_prince_albert", "Need counselling in Prince Albert and transportation is an issue", "Prince Albert", "Saskatchewan", ["counselling", "transportation"]],
  ["burnaby_regional_withdrawal", "Detox in Burnaby", "Burnaby", "British Columbia", ["detox"]],
  ["port_hardy_mental_health", "Mental health support in Port Hardy", "Port Hardy", "British Columbia", ["mental_health"]],
  ["terrace_treatment", "Treatment help in Terrace", "Terrace", "British Columbia", ["treatment"]],
  ["cranbrook_addiction", "Addiction treatment in Cranbrook", "Cranbrook", "British Columbia", ["treatment"]],
  ["prince_george_housing_transition", "Housing after treatment in Prince George", "Prince George", "British Columbia", ["housing", "treatment", "continuity"]],
  ["bonnyville_oat", "OAT in Bonnyville", "Bonnyville", "Alberta", ["oat"]],
  ["high_river_counselling", "Counselling in High River", "High River", "Alberta", ["counselling"]],
  ["canmore_addiction", "Addiction help in Canmore", "Canmore", "Alberta", ["treatment"]],
  ["reentry_housing_addiction", "Leaving corrections and need housing and addiction support", null, null, ["reentry", "housing"]],
  ["family_after_treatment", "Family support after treatment", null, null, ["treatment", "family_support"]],
  ["indigenous_northern_sask", "Indigenous treatment support in northern Saskatchewan", null, "Saskatchewan", ["treatment"]],
  ["legal_housing", "Need legal help with housing", null, null, ["legal", "housing"]],
  ["funding_transport_treatment", "Funding and transportation for treatment", null, null, ["funding", "transportation", "treatment"]],
  ["basic_needs_addiction", "Need food and addiction support", null, null, ["basic_needs"]],
]

const unsafe = /you qualify|you are eligible|funding (?:is|will be) approved|bed (?:is|will be) available|clinically suitable|must take|diagnos/i
const runAt = new Date("2026-09-08T12:00:00.000Z")
const results = scenarios.map(([id, query, location, province, expectedNeeds]) => {
  const started = performance.now()
  const response = buildMillerMobileSearchResponse({ query, limit: 16 }, millerMobileCatalog, { now: () => runAt })
  const latencyMs = Number((performance.now() - started).toFixed(2))
  const needs = response.workflow.needs.map(item => item.need_id)
  const checks = {
    useful_results: response.results.length > 0,
    useful_top_result: Boolean(response.results[0]?.matched_needs.includes(response.workflow.needs[0]?.need_id)),
    location: location === null || response.interpreted.location === location,
    province: province === null || response.interpreted.province === province,
    need_decomposition: expectedNeeds.every(need => needs.includes(need)),
    pathway: response.workflow.pathway.length > 0,
    explainability: response.results.some(item => item.why_shown.length > 0),
    handoff_selection: response.workflow.recommended_pack_ids.length > 0,
    no_unsupported_claims: !unsafe.test(JSON.stringify({ guidance: response.guidance, workflow: response.workflow })),
    practical_boundary: response.source_policy === "verified_original_miller_practical_resources_only",
  }
  const passed = Object.values(checks).every(Boolean)
  return {
    id, query, expected_needs: expectedNeeds, detected_needs: needs, location: response.interpreted.location,
    province: response.interpreted.province, returned: response.returned_count, scope_mode: response.search_scope.mode,
    broaden_available: response.broaden_nearby.available, pathway_steps: response.workflow.pathway.length,
    suggested_pack_size: response.workflow.recommended_pack_ids.length, latency_ms: latencyMs,
    minimum_taps_to_share_sheet: 4, checks, passed,
  }
})

const failed = results.filter(item => !item.passed)
const latencies = results.map(item => item.latency_ms).sort((a, b) => a - b)
const output = {
  benchmark: "miller-navigator-professional-workflow-v1",
  generated_at: new Date().toISOString(),
  interpretation: "The four-tap model covers query focus or microphone, search, opening the suggested pack, and Share; voice may require a fifth Stop tap. This is not observed human timing. Native under-60-second timing remains a pilot/device test.",
  summary: {
    scenarios: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    pass_rate: Number(((results.length - failed.length) / results.length).toFixed(3)),
    median_pipeline_latency_ms: latencies[Math.floor(latencies.length / 2)],
    maximum_pipeline_latency_ms: latencies.at(-1),
    unsupported_claim_failures: results.filter(item => !item.checks.no_unsupported_claims).length,
  },
  failures: failed.map(item => ({ id: item.id, checks: item.checks })),
  scenarios_detail: results,
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
