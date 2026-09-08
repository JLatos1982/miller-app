import assert from "node:assert/strict"
import test from "node:test"

import { millerMobileCatalog } from "../server/millerMobileCatalog.js"
import {
  buildMillerMobileInventory,
  buildMillerMobileSharePack,
  buildMillerMobileSearchResponse,
  MILLER_MOBILE_API_VERSION,
  validateMillerMobileSearchRequest,
} from "../server/millerMobileApi.js"

const fixedNow = () => new Date("2026-09-08T12:00:00.000Z")

test("mobile request contract is bounded and normalizes Western provinces", () => {
  assert.deepEqual(validateMillerMobileSearchRequest({
    free_text: "Detox in Surrey",
    province: "BC",
    categories: ["detox", "housing", "detox"],
    limit: 200,
  }), {
    query: "Detox in Surrey",
    location: "",
    province: "British Columbia",
    categories: ["detox", "housing"],
    limit: 20,
    broaden_nearby: false,
  })
  assert.throws(() => validateMillerMobileSearchRequest({ query: "" }), /query_required/)
  assert.throws(() => validateMillerMobileSearchRequest({ query: "help", province: "Ontario" }), /province_invalid/)
})

test("mobile search returns compact verified Miller resources and practical guidance", () => {
  const response = buildMillerMobileSearchResponse({ query: "Detox and housing options in Surrey", limit: 8 }, millerMobileCatalog, { now: fixedNow })
  assert.equal(response.contract, MILLER_MOBILE_API_VERSION)
  assert.equal(response.generated_at, "2026-09-08T12:00:00.000Z")
  assert.equal(response.interpreted.primary_intent, "detox")
  assert.equal(response.interpreted.location, "Surrey")
  assert.ok(response.result_count > 0)
  assert.ok(response.results.every(resource => resource.canonical_id && resource.name))
  assert.ok(response.results.every(resource => !Object.hasOwn(resource, "score")))
  assert.ok(response.results.every(resource => Object.hasOwn(resource, "referral_note")))
  assert.ok(response.results.every(resource => Object.hasOwn(resource, "transportation_note")))
  assert.ok(response.results.every(resource => Object.hasOwn(resource, "mobile_ready")))
  assert.match(response.guidance.interpretation, /detox|withdrawal/i)
  assert.equal(response.source_policy, "verified_original_miller_practical_resources_only")
})

test("mobile city detection does not depend on an existing city record and OAT matching is token bounded", () => {
  const calgary = buildMillerMobileSearchResponse({ query: "counselling in Calgary", limit: 8 }, millerMobileCatalog, { now: fixedNow })
  assert.equal(calgary.interpreted.location, "Calgary")
  assert.equal(calgary.interpreted.province, "Alberta")
  assert.match(calgary.results[0].name, /Calgary/i)

  const edmonton = buildMillerMobileSearchResponse({ query: "OAT in Edmonton", limit: 8 }, millerMobileCatalog, { now: fixedNow })
  assert.match(edmonton.results[0].name, /Opioid Dependency Program/i)
  assert.match(JSON.stringify(edmonton.results[0]), /opioid agonist|OAT/i)
})

