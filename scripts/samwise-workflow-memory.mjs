import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import registry from "../src/data/samwise-capability-intelligence-registry-v1.json" with { type: "json" }
import nativeMemory from "../artifacts/samwise/native-app-build-validation-miller-navigator-memory-2026-09-08.json" with { type: "json" }
import { createWorkflowEpisode, createWorkflowMemoryStore, deriveCapabilityGapSignals, deriveWorkflowStrategies, extractNativeAppWorkflowEpisodes, extractWorkObserverEpisodes, recommendPriorWorkflowExperience, summarizeWorkflowFailures } from "../server/samwiseWorkflowMemory.js"

const usage = `Usage: npm run samwise:workflow-memory -- <status|recent|strategies|failures|gaps|similar|record|ingest-existing> [options]
  similar --input=<repo-relative-task.json>
  record --input=<repo-relative-episode.json>
  ingest-existing  # explicit local import from native-app memory and work-observer journal
All output is local and advisory; no workflow is executed.`
const args = process.argv.slice(2)
const command = args.shift()
const option = name => { const item = args.find(value => value.startsWith(`--${name}=`)); return item ? item.slice(name.length + 3) : null }
const root = path.resolve(process.cwd())
const store = createWorkflowMemoryStore(root)
const print = value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
const repoJson = value => {
  const candidate = path.resolve(root, value || "")
  if (!value || (candidate !== root && !candidate.startsWith(`${root}${path.sep}`))) throw new Error("samwise_workflow_memory_input_must_be_repo_relative")
  return JSON.parse(readFileSync(candidate, "utf8"))
}
const observerEvents = () => {
  const eventPath = path.join(root, "artifacts/samwise/runtime/work-observer/work-events-v1.ndjson")
  return existsSync(eventPath) ? readFileSync(eventPath, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) : []
}
const episodes = () => store.list(500)

if (!command || command === "help" || command === "--help") process.stdout.write(`${usage}\n`)
else if (command === "status") print(store.status())
else if (command === "recent") print(episodes().slice(0, Number(option("limit")) || 20))
else if (command === "strategies") print(deriveWorkflowStrategies(episodes()))
else if (command === "failures") print(summarizeWorkflowFailures(episodes()))
else if (command === "gaps") print(deriveCapabilityGapSignals({ episodes: episodes(), registered_capability_ids: registry.capabilities.map(item => item.capability_id) }))
else if (command === "similar") print(recommendPriorWorkflowExperience({ episodes: episodes(), task: repoJson(option("input")) }))
else if (command === "record") print(store.append(repoJson(option("input"))))
else if (command === "ingest-existing") {
  const candidates = [...extractNativeAppWorkflowEpisodes(nativeMemory), ...extractWorkObserverEpisodes(observerEvents())]
  const existing = new Map(store.list(500).map(item => [item.source_observation_ids.join("|"), item]))
  const results = candidates.map(item => {
    const prior = existing.get(item.source_observation_ids.join("|"))
    const candidate = createWorkflowEpisode(item)
    const priorContent = prior ? createWorkflowEpisode({ ...prior, supersedes_episode_id: null }).content_fingerprint : null
    if (priorContent === candidate.content_fingerprint) return { episode: prior, duplicate: true }
    return store.append({ ...item, supersedes_episode_id: prior?.episode_id })
  })
  print({ imported: results.filter(item => !item.duplicate).length, duplicates: results.filter(item => item.duplicate).length, status: store.status() })
} else throw new Error(`samwise_workflow_memory_command_unknown:${command}`)
