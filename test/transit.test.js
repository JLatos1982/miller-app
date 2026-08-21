import test from "node:test"
import assert from "node:assert/strict"
import { strToU8, zipSync } from "fflate"
import { buildGtfsIndex, nearbyStops, parseCsv, parseGtfsZip } from "../server/transit/gtfs.js"
import { assertTrustedTransitUrl, clearTransitCache } from "../server/transit/fetch.js"
import { bcTransitRealtimeUrls, getNearbyTransit, getTranslinkRealtime, providerForPoint, resetTransitRuntimeForTests, translinkRealtimeUrls } from "../server/transit/providers.js"
import { decodeGtfsRealtime, encodeGtfsRealtime, normalizeGtfsRealtimeAlerts, relevantActiveAlerts } from "../server/transit/realtime.js"
import { buildAccessContext } from "../server/transit/accessContext.js"

const tables = {
  "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\nS1,Main & First,49.1000,-122.3000\nS2,Far Stop,50,-123\n",
  "routes.txt": "route_id,route_short_name,route_long_name\nR1,1,Valley Connector\n",
  "trips.txt": "route_id,service_id,trip_id\nR1,WK,T1\n",
  "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,08:00:00,08:00:00,S1,1\n",
}
const fixtureZip = zipSync(Object.fromEntries(Object.entries(tables).map(([name, value]) => [name, strToU8(value)])))

test("CSV and static GTFS normalize quoted values, stops, routes, and proximity", () => {
  assert.equal(parseCsv('name,note\n"Stop, A","Uses ""quotes"""\n')[0].name, "Stop, A")
  const index = parseGtfsZip(fixtureZip)
  assert.equal(index.routeCount, 1)
  const stops = nearbyStops(index, { latitude: 49.1001, longitude: -122.3001 })
  assert.equal(stops.length, 1); assert.equal(stops[0].routes[0].shortName, "1"); assert.ok(stops[0].distanceKm < 0.1)
})

