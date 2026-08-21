import { validCoordinate } from "../map/geography.js"

export function eligiblePublicLocation(resource, publicMapResources) {
  if (resource?.id == null || resource.virtual_service === true || resource.mobile_service === true) return null
  return (publicMapResources || []).find((item) => String(item.id) === String(resource.id) && item.virtual_service !== true && item.mobile_service !== true && item.location_id && item.location_type === "fixed" && item.public_map === true && item.review_status === "approved" && item.verification_status === "verified" && validCoordinate(item.latitude, "lat") && validCoordinate(item.longitude, "lng")) || null
}

export function validateTypedOrigin(value) {
  const raw = String(value || "")
  if (/[\r\n<>]/.test(raw)) return ""
  const text = raw.replace(/\s+/g, " ").trim()
  return text.length >= 5 && text.length <= 180 ? text : ""
}

export function googleTransitDirectionsUrl(destination, origin = null) {
  if (!validCoordinate(destination?.latitude, "lat") || !validCoordinate(destination?.longitude, "lng")) return ""
  if (origin && (!validCoordinate(origin.latitude, "lat") || !validCoordinate(origin.longitude, "lng"))) return ""
  const url = new URL("https://www.google.com/maps/dir/")
  url.searchParams.set("api", "1")
  url.searchParams.set("destination", `${Number(destination.latitude)},${Number(destination.longitude)}`)
  url.searchParams.set("travelmode", "transit")
  if (origin) url.searchParams.set("origin", `${Number(origin.latitude)},${Number(origin.longitude)}`)
  return url.toString()
}
