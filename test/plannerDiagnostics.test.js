import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { buildPlannerDiagnostic } from "../server/plannerDiagnostics.js"

const resource = (id, display_name = id) => ({ id, display_name, lifecycle_state: "active", editorial_status: "approved" })
test("diagnostic integrates audit to plan with compact claim/evidence trace and summary", () => {
  const result = buildPlannerDiagnostic({ resources: [resource("relationship"), resource("clean")], claims: [{ id: "claim", resource_id: "relationship", field_name: "location_occupancy", proposed_value: "100 Main", status: "observed" }], evidence: [{ id: "evidence", claim_id: "claim", source_url: "https://official.example", source_authority: 95, stale: false }], qc: [{ canonical_resource_id: "relationship", version: 1 }], matchCandidates: [{ left_resource_id: "relationship", right_resource_id: "clean", classification: "possible", decision: "pending" }] })
  assert.equal(result.summary.resources_inspected, 2)
  assert.equal(result.summary.total_tasks, 2)
  const task = result.tasks.find((item) => item.resource_id === "relationship")
  assert.equal(task.claim_id, "claim")
  assert.deepEqual(task.evidence_ids, ["evidence"])
  assert.equal(result.summary.resources_with_no_action, 0)
})
test("no-action and repeated no-gain results remain deterministic and non-executing", () => {
  const state = { resources: [resource("clean"), resource("retry")], researchItems: [{ resource_id: "retry", outcome: "failed" }, { resource_id: "retry", outcome: "insufficient" }] }
  const first = buildPlannerDiagnostic(state), second = buildPlannerDiagnostic(state)
  assert.deepEqual(first, second)
  assert.equal(first.summary.resources_with_no_action, 1)
  assert.equal(first.summary.human_review_tasks, 1)
  assert.equal(first.tasks[0].actionable, false)
})
test("admin diagnostic endpoint is protected, private, bounded, and read-only", () => {
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  const start = server.indexOf('app.get("/api/admin/evidence-gap-plan"')
  const end = server.indexOf('app.get("/api/admin/system-health"')
  const section = server.slice(start, end)
  assert.match(section, /requireAdmin/)
  assert.match(section, /loadPlannerDiagnosticState/)
  assert.match(section, /Cache-Control", "private, no-store/)
  assert.doesNotMatch(section, /\.insert\(|\.update\(|\.upsert\(|fetch\(|tavily|OpenAI|requestBcAddressGeocode|publish/)
})
