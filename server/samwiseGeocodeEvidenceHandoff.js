import { createHash } from "node:crypto"
import { canonicalCivicAddress, classifyBcAddressResults } from "./bcAddressGeocoder.js"
import { exactBcPackage } from "./canonicalResearchPipeline.js"

export const SAMWISE_MILLER_GEOCODE_EVIDENCE_V1 = "samwise-miller-geocode-evidence-v1"
export const SAMWISE_MILLER_GEOCODE_EVIDENCE_V2 = "samwise-miller-geocode-evidence-v2"
const clean = (value, max = 500) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
const place = (value) => clean(value, 100).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => key in value)
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const coordinate = (value, min, max) => Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex")

// Cross-domain identity deliberately excludes source URL and observation time.
// Those facts remain auditable provenance, but only the receiving domain can
// decide whether its current canonical address is the same address.
export function canonicalSamwiseMillerAddressIdentity({ miller_resource_id, submitted_address, municipality, province = "BC" } = {}) {
  const civic = canonicalCivicAddress(clean(submitted_address, 300))
  const identity = {
    version: "miller-address-identity-v1",
    miller_resource_id: clean(miller_resource_id, 36).toLowerCase(),
    civic_number: civic.civic_number,
    street_name: civic.street_name,
    street_type: civic.street_type,
    street_direction: civic.street_direction,
    municipality: place(municipality),
    province: clean(province, 20).toUpperCase(),
  }
  if (!uuid(identity.miller_resource_id) || !identity.civic_number || !identity.street_name || !identity.street_type || !identity.municipality || identity.province !== "BC") throw new Error("samwise_geocode_address_identity_invalid")
  return Object.freeze({ ...identity, fingerprint: fingerprint(identity) })
}

// Strict, deliberately small observation contract.  It carries no Samwise QC
// verdict: Miller reconstructs a provider feature and applies current rules.
export function validateSamwiseGeocodeEvidence(value) {
  const keys = ["contract", "samwise_evidence_id", "miller_resource_id", "submitted_address", "municipality", "source_address_fingerprint", "observed_at", "provider", "provider_result", "geocode_result_fingerprint"]
  if (!exactKeys(value, keys) || value.contract !== SAMWISE_MILLER_GEOCODE_EVIDENCE_V1 || !uuid(value.miller_resource_id)) throw new Error("samwise_geocode_handoff_invalid")
  if (!/^[a-z0-9_-]{1,120}$/i.test(clean(value.samwise_evidence_id, 120)) || !clean(value.submitted_address, 300) || !clean(value.municipality, 100) || !/^[a-f0-9]{64}$/i.test(clean(value.source_address_fingerprint, 64)) || !/^\d{4}-\d{2}-\d{2}T/.test(clean(value.observed_at, 40)) || value.provider !== "bc_address_geocoder") throw new Error("samwise_geocode_handoff_invalid")
  const resultKeys = ["returned_address", "latitude", "longitude", "score", "precision_points", "precision", "location_descriptor", "civic_number", "street_name", "street_type", "street_direction", "locality", "province", "postal_code", "site_id"]
  const result = value.provider_result
  if (!exactKeys(result, resultKeys) || !clean(result.returned_address, 300) || coordinate(result.latitude, 48, 60) == null || coordinate(result.longitude, -140, -114) == null || Number(result.score) !== 100 || Number(result.precision_points) < 95 || clean(result.precision, 40).toLowerCase() !== "civic_number" || clean(result.location_descriptor, 40).toLowerCase() !== "parcelpoint" || !clean(result.civic_number, 20) || !clean(result.street_name, 160) || clean(result.province, 20).toUpperCase() !== "BC" || !clean(result.locality, 100) || !/^[a-f0-9]{64}$/i.test(clean(value.geocode_result_fingerprint, 64))) throw new Error("samwise_geocode_handoff_invalid")
  const expected = fingerprint({ submitted_address: value.submitted_address, municipality: value.municipality, provider: value.provider, provider_result: result, observed_at: value.observed_at, source_address_fingerprint: value.source_address_fingerprint })
  if (expected !== value.geocode_result_fingerprint) throw new Error("samwise_geocode_handoff_fingerprint_invalid")
  return Object.freeze({ ...value, provider_result: { ...result, latitude: coordinate(result.latitude, 48, 60), longitude: coordinate(result.longitude, -140, -114) } })
}

