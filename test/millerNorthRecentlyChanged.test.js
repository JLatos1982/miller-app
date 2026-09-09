import assert from "node:assert/strict"
import test from "node:test"

import accessEquity from "../src/data/miller-north-access-equity-public-v1.json" with { type: "json" }
import projection from "../src/data/miller-north-recently-changed-public-v1.json" with { type: "json" }
import { MATERIAL_CHANGE_TYPES, materialChangeLabel, validateMillerNorthRecentlyChangedProjection } from "../server/millerNorthRecentlyChanged.js"

const publicIds = [...accessEquity.findings, ...accessEquity.suggested_follow_ups].map(item => item.public_id)

test("Recently Changed contains only material updates tied to approved public records", () => {
  assert.deepEqual(validateMillerNorthRecentlyChangedProjection(projection, { publicRecordIds: publicIds }), { valid: true, items: 4, newest_material_change_at: "2026-09-09" })
  assert.equal(projection.items.every(item => MATERIAL_CHANGE_TYPES.includes(item.material_change_type) && materialChangeLabel(item.material_change_type)), true)
  assert.equal(projection.items.every(item => publicIds.includes(item.public_record_id)), true)
})

test("Recently Changed rejects routine or private workflow content", () => {
  const privateProjection = structuredClone(projection)
  privateProjection.items[0].what_changed = "Owner review refreshed after reindexing."
  assert.throws(() => validateMillerNorthRecentlyChangedProjection(privateProjection, { publicRecordIds: publicIds }), /private_or_technical/)
  const unapprovedProjection = structuredClone(projection)
  unapprovedProjection.items[0].public_record_id = "held-saskatchewan-mortality"
  assert.throws(() => validateMillerNorthRecentlyChangedProjection(unapprovedProjection, { publicRecordIds: publicIds }), /record_not_public/)
})
