import assert from "node:assert/strict"
import test from "node:test"

import listenerRegistry from "../src/data/farm-listener-registry-v1.json" with { type: "json" }
import resourceRegistry from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import generatedSourceRegistry from "../src/data/samwise-public-record-source-registry-v1.json" with { type: "json" }
import { migrationBaselineFixture as migrationBaseline } from "./fixtures/privateArtifactSummaries.js"
import { samwiseListenerInventory, validateSamwiseCapabilityRegistry } from "../server/samwiseCapabilityRegistry.js"
import { buildSamwisePublicRecordsStatus, planSamwisePublicRecordsRequest, samwiseListenerOperationalState } from "../server/samwiseConversationalPublicRecords.js"
import { assertSamwiseCannotBypassMiller, consumerBoundarySummary, projectSamwiseFinding } from "../server/samwiseConsumerAdapters.js"
import { buildSamwiseEvidenceGraph, createSamwiseGraphEdge, reconcileSamwiseGraphEdge } from "../server/samwiseEvidenceGraph.js"
import { buildSamwiseOwnerReviewPacket, calculateSamwiseSourceYield, normalizeSamwiseDomain, normalizeSamwiseFinding, normalizeSamwiseSourceFamily, reconcileSamwiseDocument, routeSamwiseFinding } from "../server/samwisePublicRecordsIntelligence.js"
import { proposeSamwiseEntityMatch, resolveSamwiseEntity, validateSamwiseEntityRegistry } from "../server/samwiseEntityResolution.js"
import { buildSamwisePublicRecordSourceRegistry, validateSamwisePublicRecordSourceRegistry } from "../server/samwiseSourceRegistry.js"
import { buildFarmStatusSnapshot, validateFarmOwnerRequest } from "../server/farmSupabaseInteraction.js"

const campbell = () => normalizeSamwiseFinding({
  canonical_finding_id: "legal_bc_2019_bchrt_275",
  citation: "2019 BCHRT 275",
  title: "Campbell v. Vancouver Police Board (No. 4)",
  summary: "The Tribunal made a merits and remedy decision.",
  source_url: "https://example.org/2019-bchrt-275.pdf",
  source_family: "bc_human_rights_tribunal",
  source_role: "tribunal_decision",
  evidence_role: "merits_and_remedy_decision",
  intelligence_state: "formal_finding",
  primary_domain: "policing_custody_corrections",
  secondary_domains: ["human_rights_public_services"],
  cross_domain_reviewed: true,
  indigenous_relevance: "explicit_formal_finding",
  downstream_destinations: ["miller_north_evidence_candidate", "miller_north_watch_candidate"],
  next_research_action: "Review implementation evidence without treating training claims as measured outcomes.",
})

test("Samwise capability registry adapts public-record listeners without replacing the scheduler", () => {
  assert.deepEqual(validateSamwiseCapabilityRegistry(), { valid: true, capabilities: 1 })
  const inventory = samwiseListenerInventory({ listeners: listenerRegistry })
  assert.equal(inventory.listeners.length, 19)
  assert.equal(inventory.counts.enabled, 16)
  assert.equal(inventory.counts.disabled, 3)
  assert.equal(inventory.scheduler, "existing_farm_job_scheduler")
  assert.ok(inventory.listeners.every(item => item.capability_id === "samwise_public_records_intelligence" && item.mutation_authority === false && item.publication_authority === false))
  assert.ok(inventory.listeners.some(item => item.legacy_listener_id === "mn_bc_inquests_weekly"))
})

test("Samwise owns a domain-aware source registry projected from stable listener identities", () => {
  const sources = buildSamwisePublicRecordSourceRegistry(listenerRegistry)
  assert.deepEqual(validateSamwisePublicRecordSourceRegistry(sources), { valid: true, sources: 19, enabled: 16, disabled: 3 })
  assert.equal(sources.scheduler, "existing_farm_job_scheduler")
  assert.ok(sources.sources.find(source => source.legacy_listener_id === "mn_bc_iio_public_reports_monthly").supported_domains.includes("policing"))
  assert.ok(sources.sources.find(source => source.legacy_listener_id === "mn_bc_inquests_weekly").supported_domains.includes("healthcare"))
  assert.deepEqual(validateSamwisePublicRecordSourceRegistry(generatedSourceRegistry), { valid: true, sources: 19, enabled: 16, disabled: 3 })
})

test("reviewed Miller North-era intelligence migrates to Samwise without manufacturing incidents", () => {
  assert.equal(migrationBaseline.processed.findings, 63)
  assert.equal(migrationBaseline.processed.legal_decisions, 8)
  assert.equal(migrationBaseline.processed.child_youth_recommendations, 30)
  assert.equal(migrationBaseline.processed.corrections_recommendations, 24)
  assert.equal(migrationBaseline.safeguards.production_mutations, 0)
  assert.equal(migrationBaseline.safeguards.original_miller_research_records, 0)
  assert.equal(migrationBaseline.routes.miller_resource_candidate, undefined)
})

