import assert from "node:assert/strict"
import test from "node:test"

import {
  ACCOUNTABILITY_OUTCOME_FIELDS,
  validateAccountabilityOutcomeTransparencyReview,
} from "../server/farmAccountabilityOutcomeTransparency.js"

const source = {
  title: "Authoritative public report",
  organization: "Example accountability office",
  url: "https://example.org/public-report",
}

const states = new Map([
  ["intake_volume", "partially_reported"],
  ["accepted_cases", "not_located"],
  ["completed_reviews", "not_located"],
  ["recommendations", "mentioned_without_count"],
  ["referrals", "mentioned_without_count"],
  ["remedies_resolutions", "not_located"],
  ["systemic_themes", "mentioned_without_count"],
  ["policy_system_changes", "reported_only_at_parent_office_level"],
  ["annual_public_reporting", "partially_reported"],
  ["follow_up_implementation", "mentioned_without_count"],
])

const review = {
  schema_version: "farm-accountability-outcome-transparency-v1",
  private: true,
  summary: "A bounded review of aggregate public reporting.",
  expected_fields: ACCOUNTABILITY_OUTCOME_FIELDS.map(field => ({
    field,
    reporting_state: states.get(field),
    relationship_strength: field === "policy_system_changes" ? "related_but_not_attributed" : "direct_attribution",
    public_finding: field === "policy_system_changes"
      ? "Changes were reported at parent-office level; role-specific attribution was unavailable."
      : `The public reporting state for ${field} was recorded conservatively.`,
    sources_checked: [source],
  })),
  stopping_reason: "Reasonable official-source avenues were exhausted.",
  next_bounded_action: "Request aggregate role-specific reporting only if owner-approved.",
}

test("accountability outcome review preserves role-specific and parent-office boundaries", () => {
  const result = validateAccountabilityOutcomeTransparencyReview(review)
  assert.deepEqual(result, { valid: true, fields: 10, publicly_reported: 0, partial_or_parent: 7, not_located: 3 })
  assert.equal(review.expected_fields.find(item => item.field === "intake_volume").reporting_state, "partially_reported")
  assert.equal(review.expected_fields.find(item => item.field === "policy_system_changes").reporting_state, "reported_only_at_parent_office_level")
})

test("accountability outcome review rejects private detail and causal overstatement", () => {
  assert.throws(() => validateAccountabilityOutcomeTransparencyReview({ ...review, patient_name: "not allowed" }), /private_field/)
  assert.throws(() => validateAccountabilityOutcomeTransparencyReview({ ...review, summary: "The office is ineffective." }), /overclaim/)
})