export function validateSamwiseGeocodeEvidenceV2(value) {
  const keys = ["contract", "samwise_evidence_id", "miller_resource_id", "submitted_address", "municipality", "province", "address_identity", "source_provenance", "observed_at", "provider", "provider_result", "geocode_result_fingerprint"]
  if (!exactKeys(value, keys) || value.contract !== SAMWISE_MILLER_GEOCODE_EVIDENCE_V2 || !uuid(value.miller_resource_id)) throw new Error("samwise_geocode_handoff_invalid")
  if (!/^[a-z0-9_-]{1,120}$/i.test(clean(value.samwise_evidence_id, 120)) || !clean(value.submitted_address, 300) || !clean(value.municipality, 100) || clean(value.province, 20).toUpperCase() !== "BC" || !/^\d{4}-\d{2}-\d{2}T/.test(clean(value.observed_at, 40)) || value.provider !== "bc_address_geocoder") throw new Error("samwise_geocode_handoff_invalid")
  const expectedIdentity = canonicalSamwiseMillerAddressIdentity(value)
  const identityKeys = ["version", "miller_resource_id", "civic_number", "street_name", "street_type", "street_direction", "municipality", "province", "fingerprint"]
  if (!exactKeys(value.address_identity, identityKeys) || Object.keys(expectedIdentity).some((key) => expectedIdentity[key] !== value.address_identity[key])) throw new Error("samwise_geocode_address_identity_invalid")
  const provenanceKeys = ["source_url", "retrieved_at", "samwise_source_fingerprint"]
  if (!exactKeys(value.source_provenance, provenanceKeys) || !clean(value.source_provenance.source_url, 500) || !/^\d{4}-\d{2}-\d{2}T/.test(clean(value.source_provenance.retrieved_at, 40)) || !/^[a-f0-9]{64}$/i.test(clean(value.source_provenance.samwise_source_fingerprint, 64))) throw new Error("samwise_geocode_handoff_invalid")
  const resultKeys = ["returned_address", "latitude", "longitude", "score", "precision_points", "precision", "location_descriptor", "civic_number", "street_name", "street_type", "street_direction", "locality", "province", "postal_code", "site_id"]
  const result = value.provider_result
  if (!exactKeys(result, resultKeys) || !clean(result.returned_address, 300) || coordinate(result.latitude, 48, 60) == null || coordinate(result.longitude, -140, -114) == null || Number(result.score) !== 100 || Number(result.precision_points) < 95 || clean(result.precision, 40).toLowerCase() !== "civic_number" || clean(result.location_descriptor, 40).toLowerCase() !== "parcelpoint" || !clean(result.civic_number, 20) || !clean(result.street_name, 160) || clean(result.province, 20).toUpperCase() !== "BC" || !clean(result.locality, 100) || !/^[a-f0-9]{64}$/i.test(clean(value.geocode_result_fingerprint, 64))) throw new Error("samwise_geocode_handoff_invalid")
  const expected = fingerprint({ contract: value.contract, samwise_evidence_id: value.samwise_evidence_id, miller_resource_id: value.miller_resource_id, submitted_address: value.submitted_address, municipality: value.municipality, province: value.province, address_identity: value.address_identity, source_provenance: value.source_provenance, observed_at: value.observed_at, provider: value.provider, provider_result: result })
  if (expected !== value.geocode_result_fingerprint) throw new Error("samwise_geocode_handoff_fingerprint_invalid")
  return Object.freeze({ ...value, provider_result: { ...result, latitude: coordinate(result.latitude, 48, 60), longitude: coordinate(result.longitude, -140, -114) } })
}

export function classifySamwiseGeocodeEvidence(value) {
  const handoff = validateSamwiseGeocodeEvidence(value), p = handoff.provider_result
  const feature = { geometry: { coordinates: [p.longitude, p.latitude] }, properties: { fullAddress: p.returned_address, civicNumber: p.civic_number, streetName: p.street_name, streetType: p.street_type, streetDirection: p.street_direction, localityName: p.locality, provinceCode: p.province, postalCode: p.postal_code, siteID: p.site_id, score: p.score, precisionPoints: p.precision_points, matchPrecision: p.precision, locationDescriptor: p.location_descriptor, faults: [] } }
  const classified = classifyBcAddressResults([feature], { street_address: handoff.submitted_address, city: handoff.municipality })
  return Object.freeze({ handoff, classified, geocoder_package: exactBcPackage(classified, handoff.submitted_address, handoff.municipality) })
}

