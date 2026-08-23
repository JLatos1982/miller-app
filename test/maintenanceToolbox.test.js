import test from "node:test"
import assert from "node:assert/strict"
import { buildMaintenanceToolbox, createInitialMachineQcHealing, mapReadiness, resourceFreshnessOpportunity } from "../server/maintenanceToolbox.js"

const base = (overrides = {}) => ({
  resource: { id: "resource-1", display_name: "Community Service", lifecycle_state: "active", editorial_status: "approved" },
  occupancyClaim: { id: "claim-1", proposed_value: "100 Main St" }, occupancy_binding: null,
  geocoderEvidence: { id: "geo-1", source_type: "bc_geocoder" }, evidence: [], qc: null, locations: [], ...overrides,
})

test("map readiness separates deterministic QC healing from publication", () => {
  const result = mapReadiness(base())
  assert.equal(result.state, "ready_to_heal")
  assert.equal(result.automatic_action, "create_initial_machine_location_qc")
})

test("missing geocoder becomes near-ready research and never healing", () => {
  const toolbox = buildMaintenanceToolbox({ mapContexts: [base({ geocoderEvidence: null })] })
  assert.equal(toolbox.healing_needs.length, 0)
  assert.equal(toolbox.readiness[0].state, "near_ready")
  assert.equal(toolbox.research_handoffs[0].recommended_worker_class, "canonical_location_geocoder_review")
  assert.equal(toolbox.research_handoffs[0].automatic_execution, false)
  assert.equal(toolbox.capability_gaps[0].problem_class, "mapping_missing_geocoder_evidence")
})

test("stale private Security Pulse is a bounded bookkeeping repair only", () => {
  const toolbox = buildMaintenanceToolbox({ securityPulse: { id: "pulse", status: "running", started_at: "2026-08-23T11:40:00Z" } }, new Date("2026-08-23T12:00:00Z"))
  assert.equal(toolbox.healing_needs[0].action_id, "recover_stale_security_pulse_run")
  assert.equal(toolbox.security.mutation_scope, "finalize_private_stale_run_only")
})

test("conflicting and sensitive locations fail closed", () => {
  const conflict = mapReadiness(base({ occupancyClaim: null, occupancy_binding: "ambiguous_or_conflicting_occupancy_claim" }))
  const sensitive = mapReadiness(base({ resource: { ...base().resource, display_name: "Confidential Safe Home" } }))
  assert.equal(conflict.state, "human_review_required")
  assert.equal(sensitive.reason_code, "sensitive_or_protected")
})

test("freshness uses project field thresholds and never says stale is wrong", () => {
  const stale = resourceFreshnessOpportunity({ field: "website", resource_id: "r", last_verified_at: "2025-01-01", source_still_exists: true }, new Date("2026-08-22"))
  const current = resourceFreshnessOpportunity({ field: "address", resource_id: "r", last_verified_at: "2026-08-01", source_still_exists: true }, new Date("2026-08-22"))
  assert.match(stale.reason, /stale does not mean incorrect/i)
  assert.equal(current, null)
})

test("machine QC healing independently verifies no location or public-map mutation", async () => {
  let reads = 0
  const result = await createInitialMachineQcHealing({
    item: base(), actorId: "actor", db: { rpc: async (name, args) => { assert.equal(name, "create_machine_initial_location_qc_from_evidence"); assert.equal(args.p_geocoder_evidence_id, "geo-1"); return { data: {}, error: null } } },
    loadState: async () => ++reads === 1 ? { qc: null, location_count: 0, public_map: false } : { qc: { origin: "machine_initial", decision: "manual_review" }, location_count: 0, public_map: false },
  })
  assert.equal(result.verified, true)
  assert.equal(result.classification, "improved")
})

test("machine QC verification fails closed on unexpected location mutation", async () => {
  let reads = 0
  const result = await createInitialMachineQcHealing({ item: base(), actorId: "actor", db: { rpc: async () => ({ data: {}, error: null }) }, loadState: async () => ++reads === 1 ? { qc: null, location_count: 0, public_map: false } : { qc: { origin: "machine_initial", decision: "manual_review" }, location_count: 1, public_map: false } })
  assert.equal(result.verified, false)
})
