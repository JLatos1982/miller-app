import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { treaty6BusinessesPublicV1 as directory } from "../src/data/treaty6-businesses-public-v1.js"
import { visibleCurrentOpportunities } from "../src/site/treaty6BusinessesPublic.js"

test("public directory contains exactly the verified, unique business projection", () => {
  assert.equal(directory.verifiedBusinessCount, 26)
  assert.equal(directory.businesses.length, 26)
  assert.equal(new Set(directory.businesses.map(item => item.name)).size, 26)
  assert.ok(directory.businesses.every(item => /^Nation-(owned|affiliated) business /.test(item.relationship)))
})

test("every public card has categories and safe public links", () => {
  assert.ok(directory.businesses.every(item => item.categories.length > 0 && item.website.startsWith("https://") && item.source.startsWith("https://")))
  assert.ok(directory.businesses.some(item => item.categories.includes("Construction")))
  assert.ok(directory.businesses.some(item => item.categories.includes("Environmental")))
})

test("only current contract notices could be rendered; RFIs and expired notices stay out", () => {
  const now = new Date("2026-09-21T12:00:00.000Z")
  const visible = visibleCurrentOpportunities([
    { id: "open", status: "CURRENT_OPEN", procurementType: "RFP", closingDate: "2026-10-01" },
    { id: "rfi", status: "CURRENT_OPEN", procurementType: "RFI", closingDate: "2027-03-31" },
    { id: "expired", status: "CURRENT_OPEN", procurementType: "RFP", closingDate: "2026-09-01" },
  ], now)
  assert.deepEqual(visible.map(item => item.id), ["open"])
})

test("published directory source has no private intelligence fields or internal paths", () => {
  const serialized = JSON.stringify(directory)
  assert.doesNotMatch(serialized, /supplier_id|evidence_hash|match_score|private_notes|josh|mr\. liu|artifacts\//i)
  const page = readFileSync(new URL("../src/site/Treaty6Businesses.jsx", import.meta.url), "utf8")
  assert.doesNotMatch(page, /watchlist|buyer_watch|supplier_paths|procurement vehicle|controlled goods/i)
})
