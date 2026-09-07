import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import watch from "../src/data/miller-north-accountability-watch-v1.json" with { type: "json" }
import discovery from "../src/data/miller-north-live-incident-discovery-v1.json" with { type: "json" }
import coverage from "../artifacts/miller-north/miller-north-coverage-gap-report-2026-09-07.json" with { type: "json" }
import discoveryAssessment from "../artifacts/miller-north/miller-north-live-incident-discovery-assessment-2026-09-07.json" with { type: "json" }
import { assessLiveIncidentCandidate, compareAccountabilityWatch, validateAccountabilityWatch, validateLiveIncidentCandidate } from "../server/millerNorthAccountabilityWatch.js"

test("Accountability Watch has seven source-backed public chains", () => {
  assert.deepEqual(validateAccountabilityWatch(watch), { valid: true, chains: 7 })
  assert.deepEqual(new Set(watch.chains.map(chain => chain.province)), new Set(["British Columbia", "Alberta", "Saskatchewan"]))
  assert.equal(watch.chains.every(chain => chain.sources.every(source => source.url.startsWith("https://"))), true)
  assert.equal(watch.chains.every(chain => chain.sources.every(source => source.role)), true)
  assert.equal(watch.chains.every(chain => chain.evidence_quality), true)
  assert.match(watch.chains.find(chain => chain.chain_id === "mnaw_maskwacis_youth_inquiry").contradictions_or_limitations, /not evidence that a recommendation was implemented/i)
  assert.match(watch.chains.find(chain => chain.chain_id === "mnaw_solonas_support_recommendation").contradictions_or_limitations, /did not make a finding of racism/i)
})

test("watch change detection ignores review-date-only changes and finds new accountability documents", () => {
  const reviewOnly = structuredClone(watch)
  reviewOnly.chains[0].last_reviewed = "2026-09-08"
  assert.deepEqual(compareAccountabilityWatch(watch, reviewOnly).meaningful_changes, [])
  const before = structuredClone(watch)
  before.chains.find(chain => chain.chain_id === "mnaw_fnho").sources.pop()
  const changes = compareAccountabilityWatch(before, watch).meaningful_changes
  assert.equal(changes.length, 1)
  assert.equal(changes[0].kind, "new_accountability_document")

  const implementationUpdate = structuredClone(watch)
  implementationUpdate.chains[0].implementation_evidence = "A newly reviewed implementation document changes the evidence statement."
  assert.deepEqual(compareAccountabilityWatch(watch, implementationUpdate).meaningful_changes.map(change => change.kind), ["implementation_evidence_changed"])

  const incidentUpdate = structuredClone(watch)
  incidentUpdate.chains[0].related_incident_refs = ["public-event-reference"]
  assert.deepEqual(compareAccountabilityWatch(watch, incidentUpdate).meaningful_changes.map(change => change.kind), ["new_related_incident"])
})

test("live discovery guardrails stop common source and status conflation", () => {
  assert.deepEqual(assessLiveIncidentCandidate({ organization_jurisdiction: "alberta", province: "saskatchewan", verification_status: "corroborated_public_report" }).flags, ["organization_jurisdiction_inconsistent_with_province"])
  assert.deepEqual(assessLiveIncidentCandidate({ source_scope: "canada", province: "alberta", verification_status: "corroborated_public_report" }).flags, ["national_source_assigned_to_province"])
  assert.deepEqual(assessLiveIncidentCandidate({ source_type: "academic_research", evidence_status: "official_investigation", verification_status: "corroborated_public_report" }).flags, ["academic_research_labeled_investigation"])
  assert.deepEqual(assessLiveIncidentCandidate({ source_type: "institutional_response", evidence_status: "reported_account", verification_status: "corroborated_public_report" }).flags, ["institutional_response_labeled_incident"])
  assert.deepEqual(assessLiveIncidentCandidate({ source_type: "news_report", evidence_status: "formal_finding", verification_status: "corroborated_public_report" }).flags, ["news_report_labeled_finding"])
  assert.deepEqual(assessLiveIncidentCandidate({ source_type: "commentary", primary_evidence: true, verification_status: "corroborated_public_report" }).flags, ["commentary_labeled_primary_evidence"])
  assert.deepEqual(assessLiveIncidentCandidate({ event_key: "same-event", verification_status: "corroborated_public_report" }, { knownEventKeys: ["same-event"] }).flags, ["possible_duplicate_event"])
  assert.equal(assessLiveIncidentCandidate({ source_type: "news_report", evidence_status: "reported_account", verification_status: "corroborated_public_report" }).safe_to_stage, true)
  assert.deepEqual(assessLiveIncidentCandidate({ source_type: "indigenous_journalism", evidence_status: "reported_account", verification_status: "corroborated_public_report", incident_location_basis: "publisher_location" }).flags, ["publication_location_may_be_incident_location"])
})

