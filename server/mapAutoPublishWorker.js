import { canonicalCivicAddress } from "./bcAddressGeocoder.js"

const text = (value) => String(value ?? "").trim()
const newest = (items) => [...items].sort((a, b) => String(b.last_observed_at || b.updated_at || b.created_at || "").localeCompare(String(a.last_observed_at || a.updated_at || a.created_at || "")))[0] || null
const housing = /\b(shelter|housing|transition|recovery home|safe home|supportive living|residential)\b/i

export const MAP_AUTO_PUBLISH_MODES = Object.freeze({ CLASSIFICATION_ONLY: "classification-only", DETERMINISTIC_REFRESH_DRY_RUN: "deterministic-refresh-dry-run", MACHINE_QC_CREATE_DRY_RUN: "machine-qc-create-dry-run" })

export function classifyCandidatePriority(resource) { return housing.test(text(resource?.display_name)) ? "shelter_housing" : "directory" }

export function enumerateMapAutoPublishCandidates({ resources = [], locations = [] }) {
  const publicIds = new Set(locations.filter((location) => location.public_map === true && location.review_status === "approved").map((location) => location.resource_id))
  return resources
    .filter((resource) => resource.lifecycle_state === "active" && resource.editorial_status !== "hidden" && !publicIds.has(resource.id))
    .map((resource) => ({ resource, priority: classifyCandidatePriority(resource) }))
    .sort((a, b) => (a.priority === b.priority ? text(a.resource.display_name).localeCompare(text(b.resource.display_name)) : a.priority === "shelter_housing" ? -1 : 1))
}

export function buildMapAutoPublishContexts({ resources = [], claims = [], evidence = [], evidenceBindings = [], qc = [], locations = [] }) {
  const evidenceByClaim = new Map(), qcByResource = new Map(qc.map((item) => [item.canonical_resource_id, item]))
  for (const item of evidence) evidenceByClaim.set(item.claim_id, [...(evidenceByClaim.get(item.claim_id) || []), item])
  // Bindings preserve immutable source evidence while making a proven
  // same-resource occupancy relationship visible to deterministic selection.
  const evidenceById = new Map(evidence.map((item) => [item.id, item]))
  for (const binding of evidenceBindings) {
    const item = evidenceById.get(binding.evidence_id)
    if (item && binding.target_claim_id) evidenceByClaim.set(binding.target_claim_id, [...(evidenceByClaim.get(binding.target_claim_id) || []), item])
  }
  return enumerateMapAutoPublishCandidates({ resources, locations }).map(({ resource, priority }) => {
    const resourceClaims = claims.filter((claim) => claim.resource_id === resource.id && claim.field_name === "location_occupancy")
    const binding = selectOccupancyClaim(resourceClaims, evidenceByClaim)
    const geocoderEvidence = selectGeocoderEvidence(resourceClaims, evidenceByClaim, binding.claim?.proposed_value)
    return { resource, priority, qc: qcByResource.get(resource.id) || null, occupancyClaim: binding.claim, occupancy_binding: binding.reason_code, geocoderEvidence, evidence: binding.claim ? evidenceByClaim.get(binding.claim.id) || [] : [], locations: locations.filter((location) => location.resource_id === resource.id) }
  })
}

const normalized = (value) => text(typeof value === "string" ? value : value?.value ?? value).toLowerCase().replace(/[^a-z0-9]/g, "")
const sameExactCivicAddress = (left, right) => {
  const leftKey = canonicalCivicAddress(left), rightKey = canonicalCivicAddress(right)
  return Boolean(leftKey.civic_number && leftKey.civic_number === rightKey.civic_number && leftKey.street_name === rightKey.street_name && leftKey.street_type === rightKey.street_type && leftKey.street_direction === rightKey.street_direction)
}
const currentEvidence = (items = []) => items.filter((entry) => entry.stale !== true && ((entry.source_url && Number(entry.source_authority) >= 85) || (entry.source_type === "trusted_master_record" && entry.source_record_id && Number(entry.source_authority) === 100)))
export function selectOccupancyClaim(claims = [], evidenceByClaim = new Map()) {
  const currentClaims = claims.filter((claim) => !["superseded", "rejected", "unknown"].includes(claim.status))
  if (!currentClaims.length) return { claim: null, reason_code: "missing_occupancy_claim" }
  const candidates = currentClaims.map((claim) => ({ claim, evidence: currentEvidence(evidenceByClaim.get(claim.id)) })).filter((item) => item.evidence.length)
  if (!candidates.length) return { claim: null, reason_code: "missing_authoritative_occupancy_evidence" }
  const values = new Set(candidates.map((item) => normalized(item.claim.proposed_value)).filter(Boolean))
  if (values.size !== 1) return { claim: null, reason_code: "ambiguous_or_conflicting_occupancy_claim" }
  return { claim: newest(candidates.map((item) => item.claim)), reason_code: null }
}
export function selectGeocoderEvidence(claims = [], evidenceByClaim = new Map(), address) {
  const candidates = claims.flatMap((claim) => (evidenceByClaim.get(claim.id) || []).map((evidence) => ({ claim, evidence }))).filter(({ evidence }) => { const value = evidence.extracted_value || {}; return evidence.stale !== true && evidence.source_type === "bc_geocoder" && Number(value.score) >= 90 && value.municipality_match === true && String(value.province || "").toUpperCase() === "BC" && !/centroid|locality|postal/i.test(String(value.location_descriptor || value.precision || "")) && Number.isFinite(Number(value.coordinates?.latitude ?? value.latitude)) && Number.isFinite(Number(value.coordinates?.longitude ?? value.longitude)) && sameExactCivicAddress(value.standardized_address || value.returned_address, address) })
  return newest(candidates.map((item) => item.evidence))
}
const protectedName = /\b(safe home|transition house|domestic violence|trafficking|confidential|undisclosed|intake only)\b/i
export function preflightCategory(item) {
  if (item.qc) return "existing_qc"
  if (protectedName.test(item.resource.display_name) || (item.locations || []).some((location) => ["confidential", "undisclosed"].includes(location.location_type))) return "sensitive_or_protected"
  if (!item.occupancyClaim) return item.occupancy_binding || "other_binding_failure"
  if (!item.geocoderEvidence) return "missing_geocoder_evidence"
  return "ready_for_machine_qc"
}

