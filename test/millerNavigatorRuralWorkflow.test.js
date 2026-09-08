import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import test from "node:test"

test("rural Navigator benchmark checks five priority seams without false local claims", () => {
  const output = execFileSync(process.execPath, ["scripts/benchmark-miller-navigator-rural.mjs"], { encoding: "utf8" })
  const report = JSON.parse(output)
  assert.equal(report.summary.scenarios, 5)
  assert.equal(report.summary.unsupported_claim_failures, 0)
  assert.equal(report.summary.incorrect_local_facility_claims, 0)
  assert.ok(report.scenarios.every(row => row.checks.practical_boundary))
  assert.equal(report.scenarios.find(row => row.id === "haida_gwaii_treatment").location, "Haida Gwaii")
  assert.equal(report.scenarios.find(row => row.id === "port_hardy_withdrawal_transport").checks.transportation_recognition, true)
})
