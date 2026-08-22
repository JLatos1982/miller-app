import { randomUUID } from "node:crypto"
import { mkdtemp, mkdir, open, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"

export const LOCAL_SCANNER_FLAG = "--local-only"
export const LOCAL_SCANNER_TIMEOUT_MS = 45_000
export const LOCAL_SCANNER_IMAGE = "clamav/clamav:stable"
const PRODUCTION_PROJECT_REF = "wccagykzugrahwugefqt"

export function assertLocalAttachmentScannerTarget({ apiUrl, dbUrl, explicitLocalOnly }) {
  if (!explicitLocalOnly) throw new Error("Refusing to scan: pass --local-only for the local prototype.")
  if (!apiUrl || !dbUrl) throw new Error("Refusing to scan: local Supabase identity is incomplete.")
  const api = new URL(apiUrl)
  const db = new URL(dbUrl)
  const localHosts = new Set(["127.0.0.1", "localhost", "::1"])
  if (!localHosts.has(api.hostname) || !localHosts.has(db.hostname)) {
    throw new Error("Refusing to scan: attachment scanner accepts loopback Supabase targets only.")
  }
  if (`${apiUrl} ${dbUrl}`.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error("Refusing to scan: production Supabase project is prohibited.")
  }
  return { apiUrl: api.origin, dbUrl: db.toString() }
}

export function clamAvResult({ exitCode, timedOut = false, output = "" }) {
  if (timedOut) return { decision: "failed", code: "scanner_timeout" }
  if (output.includes("MILLER_FRESHCLAM_FAILED")) return { decision: "failed", code: "definitions_update_failed" }
  if (exitCode === 0) return { decision: "clean", code: "clamav_clean" }
  if (exitCode === 1) return { decision: "malicious", code: "clamav_detected" }
  return { decision: "failed", code: "scanner_error" }
}

export function pendingAttachmentCandidates(attachments, decisions, { retryFailed = false } = {}) {
  const latest = new Map()
  for (const decision of decisions || []) {
    const previous = latest.get(decision.attachment_id)
    if (!previous || String(decision.created_at) > String(previous.created_at)) latest.set(decision.attachment_id, decision)
  }
  return (attachments || []).filter((attachment) => {
    if (attachment.status !== "pending_scan") return false
    const prior = latest.get(attachment.id)
    return !prior || prior.decision !== "failed" || retryFailed
  })
}

export async function withAttachmentLock(lockRoot, attachmentId, task) {
  await mkdir(lockRoot, { recursive: true })
  const lockPath = path.join(lockRoot, `${attachmentId}.lock`)
  let handle
  try {
    handle = await open(lockPath, "wx")
  } catch (error) {
    if (error?.code === "EEXIST") return { claimed: false }
    throw error
  }
  try {
    return { claimed: true, value: await task() }
  } finally {
    await handle.close().catch(() => {})
    await rm(lockPath, { force: true }).catch(() => {})
  }
}

function runProcess(command, args, { timeoutMs, spawnImpl = spawn } = {}) {
  return new Promise((resolve) => {
    const child = spawnImpl(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
      setTimeout(() => child.kill("SIGKILL"), 1_000).unref()
    }, timeoutMs)
    child.stdout?.on("data", (chunk) => { stdout += chunk })
    child.stderr?.on("data", (chunk) => { stderr += chunk })
    child.on("error", () => { clearTimeout(timer); resolve({ exitCode: null, timedOut, stdout, stderr }) })
    child.on("close", (exitCode) => { clearTimeout(timer); resolve({ exitCode, timedOut, stdout, stderr }) })
  })
}

export async function scanBufferWithDocker(buffer, { timeoutMs = LOCAL_SCANNER_TIMEOUT_MS, spawnImpl = spawn, image = LOCAL_SCANNER_IMAGE, definitionsDir, refreshDefinitions = true } = {}) {
  const workDir = await mkdtemp(path.join(tmpdir(), "miller-attachment-scan-"))
  const scanDefinitionsDir = definitionsDir || path.join(workDir, "definitions")
  const filePath = path.join(workDir, "attachment")
  const startedAt = Date.now()
  try {
    if (!definitionsDir) await mkdir(scanDefinitionsDir)
    await writeFile(filePath, buffer, { mode: 0o600 })
    const command = `${refreshDefinitions ? "freshclam --stdout --datadir=/definitions || { echo MILLER_FRESHCLAM_FAILED; exit 2; }; " : ""}clamscan --no-summary --infected --database=/definitions /scan/attachment`
    const processResult = await runProcess("docker", [
      "run", "--rm", "--user", "0:0",
      "--mount", `type=bind,src=${workDir},dst=/work`,
      "--mount", `type=bind,src=${scanDefinitionsDir},dst=/definitions`,
      "--mount", `type=bind,src=${filePath},dst=/scan/attachment,readonly`,
      "--entrypoint", "/bin/sh", image, "-ec", command,
    ], { timeoutMs, spawnImpl })
    const output = `${processResult.stdout}\n${processResult.stderr}`.slice(-2_000)
    const result = clamAvResult({ ...processResult, output })
    return { ...result, duration_ms: Date.now() - startedAt, output }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

export async function recordLocalScanDecision({ supabase, attachmentId, result, scanReference }) {
  const saved = await supabase.rpc("record_resource_submission_attachment_scan_decision", {
    p_attachment_id: attachmentId,
    p_decision: result.decision,
    p_actor_type: "scanner_service",
    p_actor_id: null,
    p_scan_engine: "clamav-docker-local-prototype",
    p_scan_reference: scanReference,
    p_decision_note: result.code,
  })
  if (saved.error) throw saved.error
  return saved.data
}

export async function scanLocalAttachment({ supabase, attachment, lockRoot, scanBuffer = scanBufferWithDocker, log = console }) {
  return withAttachmentLock(lockRoot, attachment.id, async () => {
    const scanReference = `local-clamav-${randomUUID()}`
    const startedAt = Date.now()
    let result
    try {
      const downloaded = await supabase.storage.from("resource-suggestion-attachments").download(attachment.storage_path)
      if (downloaded.error || !downloaded.data) throw downloaded.error || new Error("storage_download_failed")
      result = await scanBuffer(Buffer.from(await downloaded.data.arrayBuffer()))
    } catch (error) {
      result = { decision: "failed", code: error?.name === "AbortError" ? "scanner_timeout" : "scanner_unavailable", duration_ms: Date.now() - startedAt }
    }
    const stored = await recordLocalScanDecision({ supabase, attachmentId: attachment.id, result, scanReference })
    log.info(JSON.stringify({ attachment_id: attachment.id, scan_reference: scanReference, result: result.decision, code: result.code, duration_ms: result.duration_ms }))
    return { attachment: stored, result, scanReference }
  })
}