export function safeCandidateSample(item, result) {
  const snapshot = item.qc?.review_snapshot || {}, sensitive = result.reason_code === "sensitive_location" || (Array.isArray(snapshot.sensitivity_flags) && snapshot.sensitivity_flags.length > 0)
  return {
    resource_id: item.resource.id,
    resource_name: item.resource.display_name,
    priority: item.priority,
    qc_version: item.qc?.version || null,
    occupancy_evidence_class: item.evidence.some((entry) => entry.source_url && Number(entry.source_authority) >= 85 && entry.stale !== true) ? "authoritative_current" : "missing_or_untrusted",
    geocoder_match_class: sensitive ? "withheld" : `${snapshot.score || "unknown"}/${snapshot.location_descriptor || "unknown"}`,
    source_civic_address: sensitive ? undefined : snapshot.submitted_address || null,
    municipality: sensitive ? undefined : snapshot.locality || null,
    decision: result.decision,
    reason_code: result.reason_code
  }
}

export async function evaluateMapAutoPublishCandidate({ db, item, mode = MAP_AUTO_PUBLISH_MODES.CLASSIFICATION_ONLY, deterministicRefresh }) {
  if (!Object.values(MAP_AUTO_PUBLISH_MODES).includes(mode)) throw new Error("invalid_map_auto_publish_mode")
  // Stage 2 does not own a refresher.  The optional dependency is intentionally
  // injected so it can be constrained/tested without adding a writer here.
  if (mode === MAP_AUTO_PUBLISH_MODES.DETERMINISTIC_REFRESH_DRY_RUN && deterministicRefresh) await deterministicRefresh(item)
  if (!item.qc || item.qc.version < 1 || item.qc.origin !== "machine_initial") return { decision: "manual_review", reason_code: "current_machine_qc_required", mode, rpc_called: false }
  if (!item.occupancyClaim) return { decision: "manual_review", reason_code: item.occupancy_binding || "authoritative_occupancy_claim_required", mode, rpc_called: false }
  const result = await db.rpc("dry_run_map_auto_publish_v1", { p_resource_id: item.resource.id, p_expected_qc_version: item.qc.version, p_occupancy_claim_id: item.occupancyClaim.id })
  if (result.error) throw result.error
  return { ...result.data, mode, rpc_called: true }
}

export async function createMachineQcForCandidate({ db, item, actorId }) {
  const category = preflightCategory(item)
  if (category !== "ready_for_machine_qc") return { created: false, reason_code: category }
  const result = await db.rpc("create_machine_initial_location_qc_from_evidence", { p_resource_id: item.resource.id, p_occupancy_claim_id: item.occupancyClaim.id, p_geocoder_evidence_id: item.geocoderEvidence?.id || null, p_actor_id: actorId })
  if (result.error) throw result.error
  return { created: true, qc: result.data, geocoder: item.geocoderEvidence ? "bound" : "missing" }
}

export async function runMapAutoPublishDryRun({ db, data, mode = MAP_AUTO_PUBLISH_MODES.CLASSIFICATION_ONLY, limit = 100, deterministicRefresh }) {
  const contexts = buildMapAutoPublishContexts(data).slice(0, Math.max(1, limit))
  const results = []
  for (const item of contexts) {
    const result = await evaluateMapAutoPublishCandidate({ db, item, mode, deterministicRefresh })
    results.push({ item, result })
  }
  const reason_counts = {}, shelter_reason_counts = {}
  for (const { item, result } of results) {
    reason_counts[result.reason_code] = (reason_counts[result.reason_code] || 0) + 1
    if (item.priority === "shelter_housing") shelter_reason_counts[result.reason_code] = (shelter_reason_counts[result.reason_code] || 0) + 1
  }
  return { mode, total_considered: contexts.length, shelter_considered: contexts.filter((item) => item.priority === "shelter_housing").length, reason_counts, shelter_reason_counts, samples: results.slice(0, 20).map(({ item, result }) => safeCandidateSample(item, result)), results }
}

export function mapAutoPublishPreflight(data, limit = 100) {
  const contexts = buildMapAutoPublishContexts(data).slice(0, Math.max(1, limit)), counts = {}
  for (const item of contexts) {
    const reason = preflightCategory(item)
    counts[reason] = (counts[reason] || 0) + 1
  }
  return { total_considered: contexts.length, counts, contexts }
}

export function assertMapAutoPublishProductionTarget({ supabaseUrl, serviceRoleKey, explicitProductionDryRun }) {
  const host = new URL(text(supabaseUrl)).hostname
  if (!explicitProductionDryRun || host.split(".")[0] !== "wccagykzugrahwugefqt" || !text(serviceRoleKey)) throw new Error("map_auto_publish_requires_explicit_expected_production_target")
  return true
}
