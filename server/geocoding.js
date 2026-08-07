const CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000

export function normalizeAddressParts(input = {}) {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim()
  return {
    street_address: clean(input.street_address || input.address),
    city: clean(input.city),
    province: clean(input.province || "BC"),
    postal_code: clean(input.postal_code).toUpperCase(),
    country: clean(input.country || "Canada"),
  }
}

export function addressCacheKey(input) {
  return Object.values(normalizeAddressParts(input)).join("|").toLowerCase()
}

export function parseNominatimResult(result) {
  const latitude = Number(result?.lat)
  const longitude = Number(result?.lon)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null
  return { latitude, longitude, display_name: String(result.display_name || ""), geocode_source: "nominatim", geocode_confidence: result.importance == null ? null : Math.max(0, Math.min(1, Number(result.importance))), raw: result }
}

export function createGeocoder({ fetchImpl = fetch, now = () => Date.now(), minIntervalMs = 1100 } = {}) {
  const cache = new Map()
  let lastRequestAt = 0
  return {
    async geocode(input) {
      const address = normalizeAddressParts(input)
      const key = addressCacheKey(address)
      const cached = cache.get(key)
      if (cached && now() - cached.storedAt < CACHE_TTL_MS) return { ...cached.value, cached: true }
      const wait = Math.max(0, minIntervalMs - (now() - lastRequestAt))
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
      const query = Object.values(address).filter(Boolean).join(", ")
      const url = new URL("https://nominatim.openstreetmap.org/search")
      url.searchParams.set("q", query); url.searchParams.set("format", "jsonv2"); url.searchParams.set("limit", "1"); url.searchParams.set("countrycodes", "ca")
      lastRequestAt = now()
      const response = await fetchImpl(url, { headers: { "User-Agent": "Miller-Service-Map/1.0 (public-service-geocoding)", Accept: "application/json" } })
      if (!response.ok) throw new Error(`Geocoder returned ${response.status}`)
      const value = parseNominatimResult((await response.json())?.[0])
      cache.set(key, { storedAt: now(), value })
      return value
    },
  }
}

export function isPublicGeocodeCandidate(resource) {
  const address = normalizeAddressParts(resource)
  if (resource.virtual_service || resource.mobile_service || resource.public_map === false) return false
  if (!address.street_address || !address.city) return false
  return !/\b(confidential|undisclosed|private address)\b/i.test(address.street_address) && !/\bP\.?\s*O\.?\s*Box\b/i.test(address.street_address)
}
