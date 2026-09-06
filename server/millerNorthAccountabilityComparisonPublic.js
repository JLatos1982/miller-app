export const ACCOUNTABILITY_COMPARISON_SCHEMA = "miller-north-accountability-comparison-public-v1"

const EXPECTED_FIELDS = Object.freeze([
  "complaint_entry_point", "investigator_reviewer", "institutional_home", "indigenous_specific_mechanism",
  "authority", "recommendations", "appeal_reconsideration", "public_reporting", "aggregate_outcome_reporting",
  "implementation_follow_up", "indigenous_governance_input", "major_transparency_gap",
])
const PRIVATE_FIELD = /owner_review|private_note|patient_name|complainant_name|internal_id|candidate_id/i
const RANKING = /best|worst|better province|more effective|more racist/i

export function validateAccountabilityComparisonProjection(record) {
  if (record?.schema_version !== ACCOUNTABILITY_COMPARISON_SCHEMA || !record.caution || record.mechanisms?.length !== 3) throw new Error("accountability_comparison_identity")
  const serialized = JSON.stringify(record)
  if (PRIVATE_FIELD.test(serialized)) throw new Error("accountability_comparison_private_field")
  if (RANKING.test(serialized)) throw new Error("accountability_comparison_ranking")
  const sources = record.sources || {}
  for (const source of Object.values(sources)) if (!source.title || !source.organization || !/^https:\/\//.test(source.url)) throw new Error("accountability_comparison_source")
  for (const mechanism of record.mechanisms) {
    if (!mechanism.province || !mechanism.mechanism || !mechanism.case_slug || mechanism.fields?.length !== EXPECTED_FIELDS.length) throw new Error("accountability_comparison_mechanism")
    const fields = new Set()
    for (const field of mechanism.fields) {
      if (!EXPECTED_FIELDS.includes(field.field) || fields.has(field.field) || !field.label || !field.value || !field.source_ids?.length) throw new Error("accountability_comparison_cell")
      fields.add(field.field)
      if (field.source_ids.some(id => !sources[id])) throw new Error("accountability_comparison_source_reference")
    }
  }
  return { valid: true, provinces: 3, fields_per_province: EXPECTED_FIELDS.length, sourced_cells: record.mechanisms.reduce((sum, item) => sum + item.fields.length, 0) }
}
