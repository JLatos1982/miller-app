import assert from "node:assert/strict"
import test from "node:test"

import { compareCpsbcCaseStudyMemory, parseCpsbcCaseStudy, parseCpsbcCaseStudyIndex, validateCpsbcCaseStudyRecord } from "../server/millerNorthCpsbcCaseStudyListener.js"

test("CPSBC case-study index produces stable canonical records", () => {
  const html = '<article><a href="/news/publications/college-connector/2025-V13-03/05"><span class="field--name-title">Case study: consent</span></a></article>'
  assert.deepEqual(parseCpsbcCaseStudyIndex(html), [{ url: "https://www.cpsbc.ca/news/publications/college-connector/2025-V13-03/05", title: "Case study: consent" }])
})

test("CPSBC case-study parser retains explicit relevance and bounded mechanisms", () => {
  const record = parseCpsbcCaseStudy('<main><h1>Case study</h1><p>An Indigenous patient attended a rural emergency department. Consent and discharge planning were reviewed.</p></main>', { url: "https://www.cpsbc.ca/news/publications/college-connector/2025-V13-03/05" })
  assert.equal(record.indigenous_relevance_explicit, true)
  assert.equal(record.disposition, "owner_review")
  assert.deepEqual(record.mechanism_tags.sort(), ["consent", "discharge", "emergency", "rural"].sort())
  assert.equal(validateCpsbcCaseStudyRecord(record), true)
})

test("CPSBC case-study memory detects amendments without creating a new identity", () => {
  const first = parseCpsbcCaseStudy('<main><p>Indigenous patient consent.</p></main>', { url: "https://www.cpsbc.ca/news/publications/college-connector/2025-V13-03/05" })
  const initial = compareCpsbcCaseStudyMemory({}, [first])
  assert.equal(initial.new_documents.length, 1)
  assert.equal("body_text" in initial.memory.documents[first.document_id], false)
  assert.equal(compareCpsbcCaseStudyMemory(initial.memory, [first]).unchanged_documents.length, 1)
  const changed = parseCpsbcCaseStudy('<main><p>Indigenous patient consent. Updated.</p></main>', { url: first.url })
  const update = compareCpsbcCaseStudyMemory(initial.memory, [changed])
  assert.equal(update.amended_documents.length, 1)
  assert.equal(update.new_documents.length, 0)
})
