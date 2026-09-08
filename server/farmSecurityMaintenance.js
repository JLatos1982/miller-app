import { existsSync, readFileSync } from "node:fs"

const implemented = (id, cadence, path, status, detail) => ({ id, cadence, path, status, detail, mutation_authority: false })

export function inventoryFarmSecurityMaintenance(root = process.cwd()) {
  const has = path => existsSync(new URL(`../${path}`, import.meta.url)) || existsSync(`${root}/${path}`)
  return {
    schema_version: "farm-security-maintenance-inventory-v1",
    systems: [
      implemented("security_pulse", "six_hour_capability_local_only", "server/securityPulse.js", has("server/securityPulse.js") ? "implemented_inactive" : "planned_only", "Bounded defensive checks exist; the production profile does not grant scheduler activation."),
      implemented("automation_scheduler", "fifteen_minute_heartbeat_local_only", "server/automationScheduler.js", has("server/automationScheduler.js") ? "implemented_inactive" : "planned_only", "Lease and backoff machinery exists but was designed local-only."),
      implemented("repository_secret_scan", "weekly", "farm_adapter", "activated_read_only", "Pattern and tracked-file checks only; secret values are never included in reports."),
      implemented("dependency_advisory", "monthly", "server/securityPulse.js", has("server/securityPulse.js") ? "implemented_inactive" : "planned_only", "Available in advisory mode; no automatic package mutation."),
      implemented("worker_transport_health", "weekly", "farm_adapter", "activated_read_only", "Checks availability only; it does not restart or reconfigure workers."),
      implemented("listener_memory_integrity", "monthly", "farm_adapter", "activated_read_only", "Parses bounded state manifests and flags corruption without replacing prior state."),
      implemented("production_health_probe", "weekly", "farm_adapter", "activated_read_only", "GET-only public route and header check."),
      implemented("backup_recovery_check", "monthly", "none", "planned_only", "No verified read-only backup restoration probe was located; no backup setting was changed."),
      implemented("credential_rotation", "manual", "none", "obsolete_for_automation", "Credential rotation is intentionally outside autonomous Farm authority."),
    ],
  }
}

export function runFarmSecuritySanity({ root = process.cwd(), environment = process.env } = {}) {
  const sourceFiles = ["server.js", "package.json", "server/securityPulse.js", "server/automationScheduler.js"]
  const findings = []
  for (const path of sourceFiles) {
    if (!existsSync(`${root}/${path}`)) findings.push({ code: "expected_security_file_missing", path, severity: "high" })
  }
  const trackedText = sourceFiles.filter(path => existsSync(`${root}/${path}`)).map(path => readFileSync(`${root}/${path}`, "utf8")).join("\n")
  if (/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/.test(trackedText)) findings.push({ code: "private_key_literal_detected", severity: "critical" })
  const posture = {
    email_provider_configured: Boolean(environment.MILLER_EMAIL_PROVIDER && environment.MILLER_EMAIL_FROM && environment.RESEND_API_KEY),
    owner_email_configured: Boolean(environment.MILLER_OWNER_EMAIL),
    automation_token_present: Boolean(environment.MILLER_AUTOMATION_SCHEDULER_TOKEN),
    automation_local_only: environment.MILLER_AUTOMATION_SCHEDULER_LOCAL_ONLY === "true",
  }
  return { schema_version: "farm-security-sanity-v1", checked: sourceFiles.length, findings, posture, status: findings.some(item => ["critical", "high"].includes(item.severity)) ? "owner_review" : "healthy", production_mutations: 0, secret_values_reported: false }
}
