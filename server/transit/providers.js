import { cachedTransitValue, fetchTransitBytes } from "./fetch.js"
import { nearbyStops, parseGtfsZip, sharedRoutes } from "./gtfs.js"
import { decodeGtfsRealtime, normalizeGtfsRealtimeAlerts, normalizeGtfsRealtimeTrips, normalizeGtfsRealtimeVehicles, relevantActiveAlerts } from "./realtime.js"

const BC_TRANSIT_OPERATOR = "13"
const BC_TRANSIT_STATIC = `https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=${BC_TRANSIT_OPERATOR}`
const TRANSLINK_STATIC = "https://gtfs-static.translink.ca/gtfs/google_transit.zip"
const STATIC_TTL_MS = 6 * 60 * 60 * 1000
export const REALTIME_TTL_MS = 45 * 1000
const runtime = { alerts: null, tripUpdates: null, vehiclePositions: null }
let realtimeFailureUntil = 0

export const transitProviderDefinitions = {
  bc_transit: { id: "bc_transit", name: "BC Transit", coverage: "Central Fraser Valley pilot", staticUrl: BC_TRANSIT_STATIC, realtime: "available", sourceUrl: "https://www.bctransit.com/open-data/" },
  translink: { id: "translink", name: "TransLink", coverage: "Metro Vancouver", staticUrl: TRANSLINK_STATIC, realtime: "requires_api_key", sourceUrl: "https://www.translink.ca/about-us/doing-business-with-translink/app-developer-resources/gtfs" },
}

export function providerForPoint({ latitude, longitude }) {
  return latitude >= 48.95 && latitude <= 49.5 && longitude >= -123.35 && longitude <= -122.4 ? "translink" : "bc_transit"
}

export async function getNearbyTransit(point, { providerId = providerForPoint(point), origin = null, loadBytes = fetchTransitBytes } = {}) {
  const provider = transitProviderDefinitions[providerId]
  if (!provider) throw new Error("No transit provider is configured for this location.")
  const index = await cachedTransitValue(`static:${provider.id}`, async () => parseGtfsZip(await loadBytes(provider.staticUrl)), STATIC_TTL_MS)
  const stops = nearbyStops(index, point)
  const originProviderId = origin ? providerForPoint(origin) : null
  const originStops = origin && originProviderId === provider.id ? nearbyStops(index, origin) : []
  const realtime = provider.id === "translink" ? await getTranslinkRealtime({ loadBytes }) : { status: "published_not_loaded", alerts: [], feeds: {} }
  return {
    provider: { id: provider.id, name: provider.name, coverage: provider.coverage, sourceUrl: provider.sourceUrl },
    data: { kind: "nearby_stops", distanceMethod: "straight_line", radiusKm: 1.5, stops, originStops, directRoutes: sharedRoutes(originStops, stops), originCoverage: origin ? (originProviderId === provider.id ? "same_provider" : "different_or_unsupported_provider") : "not_requested" },
    realtime: { ...realtime, alerts: relevantActiveAlerts(realtime.alerts, stops) },
    provenance: { retrievedAt: new Date().toISOString(), cacheMaxAgeSeconds: STATIC_TTL_MS / 1000, realtimeCacheMaxAgeSeconds: REALTIME_TTL_MS / 1000, sourceFormat: "GTFS Schedule + GTFS-Realtime" },
  }
}

export function translinkRealtimeUrls(env = process.env) {
  if (!env.TRANSLINK_GTFS_REALTIME_API_KEY) return null
  const key = encodeURIComponent(env.TRANSLINK_GTFS_REALTIME_API_KEY)
  return { tripUpdates: `https://gtfsapi.translink.ca/v3/gtfsrealtime?apikey=${key}`, vehiclePositions: `https://gtfsapi.translink.ca/v3/gtfsposition?apikey=${key}`, alerts: `https://gtfsapi.translink.ca/v3/gtfsalerts?apikey=${key}` }
}

export function getTransitRuntimeStatus(env = process.env) {
  if (!env.TRANSLINK_GTFS_REALTIME_API_KEY) return { alerts: "not_configured", tripUpdates: "not_configured", vehiclePositions: "not_configured" }
  return Object.fromEntries(Object.entries(runtime).map(([name, status]) => [name, status || "configured"]))
}
export function resetTransitRuntimeForTests() { runtime.alerts = null; runtime.tripUpdates = null; runtime.vehiclePositions = null; realtimeFailureUntil = 0 }

export async function getTranslinkRealtime({ loadBytes = fetchTransitBytes, env = process.env } = {}) {
  const urls = translinkRealtimeUrls(env)
  if (!urls) return { status: "not_configured", alerts: [], tripUpdates: [], vehiclePositions: [], feeds: getTransitRuntimeStatus(env) }
  if (Date.now() < realtimeFailureUntil) return { status: "temporarily_unavailable", alerts: [], tripUpdates: [], vehiclePositions: [], feeds: getTransitRuntimeStatus(env) }
  const definitions = [
    ["alerts", normalizeGtfsRealtimeAlerts], ["tripUpdates", normalizeGtfsRealtimeTrips], ["vehiclePositions", normalizeGtfsRealtimeVehicles],
  ]
  const results = await Promise.all(definitions.map(async ([name, normalize]) => {
    try {
      const value = await cachedTransitValue(`translink:realtime:${name}`, async () => { const retrievedAt = new Date().toISOString(); return normalize(decodeGtfsRealtime(await loadBytes(urls[name], { maxBytes: 12 * 1024 * 1024, timeoutMs: 8000 })), "translink", retrievedAt) }, REALTIME_TTL_MS)
      runtime[name] = "available"; return [name, value]
    } catch { runtime[name] = "temporarily_unavailable"; return [name, []] }
  }))
  const feeds = getTransitRuntimeStatus(env); const available = Object.values(feeds).some((status) => status === "available")
  if (!available) realtimeFailureUntil = Date.now() + REALTIME_TTL_MS
  const values = Object.fromEntries(results)
  return { status: available ? "available" : "temporarily_unavailable", alerts: values.alerts, tripUpdates: values.tripUpdates, vehiclePositions: values.vehiclePositions, feeds }
}

export function bcTransitRealtimeUrls() {
  const base = "https://bct.tmix.se/gtfs-realtime"
  return { alerts: `${base}/alerts.pb?operatorIds=${BC_TRANSIT_OPERATOR}`, tripUpdates: `${base}/tripupdates.pb?operatorIds=${BC_TRANSIT_OPERATOR}`, vehiclePositions: `${base}/vehiclepositions.pb?operatorIds=${BC_TRANSIT_OPERATOR}` }
}
