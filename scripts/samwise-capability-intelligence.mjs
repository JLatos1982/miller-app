import { readFileSync } from "node:fs"
import path from "node:path"

import registry from "../src/data/samwise-capability-intelligence-registry-v1.json" with { type: "json" }
import { createCapabilityIntelligenceStore, ownerCapabilityInventory, recommendCapabilityRoute } from "../server/samwiseCapabilityIntelligence.js"

const usage = `Usage: npm run samwise:capability-intelligence -- <inventory|learning|status|recent|recommend|record> [options]
  recommend --input=<repo-relative-task.json>
  record --input=<repo-relative-observation.json>
This command is advisory and local-only; it never executes or changes routes.`
const args = process.argv.slice(2)
const command = args.shift()
const option = name => { const item = args.find(value => value.startsWith(`--${name}=`)); return item ? item.slice(name.length + 3) : null }
const root = path.resolve(process.cwd())
const store = createCapabilityIntelligenceStore(root)
const print = value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
const repoJson = value => {
  const candidate = path.resolve(root, value || "")
  if (!value || (candidate !== root && !candidate.startsWith(`${root}${path.sep}`))) throw new Error("samwise_capability_intelligence_input_must_be_repo_relative")
  return JSON.parse(readFileSync(candidate, "utf8"))
}

if (!command || command === "help" || command === "--help") process.stdout.write(`${usage}\n`)
else if (command === "status") print(store.status())
else if (command === "recent") print(store.list(option("limit")))
else if (command === "inventory") print(ownerCapabilityInventory({ registry, observations: store.list(500) }))
else if (command === "learning") print(ownerCapabilityInventory({ registry, observations: store.list(500) }).learning_signals)
else if (command === "recommend") print(recommendCapabilityRoute({ registry, task: repoJson(option("input")), observations: store.list(500) }))
else if (command === "record") print(store.append(repoJson(option("input"))))
else throw new Error(`samwise_capability_intelligence_command_unknown:${command}`)
