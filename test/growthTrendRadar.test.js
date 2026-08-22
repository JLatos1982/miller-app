import test from "node:test"
import assert from "node:assert/strict"
import { buildGrowthTrendReport, classifyTrendObservation, dedupeTrendObservations, planGrowthPriorities, slowGrowthProjection, trendFingerprint } from "../server/growthTrendRadar.js"

test("sparse authoritative low-risk candidates rank deterministically above duplicate or protected candidates", () => {
  const opportunities = planGrowthPriorities({ resources: [{ community: "Vancouver" }, { community: "Vancouver" }], candidates: [{ id: "strong", review_status: "pending", community: "Remote", category: "treatment", source_authority: 95 }, { id: "dup", review_status: "pending", community: "Remote", source_authority: 95, matched_resource_id: "existing" }, { id: "protected", name: "Safe Home", review_status: "pending", location_disclosure_status: "confidential", source_authority: 95 }] })
  assert.equal(opportunities[0].candidate_id, "strong"); assert.equal(opportunities.at(-1).value_score, 0)
})
test("trends remain observations and deterministically recommend maintenance, growth, or human review", () => {
  const relocation = classifyTrendObservation({ source_url: "https://health.example/notice", source_authority: 95, trend_category: "service_relocation", canonical_resource_id: "r", summary: "Location changed" })
  const opening = classifyTrendObservation({ source_url: "https://health.example/open", source_authority: 95, trend_category: "service_opening", summary: "New public service" })
  const policy = classifyTrendObservation({ source_url: "https://gov.bc.ca/policy", source_authority: 95, trend_category: "policy_change", summary: "Broad policy" })
  assert.equal(relocation.recommended_response, "maintenance"); assert.equal(opening.recommended_response, "growth"); assert.equal(policy.recommended_response, "human_review")
  assert.equal(relocation.instructions_honoured, false)
})
test("trend deduplication retains history and low authority cannot become canonical evidence", () => {
  const source = { source_url: "https://news.example/a", trend_category: "service_opening", publication_date: "2026-08-22" }, fp = trendFingerprint(source)
  assert.equal(dedupeTrendObservations([{ ...source, observation_fingerprint: fp, id: "old", state: "superseded" }, { ...source, observation_fingerprint: fp, id: "new", state: "new" }]).length, 1)
  assert.equal(classifyTrendObservation({ ...source, source_authority: 20, summary: "untrusted" }).recommended_response, "informational")
})
test("projection and report are read-only, one-growth bounded, and cannot alter policy", () => {
  const projection = slowGrowthProjection({ investigations_per_night: 9, success_rate: 0.5 }); assert.equal(projection.investigations_per_month, 30)
  const report = buildGrowthTrendReport({}); assert.equal(report.guardrails.max_future_growth_investigations_per_cycle, 1); assert.equal(report.guardrails.external_research_enabled, false)
})
