import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

import resources from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import listenerRegistry from "../src/data/farm-listener-registry-v1.json" with { type: "json" }
import { diffPalantirRecord } from "../server/palantirChangeIntelligence.js"
import { buildPalantirCoverageMatrix, classifyPalantirCoverageGap, recommendPalantirGapResearch } from "../server/palantirCoverageGapIntelligence.js"
import { assertPalantirEvidenceClaim, interpretPalantirEvidenceRole, normalizePalantirEvidenceRole } from "../server/palantirEvidenceRoles.js"
import { normalizePalantirEvent, reconcilePalantirEvent } from "../server/palantirEventIdentity.js"
import { executePalantirListenerPrimitive } from "../server/palantirListenerPrimitive.js"
import { buildFarmWeeklyOwnerEmail } from "../server/farmWeeklyOwnerEmail.js"
import { adaptFarmMilestoneListener, createPalantirWatchCandidate, normalizePalantirMilestone, recommendPalantirMilestoneSchedule } from "../server/palantirMilestoneIntelligence.js"
import { applyPalantirReviewDecision, preservePalantirReviewDecision } from "../server/palantirOwnerReview.js"
import { PALANTIR_PRIMITIVES, palantirPrimitiveIndependence, validatePalantirPrimitiveRegistry } from "../server/palantirPrimitiveRegistry.js"
import { adaptFarmRecommendationLedgerToPalantir, buildPalantirRecommendationChain, buildPalantirRecommendationLedger, diffPalantirRecommendationLedgers } from "../server/palantirRecommendationIntelligence.js"
import { buildRecommendationLedger } from "../server/farmRecommendationLedger.js"
import { normalizePalantirResourceOpportunity, routePalantirResourceOpportunity } from "../server/palantirResourceRouting.js"
import { buildSamwisePublicRecordsStatus, samwisePublicRecordsConversationalQueries } from "../server/samwiseConversationalPublicRecords.js"
import { assertSamwiseCannotBypassMiller } from "../server/samwiseConsumerAdapters.js"
import { palantirHarvestLessons } from "./fixtures/palantirHarvestLessons.js"

const baseRecommendation = {
  recommendation_id: "recommendation:maskwacis-1",
  source_report: "Reviewed public report",
  recommendation_number: "1",
  recommendation_text: "The responsible bodies should report on the documented service gap.",
  recommendation_date: "2025-01-15",
  responsible_organizations: ["Public Ministry", "Public Agency"],
  primary_domain: "government_services",
  source_url: "https://example.org/report",
}

test("harvest registry exposes independent read-only Palantír primitives", () => {
  const result = validatePalantirPrimitiveRegistry()
  assert.equal(result.primitives, 17)
  assert.equal(result.mutation_authority, false)
  const moduleSources = Object.fromEntries(PALANTIR_PRIMITIVES.map(item => [item.module, readFileSync(new URL(`../server/${item.module}.js`, import.meta.url), "utf8")]))
  assert.deepEqual(palantirPrimitiveIndependence({ moduleSources }).product_ui_dependencies, [])
})

test("Miller North-derived structural lessons remain reviewed regression fixtures", () => {
  assert.equal(Object.keys(palantirHarvestLessons).length, 9)
  assert.equal(palantirHarvestLessons.jordans_principle.legal_order_is_implementation, false)
  assert.equal(palantirHarvestLessons.coroner_inquest.hearing_is_verdict, false)
  assert.equal(palantirHarvestLessons.resource_verification.research_record_becomes_resource, false)
})

test("evidence roles preserve allegation, procedure, merits, response, implementation and outcome boundaries", () => {
  assert.equal(normalizePalantirEvidenceRole("procedural ruling"), "procedural_decision")
  assert.equal(interpretPalantirEvidenceRole("response").proves_implementation, false)
  assert.equal(interpretPalantirEvidenceRole("settlement").settlement_is_admission, false)
  assert.throws(() => assertPalantirEvidenceClaim({ role: "procedural_decision", claim: "merits" }), /does_not_establish_merits/)
  assert.throws(() => assertPalantirEvidenceClaim({ role: "response", claim: "implementation" }), /does_not_prove_implementation/)
  assert.equal(assertPalantirEvidenceClaim({ role: "measured_outcome", claim: "outcome" }).proves_outcome, true)
})

