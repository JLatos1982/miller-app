import test from "node:test"
import assert from "node:assert/strict"
import { buildCanonicalResearchQueue, canonicalResearchReason } from "../server/canonicalResearchRunner.js"

const active = (name) => ({ display_name: name, lifecycle_state: "active", editorial_status: "approved" })
test("canonical research queue is independent of legacy inventory and fails closed for protected records", () => {
  assert.equal(canonicalResearchReason({ resource: active("OAT clinic"), address: "100 Main St", hasUsableOccupancy: false }), "missing_authoritative_occupancy")
  assert.equal(canonicalResearchReason({ resource: active("Transition House"), address: "100 Main St" }), "sensitive_or_protected")
  assert.equal(canonicalResearchReason({ resource: active("Specific program"), address: "100 Main St", programSiteConfirmed: false }), "program_site_not_confirmed")
  const queue = buildCanonicalResearchQueue([{ resource: active("Community service"), address: "100 Main St" }, { resource: active("OAT clinic"), address: "100 Main St" }, { resource: active("Safe home"), address: "100 Main St" }])
  assert.deepEqual(queue.map((item) => item.resource.display_name), ["OAT clinic", "Community service"])
})
