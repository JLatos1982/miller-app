import assert from "node:assert/strict"
import test from "node:test"

import { buildFarmWeeklyOwnerEmail } from "../server/farmWeeklyOwnerEmail.js"
import { dispatchFarmIgorJob } from "../server/farmIgorWorker.js"
import { applyPalantirMilestoneDocument, buildPalantirClaimLedger, buildPalantirClaimOwnerSummary, buildPalantirClaimTimeline, claimsFromPalantirRecommendation, diffPalantirClaimLedgers, normalizePalantirClaim, normalizePalantirClaimRelationship, normalizePalantirLegalClaim, projectPalantirClaimGraph, routePalantirClaim } from "../server/palantirClaimProvenance.js"
import { normalizePalantirMilestone } from "../server/palantirMilestoneIntelligence.js"
import { buildPalantirRecommendationLedger } from "../server/palantirRecommendationIntelligence.js"
import { buildSamwisePublicRecordsStatus, samwisePublicRecordsConversationalQueries } from "../server/samwiseConversationalPublicRecords.js"
import { benefitsClaimLessons, millerNorthClaimRegressionLessons, workplaceClaimLessons } from "./fixtures/palantirClaimProvenanceLessons.js"

test("claim primitive preserves concise proposition and precise source provenance", () => {
  const claim = normalizePalantirClaim(benefitsClaimLessons.claims[0])
  assert.equal(claim.claim_type, "recommendation")
  assert.equal(claim.evidence_role, "recommendation")
  assert.equal(claim.provenance.locator.section, "Background")
  assert.equal(claim.long_source_text_stored, false)
  assert.equal(claim.mutation_authority, false)
})

test("institutional implementation claims remain distinct from independent follow-up", () => {
  const ledger = buildPalantirClaimLedger(millerNorthClaimRegressionLessons.claims, millerNorthClaimRegressionLessons.relationships)
  const selfReport = ledger.claims.find(item => item.claim_type === "implementation_claim")
  const followUp = ledger.claims.find(item => item.claim_type === "independent_implementation_evidence")
  assert.equal(selfReport.verification_state, "institution_self_report")
  assert.equal(followUp.verification_state, "independent_follow_up")
  assert.equal(selfReport.claim_status, "contradicted")
  assert.equal(followUp.claim_status, "corroborated")
  assert.equal(ledger.counts.contradictions, 1)
})

test("conservative contradiction logic rejects weak overlap and reviews time or scope mismatch", () => {
  const claims = millerNorthClaimRegressionLessons.claims.map(normalizePalantirClaim)
  const weak = normalizePalantirClaimRelationship({ ...millerNorthClaimRegressionLessons.relationships[0], weak_keyword_only: true }, claims)
  const mismatched = normalizePalantirClaimRelationship({ ...millerNorthClaimRegressionLessons.relationships[0], relationship_id: "relationship:mismatch", time_aligned: false }, claims)
  assert.equal(weak.review_state, "rejected")
  assert.equal(mismatched.review_state, "owner_review")
  assert.equal(mismatched.owner_review_required, true)
})

test("benefits proof domain forms chronological claim timelines without flattening history", () => {
  const ledger = buildPalantirClaimLedger(benefitsClaimLessons.claims, benefitsClaimLessons.relationships)
  const bc = buildPalantirClaimTimeline(ledger, { canonicalEventId: "event:bc-benefits-telephone-access" })
  const ab = buildPalantirClaimTimeline(ledger, { canonicalEventId: "event:ab-aish-personal-health-benefit" })
  const sk = buildPalantirClaimTimeline(ledger, { canonicalEventId: "event:sk-income-support-controls" })
  assert.deepEqual(bc.claims.map(item => item.claim_date), ["2018", "2025", "2026-01"])
  assert.equal(bc.claims.at(-1).verification_state, "independent_follow_up")
  assert.equal(ab.claims.some(item => item.claim_type === "measured_outcome"), true)
  assert.equal(sk.claims.find(item => item.claim_type === "implementation_claim").claim_status, "partially_supported")
})

