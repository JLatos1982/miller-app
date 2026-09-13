import fs from "node:fs"
import test from "node:test"
import assert from "node:assert/strict"

import {
  TREATY6_PROCUREMENT_POLICY, bindTreaty6ProjectionToMonitor, buildTreaty6PageSimulation, classifyTreaty6Geography,
  createTreaty6Buyer, createTreaty6GeographicModel, createTreaty6GeographicReference, createTreaty6Opportunity,
  evaluateTreaty6PublicationPolicy, filterAndSortTreaty6Opportunities, projectTemporalEventToTreaty6,
  toTreaty6PublicProjection, treaty6RefreshPlan,
} from "../server/treaty6ProcurementIntelligence.js"

const now = "2026-09-13T16:00:00.000Z"
const references = [
  createTreaty6GeographicReference({ reference_id: "text", title: "Treaty 6", source_url: "https://example.gc.ca/treaty6", source_role: "TREATY_TEXT", provinces: ["Alberta", "Saskatchewan"], geographic_scope: "Official described limits", verified_at: now }),
  createTreaty6GeographicReference({ reference_id: "ab-map", title: "Alberta treaty polygons", source_url: "https://open.alberta.ca/treaty6", source_role: "AUTHORITATIVE_BOUNDARY_DATA", provinces: ["Alberta"], geographic_scope: "Approximate historical polygons", verified_at: now }),
  createTreaty6GeographicReference({ reference_id: "sk-map", title: "Saskatchewan treaty map", source_url: "https://otc.ca/treaty6", source_role: "TREATY_COMMISSION_MAP", provinces: ["Saskatchewan"], geographic_scope: "Treaty 6 and adjacent areas", verified_at: now }),
]
const model = createTreaty6GeographicModel({ references })
const monitored = {
  opportunity_id: "PSPC-WR-001", buyer: "Public Services and Procurement Canada", title: "Western Region Indigenous Professional Design Services RFI",
  jurisdiction: "Federal / Alberta / Saskatchewan", region: "Alberta and Saskatchewan", category: "Professional design services", status: "OPEN",
  actionability: "RFI_ONLY", indigenous_relevance_class: "INDIGENOUS_PARTICIPATION_ENCOURAGED", relevance_evidence: "Explicit source language asks Indigenous businesses for capacity information.",
  source_url: "https://canadabuys.canada.ca/tender/1", posted_date: "2026-05-22", close_date: "2027-03-31", verified_at: now, observed_at: now,
}

test("Treaty 6 model requires authoritative cross-province references and forbids rectangle shortcuts", () => {
  assert.equal(model.provinces.length, 2)
  assert.match(model.geometry_rule, /No bounding rectangle/)
  assert.match(model.eligibility_rule, /never implies/)
  assert.throws(() => createTreaty6GeographicModel({ references: references.slice(0, 2) }), /evidence_incomplete/)
})

test("geographic relationships require cited evidence and never infer Indigenous eligibility", () => {
  const value = classifyTreaty6Geography({ evidence: [{ relationship: "OPEN_TO_TREATY_6_SUPPLIERS", source_ref: "text", reason: "The official opportunity includes both Treaty 6 provinces." }] }, model)
  assert.equal(value.primary, "OPEN_TO_TREATY_6_SUPPLIERS")
  assert.equal(value.geographic_relevance_established, true)
  assert.equal(value.indigenous_eligibility_inferred, false)
  assert.throws(() => classifyTreaty6Geography({ evidence: [{ relationship: "IN_TREATY_6_TERRITORY", source_ref: "missing", reason: "Unsupported source reference is rejected." }] }, model), /evidence_invalid/)
})

function opportunity(overrides = {}) {
  const geography = classifyTreaty6Geography({ evidence: [{ relationship: "OPEN_TO_TREATY_6_SUPPLIERS", source_ref: "text", reason: "The source-supported delivery region overlaps Treaty 6." }] }, model)
  return createTreaty6Opportunity({ monitored_record: { ...monitored, ...overrides }, geography, licensing_class: "PUBLIC_REUSE_CLEAR" })
}

test("opportunity adapter preserves RFI actionability and explicit Indigenous language separately", () => {
  const value = opportunity()
  assert.equal(value.actionability, "RFI_ONLY")
  assert.equal(value.indigenous_relevance_class, "INDIGENOUS_PARTICIPATION_ENCOURAGED")
  assert.deepEqual(value.categories, ["PROFESSIONAL_SERVICES"])
  assert.equal(value.small_business_fit.classification, "INSUFFICIENT_INFORMATION")
})

