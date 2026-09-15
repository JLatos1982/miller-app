import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import rawResources from "../src/vancouver_resources_merged_updated.json" with { type: "json" }
import practicalSupports from "../src/data/miller-practical-supports-public-v1.json" with { type: "json" }
import funding from "../src/data/miller-funding-assistance-public-v1.json" with { type: "json" }
import sharedRegistry from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import { stableCuratedResourceId } from "../src/map/mapChat.js"
import { normalizedResourceRows } from "../src/resourceData.js"
import { buildMillerPublicationSafeResourceCorpus } from "../src/millerPublicSearchResources.js"

const corpus = () => buildMillerPublicationSafeResourceCorpus({
  canonicalResources: normalizedResourceRows(rawResources).map(resource => ({ ...resource, id: stableCuratedResourceId(resource) })),
  practicalRecords: practicalSupports.records,
  fundingRecords: funding.records,
  sharedRecords: sharedRegistry.records,
  sharedAccessLocations: sharedRegistry.access_locations || [],
})

test("Master List consumes the shared publication-safe corpus, including practical, funding, and shared canonical records", () => {
  const source = fs.readFileSync(new URL("../src/lists/MasterList.jsx", import.meta.url), "utf8")
  assert.match(source, /buildMillerPublicationSafeResourceCorpus/)
  assert.match(source, /sharedResourceRegistry\.records/)
  const resources = corpus()
  for (const name of ["Creekside Withdrawal Management Centre", "BladeRunners", "Benefits Finder"]) assert.equal(resources.filter(resource => resource.name === name).length, 1)
  const bladeRunners = resources.find(resource => resource.name === "BladeRunners")
  assert.equal(bladeRunners.collectionLinks[0].href, "/practical-supports")
  assert.ok(bladeRunners.id)
  assert.ok(!Object.hasOwn(bladeRunners, "private_notes"))
  assert.equal(resources.length, 897)
  assert.equal(new Set(resources.map(resource => resource.id)).size, resources.length)
  assert.match(fs.readFileSync(new URL("../src/lists/PreMadeLists.jsx", import.meta.url), "utf8"), /Master List/)
  assert.match(fs.readFileSync(new URL("../src/lists/PreMadeLists.jsx", import.meta.url), "utf8"), /slug === "master-list"/)
})

test("Master List combines keyword, city, category, clear, and zero-result filtering", () => {
  const source = fs.readFileSync(new URL("../src/lists/MasterList.jsx", import.meta.url), "utf8")
  for (const pattern of [/item\.name/, /item\.city/, /item\.category/, /item\.description/, /item\.population/, /query/, /city/, /category/, /Clear filters/, /No resources match those filters/]) assert.match(source, pattern)
  assert.match(source, /items\.length !== allResources\.length/)
  assert.doesNotMatch(source, /570 resources/)
  assert.match(source, /Curated pre-made lists remain separate/)
})