test("workplace proof domain preserves enforcement, correction and procedural-only roles", () => {
  const ledger = buildPalantirClaimLedger(workplaceClaimLessons.claims, workplaceClaimLessons.relationships)
  assert.equal(ledger.claims.find(item => item.claim_id === "claim:ab-hr:procedural-only").evidence_role, "procedural_decision")
  assert.equal(ledger.claims.filter(item => item.evidence_role === "merits_finding").length, 1)
  assert.equal(ledger.claims.find(item => item.claim_id === "claim:ab-hr:procedural-only").evidence_role === "merits_finding", false)
  assert.equal(ledger.claims.find(item => item.claim_id === "claim:ab-ohs:kikino-corrective-order").claim_status, "current")
})

test("recommendation responses and evidence become separately attributable claims", () => {
  const recommendation = buildPalantirRecommendationLedger([{ recommendation_id: "recommendation:test-1", source_report: "Audit report", recommendation_text: "Publish annual results.", source_url: "https://example.org/audit", responsible_organizations: ["Ministry"], responses: [{ responder_organization: "Ministry", response_status: "accepted", claimed_action: "An annual report was published.", source_url: "https://example.org/response" }], implementation_evidence_items: [{ summary: "The auditor confirmed a report exists but found missing measures.", source_url: "https://example.org/follow-up", date: "2026-01-01" }] }]).recommendations[0]
  const adapted = claimsFromPalantirRecommendation(recommendation)
  const ledger = buildPalantirClaimLedger(adapted.claims, adapted.relationships)
  assert.deepEqual(ledger.claims.map(item => item.claim_type), ["recommendation", "claimed_action", "independent_implementation_evidence"])
  assert.equal(ledger.relationships.some(item => item.relationship_type === "institutional_response_to"), true)
  assert.equal(ledger.relationships.some(item => item.relationship_type === "implementation_evidence_for"), true)
})

test("claim graph and consumer gate expose reviewed structure but never public Miller claims", () => {
  const ledger = buildPalantirClaimLedger(millerNorthClaimRegressionLessons.claims, millerNorthClaimRegressionLessons.relationships)
  const graph = projectPalantirClaimGraph(ledger)
  assert.equal(graph.edges.some(item => item.edge_type === "contains_claim"), true)
  assert.equal(graph.edges.some(item => item.edge_type === "contradicts"), true)
  const route = routePalantirClaim(ledger.claims[0], { relationshipReviewComplete: true })
  assert.equal(route.routes.includes("miller_north_evidence_candidate"), true)
  assert.equal(route.miller_public_allowed, false)
  assert.equal(route.miller_north_publication_allowed, false)
})

test("resource claims create verification candidates rather than Miller records", () => {
  const route = routePalantirClaim({ source_document_id: "document:program", claimant: "Public program administrator", claim_type: "service_availability_claim", normalized_proposition: "The navigation line is currently available provincewide.", claim_date: "2026-09-08", primary_domain: "government_services", related_resource_id: "resource:navigation", source_url: "https://example.org/program", source_role: "official_primary" })
  assert.deepEqual(route.routes, ["owner_intelligence", "shared_resource_candidate"])
  assert.equal(route.resource_verification_required, true)
  assert.equal(route.miller_public_allowed, false)
})

test("claim change detection ignores review dates and surfaces position and contradiction changes", () => {
  const previous = buildPalantirClaimLedger([benefitsClaimLessons.claims[0]], [], { generatedAt: "2026-01-01" })
  const currentClaim = { ...benefitsClaimLessons.claims[0], normalized_proposition: "The ministry should publish and meet a defined telephone service standard.", last_reviewed: "2026-09-08" }
  const current = buildPalantirClaimLedger([currentClaim], [], { generatedAt: "2026-09-08" })
  const changed = diffPalantirClaimLedgers(previous, current)
  assert.deepEqual(changed.changes.map(item => item.change_type), ["claim_position_changed"])
})

