import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import sharedRegistry from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import { millerCanonicalPublicResources } from "../src/millerCanonicalPublicCatalog.js"
import { buildSharedCanonicalMillerResources } from "../src/millerPublicSearchResources.js"

const canonicalProjection = () => buildSharedCanonicalMillerResources(sharedRegistry.records, sharedRegistry.access_locations || [])

test("Master List is a direct, current public projection of the Canada-wide canonical registry", () => {
  const source = fs.readFileSync(new URL("../src/lists/MasterList.jsx", import.meta.url), "utf8")
  assert.match(source, /millerCanonicalPublicResources/)
  assert.doesNotMatch(source, /vancouver_resources_merged_updated/)
  assert.doesNotMatch(source, /buildMillerPublicationSafeResourceCorpus/)
  const resources = canonicalProjection()
  assert.deepEqual(millerCanonicalPublicResources.map(resource => resource.id), resources.map(resource => resource.id))
  assert.equal(resources.length, 1323)
  assert.equal(new Set(resources.map(resource => resource.id)).size, resources.length)
  assert.ok(resources.every(resource => resource.verification_status === "verified_active"))
  assert.ok(resources.every(resource => !Object.hasOwn(resource, "private_notes")))
  assert.match(fs.readFileSync(new URL("../src/lists/PreMadeLists.jsx", import.meta.url), "utf8"), /Master List/)
  assert.match(fs.readFileSync(new URL("../src/lists/PreMadeLists.jsx", import.meta.url), "utf8"), /slug === "master-list"/)
})

test("Master List combines keyword, city, category, clear, and zero-result filtering", () => {
  const source = fs.readFileSync(new URL("../src/lists/MasterList.jsx", import.meta.url), "utf8")
  for (const pattern of [/item\.name/, /item\.city/, /item\.category/, /item\.description/, /item\.population/, /query/, /city/, /category/, /Clear filters/, /No resources match those filters/]) assert.match(source, pattern)
  assert.match(source, /items\.length !== allResources\.length/)
  assert.doesNotMatch(source, /Strongest coverage is currently in British Columbia/)
  assert.match(source, /Curated pre-made lists remain separate/)
})
