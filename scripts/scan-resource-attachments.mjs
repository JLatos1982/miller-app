import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"
import { assertLocalAttachmentScannerTarget, LOCAL_SCANNER_FLAG, pendingAttachmentCandidates, scanBufferWithDocker, scanLocalAttachment } from "../server/resourceSuggestionAttachmentScanner.js"

const explicitLocalOnly = process.argv.includes(LOCAL_SCANNER_FLAG)
const retryFailed = process.argv.includes("--retry-failed")
const limitIndex = process.argv.indexOf("--limit")
const limit = limitIndex >= 0 ? Number.parseInt(process.argv[limitIndex + 1], 10) : 2
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 2) throw new Error("--limit must be between 1 and 2 for the local prototype.")

const target = assertLocalAttachmentScannerTarget({
  apiUrl: process.env.LOCAL_SUPABASE_URL,
  dbUrl: process.env.LOCAL_SUPABASE_DB_URL,
  explicitLocalOnly,
})
if (!process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY) throw new Error("Refusing to scan: LOCAL_SUPABASE_SERVICE_ROLE_KEY is required for the local stack.")
const supabase = createClient(target.apiUrl, process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

const pending = await supabase
  .from("resource_submission_attachments")
  .select("id,storage_path,status,created_at")
  .eq("status", "pending_scan")
  .order("created_at", { ascending: true })
  .limit(limit)
if (pending.error) throw new Error("Local attachment queue is unavailable.")
const ids = (pending.data || []).map((item) => item.id)
const history = ids.length
  ? await supabase.from("resource_submission_attachment_scan_decisions").select("attachment_id,decision,created_at").in("attachment_id", ids)
  : { data: [] }
if (history.error) throw new Error("Local attachment scan history is unavailable.")

const lockRoot = ".local-resource-attachment-scan-locks"
const candidates = pendingAttachmentCandidates(pending.data, history.data, { retryFailed })
const results = []
const definitionsDir = await mkdtemp(path.join(tmpdir(), "miller-clamav-definitions-"))
try {
  for (const [index, attachment] of candidates.entries()) {
    const scanBuffer = (buffer) => scanBufferWithDocker(buffer, { definitionsDir, refreshDefinitions: index === 0 })
    const outcome = await scanLocalAttachment({ supabase, attachment, lockRoot, scanBuffer })
    if (outcome.claimed) results.push(outcome.value)
  }
} finally {
  await rm(definitionsDir, { recursive: true, force: true })
}
console.log(JSON.stringify({ mode: "local_only", requested: pending.data?.length || 0, scanned: results.length, skipped: (pending.data?.length || 0) - results.length, results: results.map(({ result, scanReference }) => ({ decision: result.decision, code: result.code, scan_reference: scanReference })) }, null, 2))
