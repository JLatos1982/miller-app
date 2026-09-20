import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"

import registry from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import { buildSharedCanonicalMillerResources, millerResourceSearchText } from "../src/millerPublicSearchResources.js"
import { validateSharedResourceRegistry } from "../server/sharedResourceRegistry.js"

const registryPath = new URL("../src/data/miller-shared-resource-registry-v1.json", import.meta.url)

test("Canada-wide public registry is the approved 1361/612 release artifact", () => {
  const hash = createHash("sha256").update(readFileSync(registryPath)).digest("hex")
  assert.equal(hash, "1a68a2769b2afc475b2fa1ba8f207328945af450af1c2177541a18172198a27f")
  assert.equal(registry.records.length, 1361)
  assert.equal(registry.access_locations.length, 612)
  assert.equal(validateSharedResourceRegistry(registry).valid, true)
})

test("Quebec remains one bilingual canonical layer with public access semantics", () => {
  const resources = buildSharedCanonicalMillerResources(registry.records, registry.access_locations).filter(resource => resource.province === "Quebec")
  assert.equal(resources.length, 298)
  assert.equal(registry.access_locations.filter(location => location.province === "Quebec").length, 172)
  for (const term of ["dépendance", "addiction", "itinérance", "homelessness", "transport adapté", "adapted transportation"]) {
    assert.ok(resources.some(resource => millerResourceSearchText(resource).includes(term)), term)
  }
  const mobile = resources.find(resource => resource.name === "Arrimage jeunesse")
  assert.ok(mobile)
  assert.equal(mobile.accessLocations.length, 0)
})
