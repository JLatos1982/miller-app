import assert from "node:assert/strict"
import test from "node:test"

import { app, setPublicStaticCacheHeader } from "../server.js"

async function request(path, options = {}) {
  const server = app.listen(0, "127.0.0.1")
  await new Promise(resolve => server.once("listening", resolve))
  const { port } = server.address()
  try { return await fetch(`http://127.0.0.1:${port}${path}`, options) } finally { await new Promise(resolve => server.close(resolve)) }
}

test("public server exposes deterministic health/search and no private routes", async () => {
  const health = await request("/api/health")
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: "healthy", product: "miller-public", canonical_programs: 1361, physical_access_locations: 612 })
  const search = await request("/api/miller/match-state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "dépendance à Montréal" }) })
  assert.equal(search.status, 200)
  const searchPayload = await search.json()
  assert.equal(searchPayload.interpreted.location, "Montréal")
  assert.equal(searchPayload.interpreted.province, "Quebec")
  assert.ok(searchPayload.direct_results.length + searchPayload.broader_alternatives.length > 0)
  for (const path of ["/api/admin/session", "/api/integrations/samwise/status", "/api/internal/maintenance-scheduler/tick", "/admin/login", "/owner/directory-health-audit"]) assert.equal((await request(path)).status, 404, path)
})

test("public companion keeps contextual guidance alongside deterministic national cards", async () => {
  const search = await request("/api/miller", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ interface: "main", query: "I’m looking for addiction counselling in Newfoundland", city: "All Cities" }),
  })
  assert.equal(search.status, 200)
  const payload = await search.json()
  assert.ok(payload.results.length > 0)
  assert.match(payload.message, /Newfoundland and Labrador/i)
  assert.match(payload.message, /addiction counselling/i)
  assert.match(payload.message, /verified options/i)
  assert.doesNotMatch(payload.message, /^Sounds like you’re looking for counselling or someone to talk with\.?$/)
})

test("fingerprinted public assets cache safely while the HTML shell remains current", () => {
  const headers = new Map()
  const response = { setHeader: (name, value) => headers.set(name, value) }
  setPublicStaticCacheHeader(response, "/app/dist/assets/index-CaybuGMz.js")
  assert.equal(headers.get("Cache-Control"), "public, max-age=31536000, immutable")
  headers.clear()
  setPublicStaticCacheHeader(response, "/app/dist/index.html")
  assert.equal(headers.has("Cache-Control"), false)
})
