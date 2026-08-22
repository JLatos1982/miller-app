import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { buildImmuneSystemHealth, systemSecurityAudit } from "../server/immuneSystem.js"

const resource = { id: "r1", display_name: "Public clinic", lifecycle_state: "active", editorial_status: "approved" }
test("malicious and impossible quarantine states are deterministic high-severity findings", () => {
  const findings = systemSecurityAudit({ attachments: [{ id: "mal", status: "rejected" }, { id: "broken", status: "available" }], scanDecisions: [{ attachment_id: "mal", decision: "malicious", actor_type: "scanner_service", created_at: "2026-01-01" }], configuration: { admin_allowlist_configured: true, attachment_quarantine_enforced: true } })
  assert.deepEqual(findings.map((item) => [item.finding_type, item.severity]), [["attachment_available_without_clean_scan", "critical"], ["malicious_attachment_detected", "critical"]])
  assert.equal(findings.some((item) => /scan_reference|secret|content/i.test(JSON.stringify(item))), false)
})
test("failed and pending scans fail closed while a clean state causes no alarm", () => {
  const failed = systemSecurityAudit({ attachments: [{ id: "f", status: "pending_scan" }], scanDecisions: [{ attachment_id: "f", decision: "failed", actor_type: "scanner_service", created_at: "2026" }], configuration: { admin_allowlist_configured: true, attachment_quarantine_enforced: true } })
  assert.equal(failed[0].finding_type, "attachment_scan_failed")
  assert.equal(systemSecurityAudit({ attachments: [{ id: "c", status: "available" }], scanDecisions: [{ attachment_id: "c", decision: "clean", actor_type: "scanner_service", created_at: "2026" }], configuration: { admin_allowlist_configured: true, attachment_quarantine_enforced: true } }).length, 0)
})
test("knowledge and system findings stay separate and the audit is pure", () => {
  const input = { plannerState: { resources: [resource], claims: [{ id: "c", resource_id: "r1", field_name: "location_occupancy", status: "observed" }] }, attachments: [{ id: "p", status: "pending_scan" }], configuration: { admin_allowlist_configured: true, attachment_quarantine_enforced: true } }
  const before = JSON.stringify(input), report = buildImmuneSystemHealth(input)
  assert.equal(JSON.stringify(input), before)
  assert.ok(report.findings.some((item) => item.domain === "knowledge")); assert.ok(report.findings.some((item) => item.domain === "system"))
})
test("health endpoint is protected, bounded, metadata-only, and has no external adapter", () => {
  const source = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8"), start = source.indexOf('app.get("/api/admin/system-health"'), end = source.indexOf('const plannerTaskResearchRateLimit')
  const section = source.slice(start, end)
  assert.match(section, /requireAdmin/); assert.match(section, /resource_submission_attachments/); assert.match(section, /buildImmuneSystemHealth/)
  assert.doesNotMatch(section, /storage\.from|createSignedUrl|tavily|OpenAI|fetch\(/)
})
