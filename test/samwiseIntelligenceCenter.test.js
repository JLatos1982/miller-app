import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { benefitsV2Fixture as benefitsV2, workplaceSafetyProofFixture as workplaceProof } from "./fixtures/privateArtifactSummaries.js"
import listenerSources from "../src/data/samwise-public-record-source-registry-v1.json" with { type: "json" }
import resourceRegistry from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import { buildFarmWeeklyOwnerEmail } from "../server/farmWeeklyOwnerEmail.js"
import { compareInstitutionalAliases } from "../server/farmIgorWorker.js"
import { preserveFarmReviewDecisions, validateFarmOwnerRequest } from "../server/farmSupabaseInteraction.js"
import { assertSamwiseCannotBypassMiller, projectSamwiseFinding } from "../server/samwiseConsumerAdapters.js"
import { buildSamwiseInstitutionHistory, buildSamwiseInstitutionRelationshipChain, resolveSamwiseEntity, validateSamwiseEntityRegistry } from "../server/samwiseEntityResolution.js"
import { diffSamwiseFundingProgram, normalizeSamwiseFundingProgram, routeSamwiseFundingProgram } from "../server/samwiseFundingIntelligence.js"
import { createSamwiseLiveIntelligence, diffSamwiseLiveIntelligence } from "../server/samwiseLiveIntelligence.js"
import { normalizeSamwiseFinding, routeSamwiseFinding } from "../server/samwisePublicRecordsIntelligence.js"
import { branchSamwiseResearch, buildSamwiseResearchSourceCatalog, calculateSamwiseResearchRequestYield, continueSamwiseResearch, createSamwiseResearchMemory, planSamwiseUniversalResearch, preserveSamwiseReviewDecisions, reviewSamwiseSecondaryRelevance, validateSamwiseResearchSourceCatalog } from "../server/samwiseResearchWorkflow.js"
import { findSamwiseResearchMemory, persistSamwiseResearchMemory, readSamwiseResearchMemoryStore, samwiseResearchMemoryStatus } from "../server/samwiseResearchMemoryStore.js"

test("universal research selects a bounded explainable source plan from registered sources", () => {
  assert.deepEqual(validateSamwiseResearchSourceCatalog(), { valid: true, sources: 21, enabled: 21 })
  const catalog = buildSamwiseResearchSourceCatalog({ listenerRegistry: listenerSources })
  assert.deepEqual(catalog.counts, { total: 40, enabled: 37, scheduled: 19, research_only: 21, families: 16 })
  const request = validateFarmOwnerRequest({ request_type: "research_public_records", target_id: "samwise_public_records_intelligence", parameters: { topic: "disability benefit access", jurisdiction: "Saskatchewan", domains: ["government_services", "public_funding"], depth: "bounded", recent_only: true } })
  const plan = planSamwiseUniversalResearch(request, catalog)
  assert.equal(plan.state, "planned")
  assert.ok(plan.source_plan.length > 0 && plan.source_plan.length <= 8)
  assert.ok(plan.source_plan.some(source => source.source_id === "research:saskatchewan_auditor_reports"))
  assert.ok(plan.source_plan.every(source => source.selection_reasons.length > 0))
  assert.equal(plan.arbitrary_url_allowed, false)
  assert.equal(plan.automatic_execution, false)
})

test("research requests reject arbitrary URLs, SQL-like parameters and unbounded document limits", () => {
  assert.throws(() => validateFarmOwnerRequest({ request_type: "research_public_records", target_id: "samwise_public_records_intelligence", parameters: { topic: "x", url: "https://example.org" } }), /parameters_unsupported/)
  assert.throws(() => validateFarmOwnerRequest({ request_type: "research_public_records", target_id: "samwise_public_records_intelligence", parameters: { topic: "x", max_documents: 1000 } }), /document_limit/)
  assert.throws(() => validateFarmOwnerRequest({ request_type: "research_public_records", target_id: "samwise_public_records_intelligence", parameters: {} }), /topic_required/)
})

