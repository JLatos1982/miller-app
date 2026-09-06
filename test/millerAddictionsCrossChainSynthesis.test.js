import assert from "node:assert/strict"
import test from "node:test"
import benchmark from "../artifacts/miller/miller-addictions-policy-law-government-benchmark-2026-09-05.json" with { type: "json" }
import patterns from "../artifacts/miller/miller-addictions-cross-chain-patterns-2026-09-05.json" with { type: "json" }
import serviceVerification from "../artifacts/miller/miller-addictions-policy-to-service-verification-2026-09-05.json" with { type: "json" }
import resourceCandidates from "../artifacts/miller/miller-addictions-private-resource-candidates-2026-09-05.json" with { type: "json" }
import { normalizeResourceCandidate } from "../server/intelligence/resourceCandidates.js"
import {
  daysBetween,
  validateCrossChainPatternDataset,
  validatePolicyServiceVerificationDataset,
} from "../server/millerAddictionsCrossChainSynthesis.js"

test("cross-chain patterns cover all 21 private chains with reproducible intervals", () => {
  const summary = validateCrossChainPatternDataset(patterns, benchmark)
  assert.equal(summary.chains, 21)
  assert.equal(summary.repeated_recommendations, 7)
  assert.ok(summary.patterns >= 10)
  assert.ok(summary.recurring_organizations >= 8)
  assert.equal(daysBetween("2024-07-22", "2026-02-03"), 561)
  assert.equal(daysBetween("2024-05-07", "2023-09-18"), null)
})

test("all 15 policy-to-service candidates receive a private verification outcome", () => {
  const summary = validatePolicyServiceVerificationDataset(serviceVerification, benchmark)
  assert.equal(summary.total, 15)
  assert.equal(summary.by_status.operationally_verified, 12)
  assert.equal(summary.by_status.partially_verified, 1)
  assert.equal(summary.by_status.announced_not_verified, 2)
  assert.equal(summary.by_match.service_expansion_of_existing_resource, 3)
  assert.equal(summary.by_match.exact_existing_resource_match, 4)
  assert.equal(summary.by_match.new_resource_candidate, 4)
  assert.equal(summary.owner_review_required, 6)
})

test("service verification cannot promote announcements or review items", () => {
  const announced = serviceVerification.verifications.find(item => item.verification_status === "announced_not_verified")
  assert.throws(() => validatePolicyServiceVerificationDataset({ ...serviceVerification, verifications: serviceVerification.verifications.map(item => item.verification_id === announced.verification_id ? { ...item, opening_date: "2026-07-01" } : item) }, benchmark), /announcement_claim_invalid/)
  const review = serviceVerification.verifications.find(item => item.owner_review_flag)
  assert.throws(() => validatePolicyServiceVerificationDataset({ ...serviceVerification, verifications: serviceVerification.verifications.map(item => item.verification_id === review.verification_id ? { ...item, publication_state: "approved_for_publication" } : item) }, benchmark), /publication_gate/)
})

test("privacy-sensitive fields are rejected from synthesis artifacts", () => {
  assert.throws(() => validatePolicyServiceVerificationDataset({ ...serviceVerification, private_phone: "not allowed" }, benchmark), /private_field/)
})

test("five newly discovered resources remain private review candidates", () => {
  assert.equal(resourceCandidates.candidates.length, 5)
  const normalized = resourceCandidates.candidates.map(normalizeResourceCandidate)
  assert.ok(normalized.every(item => item.name && item.evidence.length >= 2 && item.trustState === "reviewed"))
  assert.ok(resourceCandidates.candidates.every(item => item.review_state === "owner_review_required"))
  assert.equal(resourceCandidates.summary.production_resources_modified, 0)
})
