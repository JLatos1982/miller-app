import { canonicalLegalUrl } from "./millerLegalEvidence.js"

export const FARM_SELF_HEALING_POLICY = Object.freeze({
  version: "farm-self-healing-policy-v1",
  lifecycle: ["detect", "research_verify", "propose_deterministic_correction", "validate", "owner_publication_gate", "apply_safely"],
  automatic_repairs: ["trim_whitespace", "canonicalize_public_url", "normalize_known_province_abbreviation"],
  owner_review_required: ["conflicting_address", "program_closure", "eligibility_change", "phone_change", "coordinate_change", "record_merge", "publication"],
  production_mutation_authority: false,
})

const clean = value => String(value || "").replace(/\s+/g, " ").trim()
const resourceName = record => record.name || record.program_name
const identity = record => `${clean(record.organization).toLowerCase()}|${clean(resourceName(record)).toLowerCase()}`
const daysOld = (date, now) => date ? Math.floor((new Date(now).getTime() - new Date(date).getTime()) / 86_400_000) : null

export function auditCanonicalResources(records = [], { now = new Date(), staleDays = 180 } = {}) {
  const defects = []
  const safeCorrectionCandidates = []
  const seen = new Map()
  for (const record of records) {
    const id = record.canonical_resource_id || record.id
    if (!id || !resourceName(record) || !record.organization) defects.push({ resource_id: id || "unknown", defect: "missing_canonical_identity", severity: "high", route: "owner_review" })
    if (!record.province && !record.service_area) defects.push({ resource_id: id, defect: "missing_geography", severity: "medium", route: "research_candidate" })
    const sourceUrl = record.source?.url || record.website
    if (!sourceUrl || !canonicalLegalUrl(sourceUrl)) defects.push({ resource_id: id, defect: "missing_or_invalid_official_url", severity: "high", route: "owner_review" })
    else if (clean(sourceUrl) !== sourceUrl || /[?&](?:utm_[^=]*|fbclid|gclid)=/i.test(sourceUrl)) safeCorrectionCandidates.push({ resource_id: id, defect: "noncanonical_url", proposed_fix: canonicalLegalUrl(sourceUrl), supporting_source: sourceUrl, confidence: 1, validation: "deterministic", resolution_status: "proposal_only" })
    const age = daysOld(record.last_verified || record.last_verified_date || record.last_verified_at, now)
    if (age === null) defects.push({ resource_id: id, defect: "missing_last_verified", severity: "medium", route: "research_candidate" })
    else if (age > staleDays) defects.push({ resource_id: id, defect: "stale_verification", severity: "medium", route: "research_candidate", age_days: age })
    const key = identity(record)
    if (seen.has(key)) defects.push({ resource_id: id, defect: "duplicate_program_candidate", severity: "medium", route: "owner_review", possible_match: seen.get(key) })
    else seen.set(key, id)
    for (const field of ["name", "program_name", "organization", "province", "service_area"]) {
      if (typeof record[field] === "string" && clean(record[field]) !== record[field]) safeCorrectionCandidates.push({ resource_id: id, defect: "whitespace_normalization", field, proposed_fix: clean(record[field]), supporting_source: sourceUrl || null, confidence: 1, validation: "deterministic", resolution_status: "proposal_only" })
    }
  }
  return {
    schema_version: "farm-data-quality-audit-v1",
    checked: records.length,
    defects,
    defect_counts: Object.fromEntries([...new Set(defects.map(item => item.defect))].sort().map(key => [key, defects.filter(item => item.defect === key).length])),
    safe_correction_candidates: safeCorrectionCandidates,
    owner_review: defects.filter(item => item.route === "owner_review"),
    research_candidates: defects.filter(item => item.route === "research_candidate"),
    production_mutations: 0,
    policy: FARM_SELF_HEALING_POLICY,
  }
}

export function summarizeMapQuality(records = []) {
  const withCoordinates = records.filter(record => Number.isFinite(Number(record.latitude)) && Number.isFinite(Number(record.longitude))).length
  const fixedLocations = records.filter(record => record.location_type === "fixed" || record.address || record.street_address).length
  return { total: records.length, fixed_location_candidates: fixedLocations, coordinate_bearing: withCoordinates, missing_coordinates_for_fixed_locations: Math.max(0, fixedLocations - withCoordinates), interpretation: "Missing coordinates identify a research or QC need; they do not authorize geocoding or publication." }
}
