import path from "node:path"

import { createReadOnlySamwiseOwnerBriefSurface, diagnoseChatGptBridge, localSignalProducerState, samwiseSignalProducerInventory } from "../server/samwiseUnifiedSignals.js"
import listenerRegistry from "../src/data/farm-listener-registry-v1.json" with { type: "json" }

const root = path.resolve(process.cwd())
const command = process.argv[2] || "brief"
const print = value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)

if (command === "brief") print(createReadOnlySamwiseOwnerBriefSurface(root).retrieve({ limit: Number(process.argv[3] || 12) }))
else if (command === "inventory") print(samwiseSignalProducerInventory({ listenerRegistry }))
else if (command === "producer-state") print(localSignalProducerState(root))
else if (command === "bridge-health") print(diagnoseChatGptBridge())
else throw new Error("samwise_owner_brief_command_unknown")
