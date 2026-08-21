import { normalizeBcAddressResult, requestBcAddressGeocode } from "./bcAddressGeocoder.js"

export function validateOriginText(value) {
  const raw = String(value || "")
  if (/[\r\n<>]/.test(raw)) throw new Error("Enter a BC address or intersection.")
  const text = raw.replace(/\s+/g, " ").trim()
  if (text.length < 5 || text.length > 180) throw new Error("Enter a BC address or intersection.")
  return text
}

export async function geocodeNavigationOrigin(value, options = {}) {
  const query = validateOriginText(value)
  const response = await requestBcAddressGeocode({ address: query, province: "BC" }, options)
  if (!response.ok || response.features.length !== 1) return { ok: false, status: response.status === "not_configured" ? "not_configured" : "not_found" }
  const result = normalizeBcAddressResult(response.features[0], { address: query, result_count: response.features.length })
  if (!result.valid_coordinate || !Number.isFinite(result.score) || result.score < 80 || result.materially_faulted) return { ok: false, status: "not_found" }
  return { ok: true, origin: { latitude: result.latitude, longitude: result.longitude, label: result.returned_address || query, provenance: { provider: result.provider, attribution: result.attribution } } }
}
