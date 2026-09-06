import { createHash } from "node:crypto"

export const MILLER_NORTH_LIVE_LISTENING_SCHEMA = "miller-north-live-listening-public-v1"
export const LIVE_LISTENING_STATES = Object.freeze(["public_report", "corroborated_public_report", "linked_existing_incident", "verification_in_progress", "systemic_context", "insufficient_for_incident"])
const PUBLIC_NAME_DENYLIST = /penny kerrigan|connor sutton|myra crow chief|janelle orcherton|pearl gambler|marissa smoke|thomas favel|brydon lafavour|leo manson|anne ketlo|geraldine thomas|mona johnson|jaali sutherland|yvonne houssin|dexter adams|janette sanderson|nathan cushman|leonard sylvester|lenny sylvester|rene whitstone|grant whitstone/i
const PRIVATE_FIELD = /owner_review|private_note|public_account_name|candidate_id|social_lead_id|potential_incident_id|incident_fingerprint|public_excerpt|evidence_excerpt/i
export const liveListeningId = value => `mnl_${createHash("sha256").update(String(value)).digest("hex").slice(0, 20)}`

export function validateMillerNorthLiveListeningProjection(projection, { evidenceGroupIds = [] } = {}) {
  if (projection?.schema_version !== MILLER_NORTH_LIVE_LISTENING_SCHEMA || projection?.publication_scope !== "publication_safe_public_sources" || !Array.isArray(projection.items)) throw new Error("miller_north_live_listening_projection_invalid")
  if (PRIVATE_FIELD.test(JSON.stringify(projection.items)) || PUBLIC_NAME_DENYLIST.test(JSON.stringify(projection.items))) throw new Error("miller_north_live_listening_private_or_identifying_content")
  const ids = new Set(), urls = new Set(), groupIds = new Set(evidenceGroupIds)
  for (const item of projection.items) {
    if (!/^mnl_[a-f0-9]{20}$/.test(item.listening_item_id) || ids.has(item.listening_item_id) || !LIVE_LISTENING_STATES.includes(item.evidence_state)) throw new Error("miller_north_live_listening_identity_invalid")
    ids.add(item.listening_item_id)
    if (!item.summary || !item.province || !item.date_label || !item.last_checked_date || !Array.isArray(item.sources) || !item.sources.length) throw new Error("miller_north_live_listening_required_field_missing")
    if (!/public(?:ly)? (?:source|report)|reported account|public reporting/i.test(item.summary)) throw new Error("miller_north_live_listening_summary_not_cautious")
    if (!item.sources.every(source => /^https:\/\//.test(source.url) && source.organization && source.title)) throw new Error("miller_north_live_listening_source_invalid")
    const primary = item.sources[0].url
    if (urls.has(primary)) throw new Error("miller_north_live_listening_duplicate_primary_source")
    urls.add(primary)
    if (item.linked_evidence_group_id && (!groupIds.size || !groupIds.has(item.linked_evidence_group_id))) throw new Error("miller_north_live_listening_unknown_evidence_group")
  }
  const metrics = projection.metrics || {}
  if (metrics.leads_inspected !== metrics.items_displayed + metrics.duplicates_suppressed + metrics.held_back) throw new Error("miller_north_live_listening_metrics_invalid")
  return { valid: true, items: projection.items.length, linked: projection.items.filter(item => item.linked_evidence_group_id).length, corroborated: projection.items.filter(item => item.evidence_state === "corroborated_public_report").length, reviewing: projection.items.filter(item => item.evidence_state === "verification_in_progress").length }
}
