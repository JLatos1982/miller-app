import test from "node:test"
import assert from "node:assert/strict"
import { safeEmailAddress, safeHttpUrl } from "../src/safeLinks.js"

test("public links allow HTTP(S) and reject active or malformed schemes", () => {
  assert.equal(safeHttpUrl("https://example.org/help"), "https://example.org/help")
  assert.equal(safeHttpUrl("javascript:alert(1)"), "")
  assert.equal(safeHttpUrl("data:text/html,<script>alert(1)</script>"), "")
  assert.equal(safeHttpUrl("not a URL"), "")
})

test("email links reject malformed values and header injection", () => {
  assert.equal(safeEmailAddress("help@example.org"), "help@example.org")
  assert.equal(safeEmailAddress("help@example.org\r\nBcc:bad@example.org"), "")
  assert.equal(safeEmailAddress("not-an-email"), "")
})
