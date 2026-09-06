import assert from "node:assert/strict"
import test from "node:test"
import { analyzeRepeatedSourceGroups, proposalIncidentEntity } from "../server/millerNorthIncidentReconciliation.js"

test("reconciliation does not turn repeated systemic source records into incidents", () => {
  const result = analyzeRepeatedSourceGroups([{ public_record_id: "a", evidence_status: "systemic_evidence", summary: "Pattern", source: { url: "https://example.test/a" } }, { public_record_id: "b", evidence_status: "systemic_evidence", summary: "Pattern two", source: { url: "https://example.test/a" } }])
  assert.equal(result[0].relationship, "related_context_not_same_incident")
})
test("proposal incident keeps evidence rows underneath the incident layer", () => {
  const result = proposalIncidentEntity({ candidate_id: "c", corpus_id: "v2", province: "alberta", approximate_location_or_facility: "Hospital", approximate_event_year: 2020, evidence_excerpt: "Reported treatment", source_url: "https://example.test/a", evidence_status: "reported" })
  assert.match(result.proposed_incident_id, /^mni_/)
  assert.equal(result.proposal_state, "private_reconciliation_review")
  assert.deepEqual(result.source_evidence_record_ids, [])
})

test("proposal keeps its established stable ID when evidence wording is corrected", () => {
  const result = proposalIncidentEntity({ candidate_id: "mnc_pearl", stable_proposal_id: "mni_8c619ea15a3853519e795a3f", corpus_id: "v2", province: "alberta", approximate_location_or_facility: "Hospital", event_date: "2020-06-11", event_year: 2020, evidence_excerpt: "Corrected bounded evidence", source_url: "https://example.test/a", evidence_status: "indexed_excerpt_private_review" })
  assert.equal(result.proposed_incident_id, "mni_8c619ea15a3853519e795a3f")
  assert.notEqual(result.incident_fingerprint, result.proposed_incident_id.slice(4))
})
