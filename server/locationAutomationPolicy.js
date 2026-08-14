import { BC_GEOCODER_MIN_PRECISION_POINTS, BC_GEOCODER_MIN_SCORE, bcResultMeetsExactPinStandard } from "./bcAddressGeocoder.js"

export const LOCATION_POLICY_VERSION = "miller-location-auto-v1.2.0"

const clean = (value) => String(value || "").trim()
const unique = (values) => [...new Set(values.filter(Boolean))]
const sensitivePattern = /\b(residential|recovery house|supportive housing|transitional housing|shelter|safe house|private residence|confidential|undisclosed|women'?s residence|youth residence)\b/i

export function evaluateAutomaticLocation({ resource = {}, location = {}, evidence = {}, humanDecision = null, aliasConflict = false } = {}) {
  const passed = [], failed = [], warnings = []
  const gate = (name, condition) => (condition ? passed : failed).push(name)
  const combined = `${resource.display_name || resource.name || ""} ${resource.service_type || ""} ${resource.description || ""}`
  const lat = Number(location.latitude), lon = Number(location.longitude)
  const hasBcResult = Boolean(evidence.bc_result)
  const sourceUrls = unique([...(evidence.evidence_urls || []), evidence.source_url].map(clean))
  gate("active_editorially_eligible", resource.lifecycle_state === "active" && resource.editorial_status !== "hidden")
  gate("stable_unconflicted_identity", !aliasConflict && evidence.source_identity_stable === true)
  gate("no_prior_human_override", !humanDecision)
  gate("public_fixed_facility", location.location_type === "fixed" && evidence.public_fixed_facility === true)
  gate("not_sensitive", !sensitivePattern.test(combined) && evidence.sensitive_location !== true)
  gate("not_virtual_mobile_service_area", !["virtual", "mobile", "service_area", "confidential", "undisclosed"].includes(location.location_type) && evidence.virtual_mobile_or_service_area !== true)
  gate("complete_numbered_curated_address", /\b\d+[A-Za-z]?\s+[A-Za-z]/.test(clean(location.street_address || location.original_address_text)) && Boolean(clean(location.city)) && !/\bP\.?\s*O\.?\s*Box\b/i.test(location.street_address || location.original_address_text || ""))
  gate("program_specific_curated_address", evidence.program_specific_address === true && evidence.parent_office !== true)
  gate("public_client_facing", evidence.public_client_facing === true)
  gate("bc_single_exact_result", evidence.bc_result && bcResultMeetsExactPinStandard(evidence.bc_result))
  gate("building_address_level", evidence.centroid !== true && evidence.approximate !== true && evidence.parcel_only !== true)
  gate("valid_bc_coordinate", Number.isFinite(lat) && Number.isFinite(lon) && lat >= 48 && lat <= 60 && lon >= -140 && lon <= -114 && lat !== 0 && lon !== 0)
  gate("no_conflicting_or_stale_evidence", evidence.conflicting_address !== true && evidence.stale_source !== true && evidence.material_discrepancy !== true)
  gate("no_multiple_competing_results", evidence.multiple_competing_results !== true)
  gate("storage_and_display_licensed", evidence.bc_result?.storage_licensed === true && evidence.bc_result?.display_licensed === true)
  if (Number(evidence.address_peer_count || 1) > 1) warnings.push(evidence.shared_occupancy_verified === true ? "shared_address_verified_independently" : "shared_address_occupancy_uncertain")
  if (evidence.submitted_has_unit && !evidence.returned_has_unit) warnings.push("suite_unresolved")
  if (evidence.large_campus) warnings.push("large_hospital_or_multibuilding_campus")
  const score = Math.max(0, 100 - failed.length * 20 - warnings.length * 3)
  let tier = failed.length ? "B" : "A"
  const terminalFailures = ["active_editorially_eligible", "not_sensitive", "not_virtual_mobile_service_area", "complete_numbered_curated_address"]
  if (hasBcResult) terminalFailures.push("valid_bc_coordinate")
  if (failed.some((name) => terminalFailures.includes(name)) || (failed.includes("building_address_level") && evidence.large_campus !== true)) tier = "C"
  if (humanDecision || aliasConflict || evidence.parent_office || evidence.conflicting_address || evidence.stale_source || evidence.material_discrepancy || evidence.multiple_competing_results || evidence.large_campus || warnings.includes("suite_unresolved") || warnings.includes("shared_address_occupancy_uncertain")) tier = failed.some((name) => terminalFailures.includes(name)) ? "C" : "B"
  return { tier, score, passed_hard_gates: passed, failed_hard_gates: failed, warnings, evidence_urls: sourceUrls, thresholds: { score: BC_GEOCODER_MIN_SCORE, precision_points: BC_GEOCODER_MIN_PRECISION_POINTS }, policy_version: LOCATION_POLICY_VERSION, decision_reason: tier === "A" ? "All deterministic publication gates passed." : `Failed gates: ${failed.join(", ")}` }
}

export function selectQualityControlSample(items = []) {
  if (!items.length) return []
  const count = Math.min(items.length, Math.max(items.length >= 5 ? 5 : 1, Math.ceil(items.length * 0.1)))
  return [...items].sort((a, b) => String(a.resource_id).localeCompare(String(b.resource_id))).slice(0, count)
}
