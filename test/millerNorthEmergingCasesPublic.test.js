import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import projection from "../src/data/miller-north-emerging-cases-public-v1.json" with { type: "json" }
import { validateMillerNorthEmergingCasesProjection } from "../server/millerNorthEmergingCasesPublic.js"

test("Watching Now projection is publication-safe, evidence-bearing and province-complete", () => {
  assert.deepEqual(validateMillerNorthEmergingCasesProjection(projection), { valid: true, items: 8, provinces: 3, dossier_candidates: 1, evidence_bearing: 8 })
  assert.equal(projection.items.every(item => item.sources.length > 0), true)
})

test("emerging cases cannot contain private workflow fields, named held leads or mature cases", () => {
  const privateField = structuredClone(projection)
  privateField.items[0].owner_review = true
  assert.throws(() => validateMillerNorthEmergingCasesProjection(privateField), /private_or_identifying/)
  const named = structuredClone(projection)
  named.items[0].description = "Yvonne Houssin"
  assert.throws(() => validateMillerNorthEmergingCasesProjection(named), /private_or_identifying/)
  const mature = structuredClone(projection)
  mature.items[0].stage = "research_policy_case"
  assert.throws(() => validateMillerNorthEmergingCasesProjection(mature), /stage_invalid/)
})

test("Watching Now route and navigation remain distinct from Live Listening and mature research", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  const nav = readFileSync(new URL("../src/site/MillerNorthPublicNav.jsx", import.meta.url), "utf8")
  const view = readFileSync(new URL("../src/site/MillerNorthEmergingCases.jsx", import.meta.url), "utf8")
  assert.match(app, /indigenous-healthcare-evidence\/watching-now/)
  assert.match(nav, /Watching Now/)
  assert.match(view, /From a signal to a researched case/)
  assert.match(view, /Live Listening/)
  assert.match(view, /Evidence Library/)
})
