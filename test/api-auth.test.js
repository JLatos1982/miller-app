import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequireAdmin, getBearerToken, parseAdminEmailAllowlist } from "../server/adminAuth.js"

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(value) { this.statusCode = value; return this },
    json(value) { this.body = value; return this },
    setHeader(name, value) { this.headers[name] = value },
  }
}

test("admin authorization rejects anonymous requests before contacting Supabase", async () => {
  let calls = 0
  const supabase = { auth: { getUser: async () => { calls += 1 } } }
  const requireAdmin = createRequireAdmin({ supabase, getAllowlist: () => "admin@example.org" })
  const res = responseRecorder()
  let nextCalled = false

  await requireAdmin({ headers: {} }, res, () => { nextCalled = true })
  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, { error: "Unauthorized" })
  assert.equal(calls, 0)
  assert.equal(nextCalled, false)
})

test("a valid ordinary Supabase account is not an administrator", async () => {
  const supabase = { auth: { getUser: async () => ({ data: { user: { id: "user-1", email: "visitor@example.org" } }, error: null }) } }
  const requireAdmin = createRequireAdmin({ supabase, getAllowlist: () => "admin@example.org" })
  const req = { headers: { authorization: "Bearer valid-user-token" } }
  const res = responseRecorder()
  let nextCalled = false

  await requireAdmin(req, res, () => { nextCalled = true })
  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, { error: "Forbidden" })
  assert.equal(nextCalled, false)
})

test("an allowlisted Supabase user can reach the protected handler", async () => {
  const supabase = { auth: { getUser: async (token) => {
    assert.equal(token, "valid-admin-token")
    return { data: { user: { id: "admin-1", email: "ADMIN@example.org" } }, error: null }
  } } }
  const requireAdmin = createRequireAdmin({ supabase, getAllowlist: () => "admin@example.org" })
  const req = { headers: { authorization: "Bearer valid-admin-token" } }
  const res = responseRecorder()
  let nextCalled = false

  await requireAdmin(req, res, () => { nextCalled = true })
  assert.equal(nextCalled, true)
  assert.deepEqual(req.adminUser, { id: "admin-1", email: "admin@example.org" })
  assert.equal(res.headers["Cache-Control"], "private, no-store")
})

test("admin authorization fails closed when the allowlist is missing", async () => {
  const supabase = { auth: { getUser: async () => { throw new Error("should not run") } } }
  const requireAdmin = createRequireAdmin({ supabase, getAllowlist: () => "" })
  const res = responseRecorder()
  await requireAdmin({ headers: { authorization: "Bearer token" } }, res, () => {})
  assert.equal(res.statusCode, 503)
})

test("admin auth parsing is strict and normalizes configured emails", () => {
  assert.equal(getBearerToken("Bearer abc.def.ghi"), "abc.def.ghi")
  assert.equal(getBearerToken("Basic abc"), "")
  assert.deepEqual([...parseAdminEmailAllowlist(" Admin@Example.org, second@example.org ")], ["admin@example.org", "second@example.org"])
})

const { isValidResourceId } = await import("../server.js")

test("admin resource ID validation rejects malformed IDs", () => {
  assert.equal(isValidResourceId("7"), true)
  assert.equal(isValidResourceId("not-a-number"), false)
  assert.equal(isValidResourceId("7 OR 1=1"), false)
})

test("every admin route is wired to the server authorization middleware", () => {
  const source = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  const adminRoutes = [...source.matchAll(/app\.(?:get|post|patch|delete)\("([^"]*\/api\/admin[^"]*)"([^\n]*)/g)]
  assert.ok(adminRoutes.length >= 5)
  for (const [, route, remainder] of adminRoutes) {
    assert.match(remainder, /requireAdmin/, `${route} must use requireAdmin`)
  }
})

test("the expensive Miller endpoint is not exempt from the preview-password middleware", () => {
  const source = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  const publicPathsBlock = source.match(/const publicPaths = \[([\s\S]*?)\]/)?.[1] || ""
  assert.doesNotMatch(publicPathsBlock, /\/api\/miller/)
  assert.match(publicPathsBlock, /\/api\/unlock/)
})
