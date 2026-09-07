import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { ALBERTA_OCYA_RECOMMENDATIONS_URL, compareOcyaRecommendationMemory, parseOcyaRecommendationTable, summarizeOcyaRecommendationCycle } from "../server/millerNorthAlbertaChildYouthAdvocateListener.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const artifactDir = resolve(root, "artifacts/miller-north")
const memoryPath = resolve(artifactDir, "miller-north-alberta-ocya-listener-memory-v1.json")
const reportPath = resolve(artifactDir, "miller-north-alberta-ocya-listener-cycle-v1.json")
const checkedAt = new Date().toISOString()

const response = await fetch(ALBERTA_OCYA_RECOMMENDATIONS_URL, { redirect: "follow", signal: AbortSignal.timeout(30_000) })
if (!response.ok) throw new Error(`alberta_ocya_fetch_${response.status}`)
const rows = parseOcyaRecommendationTable(await response.text(), { checkedAt })
if (!rows.length) throw new Error("alberta_ocya_table_empty")
const previous = (() => { try { return JSON.parse(readFileSync(memoryPath, "utf8")) } catch { return {} } })()
const comparison = compareOcyaRecommendationMemory(previous, rows)
const metrics = summarizeOcyaRecommendationCycle(rows, comparison)
const ownerReview = rows.filter(row => row.healthcare_relevant && row.indigenous_relevance_explicit)
const report = {
  schema_version: "miller-north-alberta-ocya-listener-cycle-v1",
  checked_at: checkedAt,
  source: ALBERTA_OCYA_RECOMMENDATIONS_URL,
  metrics,
  owner_review: ownerReview,
  material_changes: comparison.changed_rows,
  rules: [
    "The Advocate's evaluation is recorded as its public evaluation, not as independent proof of implementation effectiveness.",
    "A response, progress narrative or met label does not populate implementation_evidence or outcome_evidence automatically.",
    "Miller North review requires both explicit Indigenous relevance and healthcare-system relevance.",
  ],
  production_writes: 0,
}
mkdirSync(artifactDir, { recursive: true })
writeFileSync(memoryPath, `${JSON.stringify(comparison.memory, null, 2)}\n`)
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(metrics, null, 2))
