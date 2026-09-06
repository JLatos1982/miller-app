export const MILLER_NORTH_EMERGING_CASES_SCHEMA = "miller-north-emerging-cases-public-v1"
export const EMERGING_CASE_STAGES = Object.freeze(["lead", "emerging_case", "dossier_candidate", "research_policy_case"])

const PRIVATE_FIELD = /owner_review|private_note|candidate_id|incident_id|patient_name|complainant_name|username|evidence_excerpt|public_excerpt/i
const PRIVATE_PERSON = /yvonne houssin|nathan cushman/i
const DISPLAY_STATES = new Set(["Developing", "Monitoring implementation", "Awaiting public response", "Policy change underway", "Follow-up evidence pending", "Implementation evidence pending", "Policy evidence available", "Awaiting public report"])

export function validateMillerNorthEmergingCasesProjection(projection) {
  if (projection?.schema_version !== MILLER_NORTH_EMERGING_CASES_SCHEMA || projection?.publication_scope !== "publication_safe_public_sources" || !Array.isArray(projection.items)) throw new Error("miller_north_emerging_projection_invalid")
  const serialized = JSON.stringify(projection.items)
  if (PRIVATE_FIELD.test(serialized) || PRIVATE_PERSON.test(serialized)) throw new Error("miller_north_emerging_private_or_identifying_content")
  const ids = new Set()
  for (const item of projection.items) {
    if (!/^mne_[a-f0-9]{20}$/.test(item.emerging_case_id) || ids.has(item.emerging_case_id)) throw new Error("miller_north_emerging_identity_invalid")
    ids.add(item.emerging_case_id)
    if (!EMERGING_CASE_STAGES.includes(item.stage) || item.stage === "research_policy_case" || !DISPLAY_STATES.has(item.display_state)) throw new Error("miller_north_emerging_stage_invalid")
    if (!item.title || !item.province || !item.description || !item.why_watching || !item.latest_update_date || !item.next_question) throw new Error("miller_north_emerging_required_field_missing")
    if (!Array.isArray(item.sources) || !item.sources.length || !item.sources.every(source => source.title && source.organization && /^https:\/\//.test(source.url))) throw new Error("miller_north_emerging_source_invalid")
    if (/did not respond|failed to|unimplemented|proven|victim/i.test(`${item.description} ${item.why_watching}`)) throw new Error("miller_north_emerging_overclaim")
  }
  return {
    valid: true,
    items: projection.items.length,
    provinces: new Set(projection.items.map(item => item.province)).size,
    dossier_candidates: projection.items.filter(item => item.stage === "dossier_candidate").length,
    evidence_bearing: projection.items.filter(item => item.sources.length > 0).length,
  }
}
