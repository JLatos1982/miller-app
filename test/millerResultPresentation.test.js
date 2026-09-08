import assert from "node:assert/strict"
import test from "node:test"
import { conciseResourceDescription } from "../src/millerResultPresentation.js"

test("short resource descriptions remain intact", () => {
  assert.equal(conciseResourceDescription("  Calm, direct support.  "), "Calm, direct support.")
})

test("long descriptions stop at a useful sentence when one is available", () => {
  const description = `${"A".repeat(100)}. ${"B".repeat(100)}. ${"C".repeat(100)}.`
  const result = conciseResourceDescription(description, 230)
  assert.equal(result, `${"A".repeat(100)}. ${"B".repeat(100)}.…`)
  assert.ok(result.length <= 231)
})

test("long unbroken prose falls back to a word boundary", () => {
  const result = conciseResourceDescription("help ".repeat(100), 80)
  assert.match(result, /help…$/)
  assert.ok(result.length <= 81)
})
