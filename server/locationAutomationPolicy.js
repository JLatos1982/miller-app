import { BC_GEOCODER_MIN_PRECISION_POINTS } from "./bcAddressGeocoder.js"

export const LOCATION_POLICY_VERSION = "miller-location-auto-v1.2.1"
export const LOCATION_OGL_ATTRIBUTION = "Contains information licensed under the Open Government Licence – British Columbia."
export const LOCATION_OGL_URL = "https://www2.gov.bc.ca/gov/content/data/open-data/open-government-licence-bc"

const clean = (value) => String(value || "").trim()
const unique = (values) => [...new Set(values.filter(Boolean))]
const sensitivePattern = /\b(residential|recovery house|supportive housing|transitional housing|shelter|safe house|private residence|confidential|undisclosed|women'?s residence|youth residence)\b/i
const broadPrecisions = new Set(["province", "locality", "neighbourhood", "postal", "street"])
const acceptedPrecisions = new Set(["civic_number", "unit", "site", "occupant"])
const acceptedDescriptors = new Set(["parcelpoint", "frontdoorpoint", "rooftoppoint"])

export function evaluateAutomaticLocation({ resource = {}, location = {}, evidence = {}, humanDecision = null, aliasConflict = false } = {}) {
  const passed = [], failed = [], warnings = []
  const gate = (name, condition) => (condition ? passed : failed).push(name)
  const combined = `${resource.display_name || resource.name || ""} ${resource.service_type || ""} ${resource.description || ""}`
  const lat = Number(location.latitude), lon = Number(location.longitude)
  const hasBcResult = Boolean(evidence.bc_result)
  const bc = evidence.bc_result || {}
  const accessPointAccepted = bc.location_descriptor === "accesspoint" && evidence.interpolated_access_acceptable === true && evidence.interpolation_misleading !== true
  const descriptorAccepted = acceptedDescriptors.has(bc.location_descriptor) || accessPointAccepted
  const exactAddressMatch = bc.score === 100 && bc.precision_points >= BC_GEOCODER_MIN_PRECISION_POINTS && acceptedPrecisions.has(bc.precision) && !broadPrecisions.has(bc.precision) && bc.civic_number_match === true && bc.street_match === true && bc.municipality_match === true && bc.province_match === true && bc.valid_coordinate === true && bc.materially_faulted === false && bc.result_count === 1
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
  gate("bc_single_exact_result", hasBcResult && exactAddressMatch)
  gate("approved_coordinate_descriptor", hasBcResult && descriptorAccepted && bc.location_descriptor !== "routingpoint")
  gate("unit_precision_when_submitted", evidence.submitted_has_unit !== true || (bc.precision === "unit" && evidence.returned_has_unit === true))
  gate("valid_bc_coordinate", Number.isFinite(lat) && Number.isFinite(lon) && lat >= 48 && lat <= 60 && lon >= -140 && lon <= -114 && lat !== 0 && lon !== 0)
  gate("no_conflicting_or_stale_evidence", evidence.conflicting_address !== true && evidence.stale_source !== true && evidence.material_discrepancy !== true)
  gate("no_multiple_competing_results", evidence.multiple_competing_results !== true)
  gate("storage_and_display_licensed", evidence.bc_result?.storage_licensed === true && evidence.bc_result?.display_licensed === true)
  if (Number(evidence.address_peer_count || 1) > 1) warnings.push(evidence.shared_occupancy_verified === true ? "shared_address_verified_independently" : "shared_address_occupancy_uncertain")
  if (evidence.submitted_has_unit && (bc.precision !== "unit" || !evidence.returned_has_unit)) warnings.push("suite_unresolved")
  if (evidence.large_campus) warnings.push("large_hospital_or_multibuilding_campus")
  if (bc.location_descriptor === "parcelpoint") warnings.push("parcel_point_may_not_be_entrance")
  if (bc.location_descriptor === "routingpoint") warnings.push("routing_point_requires_review")
  if (bc.location_descriptor === "accesspoint" && !accessPointAccepted) warnings.push("interpolated_access_point_requires_review")
  const score = Math.max(0, 100 - failed.length * 20 - warnings.length * 3)
  let tier = failed.length ? "B" : "A"
  const terminalFailures = ["active_editorially_eligible", "not_sensitive", "not_virtual_mobile_service_area", "complete_numbered_curated_address"]
  if (hasBcResult) terminalFailures.push("valid_bc_coordinate")
  if (hasBcResult && (broadPrecisions.has(bc.precision) || bc.score < 90 || bc.civic_number_match !== true || bc.municipality_match !== true || bc.valid_coordinate !== true)) tier = "C"
  if (failed.some((name) => terminalFailures.includes(name))) tier = "C"
  if (humanDecision || aliasConflict || evidence.parent_office || evidence.conflicting_address || evidence.stale_source || evidence.material_discrepancy || evidence.multiple_competing_results || evidence.large_campus || warnings.includes("suite_unresolved") || warnings.includes("shared_address_occupancy_uncertain")) tier = failed.some((name) => terminalFailures.includes(name)) ? "C" : "B"
  return { tier, score, passed_hard_gates: passed, failed_hard_gates: failed, warnings, evidence_urls: sourceUrls, thresholds: { score: 100, precision_points: BC_GEOCODER_MIN_PRECISION_POINTS }, policy_version: LOCATION_POLICY_VERSION, attribution: LOCATION_OGL_ATTRIBUTION, attribution_url: LOCATION_OGL_URL, decision_reason: tier === "A" ? "All deterministic address-location gates passed; the coordinate is not proof of program occupancy or an entrance location." : `Failed gates: ${failed.join(", ")}` }
}

export function selectQualityControlSample(items = []) {
  if (!items.length) return []
  const count = Math.min(items.length, Math.max(items.length >= 5 ? 5 : 1, Math.ceil(items.length * 0.1)))
  const ordered = [...items].sort((a, b) => String(a.canonical_uuid || a.resource_id).localeCompare(String(b.canonical_uuid || b.resource_id)))
  const selected = [], seenMunicipalities = new Set(), seenFacilities = new Set()
  const take = (predicate) => { const item = ordered.find((candidate) => !selected.includes(candidate) && predicate(candidate)); if (item) selected.push(item) }
  take((item) => item.location_descriptor === "parcelpoint")
  take((item) => item.submitted_has_unit || item.shared_address_count > 1)
  for (const item of ordered) if (selected.length < count && !selected.includes(item) && (!seenMunicipalities.has(item.municipality) || !seenFacilities.has(item.facility_type))) { selected.push(item); seenMunicipalities.add(item.municipality); seenFacilities.add(item.facility_type) }
  for (const item of ordered) if (selected.length < count && !selected.includes(item)) selected.push(item)
  return selected.slice(0, count)
}
