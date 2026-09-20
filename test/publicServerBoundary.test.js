import assert from "node:assert/strict"
import test from "node:test"

import { app, setPublicStaticCacheHeader } from "../server.js"

async function request(path, options = {}) {
  const server = app.listen(0, "127.0.0.1")
  await new Promise(resolve => server.once("listening", resolve))
  const { port } = server.address()
  try { return await fetch(`http://127.0.0.1:${port}${path}`, options) } finally { await new Promise(resolve => server.close(resolve)) }
}

const guidanceText = guidance => [
  guidance?.interpretation,
  guidance?.context,
  guidance?.next_step,
  guidance?.access_note,
  guidance?.navigation_note,
].filter(Boolean).join(" ")

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

test("web and mobile compose equivalent public companion guidance for Canada-wide requests", async () => {
  const cases = [
    { query: "I’m looking for addiction counselling in Newfoundland", expected: /Newfoundland and Labrador/i },
    { query: "dépendance à Montréal", expected: /Montréal/i },
    { query: "addiction counselling in Montréal", expected: /Montréal/i },
  ]
  for (const { query, expected } of cases) {
    const web = await request("/api/miller", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ interface: "main", query, city: "All Cities" }),
    })
    const mobile = await request("/api/mobile/v1/search", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, limit: 20 }),
    })
    assert.equal(web.status, 200, query)
    assert.equal(mobile.status, 200, query)
    const webPayload = await web.json()
    const mobilePayload = await mobile.json()
    assert.equal(mobilePayload.contract, "miller-mobile-search-v1")
    assert.equal(webPayload.message, guidanceText(mobilePayload.guidance), query)
    assert.match(mobilePayload.guidance.interpretation, expected, query)
    assert.deepEqual(
      webPayload.results.filter(result => result.result_origin === "verified_miller").map(result => result.canonical_id),
      mobilePayload.results.filter(result => result.result_origin === "verified_miller").map(result => result.canonical_id),
      query,
    )
  }
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
