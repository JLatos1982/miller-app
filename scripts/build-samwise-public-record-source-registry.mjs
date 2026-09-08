import { writeFile } from "node:fs/promises"
import path from "node:path"

import { buildSamwisePublicRecordSourceRegistry, validateSamwisePublicRecordSourceRegistry } from "../server/samwiseSourceRegistry.js"

const registry = buildSamwisePublicRecordSourceRegistry()
const validation = validateSamwisePublicRecordSourceRegistry(registry)
const output = path.join(process.cwd(), "src/data/samwise-public-record-source-registry-v1.json")
await writeFile(output, `${JSON.stringify(registry, null, 2)}\n`)
console.log(JSON.stringify({ output: "src/data/samwise-public-record-source-registry-v1.json", ...validation, scheduler: registry.scheduler, mutation_authority: false, publication_authority: false }, null, 2))
