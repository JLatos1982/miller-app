import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"

const exec = promisify(execFile)
const MAX_FILES = 2_000
const MAX_BYTES = 96 * 1024
const fingerprint = (parts) => createHash("sha256").update(parts.join("|")).digest("hex")
const relative = (root, file) => path.relative(root, file).replaceAll("\\", "/")
const keyLike = /(?:^|[_-])(private|secret|service)[_-]?(?:key|token|credential)|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i

export async function trackedRepositoryFiles(root) {
  const result = await exec("git", ["-C", root, "ls-files", "-z"], { cwd: root, shell: false, timeout: 5_000, maxBuffer: 256 * 1024 })
  return result.stdout.split("\0").filter(Boolean).slice(0, MAX_FILES)
}

export async function inspectRepositoryHygiene({ root, files = null, read = readFile } = {}) {
  if (!root || !path.isAbsolute(root)) throw new Error("trusted_repository_root_required")
  const tracked = files || await trackedRepositoryFiles(root), findings = []
  for (const file of tracked.slice(0, MAX_FILES)) {
    const clean = relative(root, path.resolve(root, file))
    if (!clean || clean.startsWith("../")) throw new Error("repository_scope_denied")
    if (/(^|\/)\.env(?:\.|$)/i.test(clean) || /(^|\/)(id_rsa|id_ed25519|.*\.(pem|key|p12))$/i.test(clean)) findings.push({ finding_key: `repository_hygiene:${clean}`, finding_fingerprint: fingerprint(["repository_hygiene", "sensitive_file", clean]), finding_type: "tracked_sensitive_file", subsystem: "repository_hygiene", severity: "high", confidence: "observed", description: `A sensitive-looking tracked file needs review: ${clean}.`, defensive_result: "protection_uncertain", recommended_action: "Remove the file from tracked source and rotate any affected credential.", instrument_id: "repository_hygiene" })
    if (!/\.(?:[cm]?[jt]sx?|json|ya?ml|env|config)$/i.test(clean)) continue
    let content = ""
    try { content = String(await read(path.resolve(root, clean), "utf8")).slice(0, MAX_BYTES) } catch { continue }
    if (clean.startsWith("src/") && /SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY/i.test(content)) findings.push({ finding_key: `repository_hygiene:client_service_role:${clean}`, finding_fingerprint: fingerprint(["repository_hygiene", "client_service_role", clean]), finding_type: "client_service_role_reference", subsystem: "repository_hygiene", severity: "critical", confidence: "observed", description: `Client-facing source references a service-role-like credential: ${clean}.`, defensive_result: "protection_uncertain", recommended_action: "Keep privileged credentials server-side only.", instrument_id: "repository_hygiene" })
    if (keyLike.test(content)) findings.push({ finding_key: `repository_hygiene:possible_credential:${clean}`, finding_fingerprint: fingerprint(["repository_hygiene", "possible_credential", clean]), finding_type: "possible_credential_pattern", subsystem: "repository_hygiene", severity: "high", confidence: "observed", description: `A credential-like pattern needs review in ${clean}; its value was not retained.`, defensive_result: "protection_uncertain", recommended_action: "Review the file privately and remove or rotate any credential.", instrument_id: "repository_hygiene" })
  }
  return { instrument_id: "repository_hygiene", completeness: "complete", files_considered: Math.min(tracked.length, MAX_FILES), findings: findings.slice(0, 20), external_requests: 0 }
}
