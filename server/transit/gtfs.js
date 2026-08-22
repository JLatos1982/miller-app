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
  const wanted = new Set(["stops.txt", "routes.txt", "trips.txt", "stop_times.txt", "calendar.txt", "calendar_dates.txt", "feed_info.txt"])
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
  const trips = new Map((tables["trips.txt"] || []).map((trip) => [trip.trip_id, {
    id: trip.trip_id, routeId: trip.route_id, serviceId: trip.service_id || "", directionId: trip.direction_id === "" ? null : trip.direction_id,
    headsign: trip.trip_headsign || "",
  }]))
  const routeIdsByStop = new Map()
  for (const item of tables["stop_times.txt"] || []) {
    const trip = trips.get(item.trip_id); const routeId = trip?.routeId; if (!routeId || !item.stop_id) continue
    const values = routeIdsByStop.get(item.stop_id) || new Set(); values.add(routeId); routeIdsByStop.set(item.stop_id, values)
  }
  const stops = (tables["stops.txt"] || []).map((stop) => ({
    id: stop.stop_id, name: stop.stop_name || "Transit stop", code: stop.stop_code || null,
    latitude: Number(stop.stop_lat), longitude: Number(stop.stop_lon),
    routes: [...(routeIdsByStop.get(stop.stop_id) || [])].map((id) => routes.get(id)).filter(Boolean),
  })).filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude))
  const stopTimesByTrip = new Map(), tripIdsByStop = new Map()
  for (const item of tables["stop_times.txt"] || []) {
    const trip = trips.get(item.trip_id); if (!trip || !item.stop_id || !Number.isFinite(Number(item.stop_sequence))) continue
    const stopTime = { stopId: item.stop_id, sequence: Number(item.stop_sequence), arrivalTime: item.arrival_time || "", departureTime: item.departure_time || "" }
    stopTimesByTrip.set(trip.id, [...(stopTimesByTrip.get(trip.id) || []), stopTime])
    tripIdsByStop.set(item.stop_id, [...(tripIdsByStop.get(item.stop_id) || []), trip.id])
  }
  for (const stopTimes of stopTimesByTrip.values()) stopTimes.sort((a, b) => a.sequence - b.sequence)
  return { stops, routeCount: routes.size, trips, stopTimesByTrip, tripIdsByStop, calendar: new Map((tables["calendar.txt"] || []).map((row) => [row.service_id, row])), calendarDates: tables["calendar_dates.txt"] || [], feedInfo: tables["feed_info.txt"]?.[0] || null }
}

export function nearbyStops(index, point, { radiusKm = 1.5, limit = 5 } = {}) {
  return index.stops.map((stop) => ({ ...stop, distanceKm: distanceKm(point, stop) }))
    .filter((stop) => stop.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name)).slice(0, limit)
}

// This is deliberately not a journey planner.  It only identifies a route that
// the published schedule says serves a stop near each supplied point.
export function sharedRoutes(originStops = [], destinationStops = [], { limit = 4 } = {}) {
  const destinationRouteIds = new Set(destinationStops.flatMap((stop) => stop.routes || []).map((route) => route.id))
  const seen = new Map()
  for (const stop of originStops) {
    for (const route of stop.routes || []) {
      if (!destinationRouteIds.has(route.id) || seen.has(route.id)) continue
      const destinationStop = destinationStops.find((candidate) => (candidate.routes || []).some((item) => item.id === route.id))
      if (destinationStop) seen.set(route.id, { ...route, originStop: { id: stop.id, name: stop.name }, destinationStop: { id: destinationStop.id, name: destinationStop.name } })
    }
  }
  return [...seen.values()].sort((a, b) => (a.shortName || a.longName || a.id).localeCompare(b.shortName || b.longName || b.id)).slice(0, limit)
}

export function gtfsTimeToSeconds(value) {
  const match = /^(\d{1,2}|[12]\d|3[0-9]|4[0-7]):([0-5]\d):([0-5]\d)$/.exec(String(value || ""))
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null
}

