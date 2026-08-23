import test from "node:test"
import assert from "node:assert/strict"
import { explainMaintenanceIntent, maintenanceAdminSummary, routeMaintenanceIntent } from "../server/maintenanceAdmin.js"

test("fixed maintenance questions route without accepting arbitrary commands", () => {
  assert.equal(routeMaintenanceIntent("Which resources are almost ready to map?"), "map_readiness")
  assert.equal(routeMaintenanceIntent("What resource information is stale?"), "resource_freshness")
  assert.equal(routeMaintenanceIntent("What tools are you missing?"), "capability_gaps")
  assert.equal(routeMaintenanceIntent("update this address to 1 Main Street"), null)
  assert.equal(routeMaintenanceIntent("run arbitrary SQL"), null)
})

test("admin summary separates verified work, research, freshness, and ineffective outcomes", () => {
  const summary = maintenanceAdminSummary({ outcomes: [{ id: "ok", verification: "passed" }, { id: "bad", verification: "failed" }], opportunities: [{ id: "map", gap_type: "mapping_missing_geocoder_evidence", state: "candidate" }, { id: "stale", gap_type: "stale_website_evidence", state: "candidate" }], capability_gaps: [{ id: "gap", safety_category: "human_review", status: "candidate" }] })
  assert.equal(summary.almost_map_ready, 1)
  assert.equal(summary.stale_resource_information, 1)
  assert.equal(summary.verified_outcomes.length, 1)
  assert.equal(summary.ineffective_outcomes.length, 1)
  assert.match(explainMaintenanceIntent("resource_freshness", summary).text, /Stale does not mean incorrect/)
  assert.match(explainMaintenanceIntent("capability_gaps", summary).text, /development recommendations/)
})
