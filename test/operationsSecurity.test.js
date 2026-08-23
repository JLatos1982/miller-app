import test from "node:test"
import assert from "node:assert/strict"
import { clearOperationObservationsForTests, operationsSnapshot, recordOperation, securityPosture } from "../server/operationsSecurity.js"

test("operations telemetry is aggregate-only and never retains visitor identifiers or request content", () => {
  clearOperationObservationsForTests()
  recordOperation({ path: "/api/admin/control-room", status: 403, durationMs: 12, now: Date.parse("2026-08-22T12:00:00Z") })
  recordOperation({ path: "/api/admin/control-room", status: 403, durationMs: 10, now: Date.parse("2026-08-22T12:01:00Z") })
  recordOperation({ path: "/api/admin/control-room", status: 403, durationMs: 8, now: Date.parse("2026-08-22T12:02:00Z") })
  const report = operationsSnapshot({ siteEvents: [{ event_type: "page_view", created_at: "2026-08-22T10:00:00Z" }, { event_type: "search", created_at: "2026-08-22T11:00:00Z" }], now: Date.parse("2026-08-22T13:00:00Z") })
  assert.equal(report.activity.visits_today, 1)
  assert.equal(report.activity.searches_today, 1)
  assert.equal(report.runtime.rejected_protected_requests, 3)
  assert.match(report.findings[0].observation, /rejected/)
  assert.doesNotMatch(JSON.stringify(report.recent_buckets), /ip|session|authorization|body|user-agent/i)
})

test("security posture is deterministic and distinguishes passed controls from review", () => {
  const healthy = securityPosture()
  assert.equal(healthy.status, "healthy")
  assert.equal(healthy.checks.every((item) => item.status === "pass"), true)
  const review = securityPosture({ privateInsights: false })
  assert.equal(review.status, "review_needed")
  assert.equal(review.checks.find((item) => item.id === "private_insights").status, "review_needed")
})
