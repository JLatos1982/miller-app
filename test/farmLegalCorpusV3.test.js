import test from "node:test"
import assert from "node:assert/strict"

import { legalCorpusV3Fixture as corpus } from "./fixtures/privateArtifactSummaries.js"
import taxonomy from "../src/data/farm-legal-query-taxonomy-v3.json" with { type: "json" }
import { summarizeLegalCorpusV3, validateFarmLegalCorpusV3Record } from "../server/farmLegalCorpus.js"

test("v3 separates index discovery, official digests, and full-decision review", () => {
  const summary = summarizeLegalCorpusV3(corpus)
  assert.deepEqual(summary.by_review_level, {
    index_discovered: 0,
    official_digest_reviewed: 7,
    full_decision_reviewed: 8,
  })
  assert.equal(summary.index_entries_checked, 695)
  assert.equal(summary.cumulative_decision_records, 34)
  assert.equal(summary.invalid.length, 0)
})

test("publication candidates require full-decision review", () => {
  const base = {
    legal_record_id: "legal_test",
    citation: "2025 SCC 1",
    process_role: "merits_decision",
    source_url: "https://example.test/decision",
    source_authority: "official_decision",
    project_route: "private_review",
    finding_boundary: "A bounded finding.",
    disposition: "owner_review",
    publication_candidate: true,
  }
  assert.deepEqual(validateFarmLegalCorpusV3Record({ ...base, review_level: "official_digest_reviewed" }).errors, ["publication_requires_full_decision_review"])
  assert.equal(validateFarmLegalCorpusV3Record({ ...base, review_level: "full_decision_reviewed" }).valid, true)
})

test("procedural summaries cannot claim a discrimination finding", () => {
  const result = validateFarmLegalCorpusV3Record({
    legal_record_id: "legal_test",
    citation: "2025 BCHRT 1",
    process_role: "procedural_decision",
    review_level: "full_decision_reviewed",
    source_url: "https://example.test/decision",
    source_authority: "official_decision",
    project_route: "private_review",
    finding_boundary: "The ruling only determines process.",
    disposition: "owner_review",
    summary: "The Tribunal found discrimination and allowed the complaint to proceed.",
  })
  assert.ok(result.errors.includes("procedural_summary_overstates_finding"))
})

test("Jordan correction records 2024 CHRT 95 as an interested-party order", () => {
  const correction = corpus.corrections.find(item => item.citation === "2024 CHRT 95")
  const chainStep = corpus.jordans_principle.connected_steps.find(item => item.citation === "2024 CHRT 95")
  assert.equal(correction.prior_role, "compliance_order")
  assert.equal(correction.corrected_role, "interested_party_order")
  assert.equal(chainStep.role, "interested_party_order")
})

test("v3 is owner-gated and creates no production mutation", () => {
  const summary = summarizeLegalCorpusV3(corpus)
  assert.equal(summary.publication_candidates, 0)
  assert.equal(summary.public_records_added, 0)
  assert.equal(summary.production_mutations, 0)
  assert.equal(corpus.reconciliation.duplicate_incidents_created, 0)
})

test("taxonomy versions deterministic mechanisms and legal boundaries", () => {
  assert.equal(taxonomy.schema_version, "farm-legal-query-taxonomy-v3")
  assert.ok(taxonomy.miller_north.mechanisms.indigenous_specific_discrimination.includes("anti-Indigenous racism"))
  assert.ok(taxonomy.miller.mechanisms.treatment_access.includes("OAT"))
  assert.ok(taxonomy.deterministic_boundaries.some(item => item.includes("procedural ruling")))
  assert.ok(taxonomy.process_roles.interested_party_order.includes("procedural"))
})

test("legal support matches stay general and owner reviewed", () => {
  assert.match(corpus.support_pathway_matches.disclaimer, /does not determine whether someone has a legal claim/i)
  assert.ok(corpus.support_pathway_matches.reviewed_suggestions.every(item => item.owner_review === true))
  assert.ok(corpus.support_pathway_matches.reviewed_suggestions.every(item => item.resource_ids.length > 0))
  assert.doesNotMatch(JSON.stringify(corpus.support_pathway_matches), /you have a (?:case|claim)|you should sue/i)
})
