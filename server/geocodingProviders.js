export const GEOCODING_CONSENSUS_VERSION = "miller-geocoding-consensus-v1.0.0"

export const providerPolicies = Object.freeze({
  bc_address_geocoder: { family: "bc_authoritative", datasets: ["bc_local_government", "bc_assessment"], permitsPersistentStorage: true, permitsLeafletDisplay: true, attribution: "Contains information licensed under the Open Government Licence – British Columbia.", enabledEnv: "BC_GEOCODER_ENABLED", keyEnv: "BC_GEOCODER_API_KEY", endpointEnv: "BC_GEOCODER_BASE_URL" },
  geoapify: { family: "open_data_aggregator", datasets: ["openstreetmap", "openaddresses", "geonames"], permitsPersistentStorage: true, permitsLeafletDisplay: true, attribution: "Powered by Geoapify; underlying data-source attribution retained.", enabledEnv: "GEOAPIFY_ENABLED", keyEnv: "GEOAPIFY_API_KEY", endpointEnv: "GEOAPIFY_BASE_URL" },
  nominatim: { family: "openstreetmap", datasets: ["openstreetmap"], permitsPersistentStorage: true, permitsLeafletDisplay: true, attribution: "© OpenStreetMap contributors", enabledEnv: "NOMINATIM_SECONDARY_ENABLED", keyEnv: null, endpointEnv: "NOMINATIM_BASE_URL" },
  google: { family: "google", datasets: ["google_proprietary"], permitsPersistentStorage: false, permitsLeafletDisplay: false, attribution: "Google Maps", enabledEnv: "GOOGLE_GEOCODING_ENABLED", keyEnv: "GOOGLE_MAPS_API_KEY", endpointEnv: null },
  mapbox_temporary: { family: "mapbox", permitsPersistentStorage: false, permitsLeafletDisplay: true, attribution: "© Mapbox", enabledEnv: "MAPBOX_GEOCODING_ENABLED", keyEnv: "MAPBOX_ACCESS_TOKEN", endpointEnv: null },
  mapbox_permanent: { family: "mapbox", permitsPersistentStorage: true, permitsLeafletDisplay: true, attribution: "© Mapbox", enabledEnv: "MAPBOX_PERMANENT_GEOCODING_ENABLED", keyEnv: "MAPBOX_ACCESS_TOKEN", endpointEnv: null },
  here: { family: "here", permitsPersistentStorage: false, permitsLeafletDisplay: false, attribution: "© HERE", enabledEnv: "HERE_GEOCODING_ENABLED", keyEnv: "HERE_API_KEY", endpointEnv: null },
  geocoder_ca: { family: "canadian_commercial", permitsPersistentStorage: false, permitsLeafletDisplay: true, attribution: "Geocoder.ca", enabledEnv: "GEOCODER_CA_ENABLED", keyEnv: "GEOCODER_CA_AUTH_TOKEN", endpointEnv: null },
})

export function providerConfiguration(env = process.env) {
  return Object.entries(providerPolicies).map(([provider, policy]) => ({ provider, enabled: env[policy.enabledEnv] === "true", keyConfigured: policy.keyEnv ? Boolean(env[policy.keyEnv]) : true, ...policy }))
}

export function normalizeProviderResult(input = {}) {
  const policy = providerPolicies[input.provider]
  if (!policy) throw new Error("Unknown geocoding provider")
  return Object.freeze({ provider: input.provider, provider_family: policy.family, source_datasets: policy.datasets || [policy.family], query: String(input.query || ""), normalized_address: input.normalized_address || {}, returned_address: String(input.returned_address || ""), latitude: Number(input.latitude), longitude: Number(input.longitude), result_type: String(input.result_type || "unknown"), precision: String(input.precision || "unknown"), confidence: input.confidence == null ? null : Number(input.confidence), street_number_match: input.street_number_match === true, municipality_match: input.municipality_match === true, province_match: input.province_match === true, country_match: input.country_match === true, provider_result_id: String(input.provider_result_id || ""), license: { permits_persistent_storage: policy.permitsPersistentStorage, permits_leaflet_display: policy.permitsLeafletDisplay, attribution: policy.attribution }, evidence_timestamp: String(input.evidence_timestamp || new Date().toISOString()) })
}

export function providerCacheKey(provider, normalizedQuery, contractVersion = GEOCODING_CONSENSUS_VERSION) {
  if (!providerPolicies[provider]) throw new Error("Unknown geocoding provider")
  return `${provider}:${contractVersion}:${String(normalizedQuery).trim().toLowerCase()}`
}
