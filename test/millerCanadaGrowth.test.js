import assert from "node:assert/strict"
import test from "node:test"

import growth from "../src/data/miller-canada-growth-2026-09-08.json" with { type: "json" }
import registry from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import { validateSharedResourceRegistry } from "../server/sharedResourceRegistry.js"

test("Canada growth records are verified practical pathways with distinct canonical identities", () => {
  assert.equal(growth.candidate_outcomes.accepted, 10)
  assert.equal(new Set(growth.records.map(record => record.canonical_resource_id)).size, growth.records.length)
  assert.ok(growth.records.every(record => record.project_visibility.includes("miller")))
  assert.ok(growth.records.every(record => record.website.startsWith("https://") && record.source.url.startsWith("https://")))
  assert.ok(growth.records.every(record => ["2026-09-08", "2026-09-09"].includes(record.last_verified_date)))
  assert.ok(growth.records.every(record => !Object.keys(record).some(key => /incident|finding|investigation|accountability|owner_review/i.test(key))))
})

test("Canada growth records project through the canonical shared registry", () => {
  assert.equal(validateSharedResourceRegistry(registry).valid, true)
  for (const record of growth.records) {
    const projected = registry.records.find(item => item.canonical_resource_id === record.canonical_resource_id)
    assert.ok(projected, `missing ${record.canonical_resource_id}`)
    assert.ok(projected.project_visibility.includes("miller"))
  }
  const indigenousNavigation = registry.records.find(item => item.canonical_resource_id === "miller_bc_interior_indigenous_patient_navigators")
  assert.deepEqual(indigenousNavigation.project_visibility, ["miller", "miller_north"])
  const parentPathways = ["miller_on_halton_mississauga_raam", "miller_mb_raam_digital_front_door", "miller_ns_outpatient_withdrawal_management"].map(id => registry.records.find(item => item.canonical_resource_id === id))
  assert.ok(parentPathways.every(record => record && !record.service_scope.physical_location && record.service_scope.scope_note.includes("not")))
  const tehn = registry.records.find(item => item.canonical_resource_id === "miller_on_tehn_mgh_raam")
  assert.equal(tehn.service_scope.physical_location.address, "825 Coxwell Avenue, H5")
  const anishnawbe = registry.records.find(item => item.canonical_resource_id === "miller_on_anishnawbe_health_toronto_mh_substance_supports")
  assert.deepEqual(anishnawbe.project_visibility, ["miller", "miller_north"])
  assert.match(anishnawbe.access, /self-refer/i)
})
