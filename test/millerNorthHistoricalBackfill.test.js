import test from "node:test"
import assert from "node:assert/strict"

import { analyzeHistoricalOfficialRecord, historicalDateBand, summarizeHistoricalBackfill } from "../server/millerNorthHistoricalBackfill.js"

test("historical backfill uses stable date bands", () => {
  assert.equal(historicalDateBand(2020), "2018_2023")
  assert.equal(historicalDateBand(2015), "2014_2017")
  assert.equal(historicalDateBand(2010), "2010_2013")
  assert.equal(historicalDateBand(2009), "outside_scope")
})

test("historical triage requires explicit Indigenous and healthcare mechanism evidence", () => {
  const selected = analyzeHistoricalOfficialRecord({ year: 2019 }, "The First Nations patient was transported by ambulance to the emergency department.")
  assert.equal(selected.disposition, "owner_review")
  assert.deepEqual(selected.indigenous_terms, ["first_nations"])
  assert.ok(selected.mechanism_tags.includes("ambulance_transport"))
  assert.match(selected.evidence_excerpt, /First Nations patient/)
  assert.equal(analyzeHistoricalOfficialRecord({ year: 2019 }, "The patient was transported by ambulance.").disposition, "not_selected_by_deterministic_triage")
})

test("unreadable historical PDFs remain reviewable and are never rejected silently", () => {
  const result = analyzeHistoricalOfficialRecord({ year: 2011 }, "")
  assert.equal(result.extraction_status, "text_unavailable_ocr_required")
  assert.equal(result.disposition, "manual_extraction_review")
  assert.equal(summarizeHistoricalBackfill([result]).ocr_required, 1)
})
