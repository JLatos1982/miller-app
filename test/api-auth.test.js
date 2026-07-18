import test from "node:test"
import assert from "node:assert/strict"

process.env.SITE_PASSWORD = "test-only-password"
const { isValidResourceId, requireAdmin } = await import("../server.js")

test("AI review authorization guard rejects an unauthorized request", () => {
  const req = { headers: {} }
  let status
  let body
  const res = {
    status(value) { status = value; return this },
    json(value) { body = value; return this },
  }
  let nextCalled = false

  requireAdmin(req, res, () => { nextCalled = true })
  assert.equal(status, 401)
  assert.deepEqual(body, { error: "Unauthorized" })
  assert.equal(nextCalled, false)
})

test("AI review resource ID validation rejects malformed IDs", () => {
  assert.equal(isValidResourceId("7"), true)
  assert.equal(isValidResourceId("not-a-number"), false)
  assert.equal(isValidResourceId("7 OR 1=1"), false)
})

