import test from "node:test"
import assert from "node:assert/strict"
import { capabilityGapsFromMaintenance, rankGrowth } from "../server/maintenanceCapabilityGaps.js"

test("repeated unmet mapping need has one stable capability gap", () => {
  const input = { growth_opportunities: [{ gap_type: "mapping_missing_geocoder_evidence", target_key: "resource:r", reason: "Coordinates need trusted evidence.", priority: 90 }], security: { items: [] } }
  const [first] = capabilityGapsFromMaintenance(input), [again] = capabilityGapsFromMaintenance(input)
  assert.equal(first.gap_fingerprint, again.gap_fingerprint)
  assert.equal(first.worker_candidates[0], "canonical_location_geocoder_review")
  assert.match(first.suggested_direction, /do not pin/i)
})

test("growth ranking is deterministic and risk lowers human-only work", () => {
  const ranked = rankGrowth([{ target_key: "human", priority: 90, recurrence_count: 3, safety_category: "human_review" }, { target_key: "safe", priority: 80, recurrence_count: 3, safety_category: "low", worker_candidates: ["worker"] }])
  assert.equal(ranked[0].target_key, "safe")
})
