import assert from "node:assert/strict"
import test from "node:test"

import { palantirWorkplaceProofFixture as proof } from "./fixtures/privateArtifactSummaries.js"
import catalog from "../src/data/samwise-research-source-catalog-v1.json" with { type: "json" }
import { validateSamwiseEntityRegistry } from "../server/samwiseEntityResolution.js"
import { normalizePalantirWorkplaceFinding, routePalantirWorkplaceFinding, summarizePalantirWorkplaceYield, validatePalantirWorkplaceSafetyTaxonomy } from "../server/palantirWorkplaceSafety.js"

test("workplace-safety taxonomy requires explicit evidence and preserves publication boundaries", () => {
  assert.deepEqual(validatePalantirWorkplaceSafetyTaxonomy(), { valid: true, evidence_roles: 8, mechanism_terms: 15 })
  assert.throws(() => normalizePalantirWorkplaceFinding({ canonical_finding_id: "bad", title: "Bad", source_url: "https://example.org", evidence_role: "formal_investigation_finding", indigenous_relevance: "explicit_person_or_group", discrimination_state: "no_discrimination_finding" }), /indigenous_evidence_required/)
})

test("registered workplace sources span three provinces and multiple document roles", () => {
  const sources = catalog.sources.filter(item => ["British Columbia", "Alberta", "Saskatchewan"].includes(item.jurisdiction) && ["workplace_safety_enforcement", "administrative_appeals", "human_rights_tribunals"].includes(item.source_family))
  for (const province of ["British Columbia", "Alberta", "Saskatchewan"]) assert.ok(sources.filter(item => item.jurisdiction === province).length >= 3)
  assert.ok(sources.some(item => item.operations.includes("structured_table_parse")))
  assert.ok(sources.some(item => item.operations.includes("procedural_role_classification")))
})

test("only explicit Indigenous public-institution material becomes a private Miller North candidate", () => {
  const routes = proof.findings.map(item => [item.canonical_finding_id, routePalantirWorkplaceFinding(item).routes])
  const candidates = routes.filter(([, items]) => items.includes("miller_north_evidence_candidate"))
  assert.deepEqual(candidates.map(([id]) => id), ["palantir:ledger-2021-ahrc-95"])
  assert.equal(proof.consumer_routing.publications, 0)
  assert.equal(proof.consumer_routing.investigations_routed_to_public_miller, 0)
})

test("Indigenous institution context alone is not Indigenous identity or discrimination evidence", () => {
  const kikino = proof.findings.find(item => item.canonical_finding_id === "palantir:ab-ohs-kikino-2022")
  assert.equal(kikino.indigenous_relevance, "explicit_indigenous_institution_only")
  assert.equal(kikino.discrimination_state, "no_discrimination_finding")
  assert.equal(kikino.routing.routes.includes("miller_north_evidence_candidate"), false)
})

test("procedural, mediated, and merits human-rights records remain distinct", () => {
  const states = new Map(proof.findings.map(item => [item.canonical_finding_id, item.discrimination_state]))
  assert.equal(states.get("palantir:small-legs-dhillon-2008"), "explicit_formal_finding")
  assert.equal(states.get("palantir:ledger-2021-ahrc-95"), "credible_allegation_procedural_only")
  assert.equal(states.get("palantir:sk-shrc-caitlin-2023-24"), "mediated_without_merits_finding")
})

test("checkpointed proof cycles completed source by source without mutation authority", () => {
  assert.equal(proof.cycles.length, 3)
  assert.equal(proof.cycles.every(cycle => cycle.execution.state === "completed"), true)
  assert.equal(proof.cycles.every(cycle => cycle.checkpoints_written >= cycle.plan.source_plan.length + 1), true)
  assert.equal(proof.cycles.every(cycle => cycle.execution.mutation_authority === false && cycle.execution.publication_authority === false), true)
})

test("yield reporting is transparent and does not over-promote a small sample", () => {
  const summary = summarizePalantirWorkplaceYield({ sourcesChecked: 11, pagesChecked: 15, fullRecords: 10, findings: proof.findings, rejectedNoise: 5, duplicates: 1, technicalFailures: 1, comparableCycles: 2 })
  assert.equal(summary.cross_domain_discoveries, 9)
  assert.equal(summary.cadence_recommendation, "occasional_research_domain")
  assert.equal(summary.automatic_publications, 0)
})

test("institution aliases expanded deterministically without identity inference", () => {
  assert.deepEqual(validateSamwiseEntityRegistry(), { valid: true, entities: 30, aliases: 82 })
})
