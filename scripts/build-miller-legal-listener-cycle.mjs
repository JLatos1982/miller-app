import { mkdir, readFile, writeFile } from "node:fs/promises"

import review from "../artifacts/miller-legal/miller-legal-evidence-review-v1.json" with { type: "json" }
import registry from "../src/data/miller-legal-source-registry-v1.json" with { type: "json" }
import { compareLegalListenerCycle, validateLegalRecord, validateLegalSourceRegistry } from "../server/millerLegalEvidence.js"

const artifactDirectory = new URL("../artifacts/miller-legal/", import.meta.url)
const memoryUrl = new URL("miller-legal-listener-memory-v1.json", artifactDirectory)
const cycleUrl = new URL("miller-legal-listener-cycle-v1.json", artifactDirectory)
let previousState = { documents: [] }
try {
  previousState = JSON.parse(await readFile(memoryUrl, "utf8"))
} catch (error) {
  if (error?.code !== "ENOENT") throw error
}

validateLegalSourceRegistry(registry)
for (const record of review.records) validateLegalRecord(record)
const cycle = compareLegalListenerCycle(review.records, previousState)
const memory = {
  schema_version: "miller-legal-listener-memory-v1",
  checked_at: "2026-09-07",
  documents: cycle.documents.map(({ change: _change, ...document }) => document),
}
await mkdir(artifactDirectory, { recursive: true })
await writeFile(cycleUrl, `${JSON.stringify(cycle, null, 2)}\n`)
await writeFile(memoryUrl, `${JSON.stringify(memory, null, 2)}\n`)
console.log(JSON.stringify({ registry: validateLegalSourceRegistry(registry), cycle: cycle.summary }))
