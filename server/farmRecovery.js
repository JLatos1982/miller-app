import { createHash } from "node:crypto"
import { existsSync, readFileSync, statSync } from "node:fs"
import { resolve, relative } from "node:path"

const FORBIDDEN = /(^|\/)(\.env(?:\.|$)|.*credential.*|.*secret.*|.*replay.*|node_modules|\.git)(\/|$)/i
const hashFile = path => createHash("sha256").update(readFileSync(path)).digest("hex")

export function buildFarmRecoveryManifest({ root, paths, now = new Date() } = {}) {
  const files = []
  const excluded = []
  for (const input of paths || []) {
    const absolute = resolve(root, input)
    const name = relative(root, absolute)
    if (FORBIDDEN.test(name)) { excluded.push({ path: name, reason: "secret_or_runtime_security_material" }); continue }
    if (!existsSync(absolute) || !statSync(absolute).isFile()) { excluded.push({ path: name, reason: "missing_or_not_file" }); continue }
    const stat = statSync(absolute)
    files.push({ path: name, bytes: stat.size, sha256: hashFile(absolute) })
  }
  return {
    schema_version: "farm-recovery-manifest-v1",
    generated_at: new Date(now).toISOString(),
    files,
    excluded,
    manifest_fingerprint: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
    contains_credentials: false,
    encrypted_off_host_copy: false,
  }
}

export function verifyFarmRecoveryManifest({ root, manifest } = {}) {
  const results = manifest.files.map(item => {
    const absolute = resolve(root, item.path)
    const status = !existsSync(absolute) ? "missing" : hashFile(absolute) === item.sha256 ? "verified" : "changed"
    return { path: item.path, status }
  })
  return { checked: results.length, verified: results.filter(item => item.status === "verified").length, failures: results.filter(item => item.status !== "verified"), destructive_restore_performed: false }
}
