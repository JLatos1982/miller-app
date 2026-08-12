const text = (value) => String(value || "").trim()

export function classifyLocationReview({ location = {}, evidence = {}, resource = {}, addressPeerCount = 1 } = {}) {
  const warnings = [...(Array.isArray(evidence.warnings) ? evidence.warnings : [])]
  const combined = `${resource.display_name || ""} ${resource.service_type || ""} ${resource.description || ""}`.toLowerCase()
  if (/residential|shelter|transitional housing|confidential|undisclosed|private residence|service.area.only/.test(combined)) warnings.push("sensitive_service_classification")
  const lat = Number(location.latitude), lon = Number(location.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !lat || !lon || lat < 48 || lat > 60 || lon < -140 || lon > -114) warnings.push("invalid_or_suspicious_coordinate")
  if (location.location_type !== "fixed") warnings.push("not_fixed")
  if (!/verified|matched/.test(text(location.geocode_status))) warnings.push("unvalidated_geocode_state")
  if (evidence.street_number_match !== true) warnings.push("street_number_mismatch")
  if (evidence.municipality_match !== true) warnings.push("municipality_mismatch")
  if (evidence.province_country_match !== true) warnings.push("province_country_mismatch")
  if (evidence.building_level !== true) warnings.push("not_building_level")
  if (warnings.length) return { tier: 3, label: "Rejected / unresolved", selectable: false, warnings: [...new Set(warnings)] }
  const tier2 = []
  if (addressPeerCount > 1) tier2.push("shared_address")
  if (evidence.submitted_has_unit && !evidence.returned_has_unit) tier2.push("unit_not_returned")
  if (evidence.large_campus) tier2.push("large_building_or_campus")
  if (evidence.material_discrepancy) tier2.push("address_discrepancy")
  return tier2.length ? { tier: 2, label: "Individual review required", selectable: false, warnings: tier2 } : { tier: 1, label: "Ready for quick review", selectable: true, warnings: [] }
}
