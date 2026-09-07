import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import registry from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import { toMillerNorthSharedEmailResult } from "../src/millerNorthPublicSupportEmail.js"
import { filterMillerNorthSupports } from "../src/site/millerNorthSupportFilters.js"
import { projectSharedResources, validateSharedResourceRegistry } from "../server/sharedResourceRegistry.js"

test("shared public registry validates and preserves distinct project projections", () => {
  assert.deepEqual(validateSharedResourceRegistry(registry), { valid: true, total: 124, miller_only: 47, miller_north_only: 42, both: 35 })
  assert.equal(projectSharedResources(registry, "miller").length, 82)
  assert.equal(projectSharedResources(registry, "miller_north").length, 77)
})

test("known cross-project programs share one canonical record while program-level services stay distinct", () => {
  const transport = registry.records.find(record => record.program_name === "Medical Transportation Benefit")
  assert.deepEqual(transport.project_visibility, ["miller", "miller_north"])
  assert.ok(transport.source_record_ids.length >= 2)
  const rentBanks = registry.records.filter(record => /Rent Bank/.test(record.program_name))
  assert.ok(rentBanks.length >= 4)
  const counsellingBenefit = registry.records.find(record => record.canonical_resource_id === "shared_isc_nihb_mental_health_counselling")
  assert.equal(counsellingBenefit.record_type, "funding")
  assert.equal(counsellingBenefit.funding.status, "recurring")
})

test("Supports & Funding UI consumes the shared projection and exposes no private workflow fields", () => {
  const page = readFileSync(new URL("../src/site/MillerNorthFirstNationsSupports.jsx", import.meta.url), "utf8")
  assert.match(page, /miller-shared-resource-registry-v1\.json/)
  assert.match(page, /Supports &amp; Funding/)
  assert.match(page, /aria-label="Supports and Funding filters"/)
  assert.doesNotMatch(page, /owner_review|private_notes|candidate_notes/)
  assert.doesNotMatch(page, /shared publication-safe resource registry|One resource foundation/)
})

test("every North projection record maps to a public email identifier", () => {
  const records = projectSharedResources(registry, "miller_north")
  const emailRecords = records.map(toMillerNorthSharedEmailResult)
  assert.equal(emailRecords.filter(Boolean).length, records.length)
  assert.equal(new Set(emailRecords.map(record => record.id)).size, records.length)
  assert.ok(emailRecords.every(record => record.approved && record.website.startsWith("https://")))
  assert.equal(emailRecords.find(record => record.id === "support:north:shared_isc_nihb_mental_health_counselling").kind, "funding")
  assert.equal(emailRecords.find(record => record.id === "support:north:north_ahs_indigenous_hospital_support").kind, "service")
})

test("expanded records retain program-level housing, legal and medical-travel detail", () => {
  const camponi = registry.records.find(record => record.canonical_resource_id === "shared_sk_camponi_housing")
  assert.equal(camponi.housing.availability, "Approved applicants join a wait list")
  assert.ok(camponi.required_documents.includes("Household income verification"))
  const courtwork = registry.records.find(record => record.canonical_resource_id === "shared_ncsa_indigenous_courtwork")
  assert.equal(courtwork.legal_support.service_type, "court_navigation_and_support")
  assert.match(courtwork.legal_support.representation, /not a general promise/i)
  const travel = registry.records.find(record => record.canonical_resource_id === "shared_mns_medical_travel_assistance")
  assert.equal(travel.transportation.delivery, "Fuel, meal and accommodation support plus scheduled medical travel vans")
  assert.match(travel.transportation.escort_rules, /may be authorized/i)
})

test("North quick filters find specialized facets without duplicating canonical records", () => {
  const records = projectSharedResources(registry, "miller_north")
  const transport = filterMillerNorthSupports(records, { category: "transportation", province: "Saskatchewan" })
  assert.ok(transport.some(record => record.canonical_resource_id === "shared_mns_medical_travel_assistance"))
  assert.equal(new Set(transport.map(record => record.canonical_resource_id)).size, transport.length)
  const housing = filterMillerNorthSupports(records, { category: "housing", province: "Alberta" })
  assert.ok(housing.some(record => record.canonical_resource_id === "shared_ncsa_kisnimi_ti"))
  const mentalHealth = filterMillerNorthSupports(records, { category: "mental_health_substance_use" })
  assert.ok(mentalHealth.some(record => record.canonical_resource_id === "shared_isc_hope_for_wellness"))
  assert.deepEqual(filterMillerNorthSupports(records, { query: "courtwork", province: "Alberta" }).map(record => record.canonical_resource_id), ["shared_ncsa_indigenous_courtwork"])
})

test("verified legal-navigation services project independently into both products", () => {
  const miller = projectSharedResources(registry, "miller")
  const north = projectSharedResources(registry, "miller_north")
  const shared = registry.records.find(record => record.canonical_resource_id === "shared_bc_human_rights_clinic")
  assert.deepEqual(shared.project_visibility, ["miller", "miller_north"])
  assert.equal(shared.legal_support.service_type, "human_rights_advice_and_possible_representation")
  assert.ok(miller.some(record => record.canonical_resource_id === "shared_sk_classic_legal_programs"))
  assert.ok(north.some(record => record.canonical_resource_id === "shared_bc_virtual_indigenous_justice_centre"))
  assert.equal(miller.some(record => record.canonical_resource_id === "north_bc_police_accountability_unit"), false)
  assert.equal(north.some(record => record.canonical_resource_id === "north_bc_police_accountability_unit"), true)
})
