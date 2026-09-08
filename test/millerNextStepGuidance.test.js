import assert from "node:assert/strict"
import test from "node:test"
import { buildMillerNextStepGuidance, inferMillerNextStepIntent, MILLER_NEXT_STEP_INTENTS } from "../src/millerNextStepGuidance.js"

const sample = overrides => ({
  id: "resource-1",
  name: "Example Support",
  phone: "250-555-0100",
  ...overrides,
})

test("next-step intent families are deterministic and cover the resource finder", () => {
  const queries = {
    housing: "supportive housing",
    detox: "withdrawal management",
    treatment: "residential rehab",
    oat: "Suboxone clinic",
    counselling: "counselling",
    harm_reduction: "naloxone and harm reduction",
    meetings: "peer support meetings",
    legal: "tenancy legal aid",
    funding: "treatment funding",
    mental_health: "mental health help",
    basic_needs: "food and basic needs",
    transportation: "medical transportation",
  }

  assert.deepEqual(Object.keys(queries).sort(), [...MILLER_NEXT_STEP_INTENTS].sort())
  for (const [expected, query] of Object.entries(queries)) {
    assert.equal(inferMillerNextStepIntent({ query }), expected, query)
  }
})

test("structured search intent can select guidance without free-form AI", () => {
  assert.equal(inferMillerNextStepIntent({
    intent: { explicit: { supportNeeds: ["detox"] }, normalized: { supportConcepts: [] } },
  }), "detox")
})

test("guidance uses explicit access data and keeps the claim tied to its resource", () => {
  const direct = buildMillerNextStepGuidance({
    query: "housing",
    results: [sample({ id: "direct", name: "Direct Housing Help", accessType: "Self-referral" })],
  })
  assert.equal(direct.source, "deterministic_controlled_template")
  assert.equal(direct.access_note.basis, "resource_access_direct")
  assert.equal(direct.access_note.resource_id, "direct")
  assert.match(direct.access_note.text, /lists direct or self-referral access/i)

  const referral = buildMillerNextStepGuidance({
    query: "treatment",
    results: [sample({ id: "referral", name: "Referral Program", accessType: "Physician referral required" })],
  })
  assert.equal(referral.access_note.basis, "resource_access_referral")
  assert.equal(referral.access_note.resource_id, "referral")
  assert.match(referral.access_note.text, /lists a referral requirement/i)
})

test("guidance never infers access from a description or an unknown field", () => {
  const guidance = buildMillerNextStepGuidance({
    query: "mental health",
    results: [sample({ description: "People sometimes ask whether a referral is required." })],
  })
  assert.equal(guidance.access_note.basis, "published_phone_present")

  const noGrounding = buildMillerNextStepGuidance({
    query: "mental health",
    results: [sample({ phone: "", description: "Self-referral may be possible." })],
  })
  assert.equal(noGrounding.access_note, null)
})

test("guidance is omitted for unknown intent or empty results", () => {
  assert.equal(buildMillerNextStepGuidance({ query: "something different", results: [sample()] }), null)
  assert.equal(buildMillerNextStepGuidance({ query: "housing", results: [] }), null)
})

test("controlled guidance avoids unsupported availability, eligibility, clinical, and legal claims", () => {
  for (const intent of MILLER_NEXT_STEP_INTENTS) {
    const guidance = buildMillerNextStepGuidance({ query: intent.replaceAll("_", " "), results: [sample()] })
    assert.ok(guidance, intent)
    const copy = `${guidance.text} ${guidance.access_note?.text || ""}`
    assert.doesNotMatch(copy, /available now|you are eligible|you qualify|should sue|must attend|guaranteed/i)
  }
})
