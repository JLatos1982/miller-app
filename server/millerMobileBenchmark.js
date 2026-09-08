import { performance } from "node:perf_hooks"

import { buildMillerMobileSearchResponse, buildMillerMobileSharePack } from "./millerMobileApi.js"
import { buildMobileReadinessIndex, mobileReadinessSummary } from "./millerMobileReadiness.js"
import { isMillerPracticalPublicResource } from "../src/millerPracticalIntelligence.js"
import { millerResourceSearchText } from "../src/millerPublicSearchResources.js"
import { MILLER_CANADIAN_COMMUNITY_INVENTORY, MILLER_COVERAGE_MATURITY, MILLER_WESTERN_COMMUNITY_INVENTORY } from "./millerWesternCommunities.js"

const clean = value => String(value ?? "").replace(/\s+/g, " ").trim()
const normalized = value => clean(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
const ratio = (part, total) => total ? Number((part / total).toFixed(3)) : 0
const includesAny = (value, terms) => terms.some(term => ` ${normalized(value)} `.includes(` ${normalized(term)} `))
const canonicalProvince = value => ({
  bc: "British Columbia",
  "british columbia": "British Columbia",
  ab: "Alberta",
  alberta: "Alberta",
  sk: "Saskatchewan",
  saskatchewan: "Saskatchewan",
  mb: "Manitoba",
  manitoba: "Manitoba",
  on: "Ontario",
  ontario: "Ontario",
  qc: "Quebec",
  quebec: "Quebec",
  "québec": "Quebec",
  nb: "New Brunswick",
  "new brunswick": "New Brunswick",
  ns: "Nova Scotia",
  "nova scotia": "Nova Scotia",
  pe: "Prince Edward Island",
  pei: "Prince Edward Island",
  "prince edward island": "Prince Edward Island",
  nl: "Newfoundland and Labrador",
  "newfoundland and labrador": "Newfoundland and Labrador",
  yt: "Yukon",
  yukon: "Yukon",
  nt: "Northwest Territories",
  nwt: "Northwest Territories",
  "northwest territories": "Northwest Territories",
  nu: "Nunavut",
  nunavut: "Nunavut",
  canada: "Canada-wide",
  "canada wide": "Canada-wide",
}[normalized(value)] || "Unknown")

export const MILLER_MOBILE_QUERY_BENCHMARK = Object.freeze([
  { id: "detox_surrey", query: "detox in Surrey", province: "British Columbia", location: "Surrey", terms: ["detox", "withdrawal management"] },
  { id: "detox_burnaby", query: "detox in Burnaby", province: "British Columbia", location: "Burnaby", terms: ["detox", "withdrawal management"] },
  { id: "housing_after_treatment_vancouver", query: "housing after treatment in Vancouver", province: "British Columbia", location: "Vancouver", terms: ["housing", "recovery housing", "supportive housing"] },
  { id: "oat_edmonton", query: "OAT in Edmonton", province: "Alberta", location: "Edmonton", terms: ["oat", "opioid agonist", "methadone", "buprenorphine"] },
  { id: "counselling_calgary", query: "counselling in Calgary", province: "Alberta", location: "Calgary", terms: ["counselling", "counseling", "therapy"] },
  { id: "mental_health_housing_saskatoon", query: "mental health and housing in Saskatoon", province: "Saskatchewan", location: "Saskatoon", terms: ["housing", "mental health"] },
  { id: "funding_treatment", query: "funding for treatment", terms: ["funding", "financial", "benefit", "covered"], support: "funding" },
  { id: "transport_treatment", query: "transportation to treatment", terms: ["transportation", "transport", "medical travel", "travel"], support: "transportation" },
  { id: "indigenous_treatment", query: "Indigenous-specific treatment support", terms: ["indigenous", "first nations", "inuit", "métis", "metis"] },
  { id: "legal_housing", query: "legal help with housing", terms: ["legal", "tenancy", "advocacy", "rights"] },
  { id: "recovery_housing", query: "recovery housing", terms: ["recovery housing", "post treatment housing", "supportive housing"] },
  { id: "family_after_treatment", query: "family support after treatment", terms: ["family", "caregiver", "loved one"] },
  { id: "corrections_reentry", query: "corrections re-entry support", terms: ["re entry", "reentry", "corrections", "reintegration", "release planning"] },
  { id: "detox_yorkton", query: "detox in Yorkton", province: "Saskatchewan", location: "Yorkton", terms: ["detox", "withdrawal management"] },
  { id: "withdrawal_la_ronge", query: "withdrawal help in La Ronge", province: "Saskatchewan", location: "La Ronge", terms: ["withdrawal", "detox"] },
  { id: "addiction_swift_current", query: "addiction help in Swift Current", province: "Saskatchewan", location: "Swift Current", terms: ["addiction", "substance use", "treatment"] },
  { id: "oat_bonnyville", query: "OAT in Bonnyville", province: "Alberta", location: "Bonnyville", terms: ["oat", "opioid agonist", "methadone", "buprenorphine"] },
  { id: "counselling_high_river", query: "counselling in High River", province: "Alberta", location: "High River", terms: ["counselling", "mental health", "substance use"] },
  { id: "addiction_canmore", query: "addiction help in Canmore", province: "Alberta", location: "Canmore", terms: ["addiction", "substance use", "treatment"] },
  { id: "mental_health_port_hardy", query: "mental health support in Port Hardy", province: "British Columbia", location: "Port Hardy", terms: ["mental health", "counselling"] },
  { id: "treatment_terrace", query: "treatment help in Terrace", province: "British Columbia", location: "Terrace", terms: ["treatment", "substance use", "addiction"] },
  { id: "addiction_cranbrook", query: "addiction support in Cranbrook", province: "British Columbia", location: "Cranbrook", terms: ["addiction", "substance use", "treatment"] },
  { id: "housing_prince_george", query: "housing after treatment in Prince George", province: "British Columbia", location: "Prince George", terms: ["housing", "shelter", "supportive housing"] },
  { id: "rural_transport", query: "transportation to treatment from rural British Columbia", province: "British Columbia", terms: ["transportation", "medical travel", "travel"], support: "transportation" },
  { id: "indigenous_northern_sk", query: "Indigenous treatment support in northern Saskatchewan", province: "Saskatchewan", terms: ["indigenous", "first nations", "treatment"] },
])

export const MILLER_NATIONAL_QUERY_BENCHMARK = Object.freeze([
  { id: "detox_winnipeg", query: "detox in Winnipeg", province: "Manitoba", location: "Winnipeg", terms: ["detox", "withdrawal", "addiction intake", "substance use"] },
  { id: "oat_brandon", query: "OAT in Brandon", province: "Manitoba", location: "Brandon", terms: ["oat", "opioid agonist", "raam", "rapid access"] },
  { id: "treatment_thunder_bay", query: "addiction treatment in Thunder Bay", province: "Ontario", location: "Thunder Bay", terms: ["addiction", "treatment", "indigenous"] },
  { id: "housing_toronto", query: "housing after treatment in Toronto", province: "Ontario", location: "Toronto", terms: ["housing", "treatment", "navigation"] },
  { id: "counselling_sudbury", query: "counselling in Sudbury", province: "Ontario", location: "Sudbury", terms: ["counselling", "mental health", "navigation"] },
  { id: "treatment_ottawa", query: "treatment help in Ottawa", province: "Ontario", location: "Ottawa", terms: ["treatment", "addiction", "navigation"] },
  { id: "addiction_montreal", query: "addiction help in Montreal", province: "Quebec", location: "Montréal", terms: ["drogue", "addiction", "reference", "référence"] },
  { id: "withdrawal_halifax", query: "withdrawal help in Halifax", province: "Nova Scotia", location: "Halifax", terms: ["withdrawal", "addiction", "intake"] },
  { id: "addiction_moncton", query: "addiction support in Moncton", province: "New Brunswick", location: "Moncton", terms: ["addiction", "withdrawal", "treatment"] },
  { id: "treatment_st_johns", query: "treatment in St. John's", province: "Newfoundland and Labrador", location: "St. John's", terms: ["treatment", "withdrawal", "addiction"] },
  { id: "addiction_whitehorse", query: "addiction help in Whitehorse", province: "Yukon", location: "Whitehorse", terms: ["addiction", "withdrawal", "substance use"] },
  { id: "treatment_yellowknife", query: "treatment access in Yellowknife", province: "Northwest Territories", location: "Yellowknife", terms: ["treatment", "addiction", "counselling"] },
  { id: "mental_health_nunavut", query: "mental health and addiction help in Nunavut", province: "Nunavut", terms: ["mental health", "addiction", "community health"] },
  { id: "indigenous_northern_ontario", query: "Indigenous treatment support in northern Ontario", province: "Ontario", location: "Northern Ontario", terms: ["indigenous", "first nations", "métis", "inuit"] },
  { id: "remote_transport", query: "transportation to treatment from a remote community", terms: ["transportation", "medical travel", "travel", "treatment"], support: "transportation" },
])

export const MILLER_NORTHERN_QUERY_BENCHMARK = Object.freeze([
  { id: "treatment_churchill", query: "addiction treatment from Churchill", province: "Manitoba", location: "Churchill", terms: ["addiction", "treatment", "substance use"], expect_transport: true },
  { id: "withdrawal_the_pas", query: "withdrawal help in The Pas", province: "Manitoba", location: "The Pas", terms: ["withdrawal", "raam", "addiction"] },
  { id: "indigenous_treatment_sioux_lookout", query: "Indigenous treatment from Sioux Lookout", province: "Ontario", location: "Sioux Lookout", terms: ["indigenous", "first nations", "addiction", "mental health"], expect_transport: true },
  { id: "oat_kenora", query: "OAT in Kenora", province: "Ontario", location: "Kenora", terms: ["oat", "opioid", "addiction", "treatment"] },
  { id: "treatment_travel_labrador", query: "treatment and medical travel from Labrador", province: "Newfoundland and Labrador", location: "Labrador", terms: ["treatment", "addiction", "medical travel"], expect_transport: true, expect_funding: true },
  { id: "addiction_rankin_inlet", query: "addiction help in Rankin Inlet", province: "Nunavut", location: "Rankin Inlet", terms: ["addiction", "mental health", "health access"] },
  { id: "mental_health_cambridge_bay", query: "mental health and addiction access in Cambridge Bay", province: "Nunavut", location: "Cambridge Bay", terms: ["mental health", "addiction", "health access"] },
  { id: "return_home_prince_rupert", query: "coming home to Prince Rupert after treatment and need housing and counselling", province: "British Columbia", location: "Prince Rupert", terms: ["housing", "counselling", "addiction"], expect_return_home: true },
  { id: "counselling_northern_saskatchewan", query: "counselling after treatment in northern Saskatchewan", province: "Saskatchewan", location: "Northern Saskatchewan", terms: ["counselling", "mental health", "addiction"], expect_return_home: true },
  { id: "remote_treatment_transport", query: "treatment plus transportation from a remote community", terms: ["treatment", "transportation", "medical travel"], expect_transport: true },
])

export const MILLER_EASTERN_QUERY_BENCHMARK = Object.freeze([
  { id: "detox_toronto", query: "detox in Toronto", province: "Ontario", location: "Toronto", terms: ["withdrawal", "detox", "addiction"] },
  { id: "raam_london", query: "RAAM in London", province: "Ontario", location: "London", terms: ["raam", "rapid access", "addiction medicine"] },
  { id: "oat_ottawa", query: "OAT in Ottawa", province: "Ontario", location: "Ottawa", terms: ["oat", "opioid agonist", "rapid access"] },
  { id: "treatment_thunder_bay_east", query: "treatment in Thunder Bay", province: "Ontario", location: "Thunder Bay", terms: ["treatment", "addiction", "raam"] },
  { id: "indigenous_sioux_lookout_east", query: "Indigenous treatment from Sioux Lookout", province: "Ontario", location: "Sioux Lookout", terms: ["indigenous", "first nations", "treatment"] },
  { id: "housing_hamilton", query: "housing after treatment in Hamilton", province: "Ontario", location: "Hamilton", terms: ["housing", "treatment", "navigation"] },
  { id: "addiction_montreal_east", query: "addiction help in Montreal", province: "Quebec", location: "Montréal", terms: ["dependance", "dépendance", "addiction", "toxicomanie"] },
  { id: "withdrawal_quebec_city", query: "withdrawal help in Quebec City", province: "Quebec", location: "Québec City", terms: ["sevrage", "drogue", "toxicomanie", "addiction"] },
  { id: "addiction_halifax_east", query: "addiction help in Halifax", province: "Nova Scotia", location: "Halifax", terms: ["addiction", "recovery", "intake"] },
  { id: "treatment_cape_breton", query: "treatment in Cape Breton", province: "Nova Scotia", location: "Cape Breton", terms: ["treatment", "withdrawal", "recovery"] },
  { id: "addiction_moncton_east", query: "addiction support in Moncton", province: "New Brunswick", location: "Moncton", terms: ["addiction", "withdrawal", "treatment"] },
  { id: "francophone_nb", query: "francophone addiction support in New Brunswick", province: "New Brunswick", terms: ["addiction", "dependance", "dépendance", "french"] },
  { id: "withdrawal_pei", query: "withdrawal in PEI", province: "Prince Edward Island", terms: ["withdrawal", "addiction"] },
  { id: "treatment_corner_brook", query: "treatment in Corner Brook", province: "Newfoundland and Labrador", location: "Corner Brook", terms: ["treatment", "addiction", "navigation"] },
  { id: "addiction_labrador_east", query: "addiction help in Labrador", province: "Newfoundland and Labrador", location: "Labrador", terms: ["addiction", "opioid", "treatment"] },
])

export const MILLER_HEALTHCARE_ADJACENT_QUERY_BENCHMARK = Object.freeze([
  { id: "oat_no_family_doctor", query: "I need OAT in Toronto and do not have a family doctor", province: "Ontario", location: "Toronto", terms: ["oat", "opioid", "primary care"], expect_layer: true },
  { id: "injection_wound", query: "addiction help and wound care in Montreal", province: "Quebec", location: "Montréal", terms: ["wound", "plaies", "toxicomanie"], expect_layer: true },
  { id: "treatment_hepatitis", query: "addiction treatment and hepatitis navigation in Labrador", province: "Newfoundland and Labrador", location: "Labrador", terms: ["hepatitis", "opioid", "treatment"], expect_layer: true },
  { id: "hospital_no_primary_care", query: "discharged from hospital in PEI and no primary care, need mental health support", province: "Prince Edward Island", terms: ["patient navigation", "mental health", "primary care"], expect_layer: true, expect_hospital_workflow: true },
  { id: "indigenous_patient_navigation", query: "Indigenous patient needs health system navigation in Labrador after hospital discharge", province: "Newfoundland and Labrador", location: "Labrador", terms: ["indigenous", "patient navigation", "discharge"], expect_layer: true, expect_hospital_workflow: true },
])

function resourceText(resource) {
  return [resource.name, resource.organization, resource.category, resource.service_type, resource.description, resource.access_note, resource.eligibility_note, resource.funding_note, resource.transportation_note, ...(resource.tags || [])].join(" ")
}

function locationRelevant(resource, scenario) {
  if (!scenario.location) return true
  return ["located_here", "serves_community", "regional_intake"].includes(resource.location_relationship)
    || normalized(resource.city) === normalized(scenario.location)
    || includesAny(`${resource.region} ${resource.address}`, [scenario.location])
}

function supportPresent(results, support) {
  if (!support) return null
  const terms = support === "funding" ? ["funding", "benefit", "financial", "covered"] : ["transportation", "transport", "travel"]
  return results.some(resource => includesAny(resourceText(resource), terms))
}

export function runMillerMobileQueryBenchmark(catalog, { now = () => new Date("2026-09-08T12:00:00.000Z"), scenarios = MILLER_MOBILE_QUERY_BENCHMARK, limit = 8 } = {}) {
  const rows = scenarios.map(scenario => {
    const started = performance.now()
    const response = buildMillerMobileSearchResponse({ query: scenario.query, limit }, catalog, { now })
    const latency = performance.now() - started
    const results = response.results
    const top = results[0]
    const correctProvince = scenario.province
      ? results.filter(resource => [scenario.province, "Canada-wide"].includes(resource.province)).length
      : results.length
    const locationCount = scenario.location ? results.filter(resource => locationRelevant(resource, scenario)).length : results.length
    const phoneCount = results.filter(resource => resource.phone).length
    const websiteCount = results.filter(resource => resource.website).length
    const accessCount = results.filter(resource => resource.access_note || resource.referral_note).length
    const shareableCount = results.filter(resource => resource.name && (resource.phone || resource.website) && (resource.access_note || resource.referral_note)).length
    const supportAvailable = supportPresent(results, scenario.support)
    const incorrectLocalFacilityClaims = results.filter(resource => resource.location_relationship === "located_here"
      && normalized(resource.physical_location?.community) !== normalized(scenario.location)).length
    const weakReasons = []
    if (!results.length) weakReasons.push("no_results")
    if (top && !includesAny(resourceText(top), scenario.terms)) weakReasons.push("top_result_not_relevant")
    if (scenario.location && locationCount === 0) weakReasons.push("no_local_or_service_area_result")
    if (results.length && ratio(correctProvince, results.length) < 0.8) weakReasons.push("province_accuracy_below_80_percent")
    if (results.length && ratio(phoneCount, results.length) < 0.5) weakReasons.push("phone_coverage_below_50_percent")
    if (results.length && ratio(accessCount, results.length) < 0.75) weakReasons.push("access_coverage_below_75_percent")
    if (results.length && ratio(shareableCount, results.length) < 0.8) weakReasons.push("shareability_below_80_percent")
    if (supportAvailable === false) weakReasons.push(`${scenario.support}_navigation_missing`)
    if (incorrectLocalFacilityClaims) weakReasons.push("incorrect_local_facility_claim")
    return {
      id: scenario.id,
      query: scenario.query,
      result_count: response.result_count,
      returned_count: results.length,
      top_result: top?.name || null,
      top_result_relevant: Boolean(top && includesAny(resourceText(top), scenario.terms)),
      province_accuracy: ratio(correctProvince, results.length),
      location_accuracy: ratio(locationCount, results.length),
      phone_availability: ratio(phoneCount, results.length),
      website_availability: ratio(websiteCount, results.length),
      access_information: ratio(accessCount, results.length),
      funding_or_navigation_available: supportAvailable,
      shareability: ratio(shareableCount, results.length),
      mobile_ready_results: results.filter(resource => resource.mobile_ready).length,
      geography_mode: response.search_scope.mode,
      physical_location_matches: response.search_scope.physical_location_matches,
      service_area_matches: response.search_scope.service_area_matches,
      incorrect_local_facility_claims: incorrectLocalFacilityClaims,
      weak: weakReasons.length > 0,
      weak_reasons: weakReasons,
      latency_ms: Number(latency.toFixed(2)),
      payload_bytes: Buffer.byteLength(JSON.stringify(response)),
    }
  })
  const totalLatency = rows.reduce((sum, row) => sum + row.latency_ms, 0)
  return Object.freeze({
    schema_version: "miller-mobile-query-benchmark-v1",
    generated_at: now().toISOString(),
    query_count: rows.length,
    passing_queries: rows.filter(row => !row.weak).length,
    weak_queries: rows.filter(row => row.weak).map(row => ({ id: row.id, reasons: row.weak_reasons })),
    average_latency_ms: Number((totalLatency / Math.max(rows.length, 1)).toFixed(2)),
    p95_latency_ms: rows.length ? [...rows].sort((a, b) => a.latency_ms - b.latency_ms)[Math.ceil(rows.length * 0.95) - 1].latency_ms : 0,
    average_payload_bytes: Math.round(rows.reduce((sum, row) => sum + row.payload_bytes, 0) / Math.max(rows.length, 1)),
    rows,
  })
}

export function runMillerNorthernPathwayBenchmark(catalog, { now = () => new Date("2026-09-08T12:00:00.000Z"), scenarios = MILLER_NORTHERN_QUERY_BENCHMARK, limit = 10 } = {}) {
  const rows = scenarios.map(scenario => {
    const response = buildMillerMobileSearchResponse({ query: scenario.query, limit }, catalog, { now })
    const results = response.results
    const top = results[0]
    const pathwayResults = results.filter(resource => resource.access_pathway)
    const combinedText = results.map(resourceText).join(" ")
    const hasTransport = results.some(resource => resource.travel_required
      || resource.access_pathway?.transportation_pathway
      || includesAny(resourceText(resource), ["transportation", "medical travel", "travel funding"]))
    const hasFunding = results.some(resource => resource.access_pathway?.funding_pathway
      || includesAny(resourceText(resource), ["funding", "benefit", "financial assistance", "grant"]))
    const hasReturnHome = response.workflow.intent === "return_home_after_treatment"
      && (response.workflow.pathway.some(step => /return.home|ongoing|continuity/i.test(`${step.title} ${step.detail}`))
        || pathwayResults.some(resource => resource.access_pathway.return_home_support?.length))
    const correctOrigin = !scenario.location || normalized(response.interpreted.location) === normalized(scenario.location)
    const serviceAreaAccurate = !scenario.location || results.some(resource => ["located_here", "serves_community", "regional_intake", "province_navigation", "canada_wide"].includes(resource.location_relationship))
    const hasAccessPoint = pathwayResults.some(resource => resource.access_pathway.local_access_point || resource.access_pathway.regional_intake)
      || results.some(resource => resource.access_note || resource.referral_note)
    const hasDestination = pathwayResults.some(resource => resource.access_pathway.destination_service)
      || results.some(resource => resource.physical_location?.community)
    const incorrectLocalFacilityClaims = results.filter(resource => resource.location_relationship === "located_here"
      && normalized(resource.physical_location?.community) !== normalized(scenario.location)).length
    const reasons = []
    if (!results.length) reasons.push("no_results")
    if (top && !includesAny(`${resourceText(top)} ${combinedText}`, scenario.terms)) reasons.push("no_relevant_result")
    if (!correctOrigin) reasons.push("origin_not_recognized")
    if (!serviceAreaAccurate) reasons.push("service_area_missing")
    if (!hasAccessPoint) reasons.push("access_point_missing")
    if (scenario.expect_transport && !hasTransport) reasons.push("transportation_pathway_missing")
    if (scenario.expect_funding && !hasFunding) reasons.push("funding_pathway_missing")
    if (scenario.expect_return_home && !hasReturnHome) reasons.push("return_home_pathway_missing")
    if (incorrectLocalFacilityClaims) reasons.push("incorrect_local_facility_claim")
    return {
      id: scenario.id,
      query: scenario.query,
      returned_count: results.length,
      top_result: top?.name || null,
      correct_origin: correctOrigin,
      access_point_identified: hasAccessPoint,
      service_area_relationship: serviceAreaAccurate,
      destination_identified: hasDestination,
      transportation_identified: hasTransport,
      funding_identified: hasFunding,
      return_home_support: hasReturnHome,
      workflow_intent: response.workflow.intent,
      scope_mode: response.search_scope.mode,
      false_local_facility_claims: incorrectLocalFacilityClaims,
      pass: reasons.length === 0,
      reasons,
    }
  })
  return Object.freeze({
    schema_version: "miller-northern-pathway-benchmark-v1",
    generated_at: now().toISOString(),
    scenario_count: rows.length,
    passing_scenarios: rows.filter(row => row.pass).length,
    failed_scenarios: rows.filter(row => !row.pass).map(row => ({ id: row.id, reasons: row.reasons })),
    false_local_facility_claims: rows.reduce((sum, row) => sum + row.false_local_facility_claims, 0),
    rows,
  })
}

export function runMillerHealthcareAdjacentBenchmark(catalog, { now = () => new Date("2026-09-08T12:00:00.000Z"), scenarios = MILLER_HEALTHCARE_ADJACENT_QUERY_BENCHMARK, limit = 10 } = {}) {
  const rows = scenarios.map(scenario => {
    const response = buildMillerMobileSearchResponse({ query: scenario.query, limit }, catalog, { now })
    const combinedText = response.results.map(resourceText).join(" ")
    const supportingResults = response.results.filter(resource => resource.resource_layer === "healthcare_adjacent_support")
    const reasons = []
    if (!response.results.length) reasons.push("no_results")
    if (!includesAny(combinedText, scenario.terms)) reasons.push("workflow_terms_missing")
    if (scenario.expect_layer && !supportingResults.length) reasons.push("supporting_layer_missing")
    if (scenario.expect_hospital_workflow && response.workflow.intent !== "hospital_to_community") reasons.push("hospital_workflow_missing")
    if (response.results.some(resource => resource.location_relationship === "located_here"
      && normalized(resource.physical_location?.community) !== normalized(scenario.location))) reasons.push("incorrect_local_facility_claim")
    return {
      id: scenario.id,
      query: scenario.query,
      returned_count: response.results.length,
      supporting_results: supportingResults.map(resource => resource.canonical_id),
      workflow_intent: response.workflow.intent,
      pass: reasons.length === 0,
      reasons,
    }
  })
  const ordinary = buildMillerMobileSearchResponse({ query: "addiction help in Toronto", limit }, catalog, { now })
  const ordinaryAdjacent = ordinary.results.filter(resource => resource.resource_layer === "healthcare_adjacent_support")
  return Object.freeze({
    schema_version: "miller-healthcare-adjacent-benchmark-v1",
    generated_at: now().toISOString(),
    scenario_count: rows.length,
    passing_scenarios: rows.filter(row => row.pass).length,
    failed_scenarios: rows.filter(row => !row.pass).map(row => ({ id: row.id, reasons: row.reasons })),
    ordinary_addiction_query_adjacent_results: ordinaryAdjacent.map(resource => resource.canonical_id),
    rows,
  })
}

const COVERAGE_BUCKETS = Object.freeze({
  detox: ["detox", "withdrawal management"],
  residential_treatment: ["residential treatment", "inpatient addiction"],
  outpatient_treatment: ["outpatient treatment", "outpatient addiction"],
  oat: ["oat", "opioid agonist", "methadone", "buprenorphine"],
  counselling: ["counselling", "counseling", "therapy"],
  harm_reduction: ["harm reduction", "naloxone", "overdose prevention"],
  housing: ["housing", "shelter", "homeless"],
  mental_health: ["mental health", "psychiatric", "crisis"],
  legal_navigation: ["legal", "tenancy", "courtworker", "rights", "advocacy"],
  funding: ["funding", "benefit", "financial assistance", "grant"],
  transportation: ["transportation", "transport", "medical travel"],
  indigenous_specific: ["indigenous", "first nations", "métis", "metis", "inuit"],
  family_youth: ["family", "youth", "caregiver", "loved one"],
  reentry_corrections: ["re entry", "reentry", "corrections", "reintegration"],
})

export function buildMillerMobileCoverageMatrix(catalog, { now = new Date("2026-09-08T12:00:00.000Z") } = {}) {
  const resources = catalog.filter(isMillerPracticalPublicResource)
  const readiness = buildMobileReadinessIndex(resources, { now })
  const provinces = Object.keys(MILLER_COVERAGE_MATURITY)
  const byProvince = Object.fromEntries(provinces.map(province => [province, {}]))
  for (const province of provinces) {
    const provincial = resources.filter(resource => canonicalProvince(resource.province) === province)
    for (const [bucket, terms] of Object.entries(COVERAGE_BUCKETS)) {
      const matches = provincial.filter(resource => includesAny(millerResourceSearchText(resource), terms))
      byProvince[province][bucket] = {
        total: matches.length,
        mobile_ready: matches.filter(resource => readiness.get(clean(resource.id))?.mobile_ready).length,
      }
    }
  }
  const cities = ["Vancouver", "Surrey", "Burnaby", "Victoria", "Calgary", "Edmonton", "Regina", "Saskatoon", "Prince Albert"]
  const byCity = Object.fromEntries(cities.map(city => {
    const matches = resources.filter(resource => normalized(resource.city) === normalized(city) || includesAny(resource.region, [city]))
    return [city, {
      total: matches.length,
      mobile_ready: matches.filter(resource => readiness.get(clean(resource.id))?.mobile_ready).length,
      categories: Object.fromEntries(Object.entries(COVERAGE_BUCKETS).map(([bucket, terms]) => [bucket, matches.filter(resource => includesAny(millerResourceSearchText(resource), terms)).length])),
    }]
  }))
  return Object.freeze({
    schema_version: "miller-mobile-coverage-matrix-v1",
    generated_at: now.toISOString(),
    catalog: mobileReadinessSummary(resources, { now }),
    by_province: byProvince,
    by_city: byCity,
  })
}

export function buildMillerCanadianCommunityCoverageMatrix(catalog, { now = new Date("2026-09-08T12:00:00.000Z") } = {}) {
  const resources = catalog.filter(isMillerPracticalPublicResource)
  const readiness = buildMobileReadinessIndex(resources, { now })
  const rows = MILLER_CANADIAN_COMMUNITY_INVENTORY.map(entry => {
    const provincial = resources.filter(resource => canonicalProvince(resource.province) === entry.province)
    const local = provincial.filter(resource => normalized(explicitPhysicalCommunity(resource)) === normalized(entry.community))
    const regional = provincial.filter(resource => !local.includes(resource) && explicitlyServes(resource, entry.community))
    const navigation = provincial.filter(resource => resource.navigationOnly === true && (resource.provinceWide === true || explicitlyServes(resource, entry.community)))
    const relevant = [...new Set([...local, ...regional, ...navigation])]
    return {
      ...entry,
      maturity: MILLER_COVERAGE_MATURITY[entry.province] || "foundation",
      status: local.length ? "verified_coverage" : regional.some(resource => resource.navigationOnly !== true) ? "regional_coverage" : navigation.length ? "navigation_only" : "research_gap",
      local_resources: local.length,
      regional_resources: regional.length,
      provincial_navigation: navigation.length,
      mobile_ready: relevant.filter(resource => readiness.get(clean(resource.id))?.mobile_ready).length,
    }
  })
  return Object.freeze({
    schema_version: "miller-canadian-community-coverage-v1",
    generated_at: now.toISOString(),
    community_count: rows.length,
    by_province: Object.fromEntries(Object.keys(MILLER_COVERAGE_MATURITY).filter(province => province !== "Canada-wide").map(province => [province, rows.filter(row => row.province === province)])),
  })
}

function explicitPhysicalCommunity(resource) {
  return clean(resource?.physicalLocation?.community || (resource?.address ? resource?.city : ""))
}

function explicitlyServes(resource, community) {
  const areas = [...(resource?.localServiceArea || []), ...(resource?.regionalServiceArea || []), ...(resource?.searchLocations || [])]
  return areas.some(area => includesAny(area, [community])) || includesAny(resource?.region, [community])
}

export function buildMillerWesternCommunityCoverageMatrix(catalog, { now = new Date("2026-09-08T12:00:00.000Z") } = {}) {
  const resources = catalog.filter(isMillerPracticalPublicResource)
  const readiness = buildMobileReadinessIndex(resources, { now })
  const rows = MILLER_WESTERN_COMMUNITY_INVENTORY.map(entry => {
    const provincial = resources.filter(resource => canonicalProvince(resource.province) === entry.province)
    const local = provincial.filter(resource => normalized(explicitPhysicalCommunity(resource)) === normalized(entry.community))
    const regional = provincial.filter(resource => !local.includes(resource) && explicitlyServes(resource, entry.community))
    const navigation = provincial.filter(resource => resource.navigationOnly === true && (resource.provinceWide === true || explicitlyServes(resource, entry.community)))
    const relevant = [...new Set([...local, ...regional, ...navigation])]
    const textFor = terms => relevant.filter(resource => includesAny(millerResourceSearchText(resource), terms)).length
    const status = local.length ? "verified_coverage"
      : regional.some(resource => resource.navigationOnly !== true) ? "regional_coverage"
        : navigation.length ? "navigation_only"
          : "research_gap"
    return {
      ...entry,
      status,
      local_resources: local.length,
      regional_resources: regional.length,
      provincial_navigation: navigation.length,
      mobile_ready: relevant.filter(resource => readiness.get(clean(resource.id))?.mobile_ready).length,
      indigenous_specific: textFor(["indigenous", "first nations", "métis", "metis", "inuit"]),
      transportation: textFor(["transportation", "medical travel", "travel"]),
      housing: textFor(["housing", "shelter", "homeless"]),
      addiction_mental_health: textFor(["addiction", "substance use", "withdrawal", "oat", "mental health"]),
    }
  })
  const statusCounts = Object.fromEntries([...new Set(rows.map(row => row.status))].sort().map(status => [status, rows.filter(row => row.status === status).length]))
  return Object.freeze({
    schema_version: "miller-western-community-coverage-v1",
    generated_at: now.toISOString(),
    community_count: rows.length,
    status_counts: statusCounts,
    by_province: Object.fromEntries(["British Columbia", "Alberta", "Saskatchewan"].map(province => [province, rows.filter(row => row.province === province)])),
  })
}

export function auditMillerMobileSharePacks(catalog, { now = () => new Date("2026-09-08T12:00:00.000Z") } = {}) {
  const queries = ["detox in Surrey", "OAT in Edmonton", "mental health and housing in Saskatoon"]
  return queries.map(query => {
    const response = buildMillerMobileSearchResponse({ query, limit: 5 }, catalog, { now })
    const pack = buildMillerMobileSharePack(response, response.results.slice(0, 3).map(resource => resource.canonical_id))
    const serialized = JSON.stringify(pack).toLowerCase()
    return {
      query,
      resource_count: pack.resources.length,
      has_guidance: Boolean(pack.guidance),
      all_have_contact: pack.resources.every(resource => resource.phone || resource.website),
      internal_metadata_exposed: /owner_review|private|ranking_score|miller north|palant[ií]r|samwise/.test(serialized),
      text_bytes: Buffer.byteLength(pack.text),
    }
  })
}
