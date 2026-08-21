import { strFromU8, unzipSync } from "fflate"
import { distanceKm } from "../../src/map/geography.js"

export const MAX_GTFS_DOWNLOAD_BYTES = 32 * 1024 * 1024
export const MAX_GTFS_FILE_BYTES = 128 * 1024 * 1024
export const MAX_GTFS_EXTRACTED_BYTES = 256 * 1024 * 1024

export function parseCsv(source) {
  const rows = []; let row = []; let field = ""; let quoted = false
  const text = String(source || "").replace(/^\uFEFF/, "")
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted && character === '"' && text[index + 1] === '"') { field += '"'; index += 1 }
    else if (character === '"') quoted = !quoted
    else if (character === "," && !quoted) { row.push(field); field = "" }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1
      row.push(field); field = ""; if (row.some((value) => value !== "")) rows.push(row); row = []
    } else field += character
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  if (!rows.length) return []
  const headers = rows.shift().map((value) => value.trim())
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])))
}

export function parseGtfsZip(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_GTFS_DOWNLOAD_BYTES) throw new Error("GTFS download exceeded the safe size limit.")
  const wanted = new Set(["stops.txt", "routes.txt", "trips.txt", "stop_times.txt", "feed_info.txt"])
  const files = unzipSync(bytes, { filter: (entry) => wanted.has(entry.name.split("/").pop()) && entry.originalSize <= MAX_GTFS_FILE_BYTES })
  const byName = Object.fromEntries(Object.entries(files).map(([name, value]) => [name.split("/").pop(), value]))
  for (const required of ["stops.txt", "routes.txt", "trips.txt", "stop_times.txt"]) if (!byName[required]) throw new Error(`GTFS feed is missing ${required}.`)
  const extracted = Object.values(byName).reduce((sum, value) => sum + value.byteLength, 0)
  if (extracted > MAX_GTFS_EXTRACTED_BYTES) throw new Error("GTFS extracted data exceeded the safe size limit.")
  return buildGtfsIndex(Object.fromEntries(Object.entries(byName).map(([name, value]) => [name, parseCsv(strFromU8(value))])))
}

export function buildGtfsIndex(tables) {
  const routes = new Map((tables["routes.txt"] || []).map((route) => [route.route_id, {
    id: route.route_id, shortName: route.route_short_name || "", longName: route.route_long_name || "",
  }]))
  const routeByTrip = new Map((tables["trips.txt"] || []).map((trip) => [trip.trip_id, trip.route_id]))
  const routeIdsByStop = new Map()
  for (const item of tables["stop_times.txt"] || []) {
    const routeId = routeByTrip.get(item.trip_id); if (!routeId || !item.stop_id) continue
    const values = routeIdsByStop.get(item.stop_id) || new Set(); values.add(routeId); routeIdsByStop.set(item.stop_id, values)
  }
  const stops = (tables["stops.txt"] || []).map((stop) => ({
    id: stop.stop_id, name: stop.stop_name || "Transit stop", code: stop.stop_code || null,
    latitude: Number(stop.stop_lat), longitude: Number(stop.stop_lon),
    routes: [...(routeIdsByStop.get(stop.stop_id) || [])].map((id) => routes.get(id)).filter(Boolean),
  })).filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude))
  return { stops, routeCount: routes.size, feedInfo: tables["feed_info.txt"]?.[0] || null }
}

export function nearbyStops(index, point, { radiusKm = 1.5, limit = 5 } = {}) {
  return index.stops.map((stop) => ({ ...stop, distanceKm: distanceKm(point, stop) }))
    .filter((stop) => stop.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name)).slice(0, limit)
}
