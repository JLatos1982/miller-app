import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { EVIDENCE_SEARCH_INSTRUCTIONS, MAX_EVIDENCE_SEARCH_RECORDS, publicEvidenceSearchRecord, retrieveEvidenceRecords, searchIndigenousHealthcareEvidence } from "../server/indigenousHealthcareEvidenceSearch.js"

const records = [
  { public_record_id: "ihe_aaaaaaaaaaaaaaaaaaaa", summary: "Emergency department care and cultural safety.", province: "british_columbia", care_setting: "emergency", evidence_status: "reported_account", source: { title: "Emergency source", publisher: "Public organization", source_type: "report" }, private_fingerprint: "never-send" },
  { public_record_id: "ihe_bbbbbbbbbbbbbbbbbbbb", summary: "Primary care access research.", province: "alberta", care_setting: "primary care", evidence_status: "systemic_evidence", source: { title: "Primary source", publisher: "Research group", source_type: "study" } },
]

test("evidence search retrieval ranks safe public matches and returns no match for unrelated terms", () => {
  assert.equal(retrieveEvidenceRecords("emergency cultural safety", records)[0].public_record_id, records[0].public_record_id)
  assert.deepEqual(retrieveEvidenceRecords("zzzxxyy", records), [])
  assert.ok(retrieveEvidenceRecords("care", Array.from({ length: 30 }, (_, index) => ({ ...records[0], public_record_id: `ihe_${String(index).padStart(20, "0")}` }))).length <= MAX_EVIDENCE_SEARCH_RECORDS)
})

test("evidence search only serializes approved public-safe context fields", () => {
  const safe = publicEvidenceSearchRecord(records[0])
  assert.deepEqual(Object.keys(safe).sort(), ["care_setting", "evidence_status", "province", "public_record_id", "source_organization", "source_title", "source_type", "summary"])
  assert.doesNotMatch(JSON.stringify(safe), /never-send|private_fingerprint/)
})

test("API-key absence and provider failure preserve locally matched records", async () => {
  const absent = await searchIndigenousHealthcareEvidence({ query: "emergency", apiKeyPresent: false, openai: null })
  assert.equal(absent.summary_available, false)
  assert.ok(absent.record_ids.length > 0)
  const failed = await searchIndigenousHealthcareEvidence({ query: "emergency", apiKeyPresent: true, openai: { responses: { create: async () => { throw new Error("unavailable") } } } })
  assert.equal(failed.summary_available, false)
  assert.ok(failed.record_ids.length > 0)
})

test("OpenAI context is capped and carries the reported-account instruction", async () => {
  let request
  const openai = { responses: { create: async (value) => {
    request = value
    return { output_text: JSON.stringify({ answer: "The supplied record is a reported account.", record_ids: [] }) }
  } } }
  const result = await searchIndigenousHealthcareEvidence({ query: "emergency", apiKeyPresent: true, openai })
  assert.equal(result.summary_available, true)
  assert.match(EVIDENCE_SEARCH_INSTRUCTIONS, /reported account/i)
  assert.ok(JSON.parse(request.input).records.length <= MAX_EVIDENCE_SEARCH_RECORDS)
  assert.equal(request.max_output_tokens, 700)
})

test("evidence page includes search, clear/reset, and retains existing filters", () => {
  const page = readFileSync(new URL("../src/site/IndigenousHealthcareEvidence.jsx", import.meta.url), "utf8")
  assert.match(page, /First Nations Healthcare Racism &amp; Discrimination Evidence/)
  assert.match(page, /Ask about the evidence/)
  assert.match(page, /Emergency departments in Alberta/)
  assert.match(page, /setSearchQuery\(example\)/)
  assert.match(page, /relevant record/)
  assert.match(page, /evidenceSearch\.match_count > 0/)
  assert.match(page, /clearEvidenceSearch/)
  assert.match(page, /filterEvidenceRecords\(records, filters\)/)
  assert.match(page, /displayedRecords/)
})
