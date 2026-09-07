import test from "node:test"
import assert from "node:assert/strict"

import { compareBcInquestMemory, fingerprintBcInquestDocument, parseBcInquestIndex, validateBcInquestRecord } from "../server/millerNorthBcInquestListener.js"

const row = `<tr><td>July 22, 2024</td><td>Kamloops</td><td>Lampreau, Randy Dale</td><td>Police-involved</td><td><a href="/assets/gov/deaths/coroners-service/inquest/2024/lampreau_vcc.pdf">Verdict with Coroner Comments</a></td><td></td></tr>`

test("B.C. inquest index produces canonical verdict records", () => {
  const records = parseBcInquestIndex(`<table>${row}${row}</table>`)
  assert.equal(records.length, 1)
  assert.deepEqual(records[0], {
    document_id: "https://www2.gov.bc.ca/assets/gov/deaths/coroners-service/inquest/2024/lampreau_vcc.pdf",
    url: "https://www2.gov.bc.ca/assets/gov/deaths/coroners-service/inquest/2024/lampreau_vcc.pdf",
    title: "Verdict with Coroner Comments",
    person_or_event: "Lampreau, Randy Dale",
    inquest_date_text: "July 22, 2024",
    location: "Kamloops",
    inquest_type: "Police-involved",
    year: 2024,
    source_role: "jury_verdict",
  })
})

test("B.C. inquest listener detects new, unchanged, and amended verdicts", () => {
  const base = { ...parseBcInquestIndex(row)[0], checked_at: "2026-09-07", document_fingerprint: fingerprintBcInquestDocument(Buffer.from("one")) }
  assert.equal(validateBcInquestRecord(base), true)
  const first = compareBcInquestMemory({}, [base])
  assert.equal(first.new_documents.length, 1)
  const replay = compareBcInquestMemory(first.memory, [{ ...base, checked_at: "2026-09-08" }])
  assert.equal(replay.unchanged_documents.length, 1)
  const amended = compareBcInquestMemory(first.memory, [{ ...base, checked_at: "2026-09-08", document_fingerprint: fingerprintBcInquestDocument(Buffer.from("two")) }])
  assert.equal(amended.amended_documents.length, 1)
})

test("B.C. inquest listener reports removed documents without reclassifying them", () => {
  const previous = { documents: { old: { url: "https://www2.gov.bc.ca/assets/gov/old.pdf", document_fingerprint: "a".repeat(64) } } }
  const result = compareBcInquestMemory(previous, [])
  assert.equal(result.removed_documents.length, 1)
  assert.equal(result.new_documents.length, 0)
})

test("bounded incremental windows preserve out-of-window listener memory", () => {
  const previous = { documents: { old: { url: "https://www2.gov.bc.ca/assets/gov/old.pdf", document_fingerprint: "a".repeat(64) } } }
  const current = { ...parseBcInquestIndex(row)[0], checked_at: "2026-09-07", document_fingerprint: fingerprintBcInquestDocument(Buffer.from("one")) }
  const result = compareBcInquestMemory(previous, [current], { preserveUnobserved: true })
  assert.equal(result.removed_documents.length, 0)
  assert.equal(Object.keys(result.memory.documents).length, 2)
})
