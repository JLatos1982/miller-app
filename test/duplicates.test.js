import test from "node:test"
import assert from "node:assert/strict"
import { classifyDeterministicDuplicate, normalizeUrl } from "../server/review/duplicates.js"

test("normalizes URLs and removes common tracking data", () => {
  assert.equal(
    normalizeUrl("HTTPS://www.Example.org/program/?utm_source=test&b=2&a=1#team"),
    "example.org/program?a=1&b=2"
  )
})

test("identical normalized URLs are exact duplicates", () => {
  const match = classifyDeterministicDuplicate(
    { id: 1, name: "Service", website: "https://example.org/help/" },
    { id: 2, name: "Other title", website: "http://www.example.org/help" }
  )
  assert.equal(match.match_type, "exact_duplicate")
  assert.equal(match.confidence, 1)
})

test("same organization with different programs stays distinct", () => {
  const match = classifyDeterministicDuplicate(
    { id: 1, name: "Youth Program", organization: "Example Health Society" },
    { id: 2, name: "Adult Program", organization: "Example Health" }
  )
  assert.equal(match.match_type, "same_organization_different_program")
})