test("Samwise normalizes legacy source and domain names while preserving reviewed secondary relevance", () => {
  assert.equal(normalizeSamwiseSourceFamily("bc_human_rights_tribunal"), "human_rights_tribunals")
  const finding = campbell()
  assert.equal(finding.primary_domain, "policing")
  assert.deepEqual(finding.secondary_domains.map(item => item.domain), ["human_rights"])
  assert.equal(finding.source.adapter_family, "bc_human_rights_tribunal")
  assert.equal(finding.publication_authority, false)
  assert.throws(() => normalizeSamwiseFinding({ ...finding, canonical_finding_id: "weak-cross-lane", source_url: "https://example.org/a", source_family: "courts", secondary_domains: ["healthcare"], cross_domain_reviewed: false }), /reviewed_evidence/)
  assert.equal(normalizeSamwiseDomain("extension_environment", { additionalDomains: ["extension_environment"] }), "extension_environment")
  assert.equal(normalizeSamwiseDomain("unregistered future domain"), "other_public_institution")
})

test("routing creates consumer candidates but never publishes", () => {
  const finding = campbell()
  const routing = routeSamwiseFinding(finding)
  assert.deepEqual(routing.routes, ["miller_north_evidence_candidate", "miller_north_watch_candidate", "owner_intelligence"])
  assert.equal(routing.automatic_publication, false)
  const packet = buildSamwiseOwnerReviewPacket(finding, routing)
  assert.equal(packet.owner_review_state, "pending")
  assert.equal(packet.publication_authority, false)
  const projected = projectSamwiseFinding({ finding, routing })
  assert.equal(projected.outputs.filter(item => item.consumer === "miller_north").length, 2)
  assert.ok(projected.outputs.every(item => item.automatic_publication === false))
})

test("documents strengthen events without treating document identity as event identity", () => {
  const first = reconcileSamwiseDocument({ listenerId: "listener-1", sourceId: "doc-2", sourceUrl: "https://example.org/doc-2", documentFingerprint: "b", eventFingerprint: "same-event", previousDocuments: [{ listener_id: "listener-1", source_id: "doc-1", document_fingerprint: "a", event_fingerprint: "same-event" }] })
  assert.equal(first.event_disposition, "existing_event_new_evidence")
  assert.equal(first.event_identity_is_document_identity, false)
  assert.equal(first.automatic_event_merge, false)
})

test("Samwise source yield is transparent and counts cross-domain value", () => {
  const metrics = calculateSamwiseSourceYield([
    { status: "completed", checked: 100, new_events: 1, existing_events_strengthened: 2, material_changes: 1, cross_lane_discoveries: [{}, {}], resource_discoveries: 1, watch_candidates: 1, owner_review: 2, noise_or_rejections: 12, cost_usd: 0 },
    { status: "failed", checked: 0, owner_review: 1 },
  ])
  assert.equal(metrics.useful_findings, 4)
  assert.equal(metrics.cross_domain_discoveries, 2)
  assert.equal(metrics.useful_per_100_documents, 4)
  assert.equal(metrics.score_type, "transparent_counts_only")
})

test("Samwise graph requires reviewed evidence for cross-domain edges and suppresses duplicates", () => {
  const nodes = [
    { node_type: "event", canonical_id: "event-1", label: "Event" },
    { node_type: "public_institution", canonical_id: "vpd", label: "Vancouver Police Department" },
  ]
  const edgeInput = { edge_type: "policing_overlap", from: "event:event-1", to: "public_institution:vpd", evidence_basis: "reviewed_citation", source_reference: "https://example.org/decision" }
  assert.throws(() => createSamwiseGraphEdge({ ...edgeInput, evidence_basis: "keyword_similarity" }), /reviewed_evidence/)
  const graph = buildSamwiseEvidenceGraph({ nodes, edges: [edgeInput] })
  assert.equal(graph.counts.nodes, 2)
  assert.equal(graph.counts.edges, 1)
  assert.equal(reconcileSamwiseGraphEdge(graph.edges, edgeInput).disposition, "duplicate_suppressed")
})

test("entity aliases are deterministic and do not merge distinct institutions", () => {
  assert.equal(validateSamwiseEntityRegistry().entities, 30)
  assert.equal(resolveSamwiseEntity("VPD").entity_id, "institution_vancouver_police_department")
  assert.equal(resolveSamwiseEntity("Vancouver Police Board").entity_id, "institution_vancouver_police_board")
  assert.notEqual(resolveSamwiseEntity("VPD").entity_id, resolveSamwiseEntity("Vancouver Police Board").entity_id)
  assert.equal(proposeSamwiseEntityMatch({ value: "Vancouver policing", candidate: { entity_id: "institution_vancouver_police_department" } }).automatic_match, false)
})

