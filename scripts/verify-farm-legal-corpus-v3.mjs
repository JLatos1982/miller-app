import corpus from "../artifacts/miller-legal/farm-legal-corpus-mining-v3.json" with { type: "json" }
import { dispatchFarmIgorJob, probeFarmIgor } from "../server/farmIgorWorker.js"
import { buildFarmLegalReviewItems } from "../server/farmSupabaseInteraction.js"

const root = new URL("../", import.meta.url).pathname
const batch = corpus.new_records.map(record => ({
  id: record.legal_record_id,
  citation: record.citation,
  source_url: record.source_url,
  process_role: record.process_role,
}))

batch.push({ id: "duplicate_check", citation: corpus.new_records[0].citation, source_url: corpus.new_records[0].source_url })
batch.push({ id: "malformed_check", citation: "decision without a neutral citation", source_url: "https://example.invalid/private-review" })

const healthBefore = await probeFarmIgor(root)
const started = performance.now()
const result = await dispatchFarmIgorJob({
  root,
  capability: "legal_citation_normalization",
  payload: { items: batch },
  timeoutMs: 30_000,
})
const durationMs = Math.round((performance.now() - started) * 100) / 100
const healthAfter = await probeFarmIgor(root)

const expected = new Set(corpus.new_records.map(record => record.citation))
const returned = new Set(result.records.map(record => record.citation))
const missing = [...expected].filter(citation => !returned.has(citation))
const reviewItems = buildFarmLegalReviewItems(corpus.new_records, "2026-09-08T00:00:00Z")

console.log(JSON.stringify({
  schema_version: "farm-legal-corpus-v3-igor-verification",
  mutation_authority: false,
  publication_authority: false,
  health_before: healthBefore,
  batch: {
    submitted: batch.length,
    canonical_records: corpus.new_records.length,
    checked: result.checked,
    valid: result.valid,
    duplicates_suppressed: result.duplicates_suppressed,
    owner_review: result.owner_review,
    missing,
  },
  duration_ms: durationMs,
  private_review_payload: {
    items: reviewItems.length,
    item_types: [...new Set(reviewItems.map(item => item.item_type))],
    publication_authority: false,
    mutation_authority: false,
  },
  health_after: healthAfter,
}, null, 2))
