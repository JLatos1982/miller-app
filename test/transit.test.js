import test from "node:test"
import assert from "node:assert/strict"
import { strToU8, zipSync } from "fflate"
import { buildGtfsIndex, nearbyStops, parseCsv, parseGtfsZip } from "../server/transit/gtfs.js"
import { assertTrustedTransitUrl, clearTransitCache } from "../server/transit/fetch.js"
import { bcTransitRealtimeUrls, getNearbyTransit, providerForPoint, translinkRealtimeUrls } from "../server/transit/providers.js"
import { normalizeGtfsRealtimeAlerts } from "../server/transit/realtime.js"

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
test("realtime adapters expose official endpoints and normalized alerts", () => { assert.match(bcTransitRealtimeUrls().alerts, /^https:\/\/bct\.tmix\.se\/gtfs-realtime\/alerts\.pb/); const alerts = normalizeGtfsRealtimeAlerts({ entity: [{ id: "a1", alert: { headerText: { translation: [{ language: "en", text: "Route detour" }] }, informedEntity: [{ routeId: "1" }] } }] }, "bc_transit"); assert.deepEqual(alerts[0].routeIds, ["1"]); assert.equal(alerts[0].text, "Route detour") })
