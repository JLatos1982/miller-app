import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"

import { mergeSamwiseResearchMemory } from "./samwiseResearchWorkflow.js"

const EMPTY = Object.freeze({ schema_version: "samwise-research-memory-store-v1", requests: [], parent_child_links: [], updated_at: null })

export function readSamwiseResearchMemoryStore(filePath) {
  if (!existsSync(filePath)) return { ...EMPTY, requests: [], parent_child_links: [] }
  const store = JSON.parse(readFileSync(filePath, "utf8"))
  if (store?.schema_version !== EMPTY.schema_version || !Array.isArray(store.requests) || !Array.isArray(store.parent_child_links)) throw new Error("samwise_research_memory_store_invalid")
  return store
}

export function persistSamwiseResearchMemory(filePath, memory, { now = new Date() } = {}) {
  if (memory?.schema_version !== "samwise-research-memory-v1" || !memory.research_request_id) throw new Error("samwise_research_memory_invalid")
  const current = readSamwiseResearchMemoryStore(filePath)
  const existing = current.requests.find(item => item.research_request_id === memory.research_request_id)
  const nextMemory = existing ? mergeSamwiseResearchMemory(existing, memory) : memory
  const requests = [...current.requests.filter(item => item.research_request_id !== memory.research_request_id), nextMemory]
  const parentChild = memory.parent_research_request_id ? [{ parent: memory.parent_research_request_id, child: memory.research_request_id }] : []
  const parent_child_links = [...current.parent_child_links, ...parentChild].filter((item, index, values) => values.findIndex(candidate => candidate.parent === item.parent && candidate.child === item.child) === index)
  const next = { schema_version: EMPTY.schema_version, requests, parent_child_links, updated_at: new Date(now).toISOString(), production_data_mutations: 0, publication_actions: 0 }
  mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp`
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, filePath)
  return next
}

export function findSamwiseResearchMemory(store, researchRequestId) {
  if (store?.schema_version !== EMPTY.schema_version) throw new Error("samwise_research_memory_store_invalid")
  return store.requests.find(item => item.research_request_id === researchRequestId) || null
}

export function samwiseResearchMemoryStatus(store) {
  if (store?.schema_version !== EMPTY.schema_version) throw new Error("samwise_research_memory_store_invalid")
  return Object.freeze({
    requests: store.requests.length,
    continuable: store.requests.filter(item => !["owner_stopped", "sources_exhausted"].includes(item.stopping_reason)).length,
    branches: store.parent_child_links.length,
    documents_seen: store.requests.reduce((sum, item) => sum + item.documents_seen.length, 0),
    findings: new Set(store.requests.flatMap(item => item.findings_produced)).size,
    production_data_mutations: 0,
    publication_actions: 0,
  })
}
