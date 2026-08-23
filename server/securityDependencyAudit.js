import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { parseNpmAudit, SECURITY_INSTRUMENTS } from "./securityInstruments.js"

const exec = promisify(execFile)

export async function runDependencyAdvisoryAudit({ root, execute = exec } = {}) {
  if (!root) throw new Error("trusted_repository_root_required")
  try {
    const result = await execute("npm", ["audit", "--json"], { cwd: root, shell: false, timeout: SECURITY_INSTRUMENTS.dependency_posture.timeout_ms, maxBuffer: SECURITY_INSTRUMENTS.dependency_posture.max_output_bytes, env: { PATH: process.env.PATH, npm_config_loglevel: "silent" } })
    const report = JSON.parse(String(result.stdout || "{}"))
    return { instrument_id: "dependency_posture", completeness: "complete", findings: parseNpmAudit(report).map((item) => ({ finding_fingerprint: item.finding_key, finding_type: "dependency_advisory", subsystem: "dependency_posture", severity: item.severity, confidence: "verified", description: `A package Miller uses has a known security issue: ${item.package}.`, defensive_result: "protection_uncertain", recommended_action: "Review the affected package and the safe remediation offered by its maintainer.", instrument_id: "dependency_posture" })), external_requests: 1 }
  } catch (error) {
    const text = String(error?.stdout || "")
    try { const report = JSON.parse(text); return { instrument_id: "dependency_posture", completeness: "complete", findings: parseNpmAudit(report).map((item) => ({ finding_fingerprint: item.finding_key, finding_type: "dependency_advisory", subsystem: "dependency_posture", severity: item.severity, confidence: "verified", description: `A package Miller uses has a known security issue: ${item.package}.`, defensive_result: "protection_uncertain", recommended_action: "Review the affected package and the safe remediation offered by its maintainer.", instrument_id: "dependency_posture" })), external_requests: 1 } } catch { return { instrument_id: "dependency_posture", completeness: "unavailable", findings: [], external_requests: 1, failure_code: error?.killed ? "timeout" : "audit_unavailable" } }
  }
}
