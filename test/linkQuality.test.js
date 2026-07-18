import test from "node:test"
import assert from "node:assert/strict"
import { assertSafePublicUrl, isPrivateIp } from "../server/review/linkQuality.js"

test("recognizes private and loopback addresses", () => {
  assert.equal(isPrivateIp("127.0.0.1"), true)
  assert.equal(isPrivateIp("10.1.2.3"), true)
  assert.equal(isPrivateIp("192.168.1.5"), true)
  assert.equal(isPrivateIp("8.8.8.8"), false)
})

test("blocks localhost and private DNS results", async () => {
  await assert.rejects(() => assertSafePublicUrl("http://localhost/admin"), /Internal hostname/)
  await assert.rejects(
    () => assertSafePublicUrl("https://public.example", async () => [{ address: "169.254.169.254", family: 4 }]),
    /Private/
  )
})