test("research memory supports continuation without blindly replaying documents", () => {
  const catalog = buildSamwiseResearchSourceCatalog({ listenerRegistry: listenerSources })
  const request = validateFarmOwnerRequest({ request_type: "research_public_records", target_id: "samwise_public_records_intelligence", parameters: { topic: "public benefits administration", jurisdiction: "British Columbia", domains: ["government_services", "public_funding"], depth: "bounded" } })
  const plan = planSamwiseUniversalResearch(request, catalog)
  const source = plan.source_plan[0].source_id
  const secondary = reviewSamwiseSecondaryRelevance({ findingId: "finding-1", primaryDomain: "government_services", candidates: [{ domain: "public_funding", evidence_basis: "explicit_source" }], sourceReference: "https://example.org/report" })
  const memory = createSamwiseResearchMemory({ plan, sourcesChecked: [source], documentsSeen: [{ source_id: source, document_id: "doc-1", fingerprint: "abc", reviewed: true }], findings: ["finding-1"], secondaryReviews: [secondary], stoppingReason: "document_limit", now: new Date("2026-09-07T12:00:00Z") })
  const continuationRequest = validateFarmOwnerRequest({ request_type: "continue_research", target_id: "samwise_public_records_intelligence", parameters: { research_request_id: memory.research_request_id } })
  const continuation = continueSamwiseResearch({ request: continuationRequest, memory, sourceCatalog: catalog })
  assert.deepEqual(continuation.exclude_document_fingerprints, ["abc"])
  assert.equal(continuation.repeated_completed_sources_without_reason, 0)
  assert.ok(continuation.source_plan.some(item => !memory.sources_checked.includes(item.source_id)))
  assert.deepEqual(calculateSamwiseResearchRequestYield(memory), { research_request_id: memory.research_request_id, sources_checked: 1, documents_checked: 1, useful_findings: 1, cross_domain_discoveries: 1, useful_per_100_documents: 100, cost_usd: 0, score_type: "transparent_counts_only" })
})

test("research memory persists atomically and merges continuation state", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "samwise-memory-"))
  const file = path.join(directory, "memory.json")
  const catalog = buildSamwiseResearchSourceCatalog({ listenerRegistry: listenerSources })
  const request = validateFarmOwnerRequest({ request_type: "research_public_records", target_id: "samwise_public_records_intelligence", parameters: { topic: "administrative fairness", domains: ["government_services"], depth: "single" } })
  const plan = planSamwiseUniversalResearch(request, catalog)
  const first = createSamwiseResearchMemory({ plan, sourcesChecked: [plan.source_plan[0].source_id], documentsSeen: [{ source_id: plan.source_plan[0].source_id, document_id: "one", fingerprint: "one", reviewed: true }], findings: ["finding-one"], stoppingReason: "document_limit" })
  persistSamwiseResearchMemory(file, first)
  const second = createSamwiseResearchMemory({ plan, sourcesChecked: [plan.source_plan[1].source_id], documentsSeen: [{ source_id: plan.source_plan[1].source_id, document_id: "two", fingerprint: "two", reviewed: true }], findings: ["finding-two"], stoppingReason: "no_material_novelty" })
  const store = persistSamwiseResearchMemory(file, second)
  assert.equal(findSamwiseResearchMemory(store, plan.research_request_id).documents_seen.length, 2)
  assert.deepEqual(samwiseResearchMemoryStatus(readSamwiseResearchMemoryStore(file)), { requests: 1, continuable: 1, branches: 0, documents_seen: 2, findings: 2, production_data_mutations: 0, publication_actions: 0 })
})

test("research branching is parent-linked and capped", () => {
  const catalog = buildSamwiseResearchSourceCatalog({ listenerRegistry: listenerSources })
  const request = validateFarmOwnerRequest({ request_type: "research_public_records", target_id: "samwise_public_records_intelligence", parameters: { topic: "public benefits", domains: ["government_services"], depth: "bounded" } })
  const plan = planSamwiseUniversalResearch(request, catalog)
  const memory = { ...createSamwiseResearchMemory({ plan, findings: ["ombuds-chain"], stoppingReason: "no_material_novelty" }), branch_depth: 0 }
  const child = branchSamwiseResearch({ parentMemory: memory, findingId: "ombuds-chain", topic: "ombuds implementation follow-up", domains: ["government_services"], sourceCatalog: catalog, maxDocuments: 25 })
  assert.equal(child.parent_research_request_id, memory.research_request_id)
  assert.equal(child.branch_depth, 1)
  assert.equal(child.limits.documents, 25)
  assert.throws(() => branchSamwiseResearch({ parentMemory: { ...memory, branch_depth: 2 }, findingId: "ombuds-chain", topic: "too deep", sourceCatalog: catalog }), /depth_exceeded/)
})

