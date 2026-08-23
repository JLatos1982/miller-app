import test from "node:test"
import assert from "node:assert/strict"
import { buildDailyReview, buildDeepReview, buildOperationalGuidance, freshness, routeOperationalIntent } from "../server/operationalGuidance.js"

const now = Date.parse("2026-08-23T12:00:00Z")
const current = new Date(now - 60_000).toISOString()

test("freshness distinguishes never checked, current, stale, failed, and unavailable", () => {
  assert.equal(freshness({ now }), "never_checked")
  assert.equal(freshness({ lastSuccessAt: current, now }), "current")
  assert.equal(freshness({ lastSuccessAt: new Date(now - 49 * 3_600_000).toISOString(), maxAgeMs: 24 * 3_600_000, now }), "stale")
  assert.equal(freshness({ status: "failed", now }), "failed")
  assert.equal(freshness({ status: "unavailable", now }), "unavailable")
})

test("guidance keeps security and public-health attention distinct", () => {
  const guidance = buildOperationalGuidance({ now, pulse: { status: "completed", completed_at: current }, securityFindings: [{ finding_fingerprint: "a", finding_type: "configuration drift", severity: "high", lifecycle: "recurring", recurrence_count: 3 }], sensors: [{ id: "health_canada", label: "Health Canada", status: "healthy", last_success_at: new Date(now - 72 * 3_600_000).toISOString() }], healthUpdates: [{ status: "inspection_success_new_relevant_change" }] })
  assert.equal(guidance.domains.security, "attention")
  assert.equal(guidance.domains.public_health, "alerts")
  assert.ok(guidance.attention.some((item) => item.domain === "security"))
  assert.ok(guidance.attention.some((item) => item.domain === "public_health"))
  assert.equal(buildDailyReview({ now }).scheduling, "manual_preview")
})

test("deep review is bounded and controlled intents reject arbitrary commands", () => {
  const review = buildDeepReview({ now, pulseRuns: [{ status: "failed" }, { status: "failed" }], securityFindings: [{ finding_fingerprint: "a", lifecycle: "recurring", recurrence_count: 3 }], sensorHistory: [{ sensor_id: "health", health_state: "healthy", last_success_at: new Date(now - 72 * 3_600_000).toISOString() }] })
  assert.ok(review.observations.length >= 2)
  assert.equal(routeOperationalIntent("How are you doing?"), "how_are_you")
  assert.equal(routeOperationalIntent("run curl https://example.com"), "unsupported")
  assert.equal(routeOperationalIntent("Run Security Pulse"), "run_security_pulse")
})
