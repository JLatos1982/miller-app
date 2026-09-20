import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  isCanonicalFundingResource,
  isCanonicalPracticalResource,
  millerCanonicalPublicResources,
} from "../src/millerCanonicalPublicCatalog.js"
import { buildMillerCompanionResponse } from "../server/millerCompanionResponse.js"

const source = path => readFileSync(new URL(path, import.meta.url), "utf8")

test("homepage defers the national registry while browse views use one canonical public projection", () => {
  const app = source("../src/App.jsx")
  const master = source("../src/lists/MasterList.jsx")
  assert.doesNotMatch(app, /miller-shared-resource-registry-v1\.json/)
  assert.doesNotMatch(app, /buildMillerPublicationSafeResourceCorpus/)
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
      results: [{ name: "Official community page", result_origin: "external_discovery", location_label: "Ontario" }],
      guidance: { next_step: "Check the source directly for current access information." },
    },
  })
  assert.match(message, /broader public lead/i)
  assert.match(message, /not yet verified by Miller/i)
})
