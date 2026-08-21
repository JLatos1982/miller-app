import protobuf from "protobufjs"

const schema = `syntax = "proto2"; package transit_realtime;
message FeedMessage { required FeedHeader header = 1; repeated FeedEntity entity = 2; }
message FeedHeader { required string gtfs_realtime_version = 1; optional uint64 timestamp = 3; }
message FeedEntity { required string id = 1; optional bool is_deleted = 2; optional TripUpdate trip_update = 3; optional VehiclePosition vehicle = 4; optional Alert alert = 5; }
message TripDescriptor { optional string trip_id = 1; optional string route_id = 5; optional uint32 direction_id = 6; }
message StopTimeEvent { optional int32 delay = 1; optional int64 time = 2; optional int32 uncertainty = 3; }
message StopTimeUpdate { optional uint32 stop_sequence = 1; optional StopTimeEvent arrival = 2; optional StopTimeEvent departure = 3; optional string stop_id = 4; }
message TripUpdate { required TripDescriptor trip = 1; repeated StopTimeUpdate stop_time_update = 2; optional uint64 timestamp = 4; optional int32 delay = 5; }
message Position { required float latitude = 1; required float longitude = 2; optional float bearing = 3; optional double odometer = 4; optional float speed = 5; }
message VehiclePosition { optional TripDescriptor trip = 1; optional Position position = 2; optional uint32 current_stop_sequence = 3; optional uint64 timestamp = 5; optional string stop_id = 7; }
message TimeRange { optional uint64 start = 1; optional uint64 end = 2; }
message EntitySelector { optional string agency_id = 1; optional string route_id = 2; optional int32 route_type = 3; optional TripDescriptor trip = 4; optional string stop_id = 5; optional uint32 direction_id = 6; }
message TranslatedString { repeated Translation translation = 1; message Translation { required string text = 1; optional string language = 2; } }
enum Cause { UNKNOWN_CAUSE = 1; OTHER_CAUSE = 2; TECHNICAL_PROBLEM = 3; STRIKE = 4; DEMONSTRATION = 5; ACCIDENT = 6; HOLIDAY = 7; WEATHER = 8; MAINTENANCE = 9; CONSTRUCTION = 10; POLICE_ACTIVITY = 11; MEDICAL_EMERGENCY = 12; }
enum Effect { NO_SERVICE = 1; REDUCED_SERVICE = 2; SIGNIFICANT_DELAYS = 3; DETOUR = 4; ADDITIONAL_SERVICE = 5; MODIFIED_SERVICE = 6; OTHER_EFFECT = 7; UNKNOWN_EFFECT = 8; STOP_MOVED = 9; NO_EFFECT = 10; ACCESSIBILITY_ISSUE = 11; }
enum SeverityLevel { UNKNOWN_SEVERITY = 1; INFO = 2; WARNING = 3; SEVERE = 4; }
message Alert { repeated TimeRange active_period = 1; repeated EntitySelector informed_entity = 5; optional Cause cause = 6; optional Effect effect = 7; optional TranslatedString url = 8; optional TranslatedString header_text = 10; optional TranslatedString description_text = 11; optional SeverityLevel severity_level = 14; }
`
const FeedMessage = protobuf.parse(schema).root.lookupType("transit_realtime.FeedMessage")

export function decodeGtfsRealtime(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength) throw new Error("GTFS-Realtime payload is empty.")
  try { const value = FeedMessage.toObject(FeedMessage.decode(bytes), { longs: Number, enums: String, defaults: false }); if (!value.header?.gtfsRealtimeVersion) throw new Error("missing header"); return value }
  catch { throw new Error("GTFS-Realtime payload could not be parsed.") }
}
export function encodeGtfsRealtime(value) { const error = FeedMessage.verify(value); if (error) throw new Error(error); return FeedMessage.encode(FeedMessage.create(value)).finish() }
function translatedText(value) { return value?.translation?.find?.((item) => item.language === "en")?.text || value?.translation?.[0]?.text || "" }
function freshness(decoded, retrievedAt) { const feedTimestamp = decoded.header?.timestamp ? new Date(Number(decoded.header.timestamp) * 1000).toISOString() : null; return { retrievedAt, feedTimestamp, ageSeconds: feedTimestamp ? Math.max(0, Math.round((Date.parse(retrievedAt) - Date.parse(feedTimestamp)) / 1000)) : null } }

export function normalizeGtfsRealtimeAlerts(decoded, providerId, retrievedAt = new Date().toISOString()) {
  return (decoded?.entity || []).filter((entity) => entity.alert && !entity.isDeleted).map((entity) => ({ provider: providerId, feedType: "service_alerts", id: String(entity.id || ""), routeIds: [...new Set((entity.alert.informedEntity || []).map((item) => item.routeId || item.trip?.routeId).filter(Boolean))], stopIds: [...new Set((entity.alert.informedEntity || []).map((item) => item.stopId).filter(Boolean))], cause: entity.alert.cause || null, effect: entity.alert.effect || null, severity: entity.alert.severityLevel || null, header: translatedText(entity.alert.headerText) || "Transit service alert", description: translatedText(entity.alert.descriptionText) || null, url: translatedText(entity.alert.url) || null, activePeriods: (entity.alert.activePeriod || []).map((period) => ({ start: period.start ? Number(period.start) : null, end: period.end ? Number(period.end) : null })), freshness: freshness(decoded, retrievedAt) }))
}
export function normalizeGtfsRealtimeTrips(decoded, providerId, retrievedAt = new Date().toISOString()) { return (decoded?.entity || []).filter((entity) => entity.tripUpdate && !entity.isDeleted).map((entity) => ({ provider: providerId, feedType: "trip_updates", id: String(entity.id || ""), routeId: entity.tripUpdate.trip?.routeId || null, tripId: entity.tripUpdate.trip?.tripId || null, stopIds: (entity.tripUpdate.stopTimeUpdate || []).map((item) => item.stopId).filter(Boolean), delaySeconds: Number.isFinite(entity.tripUpdate.delay) ? entity.tripUpdate.delay : null, freshness: freshness(decoded, retrievedAt) })) }
export function normalizeGtfsRealtimeVehicles(decoded, providerId, retrievedAt = new Date().toISOString()) { return (decoded?.entity || []).filter((entity) => entity.vehicle && !entity.isDeleted).map((entity) => ({ provider: providerId, feedType: "vehicle_positions", id: String(entity.id || ""), routeId: entity.vehicle.trip?.routeId || null, tripId: entity.vehicle.trip?.tripId || null, stopId: entity.vehicle.stopId || null, latitude: entity.vehicle.position?.latitude ?? null, longitude: entity.vehicle.position?.longitude ?? null, timestamp: entity.vehicle.timestamp ? Number(entity.vehicle.timestamp) : null, freshness: freshness(decoded, retrievedAt) })) }

export function relevantActiveAlerts(alerts, stops, nowSeconds = Math.floor(Date.now() / 1000)) {
  const routeIds = new Set(stops.flatMap((stop) => stop.routes.map((route) => String(route.id)))); const stopIds = new Set(stops.map((stop) => String(stop.id)))
  return alerts.filter((alert) => (!alert.activePeriods.length || alert.activePeriods.some((period) => (!period.start || period.start <= nowSeconds) && (!period.end || period.end >= nowSeconds))) && (alert.routeIds.some((id) => routeIds.has(String(id))) || alert.stopIds.some((id) => stopIds.has(String(id)))))
}
