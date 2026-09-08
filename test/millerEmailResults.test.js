import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import registry from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import { buildSharedCanonicalMillerResources } from "../src/millerPublicSearchResources.js"
import {
  buildEmailResultIndex,
  buildResultsEmail,
  createEmailSender,
  emailProviderStatus,
  EMAIL_RESULTS_RATE_LIMIT,
  isValidEmailAddress,
  MAX_EMAIL_RESULTS,
  normalizeEmailResult,
  resolveEmailResults,
  validateEmailResultsRequest,
} from "../server/millerEmailResults.js"

const fixture = {
  id: "curated:fixture",
  name: "Safe Resource",
  organization: "Community Operator",
  description: "Practical support.",
  city: "Burnaby",
  eligibility: "Contact the program.",
  accessType: "Call or visit the public page.",
  phone: "604-555-0100",
  website: "https://example.org/resource",
  source: "curated",
  approved: true,
  hidden: false,
  private_notes: "never send",
  patient_name: "never send",
  email: "staff@example.org",
  address: "private internal location",
}

test("email validation and selection limits are conservative", () => {
  assert.equal(isValidEmailAddress("person@example.org"), true)
  assert.equal(isValidEmailAddress("not-an-email"), false)
  assert.throws(() => validateEmailResultsRequest({ recipient: "person@example.org", result_ids: [fixture.id] }), /confirmation_required/)
  assert.throws(() => validateEmailResultsRequest({ recipient: "bad", result_ids: [fixture.id], confirm: true }), /invalid_email/)
  assert.throws(() => validateEmailResultsRequest({ recipient: "person@example.org", result_ids: [], confirm: true }), /no_results_selected/)
  assert.throws(() => validateEmailResultsRequest({ recipient: "person@example.org", result_ids: Array.from({ length: MAX_EMAIL_RESULTS + 1 }, (_, index) => `curated:${index}`), confirm: true }), /too_many_results/)
  assert.deepEqual(EMAIL_RESULTS_RATE_LIMIT, { windowMs: 3_600_000, max: 3 })
})

test("only server-authorized structured results can be emailed", () => {
  const index = buildEmailResultIndex([fixture])
  assert.equal(resolveEmailResults([fixture.id], index)[0].name, fixture.name)
  assert.throws(() => resolveEmailResults(["curated:invented"], index), /unavailable_result/)
  assert.equal(normalizeEmailResult({ ...fixture, hidden: true }), null)
  assert.equal(normalizeEmailResult({ ...fixture, approved: false }), null)
})

test("new canonical Miller resources keep their public search IDs in Email Results", () => {
  const projected = buildSharedCanonicalMillerResources(registry.records)
  const index = buildEmailResultIndex(projected)
  for (const id of ["miller_ab_calgary_opioid_dependency_program", "miller_sk_regina_oat", "miller_bc_connective_vancouver_cso"]) {
    assert.equal(resolveEmailResults([id], index)[0].id, id)
  }
  assert.equal(index.has("north_bc_police_accountability_unit"), false)
})

test("message generation excludes private fields and raw search text", () => {
  const safe = normalizeEmailResult({ ...fixture, name: "Safe <script>alert(1)</script>" })
  const message = buildResultsEmail({ resources: [safe], city: "Burnaby", categories: ["Housing"] })
  assert.equal(message.subject, "Miller resources for Burnaby")
  assert.doesNotMatch(message.text, /never send|patient_name|private internal location|staff@example/)
  assert.doesNotMatch(message.html, /<script>/)
  assert.match(message.html, /&lt;script&gt;/)
  assert.doesNotMatch(message.text, /diagnosis|raw query/i)
})

test("funding messages use their own privacy-safe subject and disclaimer", () => {
  const safe = normalizeEmailResult({ ...fixture, id: "funding:miller:fixture", kind: "funding", name: "Training assistance" })
  const message = buildResultsEmail({ resources: [safe] })
  assert.equal(message.subject, "Funding opportunities from Miller")
  assert.match(message.text, /Check the official program page before applying/)
})

test("email delivery remains disabled until complete server-only configuration exists", async () => {
  assert.deepEqual(emailProviderStatus({}), { enabled: false, provider: null, max_results: MAX_EMAIL_RESULTS })
  assert.equal(createEmailSender({}), null)
  const requests = []
  const sender = createEmailSender({ MILLER_EMAIL_PROVIDER: "resend", RESEND_API_KEY: "server-secret", MILLER_EMAIL_FROM: "Miller <resources@example.org>" }, async (url, options) => {
    requests.push({ url, options })
    return { ok: true, json: async () => ({ id: "msg_123" }) }
  })
  const result = await sender({ recipient: "person@example.org", subject: "Selected Miller resources", text: "Safe", html: "<p>Safe</p>" })
  assert.equal(result.message_id, "msg_123")
  assert.equal(requests.length, 1)
  assert.match(requests[0].options.headers.Authorization, /^Bearer /)
})

test("browser code never contains provider credentials and preserves explicit confirmation", () => {
  const api = readFileSync(new URL("../src/emailResultsApi.js", import.meta.url), "utf8")
  const dialog = readFileSync(new URL("../src/site/EmailResultsDialog.jsx", import.meta.url), "utf8")
  const server = readFileSync(new URL("../server.js", import.meta.url), "utf8")
  assert.doesNotMatch(`${api}\n${dialog}`, /RESEND_API_KEY|MILLER_EMAIL_FROM|Authorization:\s*`Bearer/)
  assert.match(api, /confirm:\s*true/)
  assert.match(dialog, /Send email/)
  assert.match(server, /rateLimit\(EMAIL_RESULTS_RATE_LIMIT\)/)
})
