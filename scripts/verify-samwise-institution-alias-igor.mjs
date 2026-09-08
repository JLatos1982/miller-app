import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { dispatchFarmIgorJob } from "../server/farmIgorWorker.js"

const root = process.cwd()
const registry = JSON.parse(await readFile(path.join(root, "src/data/samwise-entity-aliases-v1.json"), "utf8"))
const proof = JSON.parse(await readFile(path.join(root, "artifacts/samwise-public-records/workplace-safety-enforcement-proof-v1.json"), "utf8"))
const items = proof.findings.flatMap(finding => finding.relevant_entities || []).map(entity => ({ name: entity.name }))
const started = performance.now()
const result = await dispatchFarmIgorJob({ root, capability: "institutional_alias_comparison", payload: { items, entities: registry.entities }, timeoutMs: 15_000 })
const report = {
  schema_version: "samwise-institution-alias-igor-verification-v1",
  checked_at: new Date().toISOString(),
  capability_id: "samwise_public_records_intelligence",
  task: "institutional_alias_comparison",
  duration_ms: Number((performance.now() - started).toFixed(1)),
  result,
  validation: {
    exact_aliases_only: result.fuzzy_matching_used === false,
    authenticated_worker_response: true,
    mutation_authority: false,
    publication_authority: false,
    final_entity_merge_authority: false
  }
}
const outputDir = path.join(root, "artifacts/samwise-public-records")
await mkdir(outputDir, { recursive: true })
await writeFile(path.join(outputDir, "samwise-institution-alias-igor-verification-v1.json"), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ task: report.task, duration_ms: report.duration_ms, checked: result.checked, matched: result.matched, owner_review: result.owner_review.length, fuzzy_matching_used: result.fuzzy_matching_used, mutation_authority: false, publication_authority: false }, null, 2))
