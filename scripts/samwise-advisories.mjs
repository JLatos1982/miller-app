import path from "node:path"

import { createCapabilityIntelligenceStore, deriveRoutingLearningSignals } from "../server/samwiseCapabilityIntelligence.js"
import { createWorkflowMemoryStore, deriveCapabilityGapSignals, deriveWorkflowStrategies, summarizeWorkflowFailures } from "../server/samwiseWorkflowMemory.js"
import { buildSamwiseBrief, compactOwnerAdvisoryRetrieval, createOwnerAdvisoryInbox, generateOwnerAdvisories } from "../server/samwiseOwnerAdvisories.js"
import registry from "../src/data/samwise-capability-intelligence-registry-v1.json" with { type: "json" }

const usage = `Usage: npm run samwise:advisories -- <refresh|new|recent|show|acknowledge|dismiss|resolve|summary|brief> [advisory-id]
  refresh        Generate local advisories from existing signals; does not send anything.
  new            Show new owner advisories.
  recent         Show recent compact owner advisories.
  show <id>      Show one advisory.
  acknowledge|dismiss|resolve <id>  Append a local status event only.`
const args = process.argv.slice(2)
const command = args.shift()
const root = path.resolve(process.cwd())
const inbox = createOwnerAdvisoryInbox(root)
const workflowStore = createWorkflowMemoryStore(root)
const capabilityStore = createCapabilityIntelligenceStore(root)
const print = value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
const sources = () => {
  const episodes = workflowStore.list(500)
  return {
    routing_signals: deriveRoutingLearningSignals(capabilityStore.list(500)), workflow_failures: summarizeWorkflowFailures(episodes), workflow_episodes: episodes,
    workflow_strategies: deriveWorkflowStrategies(episodes), capability_gaps: deriveCapabilityGapSignals({ episodes, registered_capability_ids: registry.capabilities.map(item => item.capability_id) }),
  }
}

if (!command || command === "help" || command === "--help") process.stdout.write(`${usage}\n`)
else if (command === "refresh") { const generated = generateOwnerAdvisories(sources()); const writes = generated.advisories.map(advisory => inbox.append(advisory)); print({ added: writes.filter(item => !item.duplicate).length, duplicates: writes.filter(item => item.duplicate).length, suppressed: generated.suppressed, summary: inbox.summary() }) }
else if (command === "new") print(compactOwnerAdvisoryRetrieval(inbox.list({ status: "new" })))
else if (command === "recent") print(compactOwnerAdvisoryRetrieval(inbox.list()))
else if (command === "show") print(inbox.show(args[0]))
else if (command === "acknowledge") print(inbox.transition(args[0], "acknowledged"))
else if (command === "dismiss") print(inbox.transition(args[0], "dismissed"))
else if (command === "resolve") print(inbox.transition(args[0], "resolved"))
else if (command === "summary") print(inbox.summary())
else if (command === "brief") print(buildSamwiseBrief(inbox.list()))
else throw new Error(`samwise_advisory_command_unknown:${command}`)
