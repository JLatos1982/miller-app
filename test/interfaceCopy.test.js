import test from "node:test"
import assert from "node:assert/strict"
import { MILLER_COPY } from "../src/interfaceCopy.js"

test("centralized copy remains warm, clear, and direct", () => {
  assert.match(MILLER_COPY.searchLoading, /looking carefully/i)
  assert.match(MILLER_COPY.noResultsBody, /another word|nearby city/i)
  assert.match(MILLER_COPY.temporaryFallback, /details still need your review/i)
  assert.doesNotMatch(MILLER_COPY.temporaryFallback, /stack|exception|500/i)
})