export function classifySamwiseGeocodeEvidenceV2(value) {
  const handoff = validateSamwiseGeocodeEvidenceV2(value), p = handoff.provider_result
  const feature = { geometry: { coordinates: [p.longitude, p.latitude] }, properties: { fullAddress: p.returned_address, civicNumber: p.civic_number, streetName: p.street_name, streetType: p.street_type, streetDirection: p.street_direction, localityName: p.locality, provinceCode: p.province, postalCode: p.postal_code, siteID: p.site_id, score: p.score, precisionPoints: p.precision_points, matchPrecision: p.precision, locationDescriptor: p.location_descriptor, faults: [] } }
  const classified = classifyBcAddressResults([feature], { street_address: handoff.submitted_address, city: handoff.municipality })
  return Object.freeze({ handoff, classified, geocoder_package: exactBcPackage(classified, handoff.submitted_address, handoff.municipality) })
}

export async function importSamwiseGeocodeEvidence({ db, handoff, runId, occupancyClaimId, actorId, currentAddressFingerprint }) {
  const checked = classifySamwiseGeocodeEvidence(handoff)
  if (checked.handoff.source_address_fingerprint !== currentAddressFingerprint) return { outcome: "source_address_changed", persisted: false, publication_attempted: false }
  if (!checked.geocoder_package) return { outcome: `geocoder_${checked.classified.classification}`, persisted: false, publication_attempted: false }
  const persisted = await db.rpc("persist_canonical_bc_geocoder_evidence_v1", { p_run_id: runId, p_resource_id: checked.handoff.miller_resource_id, p_occupancy_claim_id: occupancyClaimId, p_geocoder_package: { ...checked.geocoder_package, observation_origin: "samwise_bounded_geocode_operator", observed_at: checked.handoff.observed_at, samwise_evidence_id: checked.handoff.samwise_evidence_id, geocode_result_fingerprint: checked.handoff.geocode_result_fingerprint }, p_actor_id: actorId })
  if (persisted.error) throw persisted.error
  const qc = await db.rpc("create_machine_initial_location_qc_from_evidence", { p_resource_id: checked.handoff.miller_resource_id, p_occupancy_claim_id: occupancyClaimId, p_geocoder_evidence_id: persisted.data.evidence_id, p_actor_id: actorId })
  if (qc.error && qc.error.code !== "PT409") throw qc.error
  return { outcome: "exact_civic_staged_for_review", persisted: true, evidence_id: persisted.data.evidence_id, qc_version: qc.data?.version || qc.error?.details?.version || null, publication_attempted: false }
}

export async function importSamwiseGeocodeEvidenceV2({ db, handoff, runId, occupancyClaimId, actorId, currentAddressIdentity }) {
  const checked = classifySamwiseGeocodeEvidenceV2(handoff)
  if (!currentAddressIdentity || checked.handoff.address_identity.fingerprint !== currentAddressIdentity.fingerprint) return { outcome: "source_address_changed", persisted: false, publication_attempted: false }
  if (!checked.geocoder_package) return { outcome: `geocoder_${checked.classified.classification}`, persisted: false, publication_attempted: false }
  const persisted = await db.rpc("persist_canonical_bc_geocoder_evidence_v1", { p_run_id: runId, p_resource_id: checked.handoff.miller_resource_id, p_occupancy_claim_id: occupancyClaimId, p_geocoder_package: { ...checked.geocoder_package, observation_origin: "samwise_bounded_geocode_operator", observed_at: checked.handoff.observed_at, samwise_evidence_id: checked.handoff.samwise_evidence_id, geocode_result_fingerprint: checked.handoff.geocode_result_fingerprint, source_provenance: checked.handoff.source_provenance, address_identity: checked.handoff.address_identity }, p_actor_id: actorId })
  if (persisted.error) throw persisted.error
  const qc = await db.rpc("create_machine_initial_location_qc_from_evidence", { p_resource_id: checked.handoff.miller_resource_id, p_occupancy_claim_id: occupancyClaimId, p_geocoder_evidence_id: persisted.data.evidence_id, p_actor_id: actorId })
  if (qc.error && qc.error.code !== "PT409") throw qc.error
  return { outcome: "exact_civic_staged_for_review", persisted: true, evidence_id: persisted.data.evidence_id, qc_version: qc.data?.version || qc.error?.details?.version || null, publication_attempted: false }
}
