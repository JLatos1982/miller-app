import assert from "node:assert/strict"
import test from "node:test"

import { buildSourceYieldDashboard, normalizeSourceYieldRow } from "../server/millerNorthSourceYield.js"

test("source-yield metrics remain transparent and denominator-aware", () => {
  const row = normalizeSourceYieldRow({ source_family: "regulator", documents_checked: 200, new_verified_records: 4, existing_incidents_strengthened: 2, duplicate_documents_suppressed: 8 })
  assert.equal(row.publishable_records_per_100_documents, 2)
  assert.equal(row.material_evidence_per_100_documents, 3)
  assert.equal(row.duplicates_suppressed, 8)
})

test("source-yield dashboard is private and sorts material yield deterministically", () => {
  const dashboard = buildSourceYieldDashboard([
    { source_family: "large", documents_checked: 100, new_verified_records: 1 },
    { source_family: "small", documents_checked: 10, new_verified_records: 1 },
  ], { generatedAt: "2026-09-07" })
  assert.equal(dashboard.publication_status, "private_owner_review_only")
  assert.deepEqual(dashboard.sources.map(row => row.source_family), ["small", "large"])
  assert.equal(dashboard.totals.documents_checked, 110)
})