test("canonical event identity accumulates source documents but never auto-merges ambiguous matches", () => {
  const known = normalizePalantirEvent({ canonical_event_id: "event:trevor-dubois", title: "Publicly monitored matter", event_date: "2024-03-01", source_documents: [{ document_id: "notice-1", source_url: "https://example.org/notice", evidence_role: "institutional_acknowledgement" }], identity_confidence: "exact", merge_status: "canonical", owner_review_required: false })
  const upgrade = reconcilePalantirEvent({ title: "Different document title", source_documents: [{ document_id: "notice-1", source_url: "https://example.org/notice", evidence_role: "investigation" }] }, [known])
  assert.equal(upgrade.disposition, "existing_event_evidence_upgrade")
  const ambiguous = reconcilePalantirEvent({ title: known.title, event_date: known.event_date, source_documents: [{ document_id: "other", source_url: "https://example.org/other", evidence_role: "investigation" }] }, [known])
  assert.equal(ambiguous.disposition, "possible_same_event")
  assert.equal(ambiguous.automatic_merge, false)
})

test("recommendation intelligence supports many responders and separates response, implementation and outcome", () => {
  const ledger = buildPalantirRecommendationLedger([{ ...baseRecommendation, responses: [
    { responder_organization: "Public Ministry", response_status: "accepted", claimed_action: "A policy was announced.", source_url: "https://example.org/ministry-response" },
    { responder_organization: "Public Agency", response_status: "under_review", source_url: "https://example.org/agency-response" },
  ], implementation_evidence_items: [{ summary: "An independent audit confirmed one operational step.", source_url: "https://example.org/audit", independent: true }], unresolved_gap: "No measured outcome has been published." }])
  assert.equal(ledger.counts.responses, 2)
  assert.equal(ledger.counts.responders, 2)
  assert.equal(ledger.counts.measured_outcomes, 0)
  const chain = buildPalantirRecommendationChain(ledger.recommendations[0])
  assert.equal(chain.complete_public_trail, false)
  assert.equal(chain.response_is_implementation, false)
})

test("existing Farm recommendation ledgers migrate without changing their public authority", () => {
  const legacy = buildRecommendationLedger([{ report: "Existing child/youth report", recommendation_number: "4", recommendation_text: "Report on the stated action.", responsible_organizations: ["Public body"], response: "A response was received.", status: "response_received", source_url: "https://example.org/legacy" }])
  const migrated = adaptFarmRecommendationLedgerToPalantir(legacy)
  assert.equal(migrated.counts.recommendations, 1)
  assert.equal(migrated.counts.responses, 1)
  assert.equal(migrated.counts.implementation_evidence, 0)
  assert.equal(migrated.publication_authority, false)
})

test("recommendation change detection ignores review timestamps and duplicate responders but flags evidence and status changes", () => {
  const previous = buildPalantirRecommendationLedger([{ ...baseRecommendation, responses: [{ responder_organization: "Public Ministry", response_status: "accepted", source_url: "https://example.org/response" }], last_reviewed: "2026-09-01" }])
  const timestampOnly = buildPalantirRecommendationLedger([{ ...baseRecommendation, responses: [{ responder_organization: "Public Ministry", response_status: "accepted", source_url: "https://example.org/response" }, { responder_organization: "Public Ministry", response_status: "accepted", source_url: "https://example.org/response" }], last_reviewed: "2026-09-07" }])
  assert.equal(diffPalantirRecommendationLedgers(previous, timestampOnly).material_changes, 0)
  const updated = buildPalantirRecommendationLedger([{ ...baseRecommendation, current_status: "partially_implemented", responses: [{ responder_organization: "Public Ministry", response_status: "accepted", source_url: "https://example.org/response" }], implementation_evidence_items: [{ summary: "A follow-up audit documented a completed action.", source_url: "https://example.org/follow-up" }] }])
  const diff = diffPalantirRecommendationLedgers(previous, updated)
  assert.ok(diff.changes.some(item => item.change_type === "new_implementation_evidence"))
  assert.ok(diff.changes.some(item => item.change_type === "status_correction"))
})

