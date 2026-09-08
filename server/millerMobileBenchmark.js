import { performance } from "node:perf_hooks"

import { buildMillerMobileSearchResponse, buildMillerMobileSharePack } from "./millerMobileApi.js"
import { buildMobileReadinessIndex, mobileReadinessSummary } from "./millerMobileReadiness.js"
import { isMillerPracticalPublicResource } from "../src/millerPracticalIntelligence.js"
import { millerResourceSearchText } from "../src/millerPublicSearchResources.js"

const clean = value => String(value ?? "").replace(/\s+/g, " ").trim()
const normalized = value => clean(value).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim()
const ratio = (part, total) => total ? Number((part / total).toFixed(3)) : 0
const includesAny = (value, terms) => terms.some(term => ` ${normalized(value)} `.includes(` ${normalized(term)} `))
const canonicalProvince = value => ({
  bc: "British Columbia",
  "british columbia": "British Columbia",
  ab: "Alberta",
  alberta: "Alberta",
  sk: "Saskatchewan",
  saskatchewan: "Saskatchewan",
  canada: "Canada-wide",
  "canada wide": "Canada-wide",
}[normalized(value)] || "British Columbia")

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
])

function resourceText(resource) {
  return [resource.name, resource.organization, resource.category, resource.service_type, resource.description, resource.access_note, resource.eligibility_note, ...(resource.tags || [])].join(" ")
}

function locationRelevant(resource, scenario) {
  if (!scenario.location) return true
  return normalized(resource.city) === normalized(scenario.location)
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
    const weakReasons = []
    if (!results.length) weakReasons.push("no_results")
    if (top && !includesAny(resourceText(top), scenario.terms)) weakReasons.push("top_result_not_relevant")
    if (scenario.location && locationCount === 0) weakReasons.push("no_local_or_service_area_result")
    if (results.length && ratio(correctProvince, results.length) < 0.8) weakReasons.push("province_accuracy_below_80_percent")
    if (results.length && ratio(phoneCount, results.length) < 0.5) weakReasons.push("phone_coverage_below_50_percent")
    if (results.length && ratio(accessCount, results.length) < 0.75) weakReasons.push("access_coverage_below_75_percent")
    if (results.length && ratio(shareableCount, results.length) < 0.8) weakReasons.push("shareability_below_80_percent")
    if (supportAvailable === false) weakReasons.push(`${scenario.support}_navigation_missing`)
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
  const provinces = ["British Columbia", "Alberta", "Saskatchewan", "Canada-wide"]
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
