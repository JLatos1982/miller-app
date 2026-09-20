import assert from "node:assert/strict"
import test from "node:test"

import { app } from "../server.js"

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
