import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("public transit endpoint rechecks the approved public fixed-location gate", () => { const source = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8"); const route = source.slice(source.indexOf('app.get("/api/map/locations/:id/transit"'), source.indexOf('app.post("/api/admin/pending-locations/bounded-approve"')); assert.match(route, /eq\("location_type", "fixed"\)/); assert.match(route, /eq\("public_map", true\)/); assert.match(route, /eq\("geocode_status", "verified"\)/); assert.match(route, /eq\("review_status", "approved"\)/) })
test("homepage describes navigation gently without unsupported provider claims", () => { const source = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"); assert.match(source, /Gentle help finding your next step/); assert.match(source, /Search · nearby services · getting there/); assert.doesNotMatch(source, /connected to 211|connected to Pathways|plans your whole trip/i) })
