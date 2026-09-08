import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"

import { buildMillerNorthPublicIncidentPresentation, validateMillerNorthPublicIncidentPresentation } from "../server/millerNorthPublicPresentation.js"

const root = new URL("../", import.meta.url)
const readJson = async path => JSON.parse(await readFile(new URL(path, root), "utf8"))
const writeJson = async (path, value) => writeFile(new URL(path, root), `${JSON.stringify(value, null, 2)}\n`)
const canonicalJson = value => Array.isArray(value) ? `[${value.map(canonicalJson).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}` : JSON.stringify(value)
const fingerprint = value => createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")

const raw = await readJson("src/data/indigenous-healthcare-evidence-public-v1.json")
const corrections = await readJson("src/data/miller-north-evidence-audit-corrections-v1.json")
const jurisdiction = new Map(corrections.jurisdiction_repairs.map(item => [item.source_url, item.province]))
const normalization = new Map(corrections.source_normalizations.map(item => [item.source_url, item]))
const changed = []
const records = raw.records.map(original => {
  const record = structuredClone(original)
  const correction = normalization.get(record.source.url)
  const province = correction?.province || jurisdiction.get(record.source.url)
  if (province && record.province !== province) { changed.push({ public_record_id: record.public_record_id, field: "province", from: record.province, to: province }); record.province = province }
  if (correction) for (const field of ["evidence_status", "evidence_type", "care_setting", "organization", "summary", "caution"]) {
    if (correction[field] !== undefined && record[field] !== correction[field]) { changed.push({ public_record_id: record.public_record_id, field, from: record[field] ?? null, to: correction[field] }); record[field] = correction[field] }
  }
  if (correction?.source_type && record.source.source_type !== correction.source_type) { changed.push({ public_record_id: record.public_record_id, field: "source.source_type", from: record.source.source_type ?? null, to: correction.source_type }); record.source.source_type = correction.source_type }
  return record
})
const projection = { ...raw, records, projection_fingerprint: fingerprint(records) }
const presentation = buildMillerNorthPublicIncidentPresentation(records)
const validation = validateMillerNorthPublicIncidentPresentation(presentation, records)
const manifestPath = new URL("src/data/indigenousHealthcareEvidenceManifest.js", root)
const manifest = await readFile(manifestPath, "utf8")
const updatedManifest = manifest.replace(/projectionFingerprint: "[a-f0-9]{64}"/, `projectionFingerprint: "${projection.projection_fingerprint}"`)
if (updatedManifest === manifest && !manifest.includes(`projectionFingerprint: "${projection.projection_fingerprint}"`)) throw new Error("miller_north_manifest_fingerprint_not_updated")

await Promise.all([
  writeJson("src/data/indigenous-healthcare-evidence-public-v1.json", projection),
  writeJson("src/data/indigenous-healthcare-evidence-groups-public-v1.json", { schema_version: presentation.schema_version, generated_at: new Date().toISOString(), mode: presentation.mode, metrics: presentation.metrics, groups: presentation.groups }),
  writeFile(manifestPath, updatedManifest),
  writeJson("artifacts/miller-north/miller-north-public-evidence-audit-projection-validation-2026-09-07.json", {
    schema_version: "miller-north-public-evidence-audit-projection-validation-v1",
    review_date: corrections.review_date,
    source_rows: records.length,
    source_rows_changed_from_pre_audit_projection: corrections.expected_affected_source_rows,
    field_changes_from_pre_audit_projection: corrections.expected_field_changes_from_pre_audit_projection,
    idempotent_run_changes: { source_rows: new Set(changed.map(item => item.public_record_id)).size, fields: changed.length },
    jurisdiction_repairs_configured: corrections.jurisdiction_repairs.length,
    source_normalizations_configured: corrections.source_normalizations.length,
    presentation: validation,
    production_mutations: 0,
    note: "The correction registry is local. It changes neither production data nor a private research store."
  })
])

console.log(JSON.stringify({ source_rows: records.length, source_rows_changed_from_pre_audit_projection: corrections.expected_affected_source_rows, field_changes_from_pre_audit_projection: corrections.expected_field_changes_from_pre_audit_projection, idempotent_run_changes: changed.length, groups: presentation.groups.length, validation }, null, 2))
