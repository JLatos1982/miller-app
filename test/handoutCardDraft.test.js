import test from "node:test"
import assert from "node:assert/strict"
import { generateHandoutCardDraft, validateHandoutDraftRequest } from "../server/handoutCardDraft.js"

const request = { sourceTitle: "Clinic", sourceUrl: "https://example.org", name: "Clinic", organization: "", description: "Public details", website: "https://example.org", city: "Vernon", category: "", serviceType: "Counselling" }

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
