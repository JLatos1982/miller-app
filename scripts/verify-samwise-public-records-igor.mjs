import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { dispatchFarmIgorJob } from "../server/farmIgorWorker.js"

const root = process.cwd()
const corpus = JSON.parse(await readFile(path.join(root, "artifacts/miller-legal/farm-legal-corpus-mining-v4.json"), "utf8"))
const items = corpus.legal_matters.map(record => ({ id: record.legal_record_id, citation: record.citation || record.decision_identifier || record.case_name, source_url: record.source_url, process_role: record.process_role }))
const started = performance.now()
const result = await dispatchFarmIgorJob({ root, capability: "legal_citation_normalization", payload: { items }, timeoutMs: 15_000 })
const report = {
  schema_version: "samwise-public-records-igor-verification-v1",
  checked_at: new Date().toISOString(),
  capability_id: "samwise_public_records_intelligence",
  task: "legal_citation_normalization",
  duration_ms: Number((performance.now() - started).toFixed(1)),
  input_records: items.length,
  result,
  validation: {
    authenticated_worker_response: true,
    mutation_authority: false,
    publication_authority: false,
    legal_significance_determined_by_worker: false,
    indigenous_identity_determined_by_worker: false,
  },
}
const outputDir = path.join(root, "artifacts/samwise-public-records")
await mkdir(outputDir, { recursive: true })
await writeFile(path.join(outputDir, "samwise-public-records-igor-verification-v1.json"), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ task: report.task, duration_ms: report.duration_ms, checked: result.checked, valid: result.valid, duplicates_suppressed: result.duplicates_suppressed, owner_review: result.owner_review.length, mutation_authority: false, publication_authority: false }, null, 2))
