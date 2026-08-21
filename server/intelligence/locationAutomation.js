export const LOCATION_AUTOMATION_VERSION = "miller-location-evidence-v1.0.0"
export function classifyLocationCandidate(record = {}) {
  const reasons = []
  if (record.sensitivity_flags?.length || ["virtual", "mobile", "confidential", "undisclosed"].includes(record.location_type)) return { decision: "do_not_map", confidence: "high", reasonCodes: ["private_or_nonfixed_location"], reversible: true }
  if (record.tier === "C" || !record.coordinates || Number(record.score) < 90) return { decision: "do_not_map", confidence: "high", reasonCodes: ["geospatial_validation_failed"], reversible: true }
  if (record.conflicts?.length) reasons.push("conflicting_location_evidence")
  if (record.program_occupancy_confidence !== "supported") reasons.push("insufficient_program_specific_evidence")
  if (record.tier !== "A" && record.source_evidence_tier !== "E1" && record.evidence_review_status !== "approved") reasons.push("authoritative_occupancy_evidence_missing")
  if (record.submitted_has_unit && !record.returned_has_unit) reasons.push("unit_not_resolved")
  if (record.shared_address_count > 1 && !record.shared_address_group) reasons.push("address_shared_by_multiple_programs")
  if (record.tier !== "A") reasons.push("existing_location_policy_not_tier_a")
  return reasons.length ? { decision: "needs_review", confidence: "bounded", reasonCodes: [...new Set(reasons)], reversible: true } : { decision: "auto_validatable", confidence: "high", reasonCodes: ["exact_program_address_authoritatively_supported", "bc_geocoder_exact_match", "no_location_conflicts", "public_fixed_location"], reversible: true }
}
export function locationDryRun(records = []) {
  const evaluated = records.map((record) => ({ canonical_uuid: record.canonical_uuid, resource_name: record.resource_name, ...classifyLocationCandidate(record) })), counts = { auto_validatable: 0, needs_review: 0, do_not_map: 0 }
  for (const item of evaluated) counts[item.decision] += 1
  const reviewReasons = {}
  for (const item of evaluated.filter((x) => x.decision === "needs_review")) for (const reason of item.reasonCodes) reviewReasons[reason] = (reviewReasons[reason] || 0) + 1
  return { version: LOCATION_AUTOMATION_VERSION, mode: "read_only_dry_run", candidatesEvaluated: evaluated.length, counts, automationRate: evaluated.length ? counts.auto_validatable / evaluated.length : 0, reviewReasons, evaluated }
}
