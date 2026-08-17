import fs from "node:fs"
import path from "node:path"

export const LOCATION_QC_DECISIONS = Object.freeze(new Set(["pilot_eligible", "manual_review", "correct_address", "exclude_exact_location", "policy_problem", "defer"]))
const emptyStore = () => ({ version: 1, decisions: {}, audit: [] })
const clean = (value) => String(value || "").trim()
export function readLocationQcStore(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")) } catch { return emptyStore() } }
function atomicWrite(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temporary = `${file}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); fs.renameSync(temporary, file) }
export function reconcileLocationQcReview(report, store = emptyStore()) {
  const sample = Array.isArray(report?.quality_control_sample) ? report.quality_control_sample : []
  const records = sample.map((item) => ({ ...item, review: store.decisions[item.canonical_uuid] || null }))
  return { policy_version: report.policy_version, sample_count: records.length, active: records.filter((item) => !item.review), completed: records.filter((item) => item.review), eligible_for_later_pilot: records.filter((item) => item.review?.decision === "pilot_eligible"), shared_address_groups: report.shared_address_groups || [], audit: store.audit || [] }
}
export function saveLocationQcDecision({ report, storeFile, canonicalUuid, decision, expectedVersion, actor, note = "", now = () => new Date().toISOString() }) {
  if (!LOCATION_QC_DECISIONS.has(decision)) return { ok: false, status: 400, code: "invalid_decision" }
  const item = report.quality_control_sample?.find((candidate) => candidate.canonical_uuid === canonicalUuid)
  if (!item) return { ok: false, status: 404, code: "qc_record_not_found" }
  const store = readLocationQcStore(storeFile), previous = store.decisions[canonicalUuid] || null, currentVersion = Number(previous?.version || 0)
  if (Number(expectedVersion) !== currentVersion) return { ok: false, status: 409, code: "review_version_conflict", current: previous }
  const timestamp = now(), next = { canonical_uuid: canonicalUuid, decision, note: clean(note).slice(0, 1000), version: currentVersion + 1, policy_version: report.policy_version, classification_fingerprint: report.classification_fingerprint, reviewed_by: actor.id, reviewed_at: timestamp, updated_at: timestamp }
  store.decisions[canonicalUuid] = next
  store.audit.push({ id: store.audit.length + 1, canonical_uuid: canonicalUuid, previous_decision: previous?.decision || null, new_decision: decision, previous_version: currentVersion, new_version: next.version, actor_id: actor.id, note: next.note, created_at: timestamp })
  atomicWrite(storeFile, store)
  return { ok: true, status: previous ? 200 : 201, decision: next, audit_id: store.audit.at(-1).id, publication_created: false, location_created: false, public_map_changed: false }
}
