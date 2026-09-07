import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  MILLER_NORTH_PUBLIC_PLACEMENT_RULES,
  MILLER_NORTH_PUBLIC_SECTIONS,
  resolveMillerNorthPublicSection,
} from "../src/site/millerNorthPublicTaxonomy.js"

test("Miller North public navigation has four visitor-facing primary sections", () => {
  assert.deepEqual(MILLER_NORTH_PUBLIC_SECTIONS.map(section => section.label), ["Evidence", "Incidents", "Accountability", "Watching"])
  assert.equal(new Set(MILLER_NORTH_PUBLIC_SECTIONS.map(section => section.href)).size, 4)
  assert.deepEqual(MILLER_NORTH_PUBLIC_SECTIONS.map(section => section.id), Object.keys(MILLER_NORTH_PUBLIC_PLACEMENT_RULES))
})

test("legacy and supporting routes resolve to a stable public navigation context", () => {
  assert.equal(resolveMillerNorthPublicSection("methodology"), "evidence")
  assert.equal(resolveMillerNorthPublicSection("official"), "incidents")
  assert.equal(resolveMillerNorthPublicSection("research"), "accountability")
  assert.equal(resolveMillerNorthPublicSection("listening"), "watching")
})

test("public placement rules keep one primary home while search can span every type", () => {
  assert.equal(MILLER_NORTH_PUBLIC_PLACEMENT_RULES.evidence.includes.includes("aggregate_finding"), true)
  assert.equal(MILLER_NORTH_PUBLIC_PLACEMENT_RULES.incidents.includes.includes("regulator_record"), true)
  assert.equal(MILLER_NORTH_PUBLIC_PLACEMENT_RULES.accountability.includes.includes("recommendation_tracker"), true)
  assert.equal(MILLER_NORTH_PUBLIC_PLACEMENT_RULES.watching.includes.includes("pending_verdict"), true)

  const nav = readFileSync(new URL("../src/site/MillerNorthPublicNav.jsx", import.meta.url), "utf8")
  assert.doesNotMatch(nav, /Live Listening|Evidence Library|Research & Policy|Official records/)
})
