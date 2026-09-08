import { performance } from "node:perf_hooks"

import { millerMobileCatalog } from "../server/millerMobileCatalog.js"
import { buildMillerMobileSearchResponse } from "../server/millerMobileApi.js"

const scenarios = Object.freeze([
  { id: "port_hardy_withdrawal_transport", query: "Someone in Port Hardy needs withdrawal help and doesn't have transportation", location: "Port Hardy", province: "British Columbia", needs: ["detox", "transportation"], expectTransport: true },
  { id: "haida_gwaii_treatment", query: "Client in Haida Gwaii wants addiction treatment", location: "Haida Gwaii", province: "British Columbia", needs: ["treatment"] },
  { id: "la_loche_oat", query: "Someone in La Loche needs OAT", location: "La Loche", province: "Saskatchewan", needs: ["oat"] },
  { id: "high_level_detox_housing", query: "Person in High Level needs detox and somewhere to stay afterward", location: "High Level", province: "Alberta", needs: ["detox", "housing", "continuity"] },
  { id: "fort_st_john_transition", query: "Someone leaving treatment near Fort St. John needs housing and counselling", location: "Fort St. John", province: "British Columbia", needs: ["housing", "counselling", "continuity"] },
])

const unsafe = /you qualify|you are eligible|funding (?:is|will be) approved|bed (?:is|will be) available|clinically suitable|must take|diagnos/i
const normalized = value => String(value ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim()
const runAt = new Date("2026-09-08T12:00:00.000Z")

const rows = scenarios.map(scenario => {
  const started = performance.now()
  const response = buildMillerMobileSearchResponse({ query: scenario.query, limit: 16 }, millerMobileCatalog, { now: () => runAt })
  const detectedNeeds = response.workflow.needs.map(item => item.need_id)
  const useful = response.results.some(item => item.matched_needs.length > 0)
  const transportationRecognized = !scenario.expectTransport || detectedNeeds.includes("transportation")
  const hasTransportPathway = !scenario.expectTransport || response.results.some(item => /transport|travel/i.test(`${item.category} ${item.service_type} ${item.transportation_note}`))
  const checks = {
    useful_results: response.results.length > 0 && useful,
    geography: response.interpreted.location === scenario.location && response.interpreted.province === scenario.province,
    need_decomposition: scenario.needs.every(need => detectedNeeds.includes(need)),
    regional_pathway: response.workflow.pathway.length > 0,
    transportation_recognition: transportationRecognized,
    transportation_resource: hasTransportPathway,
    no_unsupported_claims: !unsafe.test(JSON.stringify({ guidance: response.guidance, workflow: response.workflow, scope: response.search_scope })),
    no_false_local_facility: response.results.every(item => item.location_relationship !== "located_here" || normalized(item.physical_location?.community) === normalized(scenario.location)),
    practical_boundary: response.source_policy === "verified_original_miller_practical_resources_only",
  }
  return {
    ...scenario,
    detected_needs: detectedNeeds,
    scope_mode: response.search_scope.mode,
    no_verified_local_facility: response.search_scope.no_verified_local_facility,
    returned: response.returned_count,
    top_results: response.results.slice(0, 3).map(item => ({ name: item.name, location: item.location_label, why: item.why_shown })),
    latency_ms: Number((performance.now() - started).toFixed(2)),
    checks,
    passed: Object.values(checks).every(Boolean),
  }
})

const failures = rows.filter(row => !row.passed)
process.stdout.write(`${JSON.stringify({
  benchmark: "miller-navigator-rural-workflow-v1",
  generated_at: new Date().toISOString(),
  summary: {
    scenarios: rows.length,
    passed: rows.length - failures.length,
    failed: failures.length,
    unsupported_claim_failures: rows.filter(row => !row.checks.no_unsupported_claims).length,
    incorrect_local_facility_claims: rows.filter(row => !row.checks.no_false_local_facility).length,
  },
  failures: failures.map(row => ({ id: row.id, checks: row.checks })),
  scenarios: rows,
}, null, 2)}\n`)
