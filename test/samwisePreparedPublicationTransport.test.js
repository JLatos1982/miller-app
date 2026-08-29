import test from "node:test"
import assert from "node:assert/strict"
import { createSamwisePreparedPublicationTransport, localPreparedPublicationAuthorized } from "../server/samwisePreparedPublicationTransport.js"

async function withServer(app, run) { const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); try { return await run(server) } finally { await new Promise(resolve => server.close(resolve)) } }

test("local conveyor allows only loopback requests with its dedicated credential", async () => {
  const token = "x".repeat(40)
  assert.equal(localPreparedPublicationAuthorized({ remoteAddress: "127.0.0.1", token, expectedToken: token }), true)
  assert.equal(localPreparedPublicationAuthorized({ remoteAddress: "::1", token, expectedToken: token }), true)
  assert.equal(localPreparedPublicationAuthorized({ remoteAddress: "10.0.0.6", token, expectedToken: token }), false)
  assert.equal(localPreparedPublicationAuthorized({ remoteAddress: "127.0.0.1", token: "wrong", expectedToken: token }), false)
  assert.throws(() => createSamwisePreparedPublicationTransport({ token: "", conveyor: {} }), /dependencies_required/)
  const calls = [], app = createSamwisePreparedPublicationTransport({ token, conveyor: { list: () => [{ prepared_action_id: "publish_11111111-1111-4111-8111-111111111111" }], confirm: async input => { calls.push(input); return { outcome: "published", idempotent: false } } } })
  await withServer(app, async server => {
    const base = `http://127.0.0.1:${server.address().port}`, headers = { "x-miller-samwise-conveyor": token }
    assert.equal((await fetch(`${base}/v1/prepared-publication-actions`)).status, 403)
    assert.equal((await fetch(`${base}/v1/prepared-publication-actions`, { headers })).status, 200)
    assert.equal((await fetch(`${base}/v1/anything-else`, { headers })).status, 404)
    assert.equal((await fetch(`${base}/v1/prepared-publication-actions/confirm`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ prepared_action_id: "publish_11111111-1111-4111-8111-111111111111", owner_confirmed: false }) })).status, 400)
    assert.equal((await fetch(`${base}/v1/prepared-publication-actions/confirm`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ prepared_action_id: "publish_11111111-1111-4111-8111-111111111111", owner_confirmed: true }) })).status, 200)
    assert.deepEqual(calls, [{ prepared_action_id: "publish_11111111-1111-4111-8111-111111111111", owner_confirmed: true }])
  })
})
