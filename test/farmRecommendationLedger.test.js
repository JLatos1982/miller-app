import test from "node:test"
import assert from "node:assert/strict"

import { buildRecommendationLedger, diffRecommendationLedgers, normalizeRecommendationRow } from "../server/farmRecommendationLedger.js"
import { childYouthLedgerFixture as childYouthLedger, spiritMattersLedgerFixture as spiritMattersLedger } from "./fixtures/privateArtifactSummaries.js"
import { runRecommendationLevelBatch } from "../server/farmPublicInstitutionListeners.js"

const base = { jurisdiction: "British Columbia", source_family: "child_youth_advocate", report: "A report", report_date: "2024", recommendation_number: "9", recommendation_text: "Provide culturally safe mental-health services.", responsible_organizations: ["Ministry of Health"], source_url: "https://example.test/report", indigenous_relevance: true, healthcare_relevance: true, mental_health_relevance: true, status: "response_received", response: "The ministry accepted the recommendation." }

test("recommendation ledger never promotes response or claimed action to implementation", () => {
  const row = normalizeRecommendationRow({ ...base, claimed_action: "A policy was announced." })
  assert.equal(row.response_is_implementation, false)
  assert.equal(row.claimed_action_is_outcome, false)
  assert.equal(row.implementation_evidence, null)
  const ledger = buildRecommendationLedger([row], { checkedAt: "2026-09-08T00:00:00Z" })
  assert.deepEqual(ledger.counts, { recommendations: 1, responses: 1, claimed_actions: 1, implementation_evidence: 0, outcome_evidence: 0, indigenous_relevant: 1, healthcare_overlap: 1, mental_health_overlap: 1, funding_service_overlap: 0 })
})

test("implementation and outcome evidence require their own source", () => {
  assert.throws(() => normalizeRecommendationRow({ ...base, implementation_evidence: "Implemented" }), /implementation_requires_source/)
  assert.throws(() => normalizeRecommendationRow({ ...base, outcome_evidence: "Improved outcomes" }), /outcome_requires_source/)
})

test("recommendation listener diff detects material response changes without timestamp churn", () => {
  const before = buildRecommendationLedger([base], { checkedAt: "2026-09-01T00:00:00Z" })
  const unchanged = buildRecommendationLedger([{ ...base, last_reviewed: "2026-09-08" }], { checkedAt: "2026-09-08T00:00:00Z" })
  assert.equal(diffRecommendationLedgers(before, unchanged).unchanged_recommendations.length, 1)
  const changed = buildRecommendationLedger([{ ...base, response: "The ministry accepted the recommendation and announced a policy review." }], { checkedAt: "2026-09-08T00:00:00Z" })
  const diff = diffRecommendationLedgers(before, changed)
  assert.equal(diff.updated_recommendations.length, 1)
  assert.equal(diff.publication_authority, false)
})

test("recommendation-level listener adapter baselines safely and routes only material changes", () => {
  const baseline = runRecommendationLevelBatch({ rows: [base], title: "Child and youth recommendations", checkedAt: "2026-09-01T00:00:00Z" })
  assert.equal(baseline.checked, 1)
  assert.equal(baseline.owner_review, 0)
  const changed = runRecommendationLevelBatch({ rows: [{ ...base, response: "Accepted with a public action plan." }], previousLedger: baseline.memory, title: "Child and youth recommendations", checkedAt: "2026-09-08T00:00:00Z" })
  assert.equal(changed.updated_documents, 1)
  assert.equal(changed.owner_review, 1)
  assert.equal(changed.publication_safe, 0)
  assert.equal(changed.mutation_authority, false)
})

test("child and youth ledger preserves responder rows and implementation gaps", () => {
  assert.equal(childYouthLedger.recommendations.length, 30)
  assert.equal(childYouthLedger.counts.distinct_alberta_recommendations, 5)
  assert.equal(childYouthLedger.counts.alberta_responder_rows, 6)
  assert.equal(childYouthLedger.recommendations.filter(row => row.implementation_evidence).length, 3)
  assert.equal(childYouthLedger.recommendations.filter(row => row.outcome_evidence).length, 0)
  assert.ok(childYouthLedger.recommendations.every(row => row.response_is_implementation === false))
})

test("Spirit Matters ledger keeps ten-year assessment separate from outcomes", () => {
  assert.equal(spiritMattersLedger.recommendations.length, 24)
  assert.equal(spiritMattersLedger.counts.original_2013_recommendations, 10)
  assert.equal(spiritMattersLedger.counts.renewed_or_new_2023_recommendations, 14)
  assert.equal(spiritMattersLedger.recommendations.filter(row => row.response).length, 24)
  assert.equal(Object.keys(spiritMattersLedger.response_sources_by_current_recommendation).length, 14)
  assert.equal(spiritMattersLedger.recommendations.filter(row => row.implementation_evidence).length, 10)
  assert.equal(spiritMattersLedger.recommendations.filter(row => row.outcome_evidence).length, 0)
  assert.ok(spiritMattersLedger.recommendations.every(row => row.claimed_action_is_outcome === false))
})
