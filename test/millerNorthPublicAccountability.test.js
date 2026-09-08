import test from "node:test"
import assert from "node:assert/strict"

import registry from "../src/data/miller-north-public-institution-source-registry-v1.json" with { type: "json" }
import taxonomy from "../src/data/miller-north-domain-taxonomy-v1.json" with { type: "json" }
import { crossLaneReviewFixture as crossLaneReview } from "./fixtures/privateArtifactSummaries.js"
import {
  MILLER_NORTH_DOMAINS,
  buildMillerNorthCrossLaneRecord,
  buildMillerNorthLiveCandidate,
  suggestPublicAccountabilityPathways,
  summarizeMillerNorthDomainYield,
  summarizeCrossDomainDiscoveries,
  validateMillerNorthDomainAssessment,
} from "../server/millerNorthPublicAccountability.js"

const supportedAssessment = {
  primary_domain: "policing_custody_corrections",
  evidence_state: "institutional_acknowledgement",
  indigenous_relevance: "supported",
  public_body_relevance: "established",
  discrimination_evidence: "alleged",
  systemic_inequity: "uncertain",
  harm: "supported",
  formal_finding: "not_established",
  accountability_significance: "supported",
  source_role: "official",
  publication_candidate: false,
}

test("Miller North domains are controlled and public filters remain evidence-volume gated", () => {
  assert.deepEqual(taxonomy.domains.map(item => item.id), MILLER_NORTH_DOMAINS)
  assert.equal(taxonomy.public_filter_policy.current_action, "do_not_add_filters_in_this_pass")
  assert.equal(taxonomy.public_filter_policy.minimum_published_records_per_domain, 3)
})

test("cross-lane records require reviewed support for every secondary domain", () => {
  assert.throws(() => buildMillerNorthCrossLaneRecord({
    canonical_id: "legal:campbell",
    title: "Police discrimination finding",
    primary_domain: "policing_custody_corrections",
    secondary_domains: ["human_rights_public_services"],
    routing_outputs: ["private_owner_review"],
  }), /secondary_domain_requires_support/)
  const record = buildMillerNorthCrossLaneRecord({
    canonical_id: "legal:campbell",
    title: "Police discrimination finding",
    primary_domain: "policing_custody_corrections",
    secondary_domains: ["human_rights_public_services"],
    domain_support: [{ domain: "human_rights_public_services", source_id: "2019 BCHRT 275", source_url: "https://example.test/campbell", basis: "reviewed_citation" }],
    related_support_categories: ["indigenous_legal_services"],
    routing_outputs: ["private_owner_review", "shared_support_resource_candidate"],
  })
  assert.deepEqual(record.secondary_domains, ["human_rights_public_services"])
  assert.equal(record.automatic_merge, false)
  assert.deepEqual(summarizeCrossDomainDiscoveries([record]), { schema_version: "miller-north-cross-domain-summary-v1", records: 1, cross_domain_discoveries: 1, secondary_domain_links: 1, existing_events_strengthened: 0, watch_links: 0, original_miller_routes: 0, support_candidates: 1 })
})

test("reviewed cross-lane corpus has evidence support and no automatic publication", () => {
  assert.equal(crossLaneReview.records.length, 5)
  assert.equal(crossLaneReview.counts.cross_domain_discoveries, 5)
  assert.ok(crossLaneReview.records.every(record => record.secondary_domains.every(domain => record.domain_support.some(support => support.domain === domain))))
  assert.ok(crossLaneReview.records.every(record => record.publication_authority === false && record.automatic_merge === false))
})

test("domain assessment preserves independent evidence dimensions", () => {
  assert.equal(validateMillerNorthDomainAssessment(supportedAssessment).valid, true)
  const publication = validateMillerNorthDomainAssessment({ ...supportedAssessment, publication_candidate: true, indigenous_relevance: "uncertain" })
  assert.ok(publication.errors.includes("publication_requires_supported_indigenous_relevance"))
})

test("explicit racism or discrimination labels require a formal finding", () => {
  const racism = validateMillerNorthDomainAssessment({ ...supportedAssessment, evidence_state: "explicit_racism_finding" })
  const discrimination = validateMillerNorthDomainAssessment({ ...supportedAssessment, evidence_state: "explicit_discrimination_finding" })
  assert.ok(racism.errors.includes("racism_finding_requires_formal_finding"))
  assert.ok(discrimination.errors.includes("discrimination_finding_requires_formal_finding"))
})

test("live intelligence requires an actionable milestone package for monitoring states", () => {
  assert.throws(() => buildMillerNorthLiveCandidate({
    canonical_id: "live:one",
    title: "Review response remains pending",
    primary_domain: "government_services_funding",
    action_state: "response_pending",
    evidence: { ...supportedAssessment, primary_domain: "government_services_funding" },
  }), /milestone_fields_required/)

  const candidate = buildMillerNorthLiveCandidate({
    canonical_id: "live:one",
    title: "Review response remains pending",
    primary_domain: "government_services_funding",
    action_state: "response_pending",
    evidence: { ...supportedAssessment, primary_domain: "government_services_funding" },
    next_public_milestone: "The department posts its response.",
    expected_document: "department response",
    monitoring_source: "https://example.test/responses",
  })
  assert.equal(candidate.publication_authority, false)
  assert.equal(candidate.mutation_authority, false)
})

test("pathway suggestions are general, deterministic and owner gated", () => {
  const result = suggestPublicAccountabilityPathways({ title: "Police conduct and housing discrimination", primary_domain: "policing_custody_corrections" })
  assert.ok(result.pathways.some(item => item.process_category === "police_oversight_complaint"))
  assert.ok(result.pathways.some(item => item.process_category === "human_rights_or_tenancy_process"))
  assert.ok(result.pathways.every(item => item.owner_review_required))
  assert.match(result.disclaimer, /does not determine whether someone has a legal claim/i)
})

test("domain yield stays transparent and additive", () => {
  const summary = summarizeMillerNorthDomainYield([
    { primary_domain: "policing_custody_corrections", documents_checked: 8, relevant_candidates: 3, rejected_noise: 5 },
    { primary_domain: "policing_custody_corrections", verified_records: 1, pathway_links: 2 },
  ])
  assert.deepEqual(summary.domains.policing_custody_corrections, { documents_checked: 8, relevant_candidates: 3, verified_records: 1, systemic_evidence: 0, watch_candidates: 0, live_incidents: 0, pathway_links: 2, rejected_noise: 5 })
  assert.equal(summary.opaque_score, false)
})

test("public-institution source registry is bounded, private-safe and listener-ready", () => {
  assert.equal(registry.sources.length, 16)
  assert.equal(new Set(registry.sources.map(item => item.source_id)).size, 16)
  assert.ok(registry.sources.every(item => MILLER_NORTH_DOMAINS.includes(item.domain)))
  assert.ok(registry.sources.every(item => /^https:\/\//.test(item.public_index)))
  assert.ok(registry.sources.every(item => item.privacy_considerations && item.listener_feasibility))
  assert.equal(registry.sources.filter(item => !["registry_only"].includes(item.listener_status)).length, 10)
})
