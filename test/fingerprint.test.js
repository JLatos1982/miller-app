import test from "node:test"
import assert from "node:assert/strict"
import { createReviewFingerprint } from "../server/review/fingerprint.js"

test("fingerprint is deterministic across irrelevant fields and whitespace", () => {
  const first = createReviewFingerprint({ id: 1, name: " Example   Service ", description: "Line one\r\nLine two", approved: false })
  const second = createReviewFingerprint({ id: 99, name: "Example Service", description: "Line one Line two", approved: true })
  assert.equal(first, second)
  assert.match(first, /^[0-9a-f]{64}$/)
})

test("fingerprint changes when review-relevant content changes", () => {
  const first = createReviewFingerprint({ name: "Example Service", website: "https://example.org" })
  const second = createReviewFingerprint({ name: "Example Service", website: "https://example.org/new" })
  assert.notEqual(first, second)
})

