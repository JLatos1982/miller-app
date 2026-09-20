import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  isCanonicalFundingResource,
  isCanonicalPracticalResource,
  millerCanonicalPublicResources,
} from "../src/millerCanonicalPublicCatalog.js"
import { buildMillerCompanionGuidance, buildMillerCompanionResponse } from "../server/millerCompanionResponse.js"

const source = path => readFileSync(new URL(path, import.meta.url), "utf8")

test("homepage defers the national registry while browse views use one canonical public projection", () => {
  const app = source("../src/App.jsx")
  const master = source("../src/lists/MasterList.jsx")
  assert.doesNotMatch(app, /miller-shared-resource-registry-v1\.json/)
  assert.doesNotMatch(app, /buildMillerPublicationSafeResourceCorpus/)
  assert.doesNotMatch(app, /vancouver_resources_merged_updated\.json/)
  assert.doesNotMatch(app, /miller-practical-supports-public-v1\.json/)
  assert.doesNotMatch(app, /miller-funding-assistance-public-v1\.json/)
  assert.match(master, /millerCanonicalPublicResources/)
  assert.ok(millerCanonicalPublicResources.length > 1_000)
})

test("Funding and Practical Supports are honest canonical national browse views", () => {
  const practical = source("../src/site/MillerPracticalSupports.jsx")
  const funding = source("../src/site/MillerFundingAssistance.jsx")
  assert.match(practical, /millerCanonicalPublicResources/)
  assert.match(funding, /millerCanonicalPublicResources/)
  assert.doesNotMatch(practical, /Fraser North and nearby Lower Mainland/)
  assert.ok(millerCanonicalPublicResources.some(isCanonicalFundingResource))
  assert.ok(millerCanonicalPublicResources.some(isCanonicalPracticalResource))
})

test("main public search remains canonical-first and preserves bounded external fallback semantics", () => {
  const app = source("../src/App.jsx")
  const server = source("../server.js")
  assert.match(server, /buildMillerHybridSearchResponse/)
  assert.match(server, /tavilyResults: externalResults/)
  assert.match(app, /const verifiedResults = deterministicPresentation/)
  assert.match(app, /const externalResults = \(data\.tavilyResults \|\| \[\]\)/)
  assert.match(app, /result_origin !== "external_discovery"/)
})

test("companion keeps external fallback findings visibly unverified", () => {
  const message = buildMillerCompanionResponse({
    query: "housing in a small community",
    response: {
      interpreted: { primary_intent: "housing", province: "Ontario" },
      results: [{ name: "Official community page", result_origin: "external", location_label: "Ontario", verified_status: "external_unverified" }],
      guidance: { next_step: "Check the source directly for current access information." },
    },
  })
  assert.match(message, /broader public lead/i)
  assert.match(message, /not yet verified by Miller/i)
})

test("web message and structured mobile guidance use one public-only composition", () => {
  const input = {
    query: "I’m looking for addiction counselling in Newfoundland",
    response: {
      interpreted: { primary_intent: "counselling", province: "Newfoundland and Labrador" },
      results: [{ name: "Newfoundland and Labrador HealthLine", province: "Newfoundland and Labrador", result_origin: "verified_miller" }],
      guidance: { title: "Miller’s guide", access_note: "Call first to confirm current intake.", safeguards: ["Confirm current access."] },
    },
  }
  const guidance = buildMillerCompanionGuidance(input)
  assert.equal(buildMillerCompanionResponse(input), guidance.message)
  assert.match(guidance.interpretation, /Newfoundland and Labrador/i)
  assert.match(guidance.interpretation, /addiction counselling/i)
  assert.match(guidance.context, /HealthLine/)
  assert.match(guidance.next_step, /confirm current intake/i)
})

test("companion restores public-safe, need-specific safety and readiness guidance", () => {
  const base = {
    interpreted: { primary_intent: "harm reduction", province: "Ontario" },
    results: [{ name: "Verified harm-reduction service", result_origin: "verified_miller" }],
    guidance: { context: "Verified services can offer supplies, outreach, and connections to care.", next_step: "Check current access details before visiting." },
  }
  assert.match(buildMillerCompanionResponse({ query: "Someone is using opioids alone and needs harm reduction supplies", response: base }), /try not to use alone.*naloxone/i)
  assert.match(buildMillerCompanionResponse({ query: "I am not ready for abstinence but want counselling", response: { ...base, interpreted: { primary_intent: "counselling" } } }), /do not have to be ready for abstinence/i)
  assert.match(buildMillerCompanionResponse({ query: "My family member is not sure whether they need detox", response: { ...base, interpreted: { primary_intent: "detox" } } }), /safest next step/i)
  assert.match(buildMillerCompanionResponse({ query: "My family member needs counselling", response: { ...base, interpreted: { primary_intent: "counselling" } } }), /supporting someone else/i)
  assert.match(buildMillerCompanionResponse({ query: "Alcohol withdrawal with hallucinations", response: { ...base, interpreted: { primary_intent: "detox" } } }), /urgent medical help/i)
  assert.match(buildMillerCompanionResponse({ query: "Someone is not breathing after opioids", response: base }), /call 911 now/i)
})
