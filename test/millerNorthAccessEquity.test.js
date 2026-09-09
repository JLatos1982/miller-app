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
  assert.match(page, /ACCESS_EQUITY_PUBLIC_PROJECTION/)
  assert.match(page, /What this does not establish/)
  assert.match(page, /What institutions did/)
  assert.match(page, /Implementation and effectiveness are different questions/)
  assert.doesNotMatch(page, /artifacts\/samwise|saskatchewan-governance-outreach|request_draft|private_record/i)
  assert.match(app, /indigenous-healthcare-evidence\/access-equity/)
})

test("Access & Equity public projection contains only the approved first release", () => {
  const projection = readFileSync(new URL("../src/site/accessEquityPublicProjection.js", import.meta.url), "utf8")
  const publicData = JSON.parse(readFileSync(new URL("../src/data/miller-north-access-equity-public-v1.json", import.meta.url), "utf8"))
  assert.match(projection, /miller-north-access-equity-public-v1\.json/)
  assert.equal(publicData.findings.length, 4)
  assert.equal(publicData.suggested_follow_ups.length, 4)
  assert.deepEqual(publicData.findings.map(item => item.public_id).sort(), [
    "alberta-documented-indigenous-primary-care-barriers",
    "alberta-indigenous-primary-care-navigation-response",
    "bc-first-nations-led-primary-care-implementation-2025",
    "bc-first-nations-primary-care-attachment-2017-18",
  ])
  assert.ok(publicData.suggested_follow_ups.every(item => item.status === "watching_for_public_update"))
  assert.doesNotMatch(JSON.stringify(publicData), /opioid.toxicity mortality|94\.6 per 100,000|owner_review|private_research|request_draft/i)
  assert.doesNotMatch(projection, /owner_review|private_research|artifacts\/samwise|request_draft/i)
})
