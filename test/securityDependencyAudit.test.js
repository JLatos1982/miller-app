import test from "node:test"
import assert from "node:assert/strict"
import { runDependencyAdvisoryAudit } from "../server/securityDependencyAudit.js"

test("dependency audit uses fixed npm audit arguments and normalizes findings", async () => {
  let call = null
  const result = await runDependencyAdvisoryAudit({ root: "/repo", execute: async (...args) => { call = args; return { stdout: JSON.stringify({ vulnerabilities: { example: { severity: "high", via: [{ url: "https://example.invalid/advisory", title: "CVE-0000" }] } } }) } } })
  assert.deepEqual(call.slice(0, 2), ["npm", ["audit", "--json"]])
  assert.equal(call[2].shell, false)
  assert.equal(result.completeness, "complete")
  assert.equal(result.findings[0].subsystem, "dependency_posture")
})

test("dependency audit failure is incomplete and cannot resolve prior findings", async () => {
  const result = await runDependencyAdvisoryAudit({ root: "/repo", execute: async () => { throw new Error("offline") } })
  assert.equal(result.completeness, "unavailable")
  assert.equal(result.findings.length, 0)
})
