const clean = value => String(value ?? "").trim()
const normalizeWhitespace = value => clean(value).replace(/\s+/g, " ")
const provinceAliases = new Map([["bc", "British Columbia"], ["b.c.", "British Columbia"], ["ab", "Alberta"], ["sk", "Saskatchewan"]])

export const FARM_LOCATION_SELF_HEALING_POLICY = Object.freeze({
  mode: "detect_propose_only",
  production_mutation_authority: false,
  safe_deterministic: ["whitespace_normalization", "known_province_alias_normalization", "canonical_url_normalization"],
  requires_research: ["missing_address", "missing_city", "failed_geocode", "stale_location_verification"],
  requires_owner_review: ["conflicting_location", "duplicate_facility", "sensitive_or_non_fixed_location"],
})

export function auditMillerLocations(records = [], { now = new Date() } = {}) {
  const defects = []; const safe = []; const research = []; const owner = []
  const facilityKeys = new Map()
  for (const record of records) {
    const id = clean(record.id || record["Resource Name"] || record.name || record.canonical_resource_id)
    const address = clean(record.Address || record.address || record.housing?.address)
    const city = clean(record.City || record.city_community || record.city)
    const province = clean(record.Region || record.province)
    const website = clean(record.Website || record.website)
    if (!address && !/virtual|phone|online/i.test(`${record["Access Type"] || ""} ${record.delivery_modes || ""}`)) research.push({ id, issue: "missing_address", next_source: website || clean(record["Primary Source"]) })
    if (address && (!/\d/.test(address) || address.length < 6)) defects.push({ id, issue: "malformed_address" })
    if (address && !city) research.push({ id, issue: "missing_city", next_source: website })
    if (!province) research.push({ id, issue: "missing_province", next_source: website })
    if (provinceAliases.has(province.toLowerCase())) safe.push({ id, field: "province", current: province, proposed: provinceAliases.get(province.toLowerCase()), rule: "known_province_alias_normalization" })
    if (address && address !== normalizeWhitespace(address)) safe.push({ id, field: "address", current: address, proposed: normalizeWhitespace(address), rule: "whitespace_normalization" })
    if (address && city) {
      const key = `${normalizeWhitespace(address).toLowerCase()}|${city.toLowerCase()}`
      const matches = facilityKeys.get(key) || []; matches.push(id); facilityKeys.set(key, matches)
    }
  }
  for (const [location, ids] of facilityKeys) if (ids.length > 1) owner.push({ issue: "duplicate_facility_candidate", location_fingerprint: location, resource_ids: ids })
  return {
    schema_version: "farm-miller-location-quality-v1", generated_at: new Date(now).toISOString(), checked: records.length,
    defect_counts: { malformed_address: defects.length, research_candidates: research.length, owner_review_candidates: owner.length, safe_normalizations: safe.length },
    defects, safe_correction_candidates: safe, research_candidates: research, owner_review: owner,
    coordinate_scope: "Static registry has no authoritative reviewed coordinate projection; existing private location-QC machinery remains the source for geocode/map decisions.",
    production_mutations: 0,
  }
}

export function inventoryMillerLocationMachinery() {
  return {
    schema_version: "farm-location-machinery-inventory-v1",
    systems: [
      { id: "legacy_location_refresh", path: "scripts/refresh-legacy-location-qc.mjs", status: "implemented_manual", integration: "scheduled static detect/propose audit" },
      { id: "location_claim_reconciliation", path: "server/locationClaimReconciliation.js", status: "implemented_owner_gated", integration: "unchanged" },
      { id: "location_qc_eligibility", path: "server/locationQcEligibility.js", status: "implemented_owner_gated", integration: "unchanged" },
      { id: "pending_location_review", path: "src/map/PendingLocationReview.jsx", status: "implemented_private_ui", integration: "unchanged" },
    ],
    production_mutation_authority: false,
  }
}
