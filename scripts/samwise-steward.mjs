import path from "node:path"

import { createFarmStewardStore, createSamwiseAutonomyPolicy, deriveAutonomyPromotionProposals, deriveListenerOpportunities, recordStewardLearning, runFarmStewardOnce, stewardMaintenanceOpportunities } from "../server/samwiseFarmSteward.js"
import { createWorkflowMemoryStore } from "../server/samwiseWorkflowMemory.js"
import registry from "../src/data/samwise-capability-intelligence-registry-v1.json" with { type: "json" }
import policyData from "../src/data/samwise-autonomy-policy-v1.json" with { type: "json" }
import listenerRegistry from "../src/data/farm-listener-registry-v1.json" with { type: "json" }

const root = path.resolve(process.cwd())
const policy = createSamwiseAutonomyPolicy(policyData)
const command = process.argv[2] || "status"
const print = value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
const workflowStore = createWorkflowMemoryStore(root)
const episodes = workflowStore.list(500)
const opportunities = stewardMaintenanceOpportunities({ root, registry })
const proposal = () => deriveAutonomyPromotionProposals({ episodes, registry })
const listenerOpportunities = () => deriveListenerOpportunities({ observations: [], existing_listener_source_families: listenerRegistry.listeners.map(item => item.source_family) })

if (command === "status") print({ policy: { version: policy.version, autonomous_entries: policy.entries.filter(item => item.autonomy_level === "autonomous_allowed" && item.owner_approved).length }, steward: createFarmStewardStore(root).status(), workflow_memory: workflowStore.status(), promotion_proposals: proposal().length })
else if (command === "eligible") print((await runFarmStewardOnce({ root, policy, registry, opportunities })).decisions.map(item => ({ task_id: item.task.task_id, ...item.decision })))
else if (command === "run-once") { const result = await runFarmStewardOnce({ root, policy, registry, opportunities }); print({ run: result.record, learning: recordStewardLearning({ root, run: result.record, registry, policy, promotion_proposals: proposal(), listener_opportunities: listenerOpportunities() }) }) }
else if (command === "proposals") print({ autonomy_promotions: proposal(), listener_opportunities: listenerOpportunities() })
else if (command === "history") print(createFarmStewardStore(root).history())
else if (command === "policy") print(policy)
else throw new Error("samwise_steward_command_unknown")
