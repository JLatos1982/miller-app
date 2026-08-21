const clean = (value) => String(value || "").replace(/\s+/g, " ").trim()
const normalized = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

export function sameFixedAddress(left = {}, right = {}) {
  return normalized(left.street_address || left.original_address_text) === normalized(right.street_address || right.original_address_text)
    && normalized(left.city) === normalized(right.city)
}

export function privateLocationEligibility({ resource = {}, qc = {}, evidence = [], existingLocations = [] } = {}) {
  const snapshot = qc.review_snapshot && typeof qc.review_snapshot === "object" ? qc.review_snapshot : {}
  const coordinates = snapshot.coordinates || {}
  const reasons = []
  if (resource.lifecycle_state !== "active" || resource.editorial_status === "hidden") reasons.push("canonical_resource_not_active")
  if (qc.decision !== "pilot_eligible") reasons.push("durable_human_qc_required")
  if (!clean(snapshot.submitted_address) || !clean(snapshot.returned_address) || !clean(snapshot.locality)) reasons.push("complete_geocoded_address_required")
  if (Number(snapshot.score) !== 100 || String(snapshot.location_descriptor || "").toLowerCase() !== "parcelpoint") reasons.push("exact_parcel_geocoder_result_required")
  if (!Number.isFinite(Number(coordinates.latitude)) || !Number.isFinite(Number(coordinates.longitude)) || !Number(coordinates.latitude) || !Number(coordinates.longitude)) reasons.push("valid_geocoder_coordinates_required")
  if (snapshot.program_occupancy_confidence !== "supported") reasons.push("program_occupancy_not_supported")
  if ((snapshot.sensitivity_flags || []).length || (snapshot.conflicts || []).length) reasons.push("safety_or_conflict_review_required")
  if (!evidence.some((item) => item.source_url && Number(item.source_authority || 0) >= 85 && item.stale !== true)) reasons.push("durable_authoritative_evidence_required")
  if (existingLocations.some((item) => item.location_type === "fixed" && item.public_map === true)) reasons.push("already_has_public_location")
  return { eligible: reasons.length === 0, reasons, snapshot }
}

export function privateLocationValues({ resourceId, qc, actorId }) {
  const snapshot = qc.review_snapshot
  return {
    resource_id: resourceId,
    location_label: "Administrator-confirmed private location",
    location_type: "fixed",
    original_address_text: clean(snapshot.submitted_address),
    street_address: clean(snapshot.submitted_address),
    city: clean(snapshot.locality),
    province: "BC",
    country: "Canada",
    latitude: Number(snapshot.coordinates.latitude),
    longitude: Number(snapshot.coordinates.longitude),
    geocode_source: "bc_address_geocoder",
    geocode_confidence: 1,
    geocode_status: "matched",
    review_status: "pending",
    public_map: false,
    reviewed_by: actorId,
    reviewed_at: new Date().toISOString(),
  }
}

export function privateLocationAuditValues({ location, qc }) {
  const snapshot = qc.review_snapshot || {}
  return {
    location,
    actor_type: "human_administrator",
    private_location_confirmation: true,
    public_map: false,
    qc_review: { policy_version: qc.policy_version, version: qc.version, classification_fingerprint: qc.classification_fingerprint, reviewed_at: qc.reviewed_at },
    geocoder: { provider: snapshot.provider, returned_address: snapshot.returned_address, score: snapshot.score, precision: snapshot.precision, descriptor: snapshot.location_descriptor, coordinates: snapshot.coordinates },
    evidence: { source_url: snapshot.source_url, source_evidence_tier: snapshot.source_evidence_tier },
  }
}
