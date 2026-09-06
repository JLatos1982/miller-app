import assert from "node:assert/strict"
import test from "node:test"

import funding from "../src/data/miller-funding-assistance-public-v1.json" with { type: "json" }
import supports from "../src/data/miller-practical-supports-public-v1.json" with { type: "json" }
import { relatedFundingRecords, relatedSupportCategories } from "../src/site/millerRelatedSupports.js"

test("related support categories are bounded navigation suggestions", () => {
  assert.deepEqual(relatedSupportCategories("housing"), ["income_benefits", "advocacy_navigation"])
  assert.deepEqual(relatedSupportCategories("identification"), ["income_benefits", "housing"])
  assert.equal(supports.records.every(record => relatedSupportCategories(record.category).length <= 2), true)
})
test("related funding stays current, bounded and purpose-based", () => {
  const housing = relatedFundingRecords(funding.records, "housing")
  assert.equal(housing.length, 2)
  assert.equal(housing.every(record => !["closed", "archived"].includes(record.status)), true)
  assert.equal(housing.some(record => record.name.includes("Security Deposit")), true)
  assert.equal(relatedFundingRecords(funding.records, "transportation", 4).some(record => record.name.includes("residential alcohol and drug treatment")), true)
})