test("milestone intelligence targets documented windows and avoids blind cycles", () => {
  const milestone = normalizePalantirMilestone({ milestone_type: "verdict", matter_id: "matter:held", expected_date: "2026-10-01", expected_document: "verdict", monitoring_source: "https://example.org/court", accountable_institution: "Public court", trigger_reason: "Official hearing notice", owner_approved: true })
  const schedule = recommendPalantirMilestoneSchedule(milestone, { now: new Date("2026-09-01T00:00:00Z") })
  assert.equal(schedule.action, "defer_until_milestone")
  assert.ok(schedule.search_cycles_avoided >= 3)
  const candidate = createPalantirWatchCandidate({ milestone_type: "annual_report", date_window_label: "later this year", expected_document: "annual report", monitoring_source: "https://example.org/agency", trigger_reason: "Source used an imprecise timeframe" })
  assert.equal(candidate.disposition, "owner_review")
  assert.equal(candidate.automatic_schedule, false)
  const existing = listenerRegistry.listeners.find(item => item.schedule?.kind === "milestone")
  const adapted = adaptFarmMilestoneListener({ ...existing, source_url: "https://example.org/exact-documents" })
  assert.equal(adapted.milestone_id, `milestone:${existing.listener_id}`)
  assert.equal(adapted.automatic_schedule, true)
})

test("coverage matrices distinguish scarcity, acquisition failure, coding gaps and backlog", () => {
  assert.equal(classifyPalantirCoverageGap({ review_started: true, source_coverage: true }), "true_evidence_scarcity")
  const matrix = buildPalantirCoverageMatrix({ matrixId: "coverage:workplace", domain: "public_safety", dimensions: ["jurisdiction", "source_family"], cells: [
    { coordinates: { jurisdiction: "BC", source_family: "enforcement" }, documents_checked: 10, verified_evidence: 2, review_started: true, source_coverage: true },
    { coordinates: { jurisdiction: "Alberta", source_family: "appeals" }, documents_checked: 4, coding_complete: false, review_started: true, source_coverage: true },
    { coordinates: { jurisdiction: "Saskatchewan", source_family: "prosecutions" }, acquisition_failures: 2, review_started: true, source_coverage: true },
    { coordinates: { jurisdiction: "Federal", source_family: "follow_up" }, unreviewed_documents: 5, review_started: true, source_coverage: true },
  ] })
  assert.equal(matrix.counts.source_acquisition_failure, 1)
  assert.equal(matrix.counts.insufficient_coding, 1)
  assert.equal(matrix.counts.unreviewed_backlog, 1)
  assert.equal(recommendPalantirGapResearch(matrix).recommendations[0].recommended_action, "repair_or_replace_source_adapter")
})

test("generic change intelligence ignores timestamps and quarantines unsupported changes for review", () => {
  assert.equal(diffPalantirRecord({ value: "same", last_checked: "one" }, { value: "same", last_checked: "two" }).changed, false)
  const changed = diffPalantirRecord({ status: "open" }, { status: "closed", source_supported: false })
  assert.equal(changed.uncertain > 0, true)
  assert.equal(changed.owner_review > 0, true)
})

test("owner decisions survive refreshes and retain an audit trail", () => {
  const pending = { canonical_id: "recommendation:1", item_type: "recommendation", title: "Review recommendation" }
  const decided = applyPalantirReviewDecision(pending, { state: "needs_more_research", reason: "Implementation source missing", decidedAt: "2026-09-07T12:00:00Z" })
  assert.equal(decided.audit.previous_state, "pending")
  const refreshed = preservePalantirReviewDecision([decided.item], [{ ...pending, title: "Updated title" }])
  assert.equal(refreshed[0].review_state, "needs_more_research")
  assert.equal(refreshed[0].review_decision_preserved, true)
})

