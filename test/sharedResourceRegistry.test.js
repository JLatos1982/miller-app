import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import registry from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import { toMillerNorthSharedEmailResult } from "../src/millerNorthPublicSupportEmail.js"
import { projectSharedResources, validateSharedResourceRegistry } from "../server/sharedResourceRegistry.js"

test("shared public registry validates and preserves distinct project projections", () => {
  assert.deepEqual(validateSharedResourceRegistry(registry), { valid: true, total: 91, miller_only: 47, miller_north_only: 35, both: 9 })
  assert.equal(projectSharedResources(registry, "miller").length, 56)
  assert.equal(projectSharedResources(registry, "miller_north").length, 44)
})

test("known cross-project programs share one canonical record while program-level services stay distinct", () => {
  const transport = registry.records.find(record => record.program_name === "Medical Transportation Benefit")
  assert.deepEqual(transport.project_visibility, ["miller", "miller_north"])
  assert.ok(transport.source_record_ids.length >= 2)
  const rentBanks = registry.records.filter(record => /Rent Bank/.test(record.program_name))
  assert.ok(rentBanks.length >= 4)
  const counsellingBenefit = registry.records.find(record => record.canonical_resource_id === "shared_isc_nihb_mental_health_counselling")
  assert.equal(counsellingBenefit.record_type, "funding")
  assert.equal(counsellingBenefit.funding.status, "recurring")
})

test("Supports & Funding UI consumes the shared projection and exposes no private workflow fields", () => {
  const page = readFileSync(new URL("../src/site/MillerNorthFirstNationsSupports.jsx", import.meta.url), "utf8")
  assert.match(page, /miller-shared-resource-registry-v1\.json/)
  assert.match(page, /Supports &amp; Funding/)
  assert.match(page, /aria-label="Supports and Funding filters"/)
  assert.doesNotMatch(page, /owner_review|private_notes|candidate_notes/)
  assert.doesNotMatch(page, /shared publication-safe resource registry|One resource foundation/)
})

test("every North projection record maps to a public email identifier", () => {
  const records = projectSharedResources(registry, "miller_north")
  const emailRecords = records.map(toMillerNorthSharedEmailResult)
  assert.equal(emailRecords.filter(Boolean).length, records.length)
  assert.equal(new Set(emailRecords.map(record => record.id)).size, records.length)
  assert.ok(emailRecords.every(record => record.approved && record.website.startsWith("https://")))
  assert.equal(emailRecords.find(record => record.id === "support:north:shared_isc_nihb_mental_health_counselling").kind, "funding")
})
