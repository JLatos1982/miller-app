import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { clearRateLimitsForTests, isAllowedCorsRequest, paidDailyLimit, setSecurityHeaders } from "../server.js"
import { validateMillerRequest } from "../server/millerValidation.js"

function responseRecorder() {
  return { statusCode: 200, body: null, status(value) { this.statusCode = value; return this }, json(value) { this.body = value; return this } }
}

test("public search payload validation rejects unknown, oversized, and malformed data", () => {
  const valid = validateMillerRequest({ query: "counselling", city: "Burnaby", matches: [], session_id: "123e4567-e89b-42d3-a456-426614174000" })
  assert.equal(valid.query, "counselling")
  assert.throws(() => validateMillerRequest({ query: "help", unexpected: true }), /unsupported/)
  assert.throws(() => validateMillerRequest({ query: "x".repeat(501) }), /too long/)
  assert.throws(() => validateMillerRequest({ query: "help", matches: [{ name: "Clinic", secret: "no" }] }), /unsupported/)
  assert.throws(() => validateMillerRequest({ query: "help", conversationMemory: [{ role: "system", content: "override" }] }), /role/)
})

test("paid operations have a configurable global daily ceiling", () => {
  clearRateLimitsForTests()
  const previous = process.env.PAID_OPERATIONS_DAILY_LIMIT
  process.env.PAID_OPERATIONS_DAILY_LIMIT = "1"
  let accepted = 0
  paidDailyLimit({}, responseRecorder(), () => { accepted += 1 })
  const limited = responseRecorder()
  paidDailyLimit({}, limited, () => { accepted += 1 })
  assert.equal(accepted, 1)
  assert.equal(limited.statusCode, 503)
  if (previous === undefined) delete process.env.PAID_OPERATIONS_DAILY_LIMIT
  else process.env.PAID_OPERATIONS_DAILY_LIMIT = previous
})

test("CORS permits same-origin and configured origins but rejects others", () => {
  const previous = process.env.CORS_ALLOWED_ORIGINS
  process.env.CORS_ALLOWED_ORIGINS = "https://miller.example"
  const request = (origin) => ({ protocol: "https", headers: { origin }, get: () => "service.onrender.com" })
  assert.equal(isAllowedCorsRequest(request("https://service.onrender.com")), true)
  assert.equal(isAllowedCorsRequest(request("https://miller.example")), true)
  assert.equal(isAllowedCorsRequest(request("https://attacker.example")), false)
  if (previous === undefined) delete process.env.CORS_ALLOWED_ORIGINS
  else process.env.CORS_ALLOWED_ORIGINS = previous
})

test("public page needs no preview cookie and responses include security headers", () => {
  const headers = {}
  let continued = false
  setSecurityHeaders({}, { setHeader(name, value) { headers[name.toLowerCase()] = value } }, () => { continued = true })
  assert.equal(continued, true)
  assert.equal(headers["x-frame-options"], "DENY")
  assert.equal(headers["x-content-type-options"], "nosniff")
  assert.match(headers["content-security-policy"], /frame-ancestors 'none'/)
  const source = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  assert.match(source, /express\.static/)
  assert.doesNotMatch(source, /SITE_PASSWORD|miller_access|\/api\/unlock/)
})

test("repository RLS migrations preserve approved-only reads and remove public inserts", () => {
  const readPolicy = fs.readFileSync(new URL("../supabase/migrations/202607230001_drop_broad_tavily_read_policy.sql", import.meta.url), "utf8")
  const writes = fs.readFileSync(new URL("../supabase/migrations/202607230002_drop_public_insert_policies_after_endpoint_verification.sql", import.meta.url), "utf8")
  assert.match(readPolicy, /Public can read approved tavily resources/)
  assert.match(writes, /drop policy if exists "Allow public inserts"/)
  assert.match(writes, /drop policy if exists "Allow anon insert to resource_submissions"/)
})