test("milestone documents create claims without implying implementation success", () => {
  const milestone = normalizePalantirMilestone({ milestone_id: "milestone:audit-follow-up", matter_id: "event:audit-chain", milestone_type: "audit_follow_up", expected_date: "2026-09-01", expected_document: "Independent follow-up", monitoring_source: "https://example.org/audit", current_status: "document_found" })
  const result = applyPalantirMilestoneDocument({ milestone, documentClaims: [{ source_document_id: "document:audit-follow-up", claimant: "Independent Auditor", claim_type: "audit_finding", normalized_proposition: "Two actions remain incomplete.", claim_date: "2026-09-08", source_url: "https://example.org/audit-follow-up", source_role: "independent_oversight" }] })
  assert.equal(result.retrieval_status, "expected_document_located")
  assert.equal(result.accountability_status, "claims_require_review")
  assert.equal(result.milestone_document_found_is_successful_implementation, false)
  const replay = applyPalantirMilestoneDocument({ milestone, priorLedger: result.ledger, documentClaims: [result.ledger.claims[0]] })
  assert.equal(replay.ledger.claims.length, 1)
  assert.equal(replay.changes.material_changes, 0)
})

test("legal claim helper never converts allegations or procedure into merits", () => {
  const allegation = normalizePalantirLegalClaim({ source_document_id: "decision:1", claimant: "Applicant", claim_type: "allegation", normalized_proposition: "The applicant alleged discriminatory conduct.", source_url: "https://example.org/decision", decision_paragraph: "12" })
  const procedure = normalizePalantirLegalClaim({ source_document_id: "decision:1", claimant: "Tribunal", claim_type: "legal_procedural_status", normalized_proposition: "The application may proceed to a hearing.", source_url: "https://example.org/decision", decision_paragraph: "45" })
  assert.equal(allegation.evidence_role, "allegation_report")
  assert.equal(procedure.evidence_role, "procedural_decision")
  assert.equal(procedure.procedural_status_establishes_merits, false)
})

test("owner status and weekly brief expose bounded claim counts without narratives", () => {
  const ledger = buildPalantirClaimLedger(millerNorthClaimRegressionLessons.claims, millerNorthClaimRegressionLessons.relationships)
  const summary = buildPalantirClaimOwnerSummary(ledger)
  const status = buildSamwisePublicRecordsStatus({ claimLedgers: [ledger] })
  assert.equal(summary.raw_source_bodies_exposed, false)
  assert.equal(summary.unresolved_claim_gaps.length, 1)
  assert.equal(status.intelligence_primitives.claims, 2)
  assert.equal(status.intelligence_primitives.claim_contradictions, 1)
  assert.ok(samwisePublicRecordsConversationalQueries.includes("What source supports that claim?"))
  const email = buildFarmWeeklyOwnerEmail({ runs: [{ completed_at: "2026-09-08T12:00:00Z", listener_id: "claim-proof", source_family: "government_audits", project_scope: "samwise", status: "completed", checked: 2, claim_changes: 1, claim_contradictions: 1, independent_claim_verifications: 1, unresolved_claim_gaps: 1, unverified_institutional_claims: 1, owner_review: 1, private_narrative: "must not appear" }], now: new Date("2026-09-08T13:00:00Z") })
  assert.match(email.text, /Material claim changes: 1; contradictions: 1; independent verifications: 1; unresolved claim gaps: 1; unverified institutional claims: 1/)
  assert.doesNotMatch(email.text, /must not appear/)
})

test("Igor normalizes bounded claim batches without truth or publication authority", async () => {
  const result = await dispatchFarmIgorJob({ root: process.cwd(), capability: "claim_batch_normalization", payload: { items: [benefitsClaimLessons.claims[0], benefitsClaimLessons.claims[0], { claim_id: "broken" }] }, timeoutMs: 5_000 })
  assert.equal(result.checked, 3)
  assert.equal(result.valid, 1)
  assert.equal(result.duplicates_suppressed, 1)
  assert.equal(result.truth_determinations, 0)
  assert.equal(result.publication_actions, 0)
})
