import test from "node:test"
import assert from "node:assert/strict"
import { assertSafePublicUrl, fetchSafeResearchDocument, isPrivateIp } from "../server/review/linkQuality.js"

test("recognizes private and loopback addresses", () => {
  assert.equal(isPrivateIp("127.0.0.1"), true)
  assert.equal(isPrivateIp("10.1.2.3"), true)
  assert.equal(isPrivateIp("192.168.1.5"), true)
  assert.equal(isPrivateIp("8.8.8.8"), false)
})
test("research fetch is SSRF-checked, bounded, and accepts only text documents", async () => { const lookup = async () => [{ address: "8.8.8.8", family: 4 }], fetchImpl = async () => new Response("<html>Program evidence</html>", { status: 200, headers: { "content-type": "text/html" } }); const result = await fetchSafeResearchDocument("https://public.example/program", { lookup, fetchImpl }); assert.equal(result.ok, true); assert.match(result.text, /Program evidence/); assert.equal(result.bytesBounded, true); await assert.rejects(() => fetchSafeResearchDocument("http://127.0.0.1/private", { lookup, fetchImpl }), /Private/) })
test("research fetch fails safely on provider timeout", async () => { const lookup = async () => [{ address: "8.8.8.8", family: 4 }], fetchImpl = async () => { throw Object.assign(new Error("timed out"), { name: "AbortError" }) }; await assert.rejects(() => fetchSafeResearchDocument("https://public.example/program", { lookup, fetchImpl, timeoutMs: 5 }), /timed out/) })

test("blocks localhost and private DNS results", async () => {
  await assert.rejects(() => assertSafePublicUrl("http://localhost/admin"), /Internal hostname/)
  await assert.rejects(
    () => assertSafePublicUrl("https://public.example", async () => [{ address: "169.254.169.254", family: 4 }]),
    /Private/
  )
})
