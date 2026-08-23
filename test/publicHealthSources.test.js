import test from "node:test"
import assert from "node:assert/strict"
import { PUBLIC_HEALTH_SOURCES, publicHealthSourceStatus } from "../server/publicHealthSources.js"

test("public-health registry contains only existing fixed sources", () => {
  assert.ok(PUBLIC_HEALTH_SOURCES.some((item) => item.id === "health_canada_drug_safety"))
  assert.ok(PUBLIC_HEALTH_SOURCES.every((item) => item.id && item.organization && item.lifecycle))
  assert.ok(PUBLIC_HEALTH_SOURCES.every((item) => typeof item.external_request_required === "boolean"))
})

test("source freshness is source-owned and never treats fixture contracts as live", () => {
  const now = Date.parse("2026-08-23T12:00:00Z"), statuses = publicHealthSourceStatus([{ sensor_id: "health_canada_drug_safety", health_state: "healthy", last_success_at: new Date(now - 72 * 3_600_000).toISOString() }], now)
  assert.equal(statuses.find((item) => item.id === "health_canada_drug_safety").status, "stale")
  assert.equal(statuses.find((item) => item.id === "bccdc_unregulated_drug").status, "fixture_validated_live_disabled")
})
