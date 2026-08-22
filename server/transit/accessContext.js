import { distanceKm } from "../../src/map/geography.js"

export function buildAccessContext({ resource, location, transit, userCoordinate = null, originProvenance = null }) {
  if (!resource?.id || !location?.id || location.review_status !== "approved" || location.public_map === false || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) throw new Error("Access context requires an approved public resource location.")
  const approvedLocation = { id: String(location.id), approved: location.review_status === "approved", latitude: Number(location.latitude), longitude: Number(location.longitude) }
  const userDistance = userCoordinate ? distanceKm(userCoordinate, approvedLocation) : null
  return { kind: "miller_access_context", resourceId: String(resource.id), location: approvedLocation, origin: userCoordinate ? { latitude: Number(userCoordinate.latitude), longitude: Number(userCoordinate.longitude), provenance: originProvenance || { provider: "user_supplied" } } : null, userDistance: Number.isFinite(userDistance) ? { method: "straight_line", kilometres: userDistance } : null, transit: transit ? { provider: transit.provider, nearbyStops: transit.data.stops, originNearbyStops: transit.data.originStops || [], directOptions: transit.data.directOptions || [], originCoverage: transit.data.originCoverage || "not_requested", relevantAlerts: transit.realtime.alerts, status: transit.realtime.status } : null, provenance: transit?.provenance || null }
}
