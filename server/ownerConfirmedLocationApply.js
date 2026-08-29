import { createHash } from "node:crypto"
import { privateLocationEligibility } from "./privateLocation.js"

export const SAMWISE_MILLER_LOCATION_APPLY_V1 = "samwise-miller-location-apply-v1"
const clean = (value, max = 500) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => key in value)

export function coordinateFingerprint(coordinates = {}) {
  const latitude = Number(coordinates.latitude), longitude = Number(coordinates.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 48 || latitude > 60 || longitude < -140 || longitude > -114) throw new Error("mapping_proposal_coordinates_invalid")
  return hash({ latitude, longitude })
}

export function createLocationApplyProposal({ proposal_id, miller_resource_id, address_identity, geocoder_evidence_id, qc, snapshot, source_provenance } = {}) {
  if (!uuid(miller_resource_id) || !uuid(geocoder_evidence_id) || !qc || !snapshot || !address_identity?.fingerprint) throw new Error("mapping_proposal_invalid")
  const coordinates = snapshot.coordinates || {}, coordinate_fingerprint = coordinateFingerprint(coordinates)
  const body = { contract: SAMWISE_MILLER_LOCATION_APPLY_V1, proposal_id: clean(proposal_id, 120), miller_resource_id, address_identity_fingerprint: clean(address_identity.fingerprint, 64), geocoder_evidence_id, qc: { policy_version: clean(qc.policy_version, 120), version: Number(qc.version), classification_fingerprint: clean(qc.classification_fingerprint, 128), origin: clean(qc.origin, 80), decision: clean(qc.decision, 80) }, address: { submitted: clean(snapshot.submitted_address, 300), provider_normalized: clean(snapshot.returned_address, 300), municipality: clean(snapshot.locality, 100), province: "BC" }, coordinates: { latitude: Number(coordinates.latitude), longitude: Number(coordinates.longitude) }, coordinate_fingerprint, source_provenance: { source_url: clean(source_provenance?.source_url, 500), observed_at: clean(source_provenance?.observed_at, 40) } }
  if (!body.proposal_id || !body.address.submitted || !body.address.provider_normalized || !body.address.municipality || !Number.isInteger(body.qc.version) || !body.qc.policy_version || !body.qc.classification_fingerprint || body.qc.origin !== "machine_initial" || body.qc.decision !== "manual_review") throw new Error("mapping_proposal_invalid")
  return Object.freeze({ ...body, proposal_fingerprint: hash(body) })
}

export function validateLocationApplyConfirmation({ proposal, confirmation, current = {} } = {}) {
  if (!proposal || proposal.contract !== SAMWISE_MILLER_LOCATION_APPLY_V1) throw new Error("mapping_proposal_invalid")
  if (!confirmation) return { allowed: false, code: "owner_confirmation_required" }
  const keys = ["confirmation_id", "proposal_fingerprint", "miller_resource_id", "address_identity_fingerprint", "geocoder_evidence_id", "qc_version", "qc_fingerprint", "coordinate_fingerprint", "state", "confirmed_at"]
  if (!exact(confirmation, keys) || !uuid(confirmation.miller_resource_id) || !clean(confirmation.confirmation_id, 120) || confirmation.state !== "confirmed") return { allowed: false, code: "owner_confirmation_invalid" }
  const same = confirmation.proposal_fingerprint === proposal.proposal_fingerprint && confirmation.miller_resource_id === proposal.miller_resource_id && confirmation.address_identity_fingerprint === proposal.address_identity_fingerprint && confirmation.geocoder_evidence_id === proposal.geocoder_evidence_id && Number(confirmation.qc_version) === proposal.qc.version && confirmation.qc_fingerprint === proposal.qc.classification_fingerprint && confirmation.coordinate_fingerprint === proposal.coordinate_fingerprint
  if (!same) return { allowed: false, code: "owner_confirmation_stale" }
  if (current.address_identity_fingerprint !== proposal.address_identity_fingerprint || current.geocoder_evidence_id !== proposal.geocoder_evidence_id || Number(current.qc?.version) !== proposal.qc.version || current.qc?.classification_fingerprint !== proposal.qc.classification_fingerprint || coordinateFingerprint(current.qc?.review_snapshot?.coordinates || {}) !== proposal.coordinate_fingerprint) return { allowed: false, code: "mapping_proposal_stale" }
  const eligibility = privateLocationEligibility({ resource: current.resource, qc: { ...current.qc, decision: "pilot_eligible" }, evidence: current.evidence, existingLocations: current.locations })
  if (!eligibility.eligible) return { allowed: false, code: "mapping_apply_ineligible", reason_codes: eligibility.reasons }
  return { allowed: true, code: "ready_to_apply", public_map: false, map_eligibility: "separate_miller_evaluation_required" }
}

export function mappingProposalPresentation(proposal, { duplicate_status = "none", public_status = "not mapped" } = {}) {
  return { resource_id: proposal.miller_resource_id, address: proposal.address.submitted, provider_normalized_address: proposal.address.provider_normalized, coordinates: proposal.coordinates, geocode_quality: "Exact civic", checks: { civic_number: "verified", street: "verified", municipality: "verified", province: "verified" }, location_type: "Public fixed location", current_public_map: public_status, duplicate_check: duplicate_status, next_action: "Owner approval required" }
}
