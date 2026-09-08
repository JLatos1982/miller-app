#!/usr/bin/env node
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import corpus from "../artifacts/miller-legal/farm-legal-corpus-mining-v4.json" with { type: "json" }
import { dispatchFarmIgorJob } from "../server/farmIgorWorker.js"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const started = Date.now()
const result = await dispatchFarmIgorJob({
  root,
  capability: "legal_citation_normalization",
  payload: { items: corpus.legal_matters.map(item => ({ id: item.legal_record_id, citation: item.citation || "", title: item.decision_identifier || item.case_name || "", source_url: item.source_url || "", process_role: item.process_role || "owner_review_required" })) },
  timeoutMs: 30_000,
})

console.log(JSON.stringify({
  schema_version: "farm-legal-v4-igor-verification-v1",
  generated_at: new Date().toISOString(),
  checked: result.checked,
  valid_neutral_citations: result.valid,
  duplicates_suppressed: result.duplicates_suppressed,
  owner_review: result.owner_review,
  duration_ms: Date.now() - started,
  interpretation: "Igor normalized neutral citations and identified duplicate or non-neutral identifiers only. It did not assess merits, identity, liability, discrimination or publication.",
  mutation_authority: false,
  publication_authority: false
}))
