import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { BC_INQUEST_INDEX, compareBcInquestMemory, fingerprintBcInquestDocument, parseBcInquestIndex, validateBcInquestRecord } from "../server/millerNorthBcInquestListener.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const artifactDir = resolve(root, "artifacts/miller-north")
const memoryPath = resolve(artifactDir, "miller-north-bc-inquest-listener-memory-v1.json")
const reportPath = resolve(artifactDir, "miller-north-bc-inquest-listener-cycle-v1.json")
const args = process.argv.slice(2)
const after = flag => args[args.indexOf(flag) + 1]
const sinceYear = Math.max(2000, Number(after("--since-year")) || 2024)
const limit = Math.min(200, Math.max(1, Number(after("--limit")) || 100))
const checkedAt = new Date().toISOString()

const indexResponse = await fetch(BC_INQUEST_INDEX, { redirect: "follow", signal: AbortSignal.timeout(30_000) })
if (!indexResponse.ok) throw new Error(`bc_inquest_index_fetch_${indexResponse.status}`)
const indexed = parseBcInquestIndex(await indexResponse.text())
const eligible = indexed.filter(item => item.year >= sinceYear)
const selected = eligible.slice(-limit)
let cursor = 0
const results = []
await Promise.all(Array.from({ length: Math.min(4, selected.length) }, async () => {
  while (cursor < selected.length) {
    const item = selected[cursor++]
    try {
      const response = await fetch(item.url, { redirect: "follow", signal: AbortSignal.timeout(30_000) })
      if (!response.ok) throw new Error(`http_${response.status}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      const record = { ...item, checked_at: checkedAt, document_fingerprint: fingerprintBcInquestDocument(bytes) }
      validateBcInquestRecord(record)
      results.push(record)
    } catch (error) {
      results.push({ ...item, checked_at: checkedAt, fetch_error: String(error?.message || error) })
    }
  }
}))
results.sort((a, b) => a.url.localeCompare(b.url))
let previous = {}
try { previous = JSON.parse(readFileSync(memoryPath, "utf8")) } catch {}
const comparable = results.filter(item => item.document_fingerprint)
const comparison = compareBcInquestMemory(previous, comparable, { preserveUnobserved: selected.length < indexed.length })
const report = {
  schema_version: "miller-north-bc-inquest-listener-cycle-v1",
  checked_at: checkedAt,
  scope: { since_year: sinceYear, selected: selected.length, production_writes: 0 },
  metrics: {
    fetched: comparable.length,
    failed: results.length - comparable.length,
    new_documents: comparison.new_documents.length,
    amended_documents: comparison.amended_documents.length,
    unchanged_documents: comparison.unchanged_documents.length,
    removed_documents: comparison.removed_documents.length,
  },
  new_documents: comparison.new_documents.map(({ document_fingerprint: _fingerprint, ...item }) => item),
  amended_documents: comparison.amended_documents.map(({ document_fingerprint: _fingerprint, ...item }) => item),
  errors: results.filter(item => item.fetch_error).map(item => ({ url: item.url, error: item.fetch_error })),
  interpretation_rule: "A new or amended verdict is a document change requiring relevance review. It is not automatically a new Miller North incident or a finding of wrongdoing.",
}
mkdirSync(artifactDir, { recursive: true })
writeFileSync(memoryPath, `${JSON.stringify(comparison.memory, null, 2)}\n`)
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report.metrics, null, 2))
