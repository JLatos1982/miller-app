import assert from "node:assert/strict"
import test from "node:test"

import review from "../artifacts/miller-legal/miller-legal-evidence-review-v1.json" with { type: "json" }
import registry from "../src/data/miller-legal-source-registry-v1.json" with { type: "json" }
import {
  canonicalLegalUrl,
  compareLegalListenerCycle,
  legalEventFingerprint,
  normalizeLegalCitation,
  reconcileLegalRecords,
  validateLegalRecord,
  validateLegalSourceRegistry,
} from "../server/millerLegalEvidence.js"

test("legal source registry is machine-readable and preserves product routing", () => {
  assert.deepEqual(validateLegalSourceRegistry(registry), { valid: true, total: 25, by_project: { miller: 16, miller_north: 23 } })
  assert.ok(registry.sources.some(source => source.source_id === "bc_bchrt_decisions" && source.listener_feasibility === "high"))
  assert.deepEqual(registry.sources.find(source => source.source_id === "ab_rtdrs").project_relevance, ["miller"])
  assert.ok(registry.sources.every(source => source.privacy_considerations && source.access_limitations))
})

test("reviewed legal records require explicit process roles and retain source traceability", () => {
  assert.equal(review.records.every(record => validateLegalRecord(record)), true)
  assert.ok(review.records.every(record => record.citation && record.source_url.startsWith("https://") && record.last_reviewed === "2026-09-07"))
  const procedural = review.records.find(record => record.citation === "2021 BCHRT 22")
  assert.equal(procedural.process_role, "procedural_decision")
  assert.deepEqual(procedural.findings, [])
  assert.match(procedural.remedy_or_outcome, /did not decide whether discrimination occurred/i)
})

test("procedural decisions cannot silently carry merits findings", () => {
  const procedural = review.records.find(record => record.citation === "2021 BCHRT 22")
  assert.throws(() => validateLegalRecord({ ...procedural, findings: ["The respondent discriminated."] }), /procedural_record_contains_merits_finding/)
})

test("legal citations and URLs normalize deterministically", () => {
  assert.equal(normalizeLegalCitation(" 2018  bcca 132 "), "2018 BCCA 132")
  assert.equal(canonicalLegalUrl("https://example.test/path/?utm_source=x&matter=1#facts"), "https://example.test/path?matter=1")
})

test("event reconciliation suppresses duplicate decisions and links later evidence", () => {
  const original = review.records[0]
  const duplicate = { ...original, legal_record_id: `${original.legal_record_id}_mirror`, source_url: `${original.source_url}?utm_source=test` }
  const later = { ...review.records[1], related_event_id: original.related_event_id }
  const reconciled = reconcileLegalRecords([original, duplicate, later])
  assert.equal(reconciled[0].reconciliation, "new_legal_matter")
  assert.equal(reconciled[1].reconciliation, "duplicate_decision")
  assert.equal(reconciled[2].reconciliation, "new_legal_evidence_for_existing_matter")
  assert.equal(legalEventFingerprint(original), legalEventFingerprint(later))
})

test("listener memory distinguishes new, unchanged and materially updated documents", () => {
  const first = compareLegalListenerCycle(review.records)
  assert.deepEqual(first.summary, { checked: 10, new_documents: 10, updated_documents: 0, unchanged_documents: 0 })
  const memory = { documents: first.documents }
  const second = compareLegalListenerCycle(review.records, memory)
  assert.deepEqual(second.summary, { checked: 10, new_documents: 0, updated_documents: 0, unchanged_documents: 10 })
  const changed = review.records.map((record, index) => index === 0 ? { ...record, public_summary: "Material implementation follow-up located." } : record)
  const third = compareLegalListenerCycle(changed, memory)
  assert.deepEqual(third.summary, { checked: 10, new_documents: 0, updated_documents: 1, unchanged_documents: 9 })
})

test("private legal review material cannot be validated as a public projection", () => {
  assert.throws(() => validateLegalRecord(review.records[0], { publicProjection: true }), /private_legal_record_exposed/)
})