export function serviceRunsOnDate(index, serviceId, serviceDate) {
  const date = String(serviceDate || "").replace(/-/g, "")
  if (!/^\d{8}$/.test(date)) return "unknown"
  const exception = (index.calendarDates || []).find((row) => row.service_id === serviceId && row.date === date)
  if (exception) return String(exception.exception_type) === "1"
  const calendar = index.calendar?.get(serviceId)
  if (!calendar) return (index.calendar?.size || index.calendarDates?.length) ? false : "unknown"
  if (date < calendar.start_date || date > calendar.end_date) return false
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  const weekday = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T12:00:00Z`).getUTCDay()
  return String(calendar[dayNames[weekday]]) === "1"
}

export function localServiceDates(now = new Date(), timeZone = "America/Vancouver") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now)
  const item = (type) => parts.find((part) => part.type === type)?.value
  const today = `${item("year")}${item("month")}${item("day")}`
  const previous = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(4, 6)) - 1, Number(today.slice(6, 8)) - 1))
  return { today, previous: `${previous.getUTCFullYear()}${String(previous.getUTCMonth() + 1).padStart(2, "0")}${String(previous.getUTCDate()).padStart(2, "0")}` }
}

export function localTimeSeconds(now = new Date(), timeZone = "America/Vancouver") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now)
  const item = (type) => Number(parts.find((part) => part.type === type)?.value || 0)
  return item("hour") * 3600 + item("minute") * 60 + item("second")
}

export function directTransitOptions(index, originStops = [], destinationStops = [], { now = new Date(), timeZone = "America/Vancouver", limit = 4, originPoint = null, destinationPoint = null } = {}) {
  const originById = new Map(originStops.map((stop) => [stop.id, stop])), destinationById = new Map(destinationStops.map((stop) => [stop.id, stop]))
  const candidateTripIds = new Set()
  for (const originStop of originStops) for (const tripId of index.tripIdsByStop?.get(originStop.id) || []) candidateTripIds.add(tripId)
  const dates = localServiceDates(now, timeZone), nowSeconds = localTimeSeconds(now, timeZone), options = []
  for (const tripId of candidateTripIds) {
    const trip = index.trips?.get(tripId), stopTimes = index.stopTimesByTrip?.get(tripId) || []
    if (!trip) continue
    const originTime = stopTimes.find((item) => originById.has(item.stopId))
    const destinationTime = stopTimes.find((item) => destinationById.has(item.stopId) && item.sequence > (originTime?.sequence ?? Infinity))
    if (!originTime || !destinationTime) continue
    const originStop = originById.get(originTime.stopId), destinationStop = destinationById.get(destinationTime.stopId)
    // Nearby-stop radii can overlap. In that case, do not call a reverse trip
    // "direct" merely because each stop happens to be in both radii.
    if (originPoint && destinationPoint && (distanceKm(originPoint, originStop) > distanceKm(destinationPoint, originStop) || distanceKm(destinationPoint, destinationStop) > distanceKm(originPoint, destinationStop))) continue
    const departureSeconds = gtfsTimeToSeconds(originTime.departureTime || originTime.arrivalTime)
    const activeToday = serviceRunsOnDate(index, trip.serviceId, dates.today)
    const activePreviousDay = serviceRunsOnDate(index, trip.serviceId, dates.previous)
    const currentServiceDay = activeToday === true && (departureSeconds == null || departureSeconds >= nowSeconds) ? dates.today : null
    const overnightPreviousServiceDay = departureSeconds != null && departureSeconds >= 24 * 3600 && activePreviousDay === true && departureSeconds - 24 * 3600 >= nowSeconds ? dates.previous : null
    const serviceDay = currentServiceDay || overnightPreviousServiceDay
    if (activeToday === false && activePreviousDay === false) continue
    if (!serviceDay && (activeToday !== "unknown" || activePreviousDay !== "unknown")) continue
    const route = (originById.get(originTime.stopId)?.routes || []).find((item) => item.id === trip.routeId) || { id: trip.routeId, shortName: "", longName: "" }
    options.push({ id: `${trip.id}:${originTime.stopId}:${destinationTime.stopId}`, tripId: trip.id, route, directionId: trip.directionId, headsign: trip.headsign, originStop, destinationStop, originStopTime: originTime.departureTime || originTime.arrivalTime || null, destinationStopTime: destinationTime.arrivalTime || null, stopsBetween: Math.max(0, destinationTime.sequence - originTime.sequence - 1), serviceDay, scheduleStatus: serviceDay ? "scheduled_service_day" : "calendar_unavailable" })
  }
  const unique = new Map()
  for (const option of options.sort((a, b) => a.originStop.distanceKm - b.originStop.distanceKm || a.destinationStop.distanceKm - b.destinationStop.distanceKm || a.stopsBetween - b.stopsBetween || String(a.route.shortName || a.route.longName).localeCompare(String(b.route.shortName || b.route.longName)))) {
    const key = `${option.route.id}:${option.originStop.id}:${option.destinationStop.id}:${option.directionId || option.headsign}`
    if (!unique.has(key)) unique.set(key, option)
  }
  return [...unique.values()].slice(0, limit)
}