test("publication policy allows safe metadata but fails closed on Treaty 6, licensing and expiry gaps", () => {
  const value = opportunity()
  const decision = evaluateTreaty6PublicationPolicy(value, { now })
  assert.equal(decision.policy, TREATY6_PROCUREMENT_POLICY)
  assert.equal(decision.publishable, true)
  const projection = toTreaty6PublicProjection(value, decision)
  assert.equal("private_only" in projection, false)
  assert.match(projection.disclaimer, /official source controls/)
  const expired = opportunity({ close_date: "2026-09-01" })
  assert.equal(evaluateTreaty6PublicationPolicy(expired, { now }).result, "EXPIRED")
  const unresolved = createTreaty6Opportunity({ monitored_record: monitored, geography: classifyTreaty6Geography({}, model), licensing_class: "LICENSING_REVIEW_REQUIRED" })
  const unresolvedDecision = evaluateTreaty6PublicationPolicy(unresolved, { now })
  assert.equal(unresolvedDecision.publishable, false)
  assert.ok(unresolvedDecision.reasons.includes("treaty6_relevance_not_established"))
  assert.ok(unresolvedDecision.reasons.includes("licensing_review_required"))
})

test("public buyer registry never claims authority for unverified watch targets", () => {
  const buyer = createTreaty6Buyer({ name: "Primary Care Alberta", province: "Alberta", buyer_type: "HEALTH_AGENCY", registry_status: "MONITOR_TARGET_SOURCE_CONFIRMATION_REQUIRED", procurement_source_url: "https://purchasing.alberta.ca/", healthcare_lane: true })
  assert.equal(buyer.procurement_authority_claimed, false)
  assert.equal(buyer.healthcare_lane, true)
})

test("page simulation, filters, sorts and private route activation remain deterministic", () => {
  const decision = evaluateTreaty6PublicationPolicy(opportunity(), { now })
  const projected = toTreaty6PublicProjection(opportunity(), decision)
  const page = buildTreaty6PageSimulation({ projections: [projected], supports: [], signals: [], generated_at: now })
  assert.equal(page.route_concept, "/north/procurement")
  assert.equal(page.activated, false)
  assert.equal(page.sections.open_opportunities.length, 0)
  assert.equal(page.sections.indigenous_specific_participation.length, 1)
  assert.equal(filterAndSortTreaty6Opportunities([projected], { province: projected.province }, "NEWEST", now).length, 1)
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  assert.doesNotMatch(app, /Treaty6ProcurementPreview/)
})

test("monitor binding reuses the active campaign and does not create publication authority", () => {
  const campaign = { campaign_id: "INDIGENOUS_PROCUREMENT_OPPORTUNITY_MONITOR_30D_V1", status: "ACTIVE", publication_authority: false, campaign_checksum: "a".repeat(64) }
  const bound = bindTreaty6ProjectionToMonitor(campaign, { projection_checksum: "b".repeat(64), record_count: 6, public_safe_count: 1 })
  assert.equal(bound.projection_bindings.length, 1)
  assert.equal(bound.projection_bindings[0].no_duplicate_campaign, true)
  assert.equal(bound.projection_bindings[0].publication_authority, false)
  assert.throws(() => bindTreaty6ProjectionToMonitor({ ...campaign, status: "COMPLETED" }, {}), /active_campaign/)
})

test("temporal projection preserves source event times and rejects unresolved geography", () => {
  const value = opportunity()
  const event = { event_id: "evt-1", entity_id: "procurement-opportunity:PSPC-WR-001", event_type: "OPPORTUNITY_POSTED", observed_at: now, published_at: "2026-05-22", effective_at: null, verified_at: now, source_refs: [monitored.source_url] }
  const projected = projectTemporalEventToTreaty6(event, value)
  assert.equal(projected.temporal_event_id, "evt-1")
  assert.equal(projected.source_event_unchanged, true)
  const unresolved = createTreaty6Opportunity({ monitored_record: monitored, geography: classifyTreaty6Geography({}, model), licensing_class: "PUBLIC_REUSE_CLEAR" })
  assert.throws(() => projectTemporalEventToTreaty6(event, unresolved), /geography_unresolved/)
})

test("refresh plan validates changes before projection and never adds a scheduler", () => {
  const plan = treaty6RefreshPlan()
  assert.equal(plan.raw_html_diff_can_publish, false)
  assert.equal(plan.temporal_event_validation_required, true)
  assert.equal(plan.no_competing_scheduler, true)
})
