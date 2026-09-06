import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { dateSemantics, deriveSourcePublicationTiming, displayDateSemantics } from "../src/millerNorthDateSemantics.js"

export { dateSemantics, deriveSourcePublicationTiming, displayDateSemantics }

export const MILLER_NORTH_RECONSTRUCTED_CORPUS_ID = "miller-north-reconstructed-corpus-v2"
export const MILLER_NORTH_CORPUS_CONTRACT_VERSION = "miller-north-corpus-contract-v2"

export const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`
  return JSON.stringify(value)
}
export const corpusFingerprint = records => createHash("sha256").update(canonicalJson(records), "utf8").digest("hex")
const cleanUrl = value => { try { return new URL(String(value)).toString() } catch { return "" } }

export function preflightCorpus(records) {
  const sourceGroups = new Map(), duplicates = new Map()
  for (const record of records) {
    const source = cleanUrl(record.source?.url) || `missing:${record.public_record_id}`
    sourceGroups.set(source, [...(sourceGroups.get(source) || []), record.public_record_id])
    const key = [record.province || "unknown", record.evidence_status || "unknown", String(record.summary || "").replace(/\s+/g, " ").trim().toLowerCase()].join("\u001f")
    duplicates.set(key, [...(duplicates.get(key) || []), record.public_record_id])
  }
  const semanticCounts = { exact_event_date: 0, event_year_only: 0, publication_date_only: 0, approximate_event_year: 0, conflicting_dates: 0, no_useful_date: 0 }
  for (const record of records) {
    const date = dateSemantics(record)
    if (date.event_date) semanticCounts.exact_event_date += 1
    else if (date.event_year) semanticCounts.event_year_only += 1
    else if (date.publication_date || date.source_publication_year) semanticCounts.publication_date_only += 1
    else semanticCounts.no_useful_date += 1
  }
  const by = field => Object.fromEntries([...Object.entries(Object.groupBy(records, record => record[field] || "unknown"))].map(([key, rows]) => [key, rows.length]))
  const duplicateSourceGroups = [...sourceGroups.entries()].filter(([, rows]) => rows.length > 1).map(([source_url, public_record_ids]) => ({ source_url, public_record_ids }))
  return { record_count: records.length, fingerprint: corpusFingerprint(records), schema: [...new Set(records.map(record => Object.keys(record).sort().join(",")))].sort(), duplicate_source_record_count: duplicateSourceGroups.reduce((sum, group) => sum + group.public_record_ids.length, 0), duplicate_source_group_count: duplicateSourceGroups.length, duplicate_source_groups: duplicateSourceGroups.slice(0, 50), obvious_duplicate_groups: [...duplicates.values()].filter(rows => rows.length > 1), date_coverage: semanticCounts, province_coverage: by("province"), evidence_status_coverage: by("evidence_status"), source_type_coverage: Object.fromEntries([...Object.entries(Object.groupBy(records, record => record.source?.source_type || "unknown"))].map(([key, rows]) => [key, rows.length])), provenance_fields: ["public_record_id", "source.title", "source.publisher", "source.url", "source.publication_date", "source.source_type", "methodology", "caution"] }
}

export function loadReconstructedCorpus({ sourcePath = new URL("../src/data/indigenous-healthcare-evidence-public-v1.json", import.meta.url) } = {}) {
  const data = JSON.parse(readFileSync(sourcePath, "utf8"))
  return { records: data.records, sourcePath: sourcePath.pathname || String(sourcePath), preflight: preflightCorpus(data.records) }
}