test("original Miller receives only independently verified practical resource records", () => {
  const valid = resourceRegistry.records.find(resource => resource.project_visibility.includes("miller"))
  assert.deepEqual(assertSamwiseCannotBypassMiller(valid), { allowed: true, reason: "verified_practical_resource_only" })
  assert.equal(assertSamwiseCannotBypassMiller({ ...valid, legal_record_id: "2019 BCHRT 275" }).allowed, false)
  const finding = normalizeSamwiseFinding({ ...campbell(), canonical_finding_id: "resource-side-effect", downstream_destinations: ["miller_resource_candidate"], resource_opportunities: [valid.canonical_resource_id] })
  const routing = routeSamwiseFinding(finding, { resourceCandidates: [valid] })
  const projection = projectSamwiseFinding({ finding, routing, resources: [valid] })
  const miller = projection.outputs.find(item => item.consumer === "miller")
  assert.equal(miller.canonical_resource_id, valid.canonical_resource_id)
  assert.equal(miller.research_record_included, false)
})

test("typed public-record requests are bounded to the Samwise capability", () => {
  const request = validateFarmOwnerRequest({ request_type: "research_public_records", target_id: "samwise_public_records_intelligence", parameters: { topic: "hospital security", jurisdiction: "BC", domains: ["policing", "healthcare"], depth: "bounded", known_case_citation: "2019 BCHRT 275" } })
  assert.deepEqual(request.parameters.domains, ["policing", "healthcare"])
  const sourceRegistry = buildSamwisePublicRecordSourceRegistry(listenerRegistry)
  const plan = planSamwisePublicRecordsRequest(request, sourceRegistry)
  assert.ok(plan.listener_ids.includes("mn_bc_iio_public_reports_monthly"))
  assert.equal(plan.automatic_execution, false)
  assert.equal(plan.arbitrary_command_allowed, false)
  assert.throws(() => validateFarmOwnerRequest({ request_type: "research_public_records", target_id: "shell", parameters: { topic: "x" } }), /target_invalid/)
  assert.throws(() => validateFarmOwnerRequest({ request_type: "research_public_records", target_id: "samwise_public_records_intelligence", parameters: { domains: ["everything"] } }), /domains_invalid/)
})

test("conversational status exposes bounded capability counts, not narratives", () => {
  const inventory = samwiseListenerInventory({ listeners: listenerRegistry }).listeners.map((item, index) => ({ ...item, next_run_at: index === 0 ? "2026-09-09T13:15:00.000Z" : null }))
  const status = buildSamwisePublicRecordsStatus({ listeners: inventory, history: [{ completed_at: "2026-09-08T12:00:00.000Z", checked: 12, new_documents: 1, updated_documents: 1, new_events: 0, existing_events_strengthened: 1, domain_counts: { policing: { checked: 12, changed: 2, relevant: 1 } } }], reviewItems: [{ review_state: "pending", summary: "sensitive narrative must not appear" }], researchMemories: [{ schema_version: "samwise-research-memory-v1", stopping_reason: "document_limit", secondary_relevance: [{ domains: ["healthcare"] }] }], now: new Date("2026-09-08T18:00:00.000Z") })
  assert.equal(status.listeners.registered, 19)
  assert.equal(status.listeners.by_state.scheduled, 19)
  assert.equal(status.activity.owner_review, 1)
  assert.equal(status.domains.policing.findings, 1)
  assert.equal(status.research.requests_remembered, 1)
  assert.equal(status.research.cross_domain_discoveries, 1)
  assert.equal(JSON.stringify(status).includes("sensitive narrative"), false)
  const farmStatus = buildFarmStatusSnapshot({ inventory: [], history: [], samwisePublicRecords: status, now: new Date("2026-09-08T18:00:00.000Z") })
  assert.equal(farmStatus.digest.capabilities.samwise_public_records_intelligence.activity.owner_review, 1)
  assert.equal(farmStatus.digest.capabilities.samwise_public_records_intelligence.research.requests_remembered, 1)
  assert.equal(JSON.stringify(farmStatus).includes("sensitive narrative"), false)
})

test("listener status distinguishes scheduled, running, changed, review and safe failure states", () => {
  assert.equal(samwiseListenerOperationalState({}), "scheduled")
  assert.equal(samwiseListenerOperationalState({ status: "running" }), "running")
  assert.equal(samwiseListenerOperationalState({ status: "completed", updated_documents: 1 }), "changed")
  assert.equal(samwiseListenerOperationalState({ status: "completed", owner_review: 1 }), "owner_review")
  assert.equal(samwiseListenerOperationalState({ status: "failed" }), "failed")
  assert.equal(samwiseListenerOperationalState({ status: "deferred" }), "deferred")
})

test("the consumer boundary remains explicit", () => {
  assert.deepEqual(consumerBoundarySummary(), {
    samwise: "discovers, reconciles, connects and routes public-record intelligence",
    miller_north: "owns Indigenous accountability presentation and publication decisions",
    miller: "owns verified practical-resource presentation and guidance",
    source_record_ownership: "samwise",
    automatic_publication: false,
  })
})
