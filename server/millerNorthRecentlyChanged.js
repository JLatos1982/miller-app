export const MILLER_NORTH_RECENTLY_CHANGED_SCHEMA = "miller-north-recently-changed-public-v1"

export const MATERIAL_CHANGE_TYPES = Object.freeze([
  "new_evidence",
  "formal_finding_added",
  "institutional_response",
  "implementation_update",
  "outcome_update",
  "source_correction",
  "superseding_document",
  "relationship_update",
])

const PRIVATE_OR_TECHNICAL = /owner_review|private_note|candidate_id|incident_id|patient_name|complainant_name|fingerprint|reindex|regenerat|code deploy|deployment|formatting|last_checked|last_reviewed/i
const HUMAN_LABELS = new Map([
  ["new_evidence", "New evidence"],
  ["formal_finding_added", "Formal finding added"],
  ["institutional_response", "Institutional response"],
  ["implementation_update", "Implementation update"],
  ["outcome_update", "Outcome update"],
  ["source_correction", "Corrected"],
  ["superseding_document", "New source"],
  ["relationship_update", "Evidence connection updated"],
])

const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
const isHttps = value => /^https:\/\//.test(String(value || ""))
const clean = value => String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim()

export function materialChangeLabel(type) {
  return HUMAN_LABELS.get(type) || null
}

// This validates a deliberately small public projection. It is not a general
// audit log: internal refreshes, review dates and deployment activity cannot
// enter the reader-facing "Recently Changed" surface.
export function validateMillerNorthRecentlyChangedProjection(projection, { publicRecordIds = [] } = {}) {
  if (projection?.schema_version !== MILLER_NORTH_RECENTLY_CHANGED_SCHEMA || projection?.publication_scope !== "approved_public_material_changes" || !Array.isArray(projection.items)) throw new Error("miller_north_recently_changed_projection_invalid")
  const publicIds = new Set(publicRecordIds)
  const ids = new Set()
  for (const item of projection.items) {
    const serialized = JSON.stringify(item)
    if (PRIVATE_OR_TECHNICAL.test(serialized)) throw new Error("miller_north_recently_changed_private_or_technical_content")
    if (!/^mnc_[a-z0-9_]{12,120}$/.test(item.change_id) || ids.has(item.change_id)) throw new Error("miller_north_recently_changed_identity_invalid")
    ids.add(item.change_id)
    if (!MATERIAL_CHANGE_TYPES.includes(item.material_change_type) || !materialChangeLabel(item.material_change_type)) throw new Error("miller_north_recently_changed_type_invalid")
    if (!item.public_record_id || (publicIds.size && !publicIds.has(item.public_record_id))) throw new Error("miller_north_recently_changed_record_not_public")
    if (!clean(item.title) || !clean(item.what_changed) || !clean(item.province) || !isDate(item.material_change_date) || !clean(item.source?.organization) || !clean(item.source?.title) || !clean(item.source?.period) || !isHttps(item.source?.url) || !/^\/indigenous-healthcare-evidence\//.test(String(item.record_href || ""))) throw new Error("miller_north_recently_changed_required_field_missing")
  }
  return Object.freeze({ valid: true, items: projection.items.length, newest_material_change_at: projection.items.map(item => item.material_change_date).sort().at(-1) || null })
}
