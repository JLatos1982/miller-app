import assert from "node:assert/strict"
import test from "node:test"

import rawResources from "../src/vancouver_resources_merged_updated.json" with { type: "json" }
import practicalSupports from "../src/data/miller-practical-supports-public-v1.json" with { type: "json" }
import millerFunding from "../src/data/miller-funding-assistance-public-v1.json" with { type: "json" }
import { isEmailResultEligible } from "../src/emailResultsApi.js"
import { stableCuratedResourceId } from "../src/map/mapChat.js"
import {
  buildMillerSpecializedSearchResources,
  mergeMillerSearchResources,
  millerResourceSearchText,
} from "../src/millerPublicSearchResources.js"
import { normalizedResourceRows } from "../src/resourceData.js"

const canonical = normalizedResourceRows(rawResources).map(resource => ({ ...resource, id: stableCuratedResourceId(resource) }))
const specialized = buildMillerSpecializedSearchResources(practicalSupports.records, millerFunding.records)
const resources = mergeMillerSearchResources(canonical, specialized)
const search = query => resources.filter(resource => millerResourceSearchText(resource).includes(query.toLowerCase()))

test("main Miller search projection includes current practical and funding records", () => {
  assert.equal(specialized.length, practicalSupports.records.length + millerFunding.records.length)
  assert.ok(search("training").some(resource => resource.name === "Skills Training for Employment Readiness directory"))
  assert.ok(search("funding").some(resource => resource.name === "Benefits Finder"))
  assert.ok(search("benefits").some(resource => resource.name === "Disability Alliance BC Direct Services"))
  assert.ok(search("transportation").some(resource => resource.name === "HandyDART and HandyCard"))
  assert.equal(search("bladerunners").filter(resource => resource.name === "BladeRunners").length, 1)
})

test("multi-purpose programs reconcile to one result and retain specialized-page paths", () => {
  const identification = resources.filter(resource => resource.name === "Identification Supplement")
  assert.equal(identification.length, 1)
  assert.deepEqual(identification[0].collectionLinks.map(link => link.href).sort(), ["/funding-assistance", "/practical-supports"])
  const practical = resources.find(resource => resource.name === "BladeRunners")
  assert.equal(practical.collectionLinks[0].href, "/practical-supports")
  assert.equal(isEmailResultEligible(practical), true)
  const funding = resources.find(resource => resource.name === "Benefits Finder")
  assert.equal(funding.collectionLinks[0].href, "/funding-assistance")
  assert.equal(isEmailResultEligible(funding), true)
})

test("specialized reconciliation preserves unrelated legacy Miller records", () => {
  const original = canonical.find(resource => !specialized.some(candidate => candidate.id === resource.id))
  const after = resources.find(resource => resource.id === original.id)
  assert.equal(after.name, original.name)
  assert.equal(after.website, original.website)
  assert.equal(after.description, original.description)
})
