import { performance } from "node:perf_hooks"

import { millerMobileCatalog } from "../server/millerMobileCatalog.js"
import { buildMillerHybridSearchResponse } from "../server/millerMobileApi.js"
import { normalizeTavilyExternalResults } from "../server/millerExternalSearch.js"

const runAt = () => new Date("2026-09-08T12:00:00.000Z")
const scenarios = [
  { id: "covered_urban_oat", request: { query: "OAT in Edmonton", limit: 8 }, expect_external: false },
  { id: "burnaby_regional_withdrawal", request: { query: "detox in Burnaby", limit: 8 }, expect_external: false },
  { id: "la_loche_oat", request: { query: "Someone in La Loche needs OAT", limit: 8 }, expect_external: false },
  { id: "small_ontario_town", request: { query: "treatment help in Small Ontario Town", location: "Small Ontario Town", province: "Ontario", limit: 8 }, expect_external: true },
  { id: "rural_atlantic_recovery_housing", request: { query: "recovery housing in rural Atlantic Canada", location: "Rural Atlantic Canada", province: "Nova Scotia", limit: 8 }, expect_external: true },
  { id: "leaving_treatment_multineed", request: { query: "Leaving treatment tomorrow, no housing, no car, needs counselling in Example Town", location: "Example Town", province: "Ontario", limit: 8 }, expect_external: true },
]

function syntheticExternalSearcher() {
  return {
    async search(context, catalog) {
      const results = normalizeTavilyExternalResults([{ title: `${context.province || "Canada"} official practical support`, url: "https://www.ontario.ca/page/mental-health-and-addictions", content: "Official public source for current support pathways." }], context, catalog)
      return { attempted: true, status: "completed", cache_status: "miss", latency_ms: 180, results, estimated_cost_usd: null, cost_status: "plan_rate_not_configured" }
    },
  }
}

const rows = []
for (const scenario of scenarios) {
  const started = performance.now()
  const response = await buildMillerHybridSearchResponse(scenario.request, millerMobileCatalog, { now: runAt, externalSearcher: syntheticExternalSearcher() })
  const millerLatency = Number((performance.now() - started).toFixed(2))
  const externalTriggered = response.external_search.attempted
  rows.push({
    id: scenario.id,
    internal_latency_ms: millerLatency,
    synthetic_external_latency_ms: externalTriggered ? response.external_search.latency_ms : 0,
    combined_latency_ms: Number((millerLatency + (externalTriggered ? response.external_search.latency_ms : 0)).toFixed(2)),
    external_triggered: externalTriggered,
    trigger_reasons: response.search_strategy.external_search_reasons,
    verified_results: response.verified_result_count,
    external_results: response.external_result_count,
    external_labeling_correct: response.results.filter(item => item.result_origin === "external").every(item => item.verified_status === "external_unverified" && /not yet verified/i.test(item.external_label)),
    false_local_facility_claims: response.results.filter(item => item.location_relationship === "located_here" && item.physical_location?.community !== response.interpreted.location).length,
    expected_external: scenario.expect_external,
    passed: externalTriggered === scenario.expect_external,
  })
}

const externalRows = rows.filter(row => row.external_triggered)
const report = {
  benchmark: "miller-navigator-hybrid-synthetic-v1",
  generated_at: new Date().toISOString(),
  scope: "Synthetic test traffic only; this is not production user telemetry and the external latency is a declared 180 ms simulation.",
  summary: {
    searches: rows.length,
    internal_only_search_rate: Number(((rows.length - externalRows.length) / rows.length).toFixed(3)),
    external_search_trigger_rate: Number((externalRows.length / rows.length).toFixed(3)),
    average_miller_search_latency_ms: Number((rows.reduce((sum, row) => sum + row.internal_latency_ms, 0) / rows.length).toFixed(2)),
    average_combined_latency_ms: Number((rows.reduce((sum, row) => sum + row.combined_latency_ms, 0) / rows.length).toFixed(2)),
    external_result_labeling_failures: rows.filter(row => !row.external_labeling_correct).length,
    false_local_facility_claims: rows.reduce((sum, row) => sum + row.false_local_facility_claims, 0),
    estimated_variable_external_cost_usd: null,
    cost_note: "No plan rate is configured in this test. The runtime records one external-search unit and can use TAVILY_ESTIMATED_SEARCH_COST_USD when an owner-approved plan rate is supplied.",
  },
  trigger_reasons: Object.fromEntries([...new Set(rows.flatMap(row => row.trigger_reasons))].map(reason => [reason, rows.filter(row => row.trigger_reasons.includes(reason)).length])),
  rows,
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
