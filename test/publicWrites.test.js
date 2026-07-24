import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { validateAnalyticsEvent, validateResourceSubmission } from "../server/publicWriteValidation.js"
import { createPublicWriteHandlers } from "../server/publicWrites.js"
import { clearRateLimitsForTests, rateLimit } from "../server.js"

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

test("analytics schema accepts only existing event types and minimizes search data", () => {
  const event = validateAnalyticsEvent({
    event_type: "search",
    city: "Burnaby",
    miller_theme: "Classic",
    session_id: "123e4567-e89b-42d3-a456-426614174000",
  })
  assert.deepEqual(event, {
    event_type: "search",
    city: "Burnaby",
    resource_name: null,
    miller_theme: "Classic",
    session_id: "123e4567-e89b-42d3-a456-426614174000",
    query: null,
  })
  assert.throws(() => validateAnalyticsEvent({ event_type: "custom" }), /invalid/)
  assert.throws(() => validateAnalyticsEvent({ event_type: "search", query: "private search" }), /unknown fields/)
  assert.throws(() => validateAnalyticsEvent({ event_type: "search", city: "x".repeat(101) }), /too long/)
  assert.throws(() => validateAnalyticsEvent({ event_type: "search", city: 42 }), /invalid type/)
})

test("analytics schema requires click resource names and rejects misplaced fields", () => {
  assert.throws(() => validateAnalyticsEvent({ event_type: "resource_click" }), /resource_name is required/)
  assert.throws(() => validateAnalyticsEvent({ event_type: "page_view", resource_name: "Unexpected" }), /only valid/)
  assert.equal(validateAnalyticsEvent({ event_type: "resource_click", resource_name: "Clinic" }).resource_name, "Clinic")
})

test("submission schema requires a meaningful note and validates URLs and limits", () => {
  const submission = validateResourceSubmission({
    resource_name: "Neighbourhood Clinic",
    city: "Surrey",
    note: "Please review this public community resource.",
    website: "https://example.org/help",
  })
  assert.deepEqual(submission, {
    name: "Neighbourhood Clinic",
    city: "Surrey",
    category: "Please review this public community resource.",
    website: "https://example.org/help",
  })
  assert.throws(() => validateResourceSubmission({}), /note is required/)
  assert.throws(() => validateResourceSubmission({ note: "short" }), /too short/)
  assert.throws(() => validateResourceSubmission({ note: "A meaningful note", website: "javascript:alert(1)" }), /HTTP\(S\)/)
  assert.throws(() => validateResourceSubmission({ note: "x".repeat(2001) }), /too long/)
  assert.throws(() => validateResourceSubmission({ note: "A meaningful note", extra: "no" }), /unknown fields/)
})

test("public write handlers insert validated rows with the service client", async () => {
  const writes = []
  const supabase = { from(table) { return { insert: async (rows) => { writes.push({ table, rows }); return { error: null } } } } }
  const handlers = createPublicWriteHandlers({ supabase, log: { error() {} } })

  const eventRes = responseRecorder()
  await handlers.createEvent({ body: { event_type: "page_view", miller_theme: "Jade" } }, eventRes)
  assert.equal(eventRes.statusCode, 202)

  const submissionRes = responseRecorder()
  await handlers.createResourceSubmission({ body: { note: "A useful local program to review." } }, submissionRes)
  assert.equal(submissionRes.statusCode, 201)
  assert.equal(writes[0].table, "site_events")
  assert.equal(writes[0].rows[0].query, null)
  assert.equal(writes[1].table, "resource_submissions")
})

test("invalid public payloads receive generic responses and never reach the database", async () => {
  let inserts = 0
  const supabase = { from() { return { insert: async () => { inserts += 1; return { error: null } } } } }
  const handlers = createPublicWriteHandlers({ supabase, log: { error() {} } })

  const eventRes = responseRecorder()
  await handlers.createEvent({ body: { event_type: "private_event", secret: "do not expose" } }, eventRes)
  assert.equal(eventRes.statusCode, 400)
  assert.deepEqual(eventRes.body, { error: "Invalid analytics event." })

  const submissionRes = responseRecorder()
  await handlers.createResourceSubmission({ body: {} }, submissionRes)
  assert.equal(submissionRes.statusCode, 400)
  assert.deepEqual(submissionRes.body, { error: "Invalid resource submission." })
  assert.equal(inserts, 0)
})

test("database failures return generic responses without internal details", async () => {
  const secretDetail = "service_role database details"
  const supabase = { from() { return { insert: async () => ({ error: { code: "DB500", message: secretDetail } }) } } }
  const logged = []
  const handlers = createPublicWriteHandlers({ supabase, log: { error(...values) { logged.push(values) } } })

  const eventRes = responseRecorder()
  await handlers.createEvent({ body: { event_type: "page_view" } }, eventRes)
  assert.equal(eventRes.statusCode, 500)
  assert.deepEqual(eventRes.body, { error: "Could not record event." })
  assert.doesNotMatch(JSON.stringify(eventRes.body), /service_role|DB500/)

  const submissionRes = responseRecorder()
  await handlers.createResourceSubmission({ body: { note: "A meaningful submission note." } }, submissionRes)
  assert.equal(submissionRes.statusCode, 500)
  assert.deepEqual(submissionRes.body, { error: "Could not submit resource." })
  assert.doesNotMatch(JSON.stringify(submissionRes.body), /service_role|DB500/)
  assert.equal(logged.length, 2)
})

test("process-memory rate limiter rejects requests after the configured limit", () => {
  clearRateLimitsForTests()
  const limiter = rateLimit({ windowMs: 60_000, max: 2 })
  const req = { ip: "203.0.113.5", path: "/api/test-limit" }
  let accepted = 0

  limiter(req, responseRecorder(), () => { accepted += 1 })
  limiter(req, responseRecorder(), () => { accepted += 1 })
  const limitedRes = responseRecorder()
  limiter(req, limitedRes, () => { accepted += 1 })

  assert.equal(accepted, 2)
  assert.equal(limitedRes.statusCode, 429)
  assert.match(limitedRes.body.error, /Too many requests/)
  assert.ok(limitedRes.headers["Retry-After"])
})

test("frontend no longer inserts directly into public-write tables", () => {
  const source = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  assert.doesNotMatch(source, /from\(["']site_events["']\)\s*\.insert/)
  assert.doesNotMatch(source, /from\(["']resource_submissions["']\)\s*\.insert/)
  assert.doesNotMatch(source, /event_type:\s*["']search["'][\s\S]{0,180}\bquery\s*:/)
})
