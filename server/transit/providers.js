import { cachedTransitValue, fetchTransitBytes } from "./fetch.js"
import { nearbyStops, parseGtfsZip } from "./gtfs.js"

const BC_TRANSIT_OPERATOR = "13"
const BC_TRANSIT_STATIC = `https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=${BC_TRANSIT_OPERATOR}`
const TRANSLINK_STATIC = "https://gtfs-static.translink.ca/gtfs/google_transit.zip"
const STATIC_TTL_MS = 6 * 60 * 60 * 1000

export const transitProviderDefinitions = {
  bc_transit: { id: "bc_transit", name: "BC Transit", coverage: "Central Fraser Valley pilot", staticUrl: BC_TRANSIT_STATIC, realtime: "available", sourceUrl: "https://www.bctransit.com/open-data/" },
  translink: { id: "translink", name: "TransLink", coverage: "Metro Vancouver", staticUrl: TRANSLINK_STATIC, realtime: "requires_api_key", sourceUrl: "https://www.translink.ca/about-us/doing-business-with-translink/app-developer-resources/gtfs" },
}

export function providerForPoint({ latitude, longitude }) {
  return latitude >= 48.95 && latitude <= 49.5 && longitude >= -123.35 && longitude <= -122.4 ? "translink" : "bc_transit"
}

export async function getNearbyTransit(point, { providerId = providerForPoint(point), loadBytes = fetchTransitBytes } = {}) {
  const provider = transitProviderDefinitions[providerId]
  if (!provider) throw new Error("No transit provider is configured for this location.")
  const index = await cachedTransitValue(`static:${provider.id}`, async () => parseGtfsZip(await loadBytes(provider.staticUrl)), STATIC_TTL_MS)
  return {
    provider: { id: provider.id, name: provider.name, coverage: provider.coverage, sourceUrl: provider.sourceUrl },
    data: { kind: "nearby_stops", distanceMethod: "straight_line", radiusKm: 1.5, stops: nearbyStops(index, point) },
    realtime: provider.id === "translink" && !process.env.TRANSLINK_GTFS_REALTIME_API_KEY ? { status: "not_configured", alerts: [] } : { status: "published_not_loaded", alerts: [] },
    provenance: { retrievedAt: new Date().toISOString(), cacheMaxAgeSeconds: STATIC_TTL_MS / 1000, sourceFormat: "GTFS Schedule" },
  }
}

export function translinkRealtimeUrls() {
  if (!process.env.TRANSLINK_GTFS_REALTIME_API_KEY) return null
  const key = encodeURIComponent(process.env.TRANSLINK_GTFS_REALTIME_API_KEY)
  return { tripUpdates: `https://gtfsapi.translink.ca/v3/gtfsrealtime?apikey=${key}`, vehiclePositions: `https://gtfsapi.translink.ca/v3/gtfsposition?apikey=${key}`, alerts: `https://gtfsapi.translink.ca/v3/gtfsalerts?apikey=${key}` }
}

export function bcTransitRealtimeUrls() {
  const base = "https://bct.tmix.se/gtfs-realtime"
  return { alerts: `${base}/alerts.pb?operatorIds=${BC_TRANSIT_OPERATOR}`, tripUpdates: `${base}/tripupdates.pb?operatorIds=${BC_TRANSIT_OPERATOR}`, vehiclePositions: `${base}/vehiclepositions.pb?operatorIds=${BC_TRANSIT_OPERATOR}` }
}
