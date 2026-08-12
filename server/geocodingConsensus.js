import { GEOCODING_CONSENSUS_VERSION } from "./geocodingProviders.js"

const approximate = /centroid|parcel|street|postcode|postal|locality|neighbou?rhood|region|campus|approximate/i
export function haversineMetres(a, b) { const rad = (x) => x * Math.PI / 180, earth = 6371000, dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude), q = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2; return 2 * earth * Math.asin(Math.sqrt(q)) }

export function evaluateGeocodingConsensus({ results = [], authoritativeAddress = false, safety = {}, thresholdMetres = 35 } = {}) {
  const failed = [], warnings = []
  if (!authoritativeAddress) failed.push("authoritative_first_party_address_required")
  if (!safety.specific_program_public || !safety.specific_location_public || safety.hard_exclusion) failed.push("specific_program_location_safety_failed")
  const eligible = results.filter((r) => r.license?.permits_persistent_storage && r.license?.permits_leaflet_display)
  if (eligible.length < 2) failed.push("two_storage_compatible_sources_required")
  if (new Set(eligible.map((r) => r.provider_family)).size < 2) failed.push("independent_source_families_required")
  for (let i = 0; i < eligible.length; i++) for (let j = i + 1; j < eligible.length; j++) if (eligible[i].source_datasets?.some((dataset) => eligible[j].source_datasets?.includes(dataset))) failed.push("independent_underlying_datasets_required")
  for (const result of eligible) {
    if (![result.latitude, result.longitude].every(Number.isFinite) || !result.latitude || !result.longitude || result.latitude < 48 || result.latitude > 60 || result.longitude < -140 || result.longitude > -114) failed.push(`${result.provider}:invalid_bc_coordinate`)
    if (!result.street_number_match) failed.push(`${result.provider}:street_number_mismatch`)
    if (!result.municipality_match || !result.province_match || !result.country_match) failed.push(`${result.provider}:jurisdiction_mismatch`)
    if (approximate.test(`${result.result_type} ${result.precision}`)) failed.push(`${result.provider}:approximate_or_centroid`)
  }
  let maximumDistance = null
  if (eligible.length >= 2) { maximumDistance = 0; for (let i = 0; i < eligible.length; i++) for (let j = i + 1; j < eligible.length; j++) maximumDistance = Math.max(maximumDistance, haversineMetres(eligible[i], eligible[j])); if (maximumDistance > thresholdMetres) failed.push("coordinate_consensus_distance_exceeded") }
  if (safety.parent_organization_warning) warnings.push("parent_organization_context_reviewed")
  return { tier: failed.length ? "B" : "A", policy_version: GEOCODING_CONSENSUS_VERSION, threshold_metres: thresholdMetres, maximum_distance_metres: maximumDistance == null ? null : Number(maximumDistance.toFixed(1)), failed_hard_gates: [...new Set(failed)], warnings }
}
