import test from "node:test"
import assert from "node:assert/strict"

import { compareOcyaRecommendationMemory, normalizeOcyaEvaluation, parseOcyaRecommendationTable, summarizeOcyaRecommendationCycle } from "../server/millerNorthAlbertaChildYouthAdvocateListener.js"

const html = `<table id="tablepress-2"><thead><tr><th>headers</th></tr></thead><tbody><tr><td>Health review</td><td>Investigative Review</td><td>Recommendation 1</td><td>Nov-24</td><td>Ministry of Health</td><td>Improve mental health access for Indigenous young people.</td><td>First Nations youth receive care.</td><td>Work with communities.</td><td>Ongoing – Some Progress</td><td>Mar-26</td><td>The ministry reported a policy.</td></tr></tbody></table>`

test("OCYA parser preserves recommendation, responder and evaluation as distinct fields", () => {
  const [row] = parseOcyaRecommendationTable(html, { checkedAt: "2026-09-07T00:00:00.000Z" })
  assert.equal(row.progress_reported_by, "Ministry of Health")
  assert.equal(row.evaluation_status, "ongoing_some_progress")
  assert.equal(row.healthcare_relevant, true)
  assert.equal(row.indigenous_relevance_explicit, true)
  assert.equal(row.implementation_evidence, null)
  assert.equal(row.outcome_evidence, null)
})

test("OCYA memory detects real content changes without treating rechecks as new", () => {
  const first = parseOcyaRecommendationTable(html)
  const initial = compareOcyaRecommendationMemory({}, first)
  const replay = compareOcyaRecommendationMemory(initial.memory, first)
  assert.equal(replay.new_rows.length, 0)
  assert.equal(replay.changed_rows.length, 0)
  assert.equal(replay.unchanged_rows.length, 1)
  const changed = parseOcyaRecommendationTable(html.replace("Some Progress", "Not Met"))
  assert.equal(compareOcyaRecommendationMemory(initial.memory, changed).changed_rows.length, 1)
})

test("OCYA metrics expose transparent review counts", () => {
  const rows = parseOcyaRecommendationTable(html)
  const comparison = compareOcyaRecommendationMemory({}, rows)
  assert.deepEqual(summarizeOcyaRecommendationCycle(rows, comparison), {
    rows_checked: 1,
    new_rows: 1,
    changed_rows: 0,
    unchanged_rows: 0,
    healthcare_rows: 1,
    explicit_indigenous_rows: 1,
    miller_north_review_rows: 1,
    claimed_implementation_rows: 0,
    independent_outcome_rows: 0,
  })
  assert.equal(normalizeOcyaEvaluation("Met"), "met_by_advocate_evaluation")
})
