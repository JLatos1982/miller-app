import test from "node:test"
import assert from "node:assert/strict"
import { buildSecurityReview, DEFENSIVE_TOOLS, evaluateOperationalHeartbeat, HEARTBEAT_POLICY } from "../server/operationsHeartbeat.js"

test("heartbeat is cheap, current-state only, and does not claim scheduling", () => {
  const heartbeat = evaluateOperationalHeartbeat({ databaseReachable: true, security: { status: "healthy" }, quietMaintenanceEnabled: false, workingMemory: 4, sensors: [{ mode: "fixture_validated_live_disabled" }] })
  assert.equal(heartbeat.status, "healthy")
  assert.equal(heartbeat.scheduling, "not_enabled")
  assert.deepEqual(heartbeat.cost, { database_queries: 0, external_requests: 0, historical_scans: 0, llm_requests: 0 })
  assert.equal(HEARTBEAT_POLICY.targetRuntimeMs, 250)
})

test("security review preserves defensive effectiveness and never asserts compromise", () => {
  const review = buildSecurityReview({ operations: { findings: [{ code: "protected_access_rejected", severity: "low", confidence: .9, observation: "3 protected requests were rejected.", protection: "Admin authorization rejected the requests.", recommendation: "No blocking action." }] }, posture: { checks: [] } })
  assert.equal(review.findings[0].defensive_result, "authorization_denied")
  assert.match(review.note, /do not assert compromise/)
  assert.equal(review.external_requests, 0)
})

test("defensive registry is controlled and contains no arbitrary execution capability", () => {
  assert.ok(DEFENSIVE_TOOLS.every((tool) => tool.class !== "shell" && tool.active))
  assert.ok(DEFENSIVE_TOOLS.some((tool) => tool.id === "attachment_quarantine"))
})
