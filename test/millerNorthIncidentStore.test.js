import assert from "node:assert/strict"
import test from "node:test"
import { buildMillerNorthIncidentSyncBatch } from "../server/millerNorthIncidentStore.js"

const candidate = { candidate_id: "mnc_example", source_organization: "Example News", source_title: "Example", source_url: "https://example.org/source", source_type: "credible_journalism", publication_date: "2021-01-02", evidence_excerpt: "Bounded evidence", source_fingerprint: "a".repeat(64), duplicate_reconciliation_state: "new_incident_candidate" }
const incident = { proposed_incident_id: "mni_aaaaaaaaaaaaaaaaaaaaaaaa", created_from_candidate_id: "mnc_example", corpus_id: "miller-north-reconstructed-corpus-v2", province: "british_columbia", facility_or_location: "Example Hospital", timing: { event_date: "2021-01-01", event_year: 2021, approximate_event_year: null, publication_date: "2021-01-02" }, summary: "Neutral private summary", evidence_status: "reported", reconciliation_confidence: "strong", incident_fingerprint: "b".repeat(24), source_evidence_record_ids: [] }

test("private incident sync preserves exact timing and source relationships", () => {
  const batch = buildMillerNorthIncidentSyncBatch({ incidents: Array.from({ length: 14 }, (_, index) => ({ ...incident, proposed_incident_id: `mni_${index.toString(16).padStart(24, "a")}`, incident_fingerprint: `${index.toString(16).padStart(24, "b")}`, created_from_candidate_id: `mnc_${index}` })), candidates: Array.from({ length: 14 }, (_, index) => ({ ...candidate, candidate_id: `mnc_${index}`, source_url: `https://example.org/${index}`, supporting_sources: index < 6 ? [{ role: "corroborating_journalism", organization: "Second report", url: `https://example.org/${index}/second` }] : [] })), expectedCount: 14, expectedMultiSourceCount: 6 })
  assert.equal(batch.length, 14)
  assert.equal(batch[0].incident.timing_semantic, "exact_event_date")
  assert.equal(batch.filter(item => item.sources.length > 1).length, 6)
  assert.equal(batch[0].sources[1].source_role, "corroborating_report")
})

test("private incident sync rejects malformed or incomplete batches", () => {
  assert.throws(() => buildMillerNorthIncidentSyncBatch({ incidents: [], candidates: [] }), /invalid_proposal_batch/)
})

test("context sources are retained without claiming independent corroboration", () => {
  const batch = buildMillerNorthIncidentSyncBatch({ incidents: [incident], candidates: [{ ...candidate, supporting_sources: [{ role: "context", organization: "Context reporting", url: "https://example.org/context", is_independent: false, evidence_confidence: "context_only" }] }] })
  assert.equal(batch[0].sources[1].source_role, "context")
  assert.equal(batch[0].sources[1].is_independent, false)
  assert.equal(batch[0].sources[1].evidence_confidence, "context_only")
})

test("unnamed specific incidents use neutral titles and require stable event facts", () => {
  const anonymousCandidate = {
    ...candidate,
    candidate_id: "mnc_unnamed",
    source_url: "https://example.org/unnamed",
    municipality: "Saskatoon",
    facility: "Royal University Hospital",
    incident_identity_class: "unnamed_but_specific_incident",
    event_identity_facts: { distinctive_encounter_facts: "Patient was turned away from emergency treatment after a concrete encounter." },
  }
  const anonymousIncident = {
    ...incident,
    proposed_incident_id: "mni_cccccccccccccccccccccccc",
    created_from_candidate_id: "mnc_unnamed",
    province: "saskatchewan",
    facility_or_location: "Royal University Hospital",
    timing: { event_date: null, event_year: 2025, approximate_event_year: null, publication_date: "2025-04-01" },
    incident_identity_class: "unnamed_but_specific_incident",
    public_case_name: null,
    event_identity_facts: anonymousCandidate.event_identity_facts,
    incident_fingerprint: "c".repeat(24),
  }
  const [row] = buildMillerNorthIncidentSyncBatch({ incidents: [anonymousIncident], candidates: [anonymousCandidate] })
  assert.equal(row.incident.public_case_name, null)
  assert.equal(row.incident.incident_identity_class, "unnamed_but_specific_incident")
  assert.equal(row.incident.working_title, "Patient not publicly named — Royal University Hospital — 2025")
  assert.deepEqual(row.incident.provenance.source_provenance, ["https://example.org/unnamed"])
})
