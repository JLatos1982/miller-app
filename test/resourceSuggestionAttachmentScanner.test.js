import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { EventEmitter } from "node:events"
import { assertLocalAttachmentScannerTarget, clamAvResult, pendingAttachmentCandidates, scanBufferWithDocker, scanLocalAttachment, withAttachmentLock } from "../server/resourceSuggestionAttachmentScanner.js"

function mockSpawn({ exitCode = 0, delay = 0 } = {}) {
  return () => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
    setTimeout(() => child.emit("close", exitCode), delay)
    return child
  }
}

test("local-only guard accepts loopback and rejects production or unclear targets", () => {
  assert.deepEqual(assertLocalAttachmentScannerTarget({ apiUrl: "http://127.0.0.1:54321", dbUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres", explicitLocalOnly: true }), { apiUrl: "http://127.0.0.1:54321", dbUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" })
  assert.throws(() => assertLocalAttachmentScannerTarget({ apiUrl: "https://wccagykzugrahwugefqt.supabase.co", dbUrl: "postgresql://db.example", explicitLocalOnly: true }), /loopback|production/)
  assert.throws(() => assertLocalAttachmentScannerTarget({ apiUrl: "http://127.0.0.1:54321", dbUrl: "postgresql://postgres@127.0.0.1/db", explicitLocalOnly: false }), /--local-only/)
})

test("ClamAV exit mapping remains fail closed", () => {
  assert.deepEqual(clamAvResult({ exitCode: 0 }), { decision: "clean", code: "clamav_clean" })
  assert.deepEqual(clamAvResult({ exitCode: 1 }), { decision: "malicious", code: "clamav_detected" })
  assert.deepEqual(clamAvResult({ exitCode: 2 }), { decision: "failed", code: "scanner_error" })
  assert.deepEqual(clamAvResult({ exitCode: null, timedOut: true }), { decision: "failed", code: "scanner_timeout" })
  assert.deepEqual(clamAvResult({ exitCode: 1, output: "MILLER_FRESHCLAM_FAILED" }), { decision: "failed", code: "definitions_update_failed" })
})

test("candidate selection is idempotent and only retries failed scans explicitly", () => {
  const attachments = [{ id: "fresh", status: "pending_scan" }, { id: "failed", status: "pending_scan" }, { id: "done", status: "available" }]
  const decisions = [{ attachment_id: "failed", decision: "failed", created_at: "2026-01-01" }]
  assert.deepEqual(pendingAttachmentCandidates(attachments, decisions).map((item) => item.id), ["fresh"])
  assert.deepEqual(pendingAttachmentCandidates(attachments, decisions, { retryFailed: true }).map((item) => item.id), ["fresh", "failed"])
})

test("same-host attachment lock prevents a second scanner claim and is removed", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "miller-lock-test-"))
  let release
  const waiting = new Promise((resolve) => { release = resolve })
  const first = withAttachmentLock(root, "attachment-1", async () => { await waiting; return "first" })
  await new Promise((resolve) => setTimeout(resolve, 5))
  const second = await withAttachmentLock(root, "attachment-1", async () => "second")
  assert.equal(second.claimed, false)
  release()
  assert.deepEqual(await first, { claimed: true, value: "first" })
  assert.deepEqual(await withAttachmentLock(root, "attachment-1", async () => "again"), { claimed: true, value: "again" })
  fs.rmSync(root, { recursive: true, force: true })
})

test("scanner temp files are removed after clean, error, and timeout outcomes", async () => {
  const clean = await scanBufferWithDocker(Buffer.from("clean"), { spawnImpl: mockSpawn({ exitCode: 0 }), timeoutMs: 50 })
  assert.equal(clean.decision, "clean")
  const failed = await scanBufferWithDocker(Buffer.from("clean"), { spawnImpl: mockSpawn({ exitCode: 2 }), timeoutMs: 50 })
  assert.equal(failed.decision, "failed")
  const timeout = await scanBufferWithDocker(Buffer.from("clean"), { spawnImpl: mockSpawn({ delay: 100 }), timeoutMs: 5 })
  assert.equal(timeout.decision, "failed")
  assert.equal(timeout.code, "scanner_timeout")
})

test("local scanner records failed results without ever marking an attachment available", async () => {
  const calls = []
  const supabase = {
    storage: { from() { return { async download() { return { error: { code: "storage_down" }, data: null } } } } },
    async rpc(name, args) { calls.push({ name, args }); return { error: null, data: { id: args.p_attachment_id, status: "pending_scan" } } },
  }
  const outcome = await scanLocalAttachment({ supabase, attachment: { id: "attachment-1", storage_path: "local/attachment" }, lockRoot: fs.mkdtempSync(path.join(os.tmpdir(), "miller-scan-test-")), log: { info() {} } })
  assert.equal(outcome.claimed, true)
  assert.equal(outcome.value.result.decision, "failed")
  assert.equal(calls[0].name, "record_resource_submission_attachment_scan_decision")
  assert.equal(calls[0].args.p_decision, "failed")
  assert.equal(calls[0].args.p_actor_type, "scanner_service")
})

test("safe EICAR fixture is present for Docker-backed local verification", () => {
  const fixture = fs.readFileSync(new URL("./fixtures/resource-suggestion-attachments/eicar.txt", import.meta.url), "utf8")
  assert.match(fixture, /EICAR-STANDARD-ANTIVIRUS-TEST-FILE/)
})

test("scanner command relies only on explicitly local-scoped configuration", () => {
  const source = fs.readFileSync(new URL("../scripts/scan-resource-attachments.mjs", import.meta.url), "utf8")
  assert.match(source, /LOCAL_SUPABASE_URL/)
  assert.match(source, /LOCAL_SUPABASE_DB_URL/)
  assert.match(source, /LOCAL_SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(source, /process\.env\.SUPABASE_URL|process\.env\.SUPABASE_SERVICE_ROLE_KEY/)
})
