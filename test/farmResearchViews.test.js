import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import registry from "../artifacts/farm/open-government-source-registry-2026-09-06.json" with { type: "json" }
import runFixture from "../artifacts/miller/miller-multi-view-research-run-fixture-2026-09-06.json" with { type: "json" }
import verification from "../artifacts/miller/miller-addictions-policy-to-service-verification-2026-09-05.json" with { type: "json" }
import candidates from "../artifacts/miller/miller-addictions-private-resource-candidates-2026-09-05.json" with { type: "json" }
import candidateReview from "../artifacts/miller/miller-five-resource-candidate-review-2026-09-06.json" with { type: "json" }
import {
  assertResearchPrivacy,
  buildPolicyResourceEvidencePath,
  buildResourceBackstoryProjection,
  generateOwnerSummary,
  generateResearchBrief,
  rankOwnerFindings,
  validateOfficialSourceRegistry,
} from "../server/farmResearchViews.js"

test("private open-government registry is reusable across Miller domains", () => {
  const result = validateOfficialSourceRegistry(registry)
  assert.equal(result.sources, 36)
  assert.equal(result.miller, 29)
  assert.equal(result.miller_north, 35)
})

test("significance ranking is deterministic and explicitly non-reputational", () => {
  const first = rankOwnerFindings(runFixture.findings)
  const second = rankOwnerFindings(runFixture.findings)
  assert.deepEqual(first, second)
  assert.equal(first.length, 5)
  assert.ok(first.every(item => item.significance.priority_score >= 0 && item.significance.priority_score <= 100))
  assert.ok(first.every(item => /not an evidence, effectiveness, compliance, or reputational score/.test(item.significance.scoring_notice)))
  assert.equal(first[0].finding_id, "frf_system_oversight_repetition")
  const low = rankOwnerFindings([{ ...runFixture.findings[0], finding_id: "frf_low_priority_fixture", official_primary_source: false, linked_chain_count: 0, real_world_service_impact: false, new_resource_discovery: false }])[0]
  assert.equal(low.significance.priority_band, "low_priority")
})

test("twelve operational relationships produce separated private projections", () => {
  const operational = verification.verifications.filter(item => item.verification_status === "operationally_verified")
  const projections = operational.map(item => buildResourceBackstoryProjection(item, candidates.candidates))
  assert.equal(projections.length, 12)
  assert.ok(projections.every(item => item.publication_scope === "private_admin_only"))
  assert.ok(projections.every(item => item.client_projection.name && item.research_projection.authoritative_timeline.length >= 1))
  assert.ok(projections.every(item => !Object.keys(item.client_projection).some(key => /policy|commitment|funding|accountability/.test(key))))
  assert.throws(() => buildResourceBackstoryProjection({ ...operational[0], publication_state: "approved_for_publication" }, candidates.candidates), /publication_gate/)
})

test("policy-to-resource paths preserve evidence on every edge", () => {
  const operational = verification.verifications.filter(item => item.verification_status === "operationally_verified")
  const paths = operational.map(item => buildPolicyResourceEvidencePath(item, candidates.candidates))
  assert.equal(paths.length, 12)
  assert.ok(paths.every(path => path.steps.length >= 3))
  assert.ok(paths.every(path => path.steps.every(step => step.claim && step.evidence_source_urls.length >= 1)))
})

test("owner and research deliverables have stable required sections", () => {
  const owner = generateOwnerSummary(runFixture)
  const brief = generateResearchBrief(runFixture)
  for (const heading of ["What changed", "Why it matters", "Strongest evidence", "Uncertainty / caution", "Recommended next move", "Key metrics"]) assert.match(owner, new RegExp(`## ${heading.replace("/", "\\/")}`))
  for (const heading of ["Executive summary", "Scope", "Key findings", "Evidence highlights", "Policy/service relationships", "Implementation status", "Unresolved questions", "Method", "Sources", "Limitations"]) assert.match(brief, new RegExp(`## ${heading.replace("/", "\\/")}`))
})

test("five candidates remain owner-gated and Red Fish is deduplicated", () => {
  assert.deepEqual(candidateReview.summary, {
    inspected: 5,
    ready_for_normal_owner_review: 3,
    reconcile_existing_private_record: 1,
    needs_additional_identity_or_governance_check: 1,
    production_resources_modified: 0,
    published: 0,
  })
  assert.ok(candidateReview.candidates.every(item => item.production_action === "none" && item.owner_review_reason))
  const redFish = candidateReview.candidates.find(item => item.source_record_id === "marc_red_fish_healing_centre")
  assert.equal(redFish.existing_canonical_uuid, "2277b951-738d-5236-ac20-a3133dc26803")
  assert.match(redFish.readiness, /do_not_create_duplicate/)
})

test("shared research views reject sensitive identity fields", () => {
  assert.throws(() => assertResearchPrivacy({ complainant_name: "do not store" }), /private_field/)
})

test("owner dashboard proof of concept remains explicitly private and bounded", () => {
  const source = readFileSync(new URL("../src/admin/FarmResearchOwnerPreview.jsx", import.meta.url), "utf8")
  assert.match(source, /Administrator only · private research synthesis/)
  assert.match(source, /findings\.slice\(0, 5\)/)
  assert.match(source, /nothing in this view is publication approval/)
  assert.doesNotMatch(source, /supabase|fetch\(/)
})
