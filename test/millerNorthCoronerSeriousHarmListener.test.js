import assert from "node:assert/strict"
import test from "node:test"

import registry from "../src/data/miller-north-coroner-serious-harm-source-registry-v1.json" with { type: "json" }
import { expandMillerNorthQuery } from "../server/indigenousHealthcareEvidenceSearch.js"
import {
  buildRecommendationResponseChains,
  buildSeriousHarmQueries,
  classifySeriousHarmDocumentRole,
  exploreDocumentGraph,
  reconcileSeriousHarmDocuments,
  runCoronerSeriousHarmListener,
  seriousHarmEventFingerprint,
  tagSeriousHarmMechanisms,
  validateCoronerSourceRegistry,
} from "../server/millerNorthCoronerSeriousHarmListener.js"

const verdict = {
  adapter_id: "coroners_inquests",
  province: "british_columbia",
  event_key: "bc_example_2017",
  event_date: "2017-10-01",
  facility: "Example Hospital",
  title: "Verdict at Coroners Inquest",
  url: "https://example.org/verdict.pdf",
  summary: "Paramedics assessed an unresponsive patient before an interfacility transfer. The jury made a recommendation.",
  relevance: "relevant_new_incident_candidate",
  new_incident_candidate: true,
}

test("coroner source registry is structurally valid and read-only oriented", () => {
  const result = validateCoronerSourceRegistry(registry)
  assert.equal(result.source_count, registry.sources.length)
  assert.ok(result.source_count >= 12)
  assert.ok(registry.sources.some(item => item.source_id === "ab_fatality_recommendation_responses" && item.listener_feasibility === "very_high"))
  assert.ok(registry.sources.some(item => item.source_id === "bc_cpsbc_indigenous_case_studies" && item.recommended_frequency === "monthly"))
  assert.ok(registry.sources.some(item => item.source_id === "sk_fnho_publications" && item.source_family === "indigenous_governed_accountability"))
  assert.ok(registry.sources.some(item => item.source_id === "ab_child_youth_advocate_reviews" && item.listener_feasibility === "very_high"))
  assert.ok(registry.sources.some(item => item.source_id === "sk_advocate_children_youth" && item.historical_backfill_feasible === true))
})

test("document roles and mechanisms are classified deterministically", () => {
  assert.equal(classifySeriousHarmDocumentRole(verdict).role, "jury_verdict")
  assert.deepEqual(tagSeriousHarmMechanisms(verdict).sort(), ["ambulance_or_paramedic", "assessment_or_resuscitation", "complaint_or_investigation", "transfer_or_medevac"].sort())
})

test("documents about the same underlying event reconcile instead of inflating incidents", () => {
  const media = { ...verdict, title: "Media report", url: "https://example.org/news", source_family: "indigenous_media", document_role: "media_corroboration" }
  const events = reconcileSeriousHarmDocuments([verdict, media])
  assert.equal(events.length, 1)
  assert.equal(events[0].documents.length, 2)
  assert.equal(seriousHarmEventFingerprint(verdict), seriousHarmEventFingerprint(media))
})

test("recommendation response rows retain multiple accountable responders", () => {
  const chains = buildRecommendationResponseChains([
    { event_key: "event", recommendation_id: "13", recommendation_summary: "Information sharing", responsible_organization: "Health system", response_status: "Waiting for Response" },
    { event_key: "event", recommendation_id: "13", recommendation_summary: "Information sharing", responsible_organization: "First Nations agency", response_status: "Other" },
  ])
  assert.equal(chains.length, 1)
  assert.deepEqual(chains[0].responders, ["Health system", "First Nations agency"])
  assert.equal(chains[0].owner_review_required, true)
  assert.equal(chains[0].response_records.every(record => record.implementation_evidence === null && record.outcome_evidence === null), true)
})

test("document-led exploration is bounded and suppresses cycles", () => {
  const child = { ...verdict, url: "https://example.org/response", title: "Response to recommendation" }
  const graph = exploreDocumentGraph(verdict, [
    { parent_url: verdict.url, ...child },
    { parent_url: child.url, ...verdict },
  ], { maxDocuments: 4, maxDepth: 3 })
  assert.equal(graph.unique_documents, 2)
  assert.ok(graph.stop_reasons.includes("repeating_document"))
})

test("entity-mechanism query generation is deterministic and bounded", () => {
  const queries = buildSeriousHarmQueries({ entities: ["Maskwacis", "Nadine Solonas"], province: "Alberta", mechanisms: ["inquest", "ambulance"], limit: 3 })
  assert.deepEqual(queries, ["\"Maskwacis\" inquest Alberta", "\"Maskwacis\" ambulance Alberta", "\"Nadine Solonas\" inquest Alberta"])
})

test("official-system vocabulary feeds deterministic Miller North search expansion", () => {
  const fatality = expandMillerNorthQuery("fatality inquiry")
  const medevac = expandMillerNorthQuery("medevac")
  assert.ok(fatality.includes("coroner"))
  assert.ok(fatality.includes("inquest"))
  assert.ok(medevac.includes("ambulance"))
  assert.ok(medevac.includes("transfer"))
})

test("serious-harm listener preserves owner-review and no-write boundaries", () => {
  const cycle = runCoronerSeriousHarmListener([verdict], undefined, { checkedAt: "2026-09-07T00:00:00Z" })
  assert.equal(cycle.metrics.genuinely_new_incident_candidates, 1)
  assert.equal(cycle.reconciled_events.length, 1)
  assert.equal(cycle.publication_writes, 0)
  assert.equal(cycle.production_writes, 0)
  assert.equal(cycle.changes[0].owner_review_required, true)
  const stored = Object.values(cycle.documents)[0]
  assert.equal(stored.document_role, "jury_verdict")
  assert.ok(stored.mechanism_tags.includes("ambulance_or_paramedic"))
  assert.equal(stored.event_fingerprint, seriousHarmEventFingerprint(verdict))
})
