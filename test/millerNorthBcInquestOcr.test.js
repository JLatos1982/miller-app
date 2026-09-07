import test from "node:test"
import assert from "node:assert/strict"

import { classifyBcInquestOcr, summarizeBcInquestOcr } from "../server/millerNorthBcInquestOcr.js"

const record = { document_id: "doc", url: "https://example.test/verdict.pdf", person_or_event: "Public event", year: 2015 }

test("OCR triage never infers Indigenous relevance from event identity or geography", () => {
  const result = classifyBcInquestOcr(record, "Verdict at inquest. The person was treated in the emergency department in a rural community.")
  assert.equal(result.indigenous_relevance_explicit, false)
  assert.equal(result.classification, "healthcare_relevant_no_indigenous_relevance_established")
  assert.equal(result.publication_status, "private_review_only")
})

test("OCR triage promotes only explicit Indigenous plus healthcare evidence to private review", () => {
  const result = classifyBcInquestOcr(record, "The First Nations patient was transported by ambulance to the hospital. The jury made recommendations to the Health Authority.", { pageCount: 5 })
  assert.equal(result.classification, "potentially_miller_north_relevant")
  assert.equal(result.requires_outward_investigation, true)
  assert.equal(result.page_count, 5)
  assert.ok(result.mechanism_tags.includes("ambulance_transport"))
})

test("OCR summary preserves unresolved scans", () => {
  const reviewed = classifyBcInquestOcr(record, "Hospital care only")
  assert.deepEqual(summarizeBcInquestOcr([reviewed], 49), {
    expected_scans: 49,
    scans_reviewed: 1,
    unreadable_scans_remaining: 48,
    potentially_relevant: 0,
    owner_review_required: 0,
    by_classification: { healthcare_relevant_no_indigenous_relevance_established: 1 },
  })
})
