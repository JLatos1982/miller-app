import test from "node:test"
import assert from "node:assert/strict"

import corpus from "../artifacts/miller-legal/farm-legal-corpus-mining-v2.json" with { type: "json" }
import { buildLegalCitationChain, summarizeLegalCorpus, validateFarmLegalRecord } from "../server/farmLegalCorpus.js"

test("legal corpus requires explicit process roles and finding boundaries", () => {
  assert.ok(corpus.new_records.every(record => validateFarmLegalRecord(record).valid))
  assert.equal(validateFarmLegalRecord({ citation: "2024 CHRT 95", process_role: "merits_decision", source_url: "https://example.test" }).valid, false)
})

test("legal corpus remains private and produces no mutation", () => {
  const summary = summarizeLegalCorpus(corpus)
  assert.equal(summary.checked, 647)
  assert.equal(summary.decision_records, 19)
  assert.equal(summary.invalid.length, 0)
  assert.equal(summary.public_records_added, 0)
  assert.equal(summary.production_mutations, 0)
})

test("citation chains preserve formal steps without claiming implementation", () => {
  const chain = buildLegalCitationChain(corpus.new_records.filter(record => record.legal_record_id.startsWith("legal_ca_") && /CHRT/.test(record.citation)))
  assert.equal(chain.records.length, 2)
  assert.equal(chain.edges.length, 1)
  assert.equal(chain.implementation_proved, false)
  assert.equal(chain.publication_authority, false)
})