test("GTFS index rejects missing required files", () => assert.throws(() => parseGtfsZip(zipSync({ "stops.txt": strToU8("stop_id\n1") })), /missing routes.txt/))
test("transit URLs are fixed to allowlisted HTTPS provider hosts", () => { assert.equal(assertTrustedTransitUrl("https://bct.tmix.se/feed").hostname, "bct.tmix.se"); assert.throws(() => assertTrustedTransitUrl("http://bct.tmix.se/feed"), /not allowlisted/); assert.throws(() => assertTrustedTransitUrl("https://example.com/feed"), /not allowlisted/) })
test("provider selection separates Metro Vancouver and the BC Transit pilot", () => { assert.equal(providerForPoint({ latitude: 49.25, longitude: -123.1 }), "translink"); assert.equal(providerForPoint({ latitude: 49.05, longitude: -122.3 }), "bc_transit") })
test("BC Transit adapter works from a mocked official static feed without live calls", async () => { clearTransitCache(); const result = await getNearbyTransit({ latitude: 49.1001, longitude: -122.3001 }, { providerId: "bc_transit", loadBytes: async (url) => { assert.match(url, /^https:\/\/bct\.tmix\.se\//); return fixtureZip } }); assert.equal(result.provider.name, "BC Transit"); assert.equal(result.data.distanceMethod, "straight_line"); assert.equal(result.data.stops.length, 1) })
test("TransLink realtime remains server-only and unconfigured without its key", () => { const previous = process.env.TRANSLINK_GTFS_REALTIME_API_KEY; delete process.env.TRANSLINK_GTFS_REALTIME_API_KEY; assert.equal(translinkRealtimeUrls(), null); if (previous === undefined) delete process.env.TRANSLINK_GTFS_REALTIME_API_KEY; else process.env.TRANSLINK_GTFS_REALTIME_API_KEY = previous })
test("raw table index helper is deterministic", () => assert.equal(buildGtfsIndex(Object.fromEntries(Object.entries(tables).map(([name, value]) => [name, parseCsv(value)]))).stops.length, 2))
test("realtime adapters expose official endpoints and normalized alerts", () => { assert.match(bcTransitRealtimeUrls().alerts, /^https:\/\/bct\.tmix\.se\/gtfs-realtime\/alerts\.pb/); const alerts = normalizeGtfsRealtimeAlerts({ header: {}, entity: [{ id: "a1", alert: { headerText: { translation: [{ language: "en", text: "Route detour" }] }, informedEntity: [{ routeId: "1" }] } }] }, "bc_transit"); assert.deepEqual(alerts[0].routeIds, ["1"]); assert.equal(alerts[0].header, "Route detour") })

const realtimeFixture = encodeGtfsRealtime({ header: { gtfsRealtimeVersion: "2.0", timestamp: 1_800_000_000 }, entity: [{ id: "alert-1", alert: { informedEntity: [{ routeId: "004", stopId: "S1" }], effect: 4, severityLevel: 3, headerText: { translation: [{ text: "Route 4 detour", language: "en" }] }, descriptionText: { translation: [{ text: "Use the temporary stop.", language: "en" }] }, activePeriod: [{ start: 1_700_000_000, end: 1_900_000_000 }] } }] })
test("protobuf parsing and alert normalization retain identifiers, selectors, effect, and freshness", () => { const alerts = normalizeGtfsRealtimeAlerts(decodeGtfsRealtime(realtimeFixture), "translink", "2027-01-15T08:00:00.000Z"); assert.equal(alerts[0].id, "alert-1"); assert.deepEqual(alerts[0].routeIds, ["004"]); assert.deepEqual(alerts[0].stopIds, ["S1"]); assert.equal(alerts[0].effect, "DETOUR"); assert.equal(alerts[0].severity, "WARNING"); assert.equal(alerts[0].freshness.retrievedAt, "2027-01-15T08:00:00.000Z") })
test("malformed realtime payload fails safely", () => assert.throws(() => decodeGtfsRealtime(new Uint8Array([255, 255, 1])), /could not be parsed/))
test("only active alerts affecting nearby routes or stops are retained", () => { const alerts = normalizeGtfsRealtimeAlerts(decodeGtfsRealtime(realtimeFixture), "translink"); assert.equal(relevantActiveAlerts(alerts, [{ id: "S1", routes: [{ id: "004" }] }], 1_800_000_000).length, 1); assert.equal(relevantActiveAlerts(alerts, [{ id: "OTHER", routes: [{ id: "999" }] }], 1_800_000_000).length, 0); assert.equal(relevantActiveAlerts(alerts, [{ id: "S1", routes: [] }], 2_000_000_000).length, 0) })
test("TransLink realtime shares cached feed results and distinguishes provider failure", async () => { clearTransitCache(); resetTransitRuntimeForTests(); let calls = 0; const env = { TRANSLINK_GTFS_REALTIME_API_KEY: "fixture-only" }; const loadBytes = async () => { calls += 1; return realtimeFixture }; const first = await getTranslinkRealtime({ loadBytes, env }); const second = await getTranslinkRealtime({ loadBytes, env }); assert.equal(first.status, "available"); assert.equal(second.status, "available"); assert.equal(calls, 3); clearTransitCache(); resetTransitRuntimeForTests(); const failed = await getTranslinkRealtime({ loadBytes: async () => { throw new Error("provider down") }, env }); assert.equal(failed.status, "temporarily_unavailable"); assert.deepEqual(failed.alerts, []) })
test("access context combines deterministic location, transit, distance, freshness, and provenance", () => { const transit = { provider: { id: "translink", name: "TransLink" }, data: { stops: [{ id: "S1", routes: [{ id: "004" }] }] }, realtime: { status: "available", alerts: [{ id: "alert-1" }] }, provenance: { retrievedAt: "2027-01-15T08:00:00.000Z" } }; const context = buildAccessContext({ resource: { id: 42 }, location: { id: "location-1", review_status: "approved", latitude: 49.2, longitude: -123.1 }, transit, userCoordinate: { latitude: 49.1, longitude: -123 } }); assert.equal(context.kind, "miller_access_context"); assert.equal(context.location.approved, true); assert.ok(context.userDistance.kilometres > 10); assert.equal(context.transit.relevantAlerts[0].id, "alert-1"); assert.equal(context.provenance.retrievedAt, "2027-01-15T08:00:00.000Z") })
test("access context rejects unapproved location facts", () => assert.throws(() => buildAccessContext({ resource: { id: 42 }, location: { id: "location-1", review_status: "pending", latitude: 49.2, longitude: -123.1 } }), /approved public resource location/))
