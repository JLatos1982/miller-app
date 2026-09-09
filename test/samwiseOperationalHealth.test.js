import assert from "node:assert/strict"
import test from "node:test"

import { buildOwnerStatusV2, classifyListenerHealth, evaluateObservationFreshness, reconcileMillerHealth, reconcileOperationalComponent, reconcileRequestLifecycle, reconcileReviewItems, reconcileWarningLifecycle } from "../server/samwiseOperationalHealth.js"

const now = new Date("2026-09-09T06:40:00.000Z")

test("freshness labels an old observation stale instead of degraded", () => {
  const result = evaluateObservationFreshness({ component: "igor", source_id: "worker-state", authority: "authoritative", observed_at: "2026-09-09T05:00:00.000Z", stale_after: "2026-09-09T06:00:00.000Z", state_at_observation: "healthy" }, now)
  assert.equal(result.state, "stale")
  assert.equal(result.state_at_observation, "healthy")
})

test("newer authoritative health supersedes historical failure without deleting it", () => {
  const result = reconcileOperationalComponent({ component: "farm", now, observations: [
    { source_id: "old-run", authority: "authoritative", observed_at: "2026-09-09T04:00:00.000Z", stale_after: "2026-09-10T04:00:00.000Z", state_at_observation: "degraded" },
    { source_id: "current-run", authority: "authoritative", observed_at: "2026-09-09T06:30:00.000Z", stale_after: "2026-09-10T06:30:00.000Z", state_at_observation: "healthy" },
  ] })
  assert.equal(result.state, "healthy")
  assert.equal(result.recovered, true)
  assert.equal(result.last_failure_at, "2026-09-09T04:00:00.000Z")
})

test("healthy Miller public service is not degraded by an unavailable internal observer", () => {
  const result = reconcileMillerHealth({ now, publicObservations: [{ source_id: "public-health", authority: "authoritative", observed_at: "2026-09-09T06:37:43.000Z", stale_after: "2026-09-09T06:52:43.000Z", state_at_observation: "healthy" }], mobileApiObservations: [{ source_id: "mobile-about", authority: "authoritative", observed_at: "2026-09-09T06:38:02.000Z", stale_after: "2026-09-09T06:53:02.000Z", state_at_observation: "healthy" }], internalObservabilityObservations: [{ source_id: "samwise-status", authority: "cached", observed_at: "2026-09-09T05:00:00.000Z", stale_after: "2026-09-09T06:00:00.000Z", state_at_observation: "degraded" }] })
  assert.equal(result.state, "healthy")
  assert.equal(result.internal_observability.state, "stale")
})

test("warning lifecycle resolves only with evidence and otherwise becomes stale", () => {
  const stale = reconcileWarningLifecycle({ warning: { warning_id: "w1", lifecycle: "active", first_seen: "2026-09-01T00:00:00.000Z", last_seen: "2026-09-01T00:00:00.000Z", stale_after: "2026-09-02T00:00:00.000Z" }, now })
  const resolved = reconcileWarningLifecycle({ warning: { warning_id: "w2", lifecycle: "active", first_seen: "2026-09-01T00:00:00.000Z", resolution_evidence: true }, now })
  assert.deepEqual([stale.lifecycle, stale.still_active], ["stale", false])
  assert.deepEqual([resolved.lifecycle, resolved.still_active], ["resolved", false])
})

test("expired control requests are derived as expired without inventing a result code", () => {
  const result = reconcileRequestLifecycle({ request: { request_id: "old-control", state: "queued", requested_at: "2026-08-01T00:00:00.000Z" }, now, defaultTtlMs: 24 * 60 * 60 * 1000 })
  assert.equal(result.state, "expired")
  assert.equal(result.resolution_reason, "request_expired_without_processing")
  assert.equal(Object.hasOwn(result, "result_code"), false)
})

test("review reconciliation separates owner decisions from additional research", () => {
  const result = reconcileReviewItems([{ candidate_id: "a", state: "pending" }, { candidate_id: "b", state: "needs_more_research" }, { candidate_id: "c", state: "superseded" }])
  assert.equal(result.owner_attention_count, 1)
  assert.equal(result.research_follow_up_count, 1)
})

test("listener cadence recognizes disabled and overdue states without false failure", () => {
  const disabled = classifyListenerHealth({ listener: { listener_id: "disabled", enabled: false, schedule: { kind: "interval", days: 7 } }, now })
  const overdue = classifyListenerHealth({ listener: { listener_id: "late", enabled: true, schedule: { kind: "interval", days: 7 } }, current: { last_successful_at: "2026-08-01T00:00:00.000Z", next_run_at: "2026-08-08T00:00:00.000Z", last_status: "completed" }, now })
  assert.equal(disabled.listener_state, "disabled")
  assert.equal(overdue.listener_state, "overdue")
  assert.equal(overdue.state, "stale")
})

test("owner status separates actionable trouble from stale or unknown observability", () => {
  const summary = buildOwnerStatusV2({ now, components: [{ component: "miller", state: "healthy", confidence: "high", reason: "live" }, { component: "igor", state: "stale", confidence: "high", reason: "old" }, { component: "security", state: "attention", confidence: "moderate", reason: "review" }], warnings: [], review: { owner_attention_count: 1, research_follow_up_count: 2 } })
  assert.equal(summary.overall_state, "attention")
  assert.equal(summary.current_issues.length, 1)
  assert.equal(summary.stale_or_unknown.length, 1)
})