test("secondary relevance requires reviewed evidence and covers the whole controlled domain set", () => {
  const review = reviewSamwiseSecondaryRelevance({ findingId: "safety-1", primaryDomain: "public_safety", candidates: [{ domain: "courts_legal", evidence_basis: "reviewed_citation" }], sourceReference: "https://example.org/order" })
  assert.equal(review.review_complete, true)
  assert.equal(review.assessed_domains.length, 14)
  assert.equal(review.cross_domain_discovery, true)
  assert.throws(() => reviewSamwiseSecondaryRelevance({ findingId: "bad", primaryDomain: "public_safety", candidates: [{ domain: "courts_legal", evidence_basis: "keyword_similarity" }], sourceReference: "https://example.org/order" }), /evidence_required/)
})

test("the second independent domain uses the same normalization and routing pipeline", () => {
  assert.equal(workplaceProof.source_systems_checked, 4)
  assert.equal(workplaceProof.full_records_reviewed, 4)
  for (const item of workplaceProof.findings) {
    const finding = normalizeSamwiseFinding(item)
    const routing = routeSamwiseFinding(finding)
    assert.equal(finding.primary_domain, "public_safety")
    assert.ok(finding.secondary_domains.length > 0)
    assert.deepEqual(routing.routes.sort(), ["future_project_candidate", "owner_intelligence"].sort())
    assert.equal(routing.automatic_publication, false)
  }
  assert.equal(workplaceProof.summary.miller_outputs, 0)
  assert.equal(workplaceProof.summary.miller_north_outputs, 0)
})

test("public-benefits v2 separates response, implementation and outcome evidence", () => {
  assert.equal(benefitsV2.documents_fully_reviewed, 3)
  assert.equal(benefitsV2.recommendation_rows.length, 7)
  assert.ok(benefitsV2.recommendation_rows.some(row => row.status === "partially_implemented"))
  assert.ok(benefitsV2.recommendation_rows.some(row => row.status === "case_level_outcome_documented"))
  assert.equal(benefitsV2.consumer_outputs.publications, 0)
})

test("institution map resolves aliases and produces factual history without reputation scores", () => {
  assert.deepEqual(validateSamwiseEntityRegistry(), { valid: true, entities: 30, aliases: 82 })
  assert.equal(resolveSamwiseEntity("AISH").entity_id, "program_alberta_aish")
  assert.equal(resolveSamwiseEntity("Alberta OHS").entity_id, "institution_alberta_ohs")
  const normalized = normalizeSamwiseFinding(workplaceProof.findings[1])
  const findings = [{ ...normalized, relevant_entities: normalized.relevant_entities.map(entity => ({ ...entity, entity_id: "institution_alberta_ohs" })) }]
  const history = buildSamwiseInstitutionHistory({ entityId: "institution_alberta_ohs", findings })
  assert.equal(history.public_record_history.length, 1)
  assert.equal(history.reputational_score, null)
  const chain = buildSamwiseInstitutionRelationshipChain({ organization: "Alberta OHS", documents: [{ document_id: "doc-1", source_reference: "https://example.org", event_id: "event-1" }], events: [{ event_id: "event-1", investigated_by: ["institution_alberta_ohs"] }] })
  assert.equal(chain.organization.entity_id, "institution_alberta_ohs")
  assert.equal(chain.automatic_event_merge, false)
})

test("Igor institutional matching remains exact, bounded and advisory", () => {
  const result = compareInstitutionalAliases([{ name: "AHS" }, { name: "Alberta health service-ish" }], [{ entity_id: "ahs", canonical_name: "Alberta Health Services", aliases: ["AHS"] }])
  assert.equal(result.checked, 2)
  assert.equal(result.matched, 1)
  assert.equal(result.owner_review.length, 1)
  assert.equal(result.fuzzy_matching_used, false)
})

