import assert from "node:assert/strict"
import test from "node:test"
import registry from "../artifacts/farm/open-government-source-registry-2026-09-06.json" with { type: "json" }
import fixtures from "../artifacts/farm/farm-canonical-research-fixtures-2026-09-06.json" with { type: "json" }
import newRoads from "../artifacts/farm/research-dossier-new-roads-2026-09-06.json" with { type: "json" }
import creekside from "../artifacts/farm/research-dossier-creekside-road-to-recovery-2026-09-06.json" with { type: "json" }
import fnho from "../artifacts/farm/research-dossier-fnho-governance-funding-2026-09-06.json" with { type: "json" }
import inPlainSight from "../artifacts/farm/research-dossier-in-plain-sight-reporting-2026-09-06.json" with { type: "json" }
import ledger from "../artifacts/farm/in-plain-sight-24-recommendation-public-evidence-ledger-2026-09-06.json" with { type: "json" }
import projection from "../artifacts/farm/research-dossier-in-plain-sight-reporting-knowledge-update-v2-2026-09-06.json" with { type: "json" }
import approval from "../artifacts/farm/farm-research-dossier-v1-canonical-approval-2026-09-06.json" with { type: "json" }
import {
  validateCanonicalDossierWorkflow,
  validateInPlainSightLedger,
  validateKnowledgeUpdateProjection,
} from "../server/farmKnowledgeGapInvestigator.js"

const dossiers = [newRoads, creekside, fnho, inPlainSight]

test("farm-research-dossier-v1 is a canonical private regression workflow with four domain-separated fixtures", () => {
  const result = validateCanonicalDossierWorkflow({ dossiers, fixtures, sourceRegistry: registry })
  assert.equal(result.workflow_id, "farm-research-dossier-v1")
  assert.equal(result.status, "canonical_private_regression_workflow")
  assert.deepEqual(result.domains, { miller_addictions: 2, miller_north_indigenous_healthcare: 2 })
  assert.equal(approval.approval_scope, "validation_fixture_only_not_publication")
  assert.deepEqual(approval.validation, result)
})

test("In Plain Sight ledger has exactly one evidence-bearing record for recommendations 1 through 24", () => {
  const result = validateInPlainSightLedger(ledger)
  assert.equal(result.recommendations, 24)
  assert.deepEqual(ledger.recommendations.map(item => item.recommendation_number), Array.from({ length: 24 }, (_, index) => index + 1))
  assert.ok(ledger.recommendations.every(item => item.source_references.length > 0))
  assert.ok(ledger.recommendations.every(item => item.implementation_evidence.every(entry => entry.source_references.length > 0)))
  assert.deepEqual(result.status_counts, {
    implemented: 2,
    substantially_implemented: 3,
    partially_implemented: 12,
    implementation_underway: 4,
    implementation_evidence_fragmentary: 3,
  })
})

test("public reporting gaps remain evidence-coverage findings rather than non-implementation claims", () => {
  assert.equal(ledger.public_reporting_finding.comprehensive_current_24_row_ledger_located, false)
  assert.match(ledger.status_taxonomy_notice, /Missing or aggregated reporting is not classified as non-implementation/)
  assert.equal(ledger.recommendations.filter(item => item.current_defensible_status === "no_clear_public_evidence_found").length, 0)
  assert.equal(ledger.recommendations.filter(item => item.public_evidence_coverage === "direct_official_baseline_only").length, 4)
})

test("original recommendation numbering controls the PIDA mapping and later source mismatch is reviewable", () => {
  const recommendation2 = ledger.recommendations[1]
  const recommendation11 = ledger.recommendations[10]
  assert.match(recommendation11.neutral_recommendation_summary, /Public Interest Disclosure Act/)
  assert.ok(recommendation11.follow_up_signals.some(signal => /recommendation 2 rather than recommendation 11/.test(signal)))
  assert.ok(recommendation2.follow_up_signals.some(signal => /numbering mismatch/.test(signal)))
})

test("ledger safeguards reject cardinality, publication and unsupported completion changes", () => {
  const missing = structuredClone(ledger)
  missing.recommendations.pop()
  assert.throws(() => validateInPlainSightLedger(missing), /exactly_24/)

  const publicCopy = structuredClone(ledger)
  publicCopy.publication_scope = "public"
  assert.throws(() => validateInPlainSightLedger(publicCopy), /scope_invalid/)

  const unsupported = structuredClone(ledger)
  unsupported.recommendations[2].current_defensible_status = "implemented"
  assert.throws(() => validateInPlainSightLedger(unsupported), /completion_evidence_too_weak/)
})

test("versioned dossier update preserves lineage, the reporting gap and zero-mutation gates", () => {
  const ledgerValidation = validateInPlainSightLedger(ledger)
  const result = validateKnowledgeUpdateProjection(projection, ledgerValidation)
  assert.deepEqual(result, {
    projection_id: "farm_dossier_miller_north_in_plain_sight_reporting_v2",
    recommendations_assessed: 24,
    reporting_gap_preserved: true,
    production_mutations: 0,
    publication_mutations: 0,
  })
  assert.equal(projection.base_dossier_id, inPlainSight.dossier_id)
  assert.equal(projection.foi_requests_sent, 0)
})
