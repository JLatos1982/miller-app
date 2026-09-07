import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { CPSBC_CULTURAL_SAFETY_INDEX, CPSBC_KNOWN_CASE_STUDIES, compareCpsbcCaseStudyMemory, parseCpsbcCaseStudy, parseCpsbcCaseStudyIndex, validateCpsbcCaseStudyRecord } from "../server/millerNorthCpsbcCaseStudyListener.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const artifactDir = resolve(root, "artifacts/miller-north")
const memoryPath = resolve(artifactDir, "miller-north-cpsbc-case-study-listener-memory-v1.json")
const reportPath = resolve(artifactDir, "miller-north-cpsbc-case-study-listener-cycle-v1.json")
const checkedAt = new Date().toISOString()

const indexResponse = await fetch(CPSBC_CULTURAL_SAFETY_INDEX, { redirect: "follow", signal: AbortSignal.timeout(30_000) })
if (!indexResponse.ok) throw new Error(`cpsbc_case_index_fetch_${indexResponse.status}`)
const discovered = parseCpsbcCaseStudyIndex(await indexResponse.text())
const seeds = new Map([...CPSBC_KNOWN_CASE_STUDIES.map(url => [url, { url }]), ...discovered.map(item => [item.url, item])])
let cursor = 0
const seedList = [...seeds.values()]
const results = []
await Promise.all(Array.from({ length: Math.min(4, seedList.length) }, async () => {
  while (cursor < seedList.length) {
    const seed = seedList[cursor++]
    try {
      const response = await fetch(seed.url, { redirect: "follow", signal: AbortSignal.timeout(30_000) })
      if (!response.ok) throw new Error(`http_${response.status}`)
      const record = { ...parseCpsbcCaseStudy(await response.text(), seed), checked_at: checkedAt }
      validateCpsbcCaseStudyRecord(record)
      results.push(record)
    } catch (error) {
      results.push({ ...seed, checked_at: checkedAt, fetch_error: String(error?.message || error) })
    }
  }
}))
results.sort((a, b) => a.url.localeCompare(b.url))
let previous = {}
try { previous = JSON.parse(readFileSync(memoryPath, "utf8")) } catch {}
const comparable = results.filter(item => item.document_fingerprint)
const comparison = compareCpsbcCaseStudyMemory(previous, comparable)
const candidates = comparable.filter(item => item.disposition === "owner_review")
const report = {
  schema_version: "miller-north-cpsbc-case-study-listener-cycle-v1",
  checked_at: checkedAt,
  scope: { index: CPSBC_CULTURAL_SAFETY_INDEX, selected: seedList.length, production_writes: 0 },
  metrics: { fetched: comparable.length, failed: results.length - comparable.length, candidates: candidates.length, new_documents: comparison.new_documents.length, amended_documents: comparison.amended_documents.length, unchanged_documents: comparison.unchanged_documents.length, removed_documents: comparison.removed_documents.length },
  candidates: candidates.map(({ body_text: _body, document_fingerprint: _fingerprint, ...item }) => item),
  errors: results.filter(item => item.fetch_error).map(item => ({ url: item.url, error: item.fetch_error })),
  interpretation_rule: "An official Inquiry Committee learning summary is formal-process evidence, not a disciplinary order, named-facility finding or automatic publication decision.",
}
mkdirSync(artifactDir, { recursive: true })
writeFileSync(memoryPath, `${JSON.stringify(comparison.memory, null, 2)}\n`)
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report.metrics, null, 2))