test("funding intelligence detects material changes but never publishes automatically", () => {
  const base = normalizeSamwiseFundingProgram({ canonical_program_id: "fund-1", administrator: "Public agency", program_name: "Travel fund", purpose: "Treatment travel", eligibility: "Published eligibility", jurisdiction: "Alberta", deadline: "ongoing", status: "active", source_url: "https://example.org/fund", last_verified: "2026-09-07", project_opportunities: ["miller"], verified_from_official_source: true })
  const changed = normalizeSamwiseFundingProgram({ ...base, deadline: "2026-12-31", source_url: "https://example.org/fund", verified_from_official_source: true })
  assert.equal(diffSamwiseFundingProgram(base, changed).material_change, true)
  const routing = routeSamwiseFundingProgram(changed)
  assert.ok(routing.routes.includes("miller_resource_candidate"))
  assert.equal(routing.automatic_publication, false)
})

test("live intelligence is domain-agnostic and requires an actionable milestone", () => {
  const first = createSamwiseLiveIntelligence({ canonical_live_id: "live-1", event_id: "event-1", institution: "Public agency", source_url: "https://example.org/process", current_status: "milestone_scheduled", evidence_status: "official_notice", primary_domain: "government_services", secondary_domains: ["public_funding"], next_public_milestone: "2026-10-01 review", expected_document: "review outcome", monitoring_source: "https://example.org/process" })
  const next = createSamwiseLiveIntelligence({ ...first, current_status: "finding_issued", evidence_status: "official_finding", material_change: true })
  assert.deepEqual(diffSamwiseLiveIntelligence(first, next).changed_fields.sort(), ["current_status", "evidence_status"].sort())
  assert.equal(next.publication_authority, false)
  assert.throws(() => createSamwiseLiveIntelligence({ canonical_live_id: "bad", event_id: "event", institution: "Agency", source_url: "https://example.org", current_status: "formal_process", primary_domain: "public_safety" }), /milestone_required/)
})

test("decided owner review state survives listener refreshes", () => {
  const prior = [{ canonical_id: "review-1", review_state: "approved", review_decided_at: "2026-09-07T00:00:00Z" }]
  const refreshed = [{ canonical_id: "review-1", review_state: "pending", title: "Changed title" }, { canonical_id: "review-2", review_state: "pending" }]
  assert.equal(preserveSamwiseReviewDecisions(prior, refreshed)[0].review_state, "approved")
  assert.equal(preserveFarmReviewDecisions(prior, refreshed)[0].review_state, "approved")
})

test("original Miller still rejects intelligence records and only accepts separately verified resources", () => {
  const finding = normalizeSamwiseFinding(workplaceProof.findings[0])
  const routing = routeSamwiseFinding(finding)
  assert.equal(projectSamwiseFinding({ finding, routing }).outputs.some(output => output.consumer === "miller"), false)
  assert.equal(assertSamwiseCannotBypassMiller({ record_kind: "legal_decision", legal_record_id: "x" }).allowed, false)
  const resource = resourceRegistry.records.find(item => item.project_visibility.includes("miller"))
  assert.equal(assertSamwiseCannotBypassMiller(resource).allowed, true)
})

test("weekly brief adds concise general Samwise intelligence counts", () => {
  const email = buildFarmWeeklyOwnerEmail({ runs: [{ completed_at: "2026-09-07T12:00:00Z", listener_id: "samwise-proof", source_family: "workplace_safety_enforcement", project_scope: "samwise", status: "completed", checked: 4, material_changes: 2, owner_review: 2, research_request_id: "research:proof", resource_discoveries: 1, live_monitor_candidates: 1, cross_domain_discoveries: [{ primary_domain: "public_safety", secondary_domains: ["courts_legal"], outcome: "formal finding", public_label: "Workplace safety" }] }], now: new Date("2026-09-07T13:00:00Z") })
  assert.equal(email.sections.samwise_intelligence.research_requests, 1)
  assert.equal(email.sections.samwise_intelligence.cross_domain_discoveries, 1)
  assert.match(email.text, /Palantír/)
  assert.doesNotMatch(email.text, /private narrative|credential/i)
})
