import { createClient } from "@supabase/supabase-js"
import { addressCacheKey } from "../server/geocoding.js"

const EXPECTED_PROJECT = "wccagykzugrahwugefqt"
const address = { street_address: "7155 Kingsway", city: "Burnaby", province: "BC", postal_code: "", country: "Canada" }
const normalizedQuery = "Suite 320, 7155 Kingsway, Burnaby, BC, Canada"
const resources = [
  ["23b498ab-7fed-5fbc-9f21-c9bea51cdf46", "Burnaby Community Substance Use Services Clinic"],
  ["b980ad5f-6dfc-5c03-ab5e-bbaaaf3d499f", "Opioid Agonist Treatment - Burnaby"],
  ["326ffb4d-a7ed-5526-8d5d-b2b171ac75da", "Burnaby Substance Use Services"],
  ["28cf5255-ecf4-5cdf-a371-301931fc4568", "Substance Use Services Access Team (SUSAT) - Fraser North"],
]
if (!process.argv.includes("--apply")) { console.log(JSON.stringify({ mode: "dry_run", request_cap: 1, normalized_query: normalizedQuery, resources }, null, 2)); process.exit(0) }
if (!process.env.SUPABASE_URL || new URL(process.env.SUPABASE_URL).hostname.split(".")[0] !== EXPECTED_PROJECT) throw new Error("Unexpected Supabase project")
if (!process.env.GEOCODER_CONTACT_EMAIL?.trim()) throw new Error("GEOCODER_CONTACT_EMAIL is required")
const db = createClient(new URL(process.env.SUPABASE_URL).origin, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: registry, error: registryError } = await db.from("resource_registry").select("id,display_name,lifecycle_state,editorial_status").in("id", resources.map(([id]) => id))
if (registryError || registry?.length !== 4) throw new Error("Canonical registry preflight failed")
for (const [id, name] of resources) { const item = registry.find((row) => row.id === id); if (!item || item.display_name !== name || item.lifecycle_state !== "active" || item.editorial_status === "hidden") throw new Error(`Registry identity failed for ${name}`) }
const { data: existing, error: existingError } = await db.from("resource_locations").select("id,resource_id").in("resource_id", resources.map(([id]) => id))
if (existingError) throw existingError
if (existing?.length) throw new Error("One or more target resources already has a location; no request was sent")

const url = new URL("https://nominatim.openstreetmap.org/search")
url.searchParams.set("q", normalizedQuery); url.searchParams.set("format", "jsonv2"); url.searchParams.set("addressdetails", "1"); url.searchParams.set("limit", "5"); url.searchParams.set("countrycodes", "ca"); url.searchParams.set("email", process.env.GEOCODER_CONTACT_EMAIL)
const response = await fetch(url, { headers: { "User-Agent": `Miller-Service-Map/1.0 (${process.env.GEOCODER_CONTACT_EMAIL})`, Accept: "application/json" } })
if (!response.ok) throw new Error(`Geocoder returned ${response.status}`)
const raw = await response.json()
const valid = raw.filter((item) => {
  const lat = Number(item.lat), lon = Number(item.lon), returned = String(item.display_name || ""), detail = item.address || {}
  const city = String(detail.city || detail.town || detail.municipality || detail.village || "")
  return Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && lon !== 0 && lat >= 48 && lat <= 60 && lon >= -140 && lon <= -114 && String(detail.country_code || "").toLowerCase() === "ca" && /British Columbia/i.test(String(detail.state || "")) && (/Burnaby/i.test(city) || /Burnaby/i.test(returned)) && (String(detail.house_number || "") === "7155" || /\b7155\b/.test(returned)) && !["city","town","village","postcode","road"].includes(item.addresstype)
})
const coordinateGroups = new Map(valid.map((item) => [`${Number(item.lat).toFixed(5)},${Number(item.lon).toFixed(5)}`, item]))
const cacheKey = addressCacheKey(address)
if (coordinateGroups.size !== 1) {
  await db.from("geocode_cache").upsert({ provider: "nominatim", normalized_query: normalizedQuery, query_hash: cacheKey, validation_status: coordinateGroups.size ? "ambiguous" : "mismatch", error_summary: coordinateGroups.size ? "multiple_validated_locations" : "no_exact_validated_building_match" }, { onConflict: "provider,query_hash" })
  console.log(JSON.stringify({ network_requests: 1, status: coordinateGroups.size ? "ambiguous" : "rejected", validated_coordinate_groups: coordinateGroups.size }, null, 2)); process.exit(2)
}
const match = [...coordinateGroups.values()][0]
const result = { latitude: Number(match.lat), longitude: Number(match.lon), returned_address: String(match.display_name || ""), geocode_source: "nominatim", geocode_confidence: match.importance == null ? null : Math.max(0, Math.min(1, Number(match.importance))), provider_place_id: match.place_id, provider_type: match.type, provider_class: match.class, warnings: [] }
await db.from("geocode_cache").upsert({ provider: "nominatim", normalized_query: normalizedQuery, query_hash: cacheKey, validation_status: "accepted", response_summary: result, error_summary: null }, { onConflict: "provider,query_hash" })
const written = []
for (const [resourceId, name] of resources) {
  const { data, error } = await db.from("resource_locations").insert({ resource_id: resourceId, location_type: "fixed", location_label: "Suite 320 shared office", original_address_text: "Suite 320, 7155 Kingsway", ...address, latitude: result.latitude, longitude: result.longitude, geocode_source: "nominatim", geocode_confidence: result.geocode_confidence, geocode_status: "matched", review_status: "pending", public_map: false }).select().single()
  if (error) throw error
  const { error: auditError } = await db.from("resource_location_audit").insert({ location_id: data.id, action: "geocoded", new_values: { ...data, normalized_query: normalizedQuery, returned_address: result.returned_address, provider_place_id: result.provider_place_id, provider_type: result.provider_type, provider_class: result.provider_class, warnings: result.warnings }, reason: `User-confirmed shared Burnaby office; one-request bounded geocode for ${name}` })
  if (auditError) throw auditError
  written.push({ resource_id: resourceId, name, location_id: data.id })
}
console.log(JSON.stringify({ network_requests: 1, status: "pending_human_review", returned_address: result.returned_address, coordinates: [result.latitude, result.longitude], locations_written: written }, null, 2))
