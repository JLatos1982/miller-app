import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dateSemantics, loadReconstructedCorpus, MILLER_NORTH_RECONSTRUCTED_CORPUS_ID } from "../server/millerNorthCorpus.js"

const requested = Number(process.argv.find(arg => arg.startsWith("--limit="))?.split("=")[1] || 100)
const limit = Math.max(1, Math.min(100, requested)), chunkSize = 20
const { records } = loadReconstructedCorpus()
const eligible = records.filter(record => !Number.isInteger(record.year))
const proposalPath = "artifacts/miller-north/reconstructed-corpus-v2-date-recovery-proposals.json"
const prior = existsSync(proposalPath) ? JSON.parse(readFileSync(proposalPath, "utf8")).proposals || [] : []
const completed = new Set(prior.map(item => item.public_record_id))
const selected = eligible.map(record => ({ record, semantic: dateSemantics(record) })).filter(({ record, semantic }) => !completed.has(record.public_record_id) && (semantic.publication_date || semantic.source_publication_year)).slice(0, limit)
const proposals = selected.map(({ record, semantic }) => ({ public_record_id: record.public_record_id, proposal_state: "staged_private_review", date_semantics: { event_date: null, event_year: null, approximate_event_year: null, publication_date: semantic.publication_date, source_publication_year: semantic.source_publication_year, confidence: "publication_only", derivation_method: semantic.derivation_method }, evidence: { source_url: record.source.url, source_title: record.source.title, source_publisher: record.source.publisher, source_type: record.source.source_type, source_publication_date_existing: record.source.publication_date || null }, note: "Source timing was deterministically recovered from existing source metadata/URL. It is not asserted to be an incident event date or year." }))
const report = { generated_at: new Date().toISOString(), corpus_id: MILLER_NORTH_RECONSTRUCTED_CORPUS_ID, mode: "private_staging_no_public_record_mutation", chunk_size: chunkSize, records_needing_date_year_recovery: eligible.length, records_processed: selected.length, exact_event_dates_recovered: 0, event_years_recovered: 0, approximate_event_years_recovered: 0, publication_only_dates_recovered: proposals.length, unresolved_in_processed: 0, conflicts_discovered: 0, chunks: Array.from({ length: Math.ceil(selected.length / chunkSize) }, (_, index) => ({ chunk: index + 1, record_ids: selected.slice(index * chunkSize, (index + 1) * chunkSize).map(({ record }) => record.public_record_id), status: "complete" })) }
mkdirSync("artifacts/miller-north", { recursive: true })
writeFileSync(proposalPath, `${JSON.stringify({ schema_version: "miller-north-date-recovery-proposals-v2", corpus_id: MILLER_NORTH_RECONSTRUCTED_CORPUS_ID, proposals: [...prior, ...proposals] }, null, 2)}\n`)
writeFileSync("artifacts/miller-north/reconstructed-corpus-v2-date-recovery-report.json", `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
