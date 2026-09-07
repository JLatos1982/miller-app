import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { BCCNM_NOTICE_INDEX, compareBccnmNoticeMemory, parseBccnmNotice, parseBccnmNoticeIndex, validateBccnmNoticeResult } from "../server/millerNorthBccnmListener.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const artifactDir = resolve(root, "artifacts/miller-north")
const memoryPath = resolve(artifactDir, "miller-north-bccnm-listener-memory-v1.json")
const reportPath = resolve(artifactDir, "miller-north-bccnm-listener-cycle-v1.json")
const args = process.argv.slice(2)
const after = flag => args[args.indexOf(flag) + 1]
const minId = Math.max(1, Number(after("--min-id")) || 1000)
const limit = Math.min(200, Math.max(1, Number(after("--limit")) || 150))
const checkedAt = new Date().toISOString()

const indexResponse = await fetch(BCCNM_NOTICE_INDEX, { redirect: "follow", signal: AbortSignal.timeout(30_000) })
if (!indexResponse.ok) throw new Error(`bccnm_index_fetch_${indexResponse.status}`)
const index = parseBccnmNoticeIndex(await indexResponse.text()).filter(item => item.notice_id >= minId).slice(-limit)
let cursor = 0
const results = []
await Promise.all(Array.from({ length: Math.min(5, index.length) }, async () => {
  while (cursor < index.length) {
    const item = index[cursor++]
    try {
      const response = await fetch(item.url, { redirect: "follow", signal: AbortSignal.timeout(20_000) })
      if (!response.ok) throw new Error(`http_${response.status}`)
      const parsed = { ...parseBccnmNotice(await response.text(), { noticeId: item.notice_id, url: item.url }), checked_at: checkedAt }
      validateBccnmNoticeResult(parsed)
      results.push(parsed)
    } catch (error) {
      results.push({ notice_id: item.notice_id, url: item.url, fetch_error: String(error?.message || error), checked_at: checkedAt })
    }
  }
}))
results.sort((a, b) => a.notice_id - b.notice_id)
let previous = {}
try { previous = JSON.parse(readFileSync(memoryPath, "utf8")) } catch {}
const comparable = results.filter(item => item.document_fingerprint)
const comparison = compareBccnmNoticeMemory(previous, comparable)
const candidates = comparable.filter(item => item.disposition === "owner_review")
const report = {
  schema_version: "miller-north-bccnm-listener-cycle-v1",
  checked_at: checkedAt,
  scope: { min_notice_id: minId, notices_selected: index.length, production_writes: 0 },
  metrics: { fetched: comparable.length, failed: results.length - comparable.length, candidate_notices: candidates.length, new_documents: comparison.new_notices.length, amended_documents: comparison.updated_notices.length, unchanged_documents: comparison.unchanged },
  candidates: candidates.map(item => ({ notice_id: item.notice_id, url: item.url, practitioner_label: item.practitioner_label, outcome_type: item.outcome_type, publication_date_text: item.publication_date_text, disposition: item.disposition, body_text: item.body_text })),
  errors: results.filter(item => item.fetch_error).map(item => ({ notice_id: item.notice_id, url: item.url, error: item.fetch_error })),
  interpretation_rule: "Explicit Indigenous terminology must occur inside the notice body. A notice is an owner-review candidate, not an automatically published incident.",
}
mkdirSync(artifactDir, { recursive: true })
writeFileSync(memoryPath, `${JSON.stringify(comparison.memory, null, 2)}\n`)
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report.metrics, null, 2))
