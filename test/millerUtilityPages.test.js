import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("new Miller utility pages reuse the one-pass companion and yield on constrained screens", () => {
  const companion = readFileSync(new URL("../src/site/MillerUtilityCompanion.jsx", import.meta.url), "utf8")
  const companionCss = readFileSync(new URL("../src/site/MillerUtilityCompanion.css", import.meta.url), "utf8")
  const practical = readFileSync(new URL("../src/site/MillerPracticalSupports.jsx", import.meta.url), "utf8")
  const funding = readFileSync(new URL("../src/site/MillerFundingAssistance.jsx", import.meta.url), "utf8")
  assert.match(companion, /MillerSheepdog/)
  assert.match(companion, /idleAllowed=\{false\}/)
  assert.match(practical, /MillerUtilityCompanion/)
  assert.match(funding, /millerNorth \? null : <MillerUtilityCompanion/)
  assert.match(companionCss, /max-height:700px/)
  assert.match(companionCss, /prefers-reduced-motion:reduce/)
  assert.match(companionCss, /pointer-events:none/)
})

test("Practical Supports and Funding share the established light Miller visual vocabulary", () => {
  const css = readFileSync(new URL("../src/site/MillerPracticalSupports.css", import.meta.url), "utf8")
  for (const token of ["#d6e4ff", "#2c4a7a", "#4f8cff", "Trebuchet MS"]) assert.match(css, new RegExp(token))
  assert.doesNotMatch(css, /#f5f1e7|Georgia/)
})
