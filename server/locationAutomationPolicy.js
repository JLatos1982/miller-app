export const LOCATION_POLICY_VERSION = "miller-location-auto-v1.1.0"

const clean = (value) => String(value || "").trim()
const unique = (values) => [...new Set(values.filter(Boolean))]
const sensitivePattern = /\b(residential|recovery house|supportive housing|transitional housing|shelter|safe house|private residence|confidential|undisclosed|women'?s residence|youth residence)\b/i

export function evaluateAutomaticLocation({ resource = {}, location = {}, evidence = {}, humanDecision = null, aliasConflict = false } = {}) {
  const passed = [], failed = [], warnings = []
  const gate = (name, condition) => (condition ? passed : failed).push(name)
  const combined = `${resource.display_name || resource.name || ""} ${resource.service_type || ""} ${resource.description || ""}`
  const lat = Number(location.latitude), lon = Number(location.longitude)
  const sourceUrls = unique([...(evidence.evidence_urls || []), evidence.source_url].map(clean))
  gate("active_editorially_eligible", resource.lifecycle_state === "active" && resource.editorial_status !== "hidden")
  gate("stable_unconflicted_identity", !aliasConflict && evidence.source_identity_stable === true)
  gate("no_prior_human_override", !humanDecision)
  gate("public_fixed_facility", location.location_type === "fixed" && evidence.public_fixed_facility === true)
  gate("not_sensitive", !sensitivePattern.test(combined) && evidence.sensitive_location !== true)
  gate("not_virtual_mobile_service_area", !["virtual", "mobile", "service_area", "confidential", "undisclosed"].includes(location.location_type) && evidence.virtual_mobile_or_service_area !== true)
  gate("complete_public_address", Boolean(clean(location.street_address || location.original_address_text) && clean(location.city)))
  gate("authoritative_public_source", evidence.authoritative_source === true && sourceUrls.length > 0)
  gate("street_number_match", evidence.street_number_match === true)
  gate("municipality_match", evidence.municipality_match === true)
  gate("province_country_match", evidence.province_country_match === true)
  gate("building_address_level", evidence.building_level === true && evidence.centroid !== true && evidence.approximate !== true && evidence.large_campus !== true)
  gate("valid_bc_coordinate", Number.isFinite(lat) && Number.isFinite(lon) && lat >= 48 && lat <= 60 && lon >= -140 && lon <= -114 && lat !== 0 && lon !== 0)
  gate("no_conflicting_or_stale_evidence", evidence.conflicting_address !== true && evidence.stale_source !== true && evidence.material_discrepancy !== true)
  gate("no_geocoder_warning", !Array.isArray(evidence.warnings) || evidence.warnings.length === 0)
  gate("storage_and_display_licensed", evidence.storage_licensed === true && evidence.display_licensed === true)
  if (evidence.submitted_has_unit && !evidence.returned_has_unit) warnings.push("suite_not_returned")
  if (Number(evidence.address_peer_count || 1) > 1) warnings.push("shared_address")
  if (evidence.single_source) warnings.push("single_source")
  const score = Math.max(0, 100 - failed.length * 20 - warnings.length * 3)
  let tier = failed.length ? "B" : "A"
  if (failed.some((name) => ["active_editorially_eligible", "public_fixed_facility", "not_sensitive", "not_virtual_mobile_service_area", "street_number_match", "municipality_match", "province_country_match", "valid_bc_coordinate"].includes(name)) || (failed.includes("building_address_level") && evidence.large_campus !== true)) tier = "C"
  return { tier, score, passed_hard_gates: passed, failed_hard_gates: failed, warnings, evidence_urls: sourceUrls, policy_version: LOCATION_POLICY_VERSION, decision_reason: tier === "A" ? "All deterministic publication gates passed." : `Failed gates: ${failed.join(", ")}` }
}

export function selectQualityControlSample(items = []) {
  if (!items.length) return []
  const count = Math.min(items.length, Math.max(items.length >= 5 ? 5 : 1, Math.ceil(items.length * 0.1)))
  return [...items].sort((a, b) => String(a.resource_id).localeCompare(String(b.resource_id))).slice(0, count)
}
