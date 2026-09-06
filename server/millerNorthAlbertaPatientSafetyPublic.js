export const ALBERTA_PATIENT_SAFETY_SCHEMA = "miller-north-alberta-patient-safety-public-v1"

const PRIVATE_FIELD = /owner_review|private_note|candidate_id|incident_id|patient_name|complainant_name|username|evidence_excerpt/i
const OVERCLAIM = /(?:is|was) independent|proved wrongdoing|government failed|no action occurred/i

const validateSources = (sources) => Array.isArray(sources) && sources.length > 0 && sources.every(source => source.title && source.organization && /^https:\/\//.test(source.url))

export function validateAlbertaPatientSafetyProjection(record) {
  if (record?.schema_version !== ALBERTA_PATIENT_SAFETY_SCHEMA || record?.slug !== "alberta-indigenous-patient-safety" || record?.maturity !== "dossier_ready_with_gaps") throw new Error("alberta_patient_safety_identity_invalid")
  const serialized = JSON.stringify(record)
  if (PRIVATE_FIELD.test(serialized)) throw new Error("alberta_patient_safety_private_field")
  if (OVERCLAIM.test(serialized)) throw new Error("alberta_patient_safety_overclaim")
  if (!validateSources(record.sources) || !Array.isArray(record.timeline) || !record.timeline.every(item => item.date && validateSources(item.sources))) throw new Error("alberta_patient_safety_timeline_source_invalid")
  if (!Array.isArray(record.evidence_path) || record.evidence_path.length < 5 || !record.evidence_path.every(edge => edge.from && edge.relationship && edge.to && validateSources(edge.sources))) throw new Error("alberta_patient_safety_edge_invalid")
  if (!Array.isArray(record.dossier_sections) || record.dossier_sections.length < 3 || !record.dossier_sections.every(section => section.title && section.items?.every(item => item.title && item.text && validateSources(item.sources)))) throw new Error("alberta_patient_safety_section_invalid")
  if (!record.what_remains_unclear?.some(item => /No comprehensive (?:role-specific )?public outcome reporting was located/.test(item.text))) throw new Error("alberta_patient_safety_outcome_limit_missing")
  return { valid: true, timeline_events: record.timeline.length, evidence_edges: record.evidence_path.length, source_count: record.sources.length, maturity: record.maturity }
}
