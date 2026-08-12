import { createClient } from "@supabase/supabase-js"
import rows from "../src/vancouver_resources_merged_updated.json" with { type: "json" }
import { normalizedResourceRows } from "../src/resourceData.js"
import { stableCuratedResourceId } from "../src/map/mapChat.js"
import { canonicalSeedId } from "../server/resourceIdentity.js"
import { addressCacheKey } from "../server/geocoding.js"

const PROJECT = "wccagykzugrahwugefqt"
const NAMES = new Set([
  "Richmond Community Mental Health and Substance Use - Central Intake", "Anne Vogel Clinic",
  "Archway Abbotsford Addictions Centre", "Burnaby Community Substance Use Services Clinic",
  "Opioid Agonist Treatment - Burnaby", "Langley Community Services Society",
  "Gathering Place Community Centre - Clothing", "Evelyne Saller Centre - Clothing",
  "Carnegie Community Centre", "Kiwassa Neighbourhood House", "Mission Possible",
  "UBC Learning Exchange", "Rapid Access Addiction Clinic (RAAC) - Vancouver",
  "Addiction Services - Downtown Community Health Centre", "Commercial Health Centre",
])
const clean = (value) => String(value || "").replace(/\s+/g, " ").trim()
const geocodingStreet = (value) => {
  const original = clean(value)
  const segment = original.split(",").map(clean).reverse().find((part) => /^#?\d/.test(part) && !/^(?:unit|suite|room)\b/i.test(part)) || original
  return segment.replace(/^#\d+[-–](?=\d)/, "").replace(/,?\s+(?:unit|suite|room)\s+.+$/i, "")
}
const pilot = normalizedResourceRows(rows).filter((row) => NAMES.has(row.name)).map((row) => {
  const alias = stableCuratedResourceId(row)
  const street_address = geocodingStreet(row.address)
  return { resource_id: canonicalSeedId("curated_bundle", alias), source_alias: alias, name: row.name, original_address_text: row.address, street_address, city: row.city, province: "BC", country: "Canada", public_source: row.website, normalized_query: [street_address, row.city, "BC", "Canada"].join(", ") }
}).sort((a, b) => a.name.localeCompare(b.name))
if (pilot.length !== 15) throw new Error(`Pilot must contain exactly 15 resources; found ${pilot.length}`)
if (!process.argv.includes("--apply")) { console.log(JSON.stringify({ mode: "dry_run", count: pilot.length, pilot }, null, 2)); process.exit(0) }
if (!process.env.SUPABASE_URL || new URL(process.env.SUPABASE_URL).hostname.split(".")[0] !== PROJECT) throw new Error("Unexpected Supabase project")
if (!clean(process.env.GEOCODER_CONTACT_EMAIL)) throw new Error("GEOCODER_CONTACT_EMAIL is required")
const db = createClient(new URL(process.env.SUPABASE_URL).origin, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const before = await Promise.all(["resource_registry", "resource_source_aliases", "resource_match_candidates", "resource_locations", "geocode_cache", "resource_location_audit"].map((table) => db.from(table).select("id", { count: "exact", head: true })))
if (before.some((x) => x.error) || before[0].count !== 430 || before[1].count !== 432 || before[2].count !== 3) throw new Error("Registry preflight counts failed")
if (before[3].count !== 0 && !process.argv.includes("--resume")) throw new Error("Location table is not empty; use --resume only after reviewing existing pilot state")

let lastRequest = 0, requestCount = 0
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const expectedNumber = (street) => street.match(/^\s*(\d+)/)?.[1] || ""
const validate = (result, item) => {
  const lat = Number(result?.lat), lon = Number(result?.lon), address = result?.address || {}
  const returned = clean(result?.display_name)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !lat || !lon || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { ok: false, reason: "invalid_coordinates" }
  if (clean(address.country_code).toLowerCase() !== "ca" || !/british columbia/i.test(clean(address.state))) return { ok: false, reason: "country_or_province_mismatch" }
  const returnedCity = clean(address.city || address.town || address.municipality || address.village || address.county)
  if (!returnedCity.toLowerCase().includes(item.city.toLowerCase()) && !returned.toLowerCase().includes(item.city.toLowerCase())) return { ok: false, reason: "city_mismatch" }
  const number = expectedNumber(item.street_address)
  if (number && clean(address.house_number) !== number && !new RegExp(`\\b${number}\\b`).test(returned)) return { ok: false, reason: "street_number_mismatch" }
  if (["place", "boundary", "highway"].includes(result?.class) || ["city", "town", "village", "postcode", "road"].includes(result?.addresstype)) return { ok: false, reason: "non_building_approximation" }
  return { ok: true, value: { latitude: lat, longitude: lon, returned_address: returned, geocode_source: "nominatim", geocode_confidence: result.importance == null ? null : Math.max(0, Math.min(1, Number(result.importance))), provider_place_id: result.place_id, provider_type: result.type, provider_class: result.class, warnings: [] } }
}
async function request(item) {
  if (requestCount >= 15) return { status: "failed", reason: "request_cap_reached" }
  const elapsed = Date.now() - lastRequest
  if (elapsed < 1100) await wait(1100 - elapsed)
  const url = new URL("https://nominatim.openstreetmap.org/search")
  url.searchParams.set("q", item.normalized_query); url.searchParams.set("format", "jsonv2"); url.searchParams.set("addressdetails", "1"); url.searchParams.set("limit", "3"); url.searchParams.set("countrycodes", "ca"); url.searchParams.set("email", process.env.GEOCODER_CONTACT_EMAIL)
  lastRequest = Date.now(); requestCount += 1
  let response
  try { response = await fetch(url, { headers: { "User-Agent": `Miller-Service-Map/1.0 (${process.env.GEOCODER_CONTACT_EMAIL})`, Accept: "application/json" } }) } catch { return { status: "failed", reason: "network_error" } }
  if (!response.ok) return { status: "failed", reason: `http_${response.status}` }
  const checked = (await response.json()).map((result) => validate(result, item)).filter((x) => x.ok)
  if (!checked.length) return { status: "rejected", reason: "no_exact_validated_building_match" }
  const unique = new Map(checked.map((x) => [`${x.value.latitude.toFixed(5)},${x.value.longitude.toFixed(5)}`, x.value]))
  if (unique.size !== 1) return { status: "ambiguous", reason: "multiple_validated_locations" }
  return { status: "accepted", value: [...unique.values()][0] }
}

const results = []
for (const item of pilot) {
  const key = addressCacheKey({ street_address: item.street_address, city: item.city, province: item.province, country: item.country })
  const { data: existingLocation } = await db.from("resource_locations").select("id,latitude,longitude").eq("resource_id", item.resource_id).eq("location_type", "fixed").eq("street_address", item.street_address).eq("city", item.city).maybeSingle()
  if (existingLocation) { results.push({ name: item.name, status: "cached", location_id: existingLocation.id }); continue }
  const { data: cached } = await db.from("geocode_cache").select("validation_status,response_summary,error_summary").eq("provider", "nominatim").eq("query_hash", key).maybeSingle()
  let outcome = cached?.validation_status === "accepted" && cached.response_summary ? { status: "accepted", value: cached.response_summary, cached: true } : cached ? { status: cached.validation_status, reason: cached.error_summary, cached: true } : await request(item)
  if (!cached) await db.from("geocode_cache").upsert({ provider: "nominatim", normalized_query: item.normalized_query, query_hash: key, validation_status: outcome.status === "rejected" ? "mismatch" : outcome.status, response_summary: outcome.value || null, error_summary: outcome.reason || null }, { onConflict: "provider,query_hash" })
  if (outcome.status !== "accepted") { results.push({ name: item.name, status: outcome.status, reason: outcome.reason, cached: Boolean(outcome.cached) }); continue }
  const location = { resource_id: item.resource_id, location_type: "fixed", original_address_text: item.original_address_text, street_address: item.street_address, city: item.city, province: item.province, country: item.country, latitude: outcome.value.latitude, longitude: outcome.value.longitude, geocode_source: "nominatim", geocode_confidence: outcome.value.geocode_confidence, geocode_status: "matched", review_status: "pending", public_map: false }
  const { data, error } = await db.from("resource_locations").insert(location).select().single()
  if (error) throw error
  const { error: auditError } = await db.from("resource_location_audit").insert({ location_id: data.id, action: "geocoded", new_values: { ...data, normalized_query: item.normalized_query, returned_address: outcome.value.returned_address, provider_place_id: outcome.value.provider_place_id, provider_type: outcome.value.provider_type, provider_class: outcome.value.provider_class, warnings: outcome.value.warnings }, reason: "Phase 1G maximum-15 non-public pilot" })
  if (auditError) throw auditError
  results.push({ name: item.name, status: outcome.cached ? "cached" : "pending", location_id: data.id, returned_address: outcome.value.returned_address })
}
const after = await Promise.all(["resource_locations", "geocode_cache", "resource_location_audit"].map((table) => db.from(table).select("id", { count: "exact", head: true })))
console.log(JSON.stringify({ project: PROJECT, resources: pilot.length, network_requests: requestCount, results, counts: { locations: after[0].count, cache: after[1].count, audit: after[2].count } }, null, 2))
