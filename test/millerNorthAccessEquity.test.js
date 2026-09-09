import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("Access & Equity is a public methodology surface with no private-record import", () => {
  const page = readFileSync(new URL("../src/site/MillerNorthAccessEquity.jsx", import.meta.url), "utf8")
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  assert.match(page, /No structural-healthcare finding is displayed here until it has passed source, method, privacy and owner-publication review/)
  assert.match(page, /does not expose private research or data-request planning/)
  assert.match(page, /A measurable disparity does not by itself establish discrimination or its cause/)
  assert.match(page, /Suggested follow-up/)
  assert.match(page, /None are displayed until that review is complete/)
  assert.doesNotMatch(page, /artifacts\/samwise|saskatchewan-governance-outreach|request_draft|private_record/i)
  assert.match(app, /indigenous-healthcare-evidence\/access-equity/)
})