test("resource opportunities never turn research records into public Miller records", () => {
  const resource = resources.records.find(item => item.project_visibility.includes("miller"))
  const opportunity = normalizePalantirResourceOpportunity({ canonical_resource_id: resource.canonical_resource_id, discovered_from_finding_id: "finding:workplace", category: "mental_health", source_url: resource.source.url, verification_status: "verified", project_visibility: "miller" })
  const routed = routePalantirResourceOpportunity(opportunity, resource, { consumerGate: record => assertSamwiseCannotBypassMiller(record).allowed })
  assert.ok(routed.routes.includes("miller_resource_candidate"))
  assert.equal(routed.research_finding_becomes_public_resource, false)
  const candidateOnly = routePalantirResourceOpportunity({ ...opportunity, verification_status: "candidate" }, null)
  assert.deepEqual(candidateOnly.routes, ["shared_resource_candidate"])
})

test("listener primitive reuses Farm memory, quarantines anomalies, and preserves state on failure", async () => {
  const listener = { listener_id: "palantir_test", source_family: "government_audits", jurisdiction: "Alberta", schedule: { kind: "interval", days: 30 }, execution_target: "samwise" }
  const previous = { documents: ["safe"] }
  const failed = await executePalantirListenerPrimitive({ listener, previousMemory: previous, adapter: async () => { throw new Error("source timeout") } })
  assert.deepEqual(failed.memory, previous)
  assert.equal(failed.result.status, "failed")
  const quarantined = await executePalantirListenerPrimitive({ listener, previousMemory: previous, adapter: async () => ({ result: { checked: 100, new_documents: 80 }, memory: { documents: ["unsafe"] } }) })
  assert.equal(quarantined.result.status, "quarantined")
  assert.deepEqual(quarantined.memory, previous)
})

test("private conversational status summarizes recommendations, milestones and coverage without narratives", () => {
  const recommendation = buildPalantirRecommendationLedger([baseRecommendation])
  const milestone = normalizePalantirMilestone({ milestone_type: "audit_follow_up", expected_date: "2026-12-01", monitoring_source: "https://example.org/audit", expected_document: "follow-up" })
  const matrix = buildPalantirCoverageMatrix({ matrixId: "coverage:benefits", domain: "government_services", dimensions: ["jurisdiction"], cells: [{ coordinates: { jurisdiction: "Saskatchewan" }, acquisition_failures: 1, review_started: true, source_coverage: true }] })
  const status = buildSamwisePublicRecordsStatus({ recommendationLedgers: [recommendation], milestones: [milestone], coverageMatrices: [matrix] })
  assert.deepEqual(status.intelligence_primitives, { claims: 0, claim_relationships: 0, claim_contradictions: 0, unresolved_claim_conflicts: 0, unresolved_claim_gaps: 0, institutional_claims_without_independent_evidence: 0, recommendations: 1, recommendation_changes: 0, milestones: 1, upcoming_milestones: 1, coverage_matrices: 1, coverage_gaps: 1, acquisition_failures: 1 })
  assert.ok(samwisePublicRecordsConversationalQueries.includes("What recommendations changed?"))
  assert.equal(status.mutation_authority, false)
})

test("weekly brief includes only compact Palantír primitive counts", () => {
  const email = buildFarmWeeklyOwnerEmail({ runs: [{ completed_at: "2026-09-07T12:00:00Z", listener_id: "palantir-primitive", source_family: "recommendation_response_trackers", project_scope: "samwise", status: "completed", checked: 3, recommendation_changes: 1, milestones_identified: 2, coverage_gaps: 1, owner_review: 1, output_titles: ["Bounded owner label"], private_narrative: "must not appear" }], now: new Date("2026-09-07T13:00:00Z") })
  assert.match(email.text, /Recommendation changes: 1; upcoming milestones found: 2; coverage gaps: 1/)
  assert.doesNotMatch(email.text, /must not appear/)
})
