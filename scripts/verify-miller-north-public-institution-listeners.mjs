#!/usr/bin/env node
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import sourceRegistry from "../src/data/miller-north-public-institution-source-registry-v1.json" with { type: "json" }
import { dispatchFarmIgorJob } from "../server/farmIgorWorker.js"
import { PUBLIC_INSTITUTION_LISTENER_CONFIGS, runPublicInstitutionIndexListener } from "../server/farmPublicInstitutionListeners.js"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const started = Date.now()
const listenerResults = []

for (const [adapter, config] of Object.entries(PUBLIC_INSTITUTION_LISTENER_CONFIGS)) {
  const began = Date.now()
  try {
    const result = await runPublicInstitutionIndexListener({ listenerId: `verify:${adapter}`, ...config })
    listenerResults.push({ adapter, status: "completed", checked: result.checked, new_documents: result.new_documents, owner_review: result.owner_review, domain: config.domain, duration_ms: Date.now() - began })
  } catch (error) {
    listenerResults.push({ adapter, status: "failed_closed", checked: 0, error: String(error?.message || error).slice(0, 160), domain: config.domain, duration_ms: Date.now() - began })
  }
}

const igorStarted = Date.now()
const igor = await dispatchFarmIgorJob({
  root,
  capability: "listener_batch_parse",
  payload: {
    items: sourceRegistry.sources.map(source => ({
      id: source.source_id,
      title: `${source.agency} — ${source.source_family}`,
      url: source.public_index,
      province: source.province,
      domain: source.domain,
      listener_status: source.listener_status,
    })),
  },
  timeoutMs: 30_000,
})

console.log(JSON.stringify({
  schema_version: "miller-north-public-institution-verification-v1",
  generated_at: new Date().toISOString(),
  listener_results: listenerResults,
  listener_summary: {
    attempted: listenerResults.length,
    completed: listenerResults.filter(item => item.status === "completed").length,
    failed_closed: listenerResults.filter(item => item.status === "failed_closed").length,
    documents_indexed: listenerResults.reduce((sum, item) => sum + Number(item.checked || 0), 0),
    baseline_new_documents: listenerResults.reduce((sum, item) => sum + Number(item.new_documents || 0), 0),
    owner_review: listenerResults.reduce((sum, item) => sum + Number(item.owner_review || 0), 0),
  },
  igor: {
    capability: "listener_batch_parse",
    checked: igor.checked,
    valid: igor.valid,
    duplicates_suppressed: igor.duplicates_suppressed,
    owner_review: igor.owner_review.length,
    duration_ms: Date.now() - igorStarted,
    mutation_authority: false,
    publication_authority: false,
  },
  total_duration_ms: Date.now() - started,
  production_writes: 0,
  publication_writes: 0,
}))
