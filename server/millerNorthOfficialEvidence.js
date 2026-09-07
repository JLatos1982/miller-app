const text = value => typeof value === "string" && value.trim().length > 0

export const INCIDENT_EVIDENCE_LABELS = Object.freeze({
  lead: "Lead",
  reported_account: "Reported account",
  independently_corroborated: "Independently corroborated",
  institutional_acknowledgement: "Institution acknowledged",
  formal_process_evidence: "Formal process evidence",
  final_formal_outcome: "Formal outcome",
})

const FORMAL_PROCESS_ROLES = new Set([
  "coroner_finding",
  "jury_verdict",
  "fatality_inquiry_report",
  "death_review_panel_report",
  "regulator_finding",
  "tribunal_decision",
  "court_decision",
])
const FINAL_OUTCOME_ROLES = new Set(["regulator_finding", "tribunal_merits_decision", "court_judgment"])
const INSTITUTIONAL_ROLES = new Set(["institutional_statement", "organizational_response", "government_response"])
const INDEPENDENT_ROLES = new Set(["indigenous_led_report", "indigenous_journalism", "independent_journalism", "media_corroboration"])
const FORBIDDEN_PUBLIC_FIELDS = new Set(["private_notes", "owner_notes", "patient_name", "medical_records", "private_contact", "internal_workflow_state"])

export function deriveIncidentEvidenceStrength(sources = []) {
  const roles = [...new Set(sources.map(source => source?.role).filter(Boolean))]
  const has = values => roles.some(role => values.has(role))
  let key = "lead"
  if (roles.length) key = "reported_account"
  if (has(INDEPENDENT_ROLES) && roles.length > 1) key = "independently_corroborated"
  if (has(INSTITUTIONAL_ROLES)) key = "institutional_acknowledgement"
  if (has(FORMAL_PROCESS_ROLES)) key = "formal_process_evidence"
  if (sources.some(source => source?.final_outcome === true) || has(FINAL_OUTCOME_ROLES)) key = "final_formal_outcome"
  return {
    key,
    label: INCIDENT_EVIDENCE_LABELS[key],
    source_roles: roles,
    note: "This label describes the strongest public evidence role located; it does not determine causation, wrongdoing or the truth of every reported claim.",
  }
}

export function officialEvidenceAdded(previousSources = [], nextSources = [], addedAt) {
  const priorUrls = new Set(previousSources.map(source => source.url))
  const additions = nextSources.filter(source => !priorUrls.has(source.url))
  const official = additions.filter(source => FORMAL_PROCESS_ROLES.has(source.role) || INSTITUTIONAL_ROLES.has(source.role))
  if (!official.length) return null
  return {
    added_at: addedAt,
    source_count: official.length,
    source_roles: [...new Set(official.map(source => source.role))],
    label: `Official evidence added ${addedAt}`,
  }
}

export function validatePublicSeriousHarmProjection(projection) {
  if (projection?.schema_version !== "miller-north-serious-harm-public-v1" || !Array.isArray(projection.incidents)) throw new Error("miller_north_serious_harm_projection_invalid")
  const ids = new Set()
  for (const incident of projection.incidents) {
    if (!/^mnsh_[a-z0-9_]+$/.test(incident.public_incident_id || "") || ids.has(incident.public_incident_id)) throw new Error("miller_north_serious_harm_id_invalid")
    if (!["British Columbia", "Alberta", "Saskatchewan"].includes(incident.province) || !text(incident.title) || !text(incident.summary) || !text(incident.care_setting) || !/^\d{4}(-\d\d(-\d\d)?)?$/.test(incident.event_date || "") || !/^\d{4}-\d\d-\d\d$/.test(incident.last_reviewed || "")) throw new Error("miller_north_serious_harm_record_invalid")
    if (!Array.isArray(incident.sources) || !incident.sources.length || !incident.sources.every(source => text(source.title) && text(source.role) && /^https:\/\//.test(source.url || ""))) throw new Error("miller_north_serious_harm_source_invalid")
    if (!INCIDENT_EVIDENCE_LABELS[incident.evidence_strength?.key] || incident.evidence_strength.label !== INCIDENT_EVIDENCE_LABELS[incident.evidence_strength.key]) throw new Error("miller_north_serious_harm_strength_invalid")
    if (Object.keys(incident).some(key => FORBIDDEN_PUBLIC_FIELDS.has(key))) throw new Error("miller_north_serious_harm_private_field")
    if (incident.affected_person && incident.affected_person !== "Not publicly named") throw new Error("miller_north_serious_harm_unnecessary_identity")
    ids.add(incident.public_incident_id)
  }
  return { valid: true, incidents: projection.incidents.length }
}