test("live incident model validates bounded public fields without requiring complaint detail", () => {
  const candidate = {
    candidate_id: "mnli_example",
    title: "Publication-safe example",
    incident_date: "2026-01",
    publication_date: "2026-02-03",
    last_reviewed: "2026-09-07",
    source_type: "indigenous_journalism",
    primary_source_url: "https://example.org/public-report",
    verification_status: "verification_in_progress",
    affected_person_description: "An Indigenous patient, as described by the public source.",
    corroborating_sources: [{ role: "institutional response", url: "https://example.org/response" }]
  }
  assert.deepEqual(validateLiveIncidentCandidate(candidate), { valid: true })
  assert.throws(() => validateLiveIncidentCandidate({ ...candidate, primary_source_url: "file:///private-note" }), /candidate_invalid/)
  assert.throws(() => validateLiveIncidentCandidate({ ...candidate, private_notes: "not for projection" }), /private_field/)
})

test("bounded discovery protocol includes provincial, source-role and deduplication safeguards", () => {
  assert.equal(discovery.province_focus.length, 3)
  assert.equal(discovery.source_families.length, 3)
  assert.match(discovery.deduplication.rule, /not independent corroboration/i)
  assert.match(discovery.staging_policy.formal_finding, /decision, report or investigation/i)
  assert.deepEqual(discovery.incident_record_model.evidence.includes("verification_status"), true)
  assert.match(discovery.search_strategy.stopping_rule, /Stop after/)
})

test("coverage report preserves the 695-row, 307-group audit boundary", () => {
  assert.equal(coverage.source_rows_total, 695)
  assert.equal(coverage.province_matrix.reduce((sum, row) => sum + row.evidence_groups, 0), 307)
  assert.equal(coverage.dimension_group_coverage.some(row => row.id === "hospital_security"), true)
  assert.match(coverage.dimension_group_coverage[0].coding_note, /missing coding rather than absent events/i)
})

test("bounded external discovery reports reconciled results without inventing new leads", () => {
  assert.equal(discoveryAssessment.external_discovery_performed, true)
  assert.equal(discoveryAssessment.bounded_external_run.reviewed_candidate_hits, discoveryAssessment.bounded_external_run.matched_existing_repository_events)
  assert.equal(discoveryAssessment.new_external_leads, 0)
  assert.equal(discoveryAssessment.bounded_external_run.newly_verified, 0)
  assert.equal(discoveryAssessment.bounded_external_run.newly_provisional, 0)
})

test("watch is reachable from Research and Policy without changing the primary navigation", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  const research = readFileSync(new URL("../src/site/MillerNorthResearchPolicy.jsx", import.meta.url), "utf8")
  const view = readFileSync(new URL("../src/site/MillerNorthAccountabilityWatch.jsx", import.meta.url), "utf8")
  assert.match(app, /indigenous-healthcare-evidence\/accountability-watch/)
  assert.match(research, /Open Accountability Watch/)
  assert.match(view, /What public evidence shows/)
  assert.match(view, /Related incident/)
})
