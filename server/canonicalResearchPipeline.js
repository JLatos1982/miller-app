import { classifyBcAddressResults } from "./bcAddressGeocoder.js"
import { canonicalResearchReason } from "./canonicalResearchRunner.js"

export const CANONICAL_RESEARCH_MODES = Object.freeze({
  RESEARCH_PREFLIGHT: "research-preflight",
  EXISTING_EVIDENCE_FOLLOW_THROUGH: "existing-evidence-follow-through",
  AUTHORITATIVE_RESEARCH: "authoritative-research",
  RESEARCH_FOLLOW_THROUGH: "research-follow-through",
})

export function canonicalResearchPreflight(records = []) {
  return records.map((record) => ({ resource_id: record.resource?.id, reason_code: canonicalResearchReason(record), external_research: false }))
}

export function exactBcPackage(result, address, municipality) {
  if (!result || result.classification !== "exact_civic") return null
  const item = result.best
  return {
    standardized_address: item.normalized_address || item.returned_address,
    returned_address: item.returned_address,
    province: item.standardized_components?.province || "BC",
    locality: item.locality,
    municipality_match: item.municipality_match === true,
    score: item.score,
    precision_points: item.precision_points,
    location_descriptor: item.location_descriptor,
    site_id: item.site_id || null,
    coordinates: { latitude: item.latitude, longitude: item.longitude },
    provider: item.provider,
    submitted_address: address,
    municipality,
  }
}

// This is deliberately a composition layer: every transition is an existing
// database RPC, and it passes only IDs emitted by the preceding persisted step.
export async function followThroughCanonicalEvidence({ db, runId, resourceId, occupancyClaimId, address, municipality, actorId, geocode }) {
  const response = await geocode({ street_address: address, city: municipality })
  if (!response?.ok) return { outcome: "geocoder_unavailable", stop: true }
  const classified = classifyBcAddressResults(response.features, { street_address: address, city: municipality })
  const geocoderPackage = exactBcPackage(classified, address, municipality)
  if (!geocoderPackage) return { outcome: `geocoder_${classified.classification}`, stop: true }
  const persisted = await db.rpc("persist_canonical_bc_geocoder_evidence_v1", { p_run_id: runId, p_resource_id: resourceId, p_occupancy_claim_id: occupancyClaimId, p_geocoder_package: geocoderPackage, p_actor_id: actorId })
  if (persisted.error) throw persisted.error
  const qc = await db.rpc("create_machine_initial_location_qc_from_evidence", { p_resource_id: resourceId, p_occupancy_claim_id: occupancyClaimId, p_geocoder_evidence_id: persisted.data.evidence_id, p_actor_id: actorId })
  if (qc.error && qc.error.code !== "PT409") throw qc.error
  const current = qc.data || { version: qc.error?.details?.version }
  if (!current?.version) return { outcome: "current_qc_exists", stop: true }
  const policy = await db.rpc("dry_run_map_auto_publish_v1", { p_resource_id: resourceId, p_expected_qc_version: current.version, p_occupancy_claim_id: occupancyClaimId })
  if (policy.error) throw policy.error
  return { outcome: policy.data.decision, geocoder_evidence_id: persisted.data.evidence_id, qc_version: current.version, policy: policy.data, publication_attempted: false }
}

export async function runCanonicalResearchMode({ mode, ...input }) {
  if (!Object.values(CANONICAL_RESEARCH_MODES).includes(mode)) throw new Error("invalid_canonical_research_mode")
  if (mode === CANONICAL_RESEARCH_MODES.RESEARCH_PREFLIGHT) return canonicalResearchPreflight(input.records)
  if (mode === CANONICAL_RESEARCH_MODES.AUTHORITATIVE_RESEARCH) return input.persistAuthoritativeResult(input)
  return followThroughCanonicalEvidence(input)
}
