import assert from "node:assert/strict"
import test from "node:test"
import registry from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import {
  buildMillerPracticalIntelligence,
  detectMillerPracticalIntents,
  isMillerPracticalPublicResource,
} from "../src/millerPracticalIntelligence.js"
import { buildSharedCanonicalMillerResources } from "../src/millerPublicSearchResources.js"

const shared = buildSharedCanonicalMillerResources(registry.records)

test("shared canonical knowledge exposes verified Miller resources without changing its public product boundary", () => {
  assert.ok(shared.length > 0)
  assert.ok(shared.every(item => item.source === "shared_canonical_miller_projection" && item.verification_status === "verified_active"))
  assert.equal(shared.some(item => item.id === "north_bc_police_accountability_unit"), false)
  assert.ok(shared.every(item => registry.records.find(record => record.canonical_resource_id === item.id)?.project_visibility.includes("miller")))
  assert.ok(shared.some(item => /fund|benefit|assistance/i.test(`${item.category} ${item.serviceType} ${item.name}`)))
})

test("funding and treatment are connected from the full internal Miller knowledge layer", () => {
  const intelligence = buildMillerPracticalIntelligence({ query: "I need help paying for treatment", resources: shared, results: [] })
  assert.equal(intelligence.primary_intent, "treatment")
  assert.deepEqual(intelligence.secondary_intents, ["funding"])
  assert.match(intelligence.combined_context, /treatment options together with verified funding/i)
  assert.ok(intelligence.related_collections.some(item => item.href === "/funding-assistance"))
  assert.ok(intelligence.speech_resources.length > 0)
})

test("housing after treatment and transportation to care retain multiple practical intents", () => {
  assert.deepEqual(detectMillerPracticalIntents("housing after treatment"), ["housing", "treatment"])
  const housing = buildMillerPracticalIntelligence({ query: "housing after treatment", resources: shared, results: shared })
  assert.match(housing.combined_context, /recovery-oriented and general housing supports/i)
  const transport = buildMillerPracticalIntelligence({ query: "transportation to OAT", resources: shared, results: shared })
  assert.match(transport.combined_context, /transportation supports/i)
})

test("re-entry guidance connects verified practical categories without exposing investigations", () => {
  assert.equal(detectMillerPracticalIntents("leaving corrections and need help")[0], "reentry")
  const intelligence = buildMillerPracticalIntelligence({ query: "leaving corrections and need housing", resources: shared, results: shared })
  assert.equal(intelligence.primary_intent, "reentry")
  assert.match(intelligence.combined_context, /re-entry support together with practical housing/i)
  assert.ok(intelligence.related_collections.some(item => item.href === "/practical-supports"))
})

test("legal navigation uses practical services while investigative records remain excluded", () => {
  const investigation = { id: "case-1", name: "Police decision", kind: "legal_decision", source: "Samwise Public Records Intelligence" }
  assert.equal(isMillerPracticalPublicResource(investigation), false)
  const legal = buildMillerPracticalIntelligence({ query: "legal help with tenancy", resources: [...shared, investigation], results: shared })
  assert.equal(legal.primary_intent, "legal")
  assert.ok(legal.speech_resources.every(item => item.id !== "case-1"))
  assert.equal(legal.public_scope, "original_miller_practical_resources_only")
})

test("internal resources remain first and external web items retain an unverified label", () => {
  const external = { id: "web-1", name: "Web lead", source: "tavily", approved: false }
  const intelligence = buildMillerPracticalIntelligence({ query: "housing", resources: shared, results: [external, ...shared.slice(0, 3)] })
  assert.equal(intelligence.source_priority[0], "current_results")
  assert.equal(intelligence.source_priority.at(-1), "bounded_external_search")
  assert.equal(intelligence.external_search_policy, "only_when_internal_results_are_insufficient")
  assert.equal(intelligence.external_results[0].status, "External result — not yet verified.")
  assert.ok(intelligence.speech_resources.every(item => item.source !== "tavily"))
})

test("private counselling stays inside Miller as an explicit UI action", () => {
  const intelligence = buildMillerPracticalIntelligence({
    query: "methadone",
    results: [{ id: "oat-1", name: "OAT intake", category: "OAT", description: "Opioid agonist treatment intake." }],
    resources: [],
  })
  assert.ok(intelligence.related_collections.some(item => item.action === "private_counselling"))
  assert.equal(intelligence.related_collections.some(item => item.href?.includes("info=private-counselling")), false)
})

test("guidance does not invent approval, entitlement, clinical fit, or bed availability", () => {
  for (const query of ["detox", "funding for treatment", "housing after treatment", "legal help"]) {
    const intelligence = buildMillerPracticalIntelligence({ query, resources: shared, results: shared })
    const text = JSON.stringify(intelligence)
    assert.doesNotMatch(text, /you (?:are eligible|qualify|will be approved)|bed is available|clinically suitable|you have a legal case/i)
  }
})