test("unknown sparse queries fall back to bounded verified navigation without inventing resources", () => {
  const response = buildMillerMobileSearchResponse({ query: "specialized rare support in Moose Jaw", limit: 5 }, millerMobileCatalog, { now: fixedNow })
  assert.equal(response.interpreted.location, "Moose Jaw")
  assert.equal(response.interpreted.province, "Saskatchewan")
  assert.ok(response.results.length > 0)
  assert.equal(response.search_scope.geography_broadened, false)
  assert.match(response.search_scope.message, /didn't find a verified|limited/i)
  assert.ok(response.results.every(resource => ["Saskatchewan", "Canada-wide"].includes(resource.province)))
})

test("professional workflow decomposes multiple needs and explains results without exposing scores", () => {
  const response = buildMillerMobileSearchResponse({ query: "Someone is leaving detox Friday, has nowhere to stay, and doesn't drive in Surrey", limit: 10 }, millerMobileCatalog, { now: fixedNow })
  const needs = response.workflow.needs.map(item => item.need_id)
  assert.ok(needs.includes("detox"))
  assert.ok(needs.includes("housing"))
  assert.ok(needs.includes("transportation"))
  assert.ok(needs.includes("continuity"))
  assert.ok(response.workflow.pathway.length > 0)
  assert.ok(response.workflow.recommended_pack_ids.length > 0)
  assert.ok(response.results.every(item => Array.isArray(item.why_shown) && item.why_shown.length <= 3))
  assert.ok(response.results.every(item => !Object.hasOwn(item, "score")))
  assert.equal(/diagnos|clinically suitable|eligible|bed available/i.test(JSON.stringify(response.workflow)), false)
})

test("broaden nearby is an explicit action and retains the requested province", () => {
  const local = buildMillerMobileSearchResponse({ query: "counselling in High River", limit: 8 }, millerMobileCatalog, { now: fixedNow })
  assert.equal(local.broaden_nearby.applied, false)
  assert.equal(local.search_scope.geography_broadened, false)
  assert.ok(local.results.every(resource => ["Alberta", "Canada-wide"].includes(resource.province)))

  const broadened = buildMillerMobileSearchResponse({ query: "counselling in High River", broaden_nearby: true, limit: 8 }, millerMobileCatalog, { now: fixedNow })
  assert.equal(broadened.broaden_nearby.applied, true)
  assert.equal(broadened.search_scope.mode, "broadened_nearby")
  assert.match(broadened.search_scope.message, /broadened/i)
  assert.ok(broadened.results.every(resource => ["Alberta", "Canada-wide"].includes(resource.province)))
})

test("access pathways use only verified access notes or explicit safety confirmation", () => {
  const response = buildMillerMobileSearchResponse({ query: "Client wants OAT in Edmonton but doesn't have a family doctor", limit: 8 }, millerMobileCatalog, { now: fixedNow })
  assert.ok(response.workflow.needs.some(item => item.need_id === "access_navigation"))
  assert.ok(response.workflow.pathway.every(step => ["verified_access_note", "verified_service_scope", "deterministic_need_match", "safety_confirmation"].includes(step.basis)))
  assert.equal(/must|will qualify|guaranteed|available bed/i.test(JSON.stringify(response.workflow.pathway)), false)
})

test("Burnaby withdrawal search distinguishes the searched city from regional intake and Creekside's Surrey location", () => {
  const response = buildMillerMobileSearchResponse({ query: "detox in Burnaby", limit: 8 }, millerMobileCatalog, { now: fixedNow })
  const creekside = response.results.find(resource => resource.name === "Creekside Withdrawal Management Centre")
  const accessLine = response.results.find(resource => resource.name === "Fraser Health Access Line")

  assert.equal(response.search_scope.physical_location_matches, 0)
  assert.equal(response.search_scope.no_verified_local_facility, true)
  assert.equal(response.search_scope.mode, "regional_pathway")
  assert.match(response.search_scope.message, /didn't find a verified detox facility physically located in Burnaby/i)
  assert.equal(creekside.physical_location.community, "Surrey")
  assert.equal(creekside.location_relationship, "serves_community")
  assert.match(creekside.location_label, /Located in Surrey.*serves Burnaby/i)
  assert.equal(accessLine.location_relationship, "regional_intake")
  assert.match(accessLine.location_label, /Regional intake serving Burnaby/i)
  assert.equal(response.results.some(resource => resource.location_relationship === "located_here" && /detox|withdrawal/i.test(`${resource.name} ${resource.service_type} ${resource.category}`)), false)
})

test("mobile scope fields distinguish physical, regional, province-wide, virtual, and navigation service semantics", () => {
  const response = buildMillerMobileSearchResponse({ query: "withdrawal help in La Ronge", limit: 8 }, millerMobileCatalog, { now: fixedNow })
  const local = response.results.find(resource => resource.name === "Medically Supported Withdrawal Management - La Ronge")
  const provincial = response.results.find(resource => resource.name === "Saskatchewan Medically Supported Withdrawal Management")

  assert.equal(local.location_relationship, "located_here")
  assert.equal(local.physical_location.community, "La Ronge")
  assert.ok(local.regional_service_area.includes("Northern Saskatchewan"))
  assert.equal(provincial.province_wide, true)
  assert.equal(provincial.navigation_only, true)
  assert.equal(provincial.location_relationship, "regional_intake")
  assert.ok(response.results.every(resource => Object.hasOwn(resource, "scope_note")))
})

test("a sparse local OAT search leads with the local access pathway before distant clinics", () => {
  const response = buildMillerMobileSearchResponse({ query: "Someone in La Loche needs OAT", limit: 8 }, millerMobileCatalog, { now: fixedNow })
  assert.equal(response.search_scope.no_verified_local_facility, true)
  assert.equal(response.results[0].name, "Mental Health, Addictions and Withdrawal Services - La Loche")
  assert.equal(response.results[0].location_relationship, "located_here")
  assert.match(response.workflow.pathway[0].title, /La Loche/i)
  assert.doesNotMatch(response.search_scope.message, /local OAT.*exists/i)
})

test("mobile share pack exposes only concise practical fields", () => {
  const response = buildMillerMobileSearchResponse({ query: "detox in Surrey", limit: 5 }, millerMobileCatalog, { now: fixedNow })
  const pack = buildMillerMobileSharePack(response, response.results.slice(0, 2).map(resource => resource.canonical_id))
  assert.equal(pack.resources.length, 2)
  assert.ok(pack.resources.every(resource => resource.name && (resource.phone || resource.website)))
  assert.match(pack.text, /Confirm current intake, eligibility and availability/i)
  assert.equal(/owner_review|ranking_score|miller north|palant[ií]r|samwise/i.test(JSON.stringify(pack)), false)
})

test("shared resource packs retain accurate regional location wording", () => {
  const response = buildMillerMobileSearchResponse({ query: "detox in Burnaby", limit: 5 }, millerMobileCatalog, { now: fixedNow })
  const selected = response.results.slice(0, 2).map(resource => resource.canonical_id)
  const pack = buildMillerMobileSharePack(response, selected)
  assert.match(pack.text, /Creekside Withdrawal Management Centre/)
  assert.match(pack.text, /Located in Surrey.*serves Burnaby/i)
  assert.match(pack.text, /Regional intake serving Burnaby/i)
  assert.doesNotMatch(pack.text, /Burnaby detox facility/i)
})

test("mobile search combines practical categories without unsupported claims", () => {
  const response = buildMillerMobileSearchResponse({ query: "Housing after treatment in Edmonton", province: "Alberta" }, millerMobileCatalog, { now: fixedNow })
  assert.equal(response.interpreted.province, "Alberta")
  assert.ok(response.interpreted.secondary_intents.includes("housing") || response.interpreted.secondary_intents.includes("treatment"))
  assert.match(response.guidance.context, /housing|treatment|service system/i)
  assert.ok(response.guidance.safeguards.some(value => /confirm current intake, eligibility, and availability/i.test(value)))
  assert.ok(response.results.every(resource => ["Alberta", "Canada-wide"].includes(resource.province)))
  assert.equal(/you are eligible|will be approved|bed is available/i.test(JSON.stringify(response.guidance)), false)
})

test("guidance and cards retain source-backed funding, travel, and referral details", () => {
  const funding = buildMillerMobileSearchResponse({ query: "funding and transportation for treatment", limit: 8 }, millerMobileCatalog, { now: fixedNow })
  assert.match(funding.guidance.context, /funding|transportation/i)
  assert.ok(funding.results.some(resource => resource.funding_note || resource.transportation_note))
  assert.equal(/funding is approved|travel is covered|you qualify/i.test(JSON.stringify(funding.guidance)), false)

  const housing = buildMillerMobileSearchResponse({ query: "housing after treatment in Edmonton", limit: 8 }, millerMobileCatalog, { now: fixedNow })
  assert.ok(housing.results.some(resource => /referral|required|self-referral|apply/i.test(`${resource.access_note} ${resource.referral_note}`)))
  assert.match(housing.guidance.access_note, /referral|contact|call/i)
})

test("mobile projection excludes investigations and Miller North intelligence", () => {
  const unsafe = [
    { id: "case-1", name: "Police finding", kind: "investigation", source: "public records intelligence", approved: true, description: "private" },
    { id: "case-2", name: "Watch chain", kind: "service", source: "Miller North Accountability Watch", approved: true },
    { id: "service-1", name: "Verified legal navigation", kind: "service", source: "curated", approved: true, category: "Legal / Advocacy", province: "Alberta" },
  ]
  const response = buildMillerMobileSearchResponse({ query: "legal help", province: "Alberta" }, unsafe, { now: fixedNow })
  assert.deepEqual(response.results.map(resource => resource.canonical_id), ["service-1"])
})

test("mobile response records no query or client record and catalog reports Western coverage", () => {
  const response = buildMillerMobileSearchResponse({ query: "Funding and transportation for treatment" }, millerMobileCatalog, { now: fixedNow })
  assert.deepEqual(response.privacy, {
    query_stored: false,
    client_record_created: false,
    patient_identifiers_requested: false,
  })
  assert.equal(Object.hasOwn(response, "query"), false)
  const inventory = buildMillerMobileInventory(millerMobileCatalog)
  assert.ok(inventory.total > 100)
  assert.ok(inventory.by_province["British Columbia"] > 0)
  assert.ok(inventory.by_province.Alberta > 0)
  assert.ok(inventory.by_province.Saskatchewan > 0)
  assert.ok(inventory.by_province["Canada-wide"] > 0)
})

test("Western demo requests surface province-appropriate verified entry points", () => {
  const alberta = buildMillerMobileSearchResponse({ query: "Housing after treatment in Edmonton", limit: 12 }, millerMobileCatalog, { now: fixedNow })
  assert.equal(alberta.interpreted.province, "Alberta")
  assert.ok(alberta.results.some(resource => resource.name === "211 Alberta"))
  assert.ok(alberta.results.every(resource => ["Alberta", "Canada-wide"].includes(resource.province)))

  const saskatchewan = buildMillerMobileSearchResponse({ query: "Counselling in Saskatoon", limit: 12 }, millerMobileCatalog, { now: fixedNow })
  assert.equal(saskatchewan.interpreted.province, "Saskatchewan")
  assert.ok(saskatchewan.results.some(resource => resource.name === "Saskatchewan Mental Health and Addictions Access"))
  assert.ok(saskatchewan.results.every(resource => ["Saskatchewan", "Canada-wide"].includes(resource.province)))
})
