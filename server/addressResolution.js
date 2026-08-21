import { addressComponents, isCompleteNumberedAddress, isSensitiveOrNonFixed, normalizeAddress } from "./addressEvidence.js"

export const ADDRESS_RESOLUTION_VERSION = "miller-address-resolution-v1.0.0"
const oldEvidenceMs = 365 * 24 * 60 * 60 * 1000
const terminalKinds = new Set(["confidential_private", "virtual_mobile_service_area"])

export function addressResolutionCategory(record = {}, geocode = null, now = Date.now()) {
  const sensitivity = (record.sensitivity_flags || []).join(" ")
  if (/confidential|private|shelter|safe.house|undisclosed/i.test(`${sensitivity} ${record.facility_type || ""}`)) return "confidential_private"
  if (isSensitiveOrNonFixed({ ...record, address: record.proposed_address, service_type: record.facility_type })) return "virtual_mobile_service_area"
  if (!record.proposed_address) return "no_address_discovered"
  if (!isCompleteNumberedAddress(record.proposed_address)) return "partial_address"
  if (record.conflicts?.length) return "conflicting_addresses"
  const retrieved = Date.parse(record.retrieval_date || "")
  if (Number.isFinite(retrieved) && now - retrieved > oldEvidenceMs) return "likely_stale_address"
  if (!geocode) return record.authoritative ? "authoritative_requires_confirmation" : record.source_priority <= 5 ? "trusted_directory_requires_confirmation" : "weak_source_address"
  if (!geocode.coordinates) return "failed_geocoding"
  if (["street", "block", "locality", "province"].includes(geocode.precision)) return "approximate_geocode"
  if (geocode.shared_address_count > 1) return "shared_building"
  if (geocode.program_occupancy_confidence !== "supported") return "geocoder_valid_occupancy_unverified"
  if (geocode.tier === "A") return "high_confidence_candidate"
  return "likely_candidate_needing_review"
}

export function confidenceRecommendation(record = {}, geocode = null) {
  const category = addressResolutionCategory(record, geocode)
  if (terminalKinds.has(category)) return { confidence: "excluded", recommendation: "exclude_from_mapping", reason_codes: [category] }
  if (category === "high_confidence_candidate") return { confidence: "very_strong", recommendation: "administrator_review", reason_codes: ["official_occupancy_supported", "exact_bc_geocode", "no_authoritative_conflict", "non_sensitive_fixed_service"] }
  if (category === "likely_candidate_needing_review") return { confidence: "strong", recommendation: "administrator_review", reason_codes: ["occupancy_supported", "bc_address_valid", ...(geocode?.warnings || [])] }
  if (["conflicting_addresses", "shared_building", "likely_stale_address", "authoritative_requires_confirmation"].includes(category)) return { confidence: "needs_review", recommendation: "research_or_decide", reason_codes: [category] }
  return { confidence: "insufficient", recommendation: "do_not_publish", reason_codes: [category, ...(geocode?.failed_hard_gates || [])] }
}

export function buildAddressResolutionReport({ inventory = {}, geocoded = {}, publicLocationCount = 0, totalDirectoryResources } = {}) {
  const geocodes = new Map((geocoded.records || []).map((item) => [item.canonical_uuid, item]))
  const records = (inventory.records || []).map((record) => {
    const geocode = geocodes.get(record.canonical_uuid) || null
    const assessment = confidenceRecommendation(record, geocode)
    return { ...record, original_address: record.submitted_address, normalized_query: geocode?.normalized_query || normalizeAddress(record.proposed_address), standardized_address: geocode?.returned_address || null, coordinates: geocode?.coordinates || null, geocoder: geocode ? { provider: geocode.provider, score: geocode.score, precision: geocode.precision, descriptor: geocode.location_descriptor, faults: geocode.faults } : null, category: addressResolutionCategory(record, geocode), ...assessment, shared_address_count: geocode?.shared_address_count || 1, public_map: false }
  })
  const counts = {}
  for (const item of records) counts[item.category] = (counts[item.category] || 0) + 1
  const total = Number(totalDirectoryResources ?? inventory.canonical_total ?? records.length)
  const evaluated = records.length
  return { version: ADDRESS_RESOLUTION_VERSION, generated_at: new Date().toISOString(), total_directory_resources: total, public_mapped_locations: publicLocationCount, evaluated, not_yet_examined: Math.max(0, total - publicLocationCount - evaluated), counts, strong_administrator_review_candidates: records.filter((item) => ["very_strong", "strong"].includes(item.confidence)).length, shared_address_groups: inventory.shared_buildings || [], records, publication_changed: false, writes_performed: false }
}

export async function runBoundedResolutionBatch(items, { resolve, concurrency = 2, cache = new Map(), onProgress = () => {} } = {}) {
  if (typeof resolve !== "function") throw new Error("A resolver is required")
  const ordered = [...items].sort((a, b) => String(a.canonical_uuid).localeCompare(String(b.canonical_uuid))), results = new Array(ordered.length)
  let cursor = 0, completed = 0
  const pending = new Map()
  async function worker() {
    while (cursor < ordered.length) {
      const index = cursor++, item = ordered[index], parsed = addressComponents(item.proposed_address, { city: item.municipality, postal_code: item.postal_code })
      const key = `${parsed.unit}|${parsed.street_address}|${parsed.municipality}|${parsed.postal_code}`.toLowerCase()
      if (!cache.has(key) && !pending.has(key)) pending.set(key, Promise.resolve(resolve(item)).then((value) => { cache.set(key, value); return value }).finally(() => pending.delete(key)))
      results[index] = cache.has(key) ? cache.get(key) : await pending.get(key)
      cache.set(key, results[index]); completed++; onProgress({ completed, total: ordered.length, canonical_uuid: item.canonical_uuid })
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(5, Number(concurrency) || 1)) }, worker))
  return { version: ADDRESS_RESOLUTION_VERSION, completed, results, publication_changed: false, writes_performed: false }
}
