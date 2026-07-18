import test from "node:test"
import assert from "node:assert/strict"
import { generateHandoutCardDraft, sanitizeGeneratedHandoutDraft, validateHandoutDraftRequest } from "../server/handoutCardDraft.js"

const request = { sourceTitle: "Clinic", sourceUrl: "https://example.org", sourceDomain: "example.org", name: "Clinic", organization: "", description: "Public details", website: "https://example.org", city: "Vernon", category: "", serviceType: "Counselling", searchCity: "Vernon" }

test("server rejects personalized or unsupported draft fields", () => {
  assert.throws(() => validateHandoutDraftRequest({ ...request, personName: "Private" }), /unsupported fields/)
  assert.throws(() => validateHandoutDraftRequest({ ...request, sourceUrl: "javascript:alert(1)" }), /valid public website/)
})

test("server sends only validated public resource data for structured generation", async () => {
  let captured
  const output = Object.fromEntries(["name", "organization", "category", "city", "serviceArea", "description", "address", "phone", "email", "website", "hours", "eligibility", "referralProcess", "cost", "accessibility", "languages", "limitations", "callBeforeNote"].map((field) => [field, field === "name" ? "Clinic" : ""]))
  const openai = { responses: { create: async (options) => { captured = options; return { output_text: JSON.stringify(output) } } } }
  const result = await generateHandoutCardDraft(request, { openai })
  assert.equal(result.name, "Clinic")
  assert.deepEqual(JSON.parse(captured.input), request)
  assert.equal(captured.text.format.strict, true)
})

test("server validates partial model output and preserves known source fields", () => {
  const result = sanitizeGeneratedHandoutDraft({ name: "AI Name", website: "javascript:bad" }, validateHandoutDraftRequest(request))
  assert.equal(result.name, "AI Name")
  assert.equal(result.website, "https://example.org")
  assert.equal(result.description, "Public details")
  assert.equal(result.city, "Vernon")
  assert.equal(result.phone, "")
  assert.throws(() => sanitizeGeneratedHandoutDraft("not an object", request), /malformed structured output/)
})
