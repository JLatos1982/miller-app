import { mkdirSync, writeFileSync } from "node:fs"
import { loadReconstructedCorpus, MILLER_NORTH_RECONSTRUCTED_CORPUS_ID } from "../server/millerNorthCorpus.js"

const { records, sourcePath, preflight } = loadReconstructedCorpus()
const createdAt = new Date().toISOString()
const contract = {
  contract_version: "miller-north-corpus-contract-v2",
  corpus_id: MILLER_NORTH_RECONSTRUCTED_CORPUS_ID,
  created_at: createdAt,
  source_artifact_path: sourcePath.replace(process.cwd(), "."),
  record_count: records.length,
  corpus_fingerprint: preflight.fingerprint,
  provenance_note: "Reconstructed working corpus registered as a new version. It is not the missing original registered Miller North private-corpus checkpoint and must not be represented as continuous with it.",
  relationship_to_missing_checkpoint: "successor_reconstruction_without_historical_checkpoint_continuity",
  authority: { read: "miller_north_local_tools", proposal: "miller_north_private_staging_only", public_or_production_mutation: "not_authorized" },
  schema: preflight.schema,
}
mkdirSync("artifacts/miller-north", { recursive: true })
writeFileSync("artifacts/miller-north/reconstructed-corpus-v2-contract.json", `${JSON.stringify(contract, null, 2)}\n`)
writeFileSync("artifacts/miller-north/reconstructed-corpus-v2-preflight.json", `${JSON.stringify({ generated_at: createdAt, corpus_id: MILLER_NORTH_RECONSTRUCTED_CORPUS_ID, source_artifact_path: contract.source_artifact_path, ...preflight }, null, 2)}\n`)
console.log(JSON.stringify({ corpus_id: contract.corpus_id, record_count: records.length, fingerprint: preflight.fingerprint, bounded_read: records.slice(0, 3).map(record => record.public_record_id) }, null, 2))
