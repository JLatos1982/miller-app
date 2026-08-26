import test from "node:test"
import assert from "node:assert/strict"
import { resolveMillerBindHost } from "../server.js"
import { localViteServerConfig } from "../vite.config.js"

test("Miller defaults to loopback locally and leaves production binding platform-managed", () => {
  assert.equal(resolveMillerBindHost({ environment: "development" }), "127.0.0.1")
  assert.equal(resolveMillerBindHost({ environment: "production" }), undefined)
})

test("Miller only broadens its backend bind through explicit configuration", () => {
  assert.equal(resolveMillerBindHost({ environment: "development", configuredHost: "0.0.0.0" }), "0.0.0.0")
})

test("Miller Vite defaults to the documented loopback proxy and requires an explicit LAN host", () => {
  const local = localViteServerConfig()
  assert.equal(local.host, "127.0.0.1"); assert.equal(local.port, 5173); assert.equal(local.strictPort, true); assert.equal(local.proxy["/api"].target, "http://127.0.0.1:8787")
  assert.equal(localViteServerConfig({ MILLER_VITE_HOST: "0.0.0.0" }).host, "0.0.0.0")
})
