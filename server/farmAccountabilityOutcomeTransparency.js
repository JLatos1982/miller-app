export const ACCOUNTABILITY_OUTCOME_FIELDS = Object.freeze([
  "intake_volume",
  "accepted_cases",
  "completed_reviews",
  "recommendations",
  "referrals",
  "remedies_resolutions",
  "systemic_themes",
  "policy_system_changes",
  "annual_public_reporting",
  "follow_up_implementation",
])

export const ACCOUNTABILITY_REPORTING_STATES = Object.freeze([
  "publicly_reported",
  "partially_reported",
  "reported_only_at_parent_office_level",
  "mentioned_without_count",
  "not_located",
  "reporting_not_required_publicly",
  "unclear",
])

export const ACCOUNTABILITY_RELATIONSHIP_STRENGTHS = Object.freeze([
  "direct_attribution",
  "explicit_contribution",
  "related_but_not_attributed",
  "temporal_only",
  "insufficient",
])

const PRIVATE_FIELD = /patient_name|complainant_name|private_complaint|medical_record|owner_review|private_note|anonymous_person_clue/i
const OVERCLAIM = /nothing has happened|office is ineffective|no complaints exist/i

const validSource = source => source?.title && source?.organization && /^https:\/\//.test(String(source.url || ""))

export function validateAccountabilityOutcomeTransparencyReview(review) {
  if (review?.schema_version !== "farm-accountability-outcome-transparency-v1" || review?.private !== true) throw new Error("accountability_transparency_gate")
  const serialized = JSON.stringify(review)
  if (PRIVATE_FIELD.test(serialized)) throw new Error("accountability_transparency_private_field")
  if (OVERCLAIM.test(serialized)) throw new Error("accountability_transparency_overclaim")
  if (!Array.isArray(review.expected_fields) || review.expected_fields.length !== ACCOUNTABILITY_OUTCOME_FIELDS.length) throw new Error("accountability_transparency_field_count")

  const seen = new Set()
  for (const field of review.expected_fields) {
    if (!ACCOUNTABILITY_OUTCOME_FIELDS.includes(field.field) || seen.has(field.field)) throw new Error("accountability_transparency_field_identity")
    seen.add(field.field)
    if (!ACCOUNTABILITY_REPORTING_STATES.includes(field.reporting_state)) throw new Error("accountability_transparency_reporting_state")
    if (!ACCOUNTABILITY_RELATIONSHIP_STRENGTHS.includes(field.relationship_strength)) throw new Error("accountability_transparency_relationship_strength")
    if (!field.public_finding || !Array.isArray(field.sources_checked) || !field.sources_checked.length || !field.sources_checked.every(validSource)) throw new Error("accountability_transparency_evidence")
    if (field.reporting_state === "reported_only_at_parent_office_level" && !/parent.office/i.test(field.public_finding)) throw new Error("accountability_transparency_parent_attribution")
  }
  if (seen.size !== ACCOUNTABILITY_OUTCOME_FIELDS.length || ACCOUNTABILITY_OUTCOME_FIELDS.some(field => !seen.has(field))) throw new Error("accountability_transparency_field_coverage")
  if (!review.stopping_reason || !review.next_bounded_action) throw new Error("accountability_transparency_stopping_rule")

  return {
    valid: true,
    fields: seen.size,
    publicly_reported: review.expected_fields.filter(field => field.reporting_state === "publicly_reported").length,
    partial_or_parent: review.expected_fields.filter(field => ["partially_reported", "reported_only_at_parent_office_level", "mentioned_without_count"].includes(field.reporting_state)).length,
    not_located: review.expected_fields.filter(field => field.reporting_state === "not_located").length,
  }
}
