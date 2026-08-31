import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { correctionRequestFingerprint, validateCanonicalCorrectionRequest } from "./canonicalFieldCorrection.js"

const CONTRACT = "miller-canonical-field-correction-v1"
const VECTOR_FILES = Object.freeze(["city-first-profile-request.json", "city-preview-response.json", "city-apply-response.json", "phone-update-request.json", "phone-apply-response.json", "phone-idempotent-replay-response.json", "phone-stale-request.json", "phone-stale-response.json", "rollback-ready-proposal.json", "canonicalization-rules.json"])
const REQUEST_FILES = Object.freeze(["city-first-profile-request.json", "phone-update-request.json", "phone-stale-request.json"])
const SHA = /^[0-9a-f]{64}$/
const sha256 = value => createHash("sha256").update(value).digest("hex")
const fail = code => { throw new Error(code) }

export function verifyCanonicalCorrectionParityBundle({ bundlePath, expectedManifestSha256 = null, readFile = readFileSync } = {}) {
  if (!bundlePath) fail("canonical_correction_parity_bundle_missing")
  const root = resolve(bundlePath)
  let manifestRaw
  try { manifestRaw = readFile(resolve(root, "manifest.json"), "utf8") } catch { fail("canonical_correction_parity_manifest_missing") }
  const manifest_sha256 = sha256(manifestRaw)
  if (expectedManifestSha256 !== null && manifest_sha256 !== expectedManifestSha256) fail("canonical_correction_parity_manifest_hash_mismatch")
  let manifest
  try { manifest = JSON.parse(manifestRaw) } catch { fail("canonical_correction_parity_manifest_invalid") }
  if (!manifest || manifest.contract !== CONTRACT || manifest.synthetic_only !== true || manifest.production_data_or_credentials_included !== false || !manifest.vectors || Object.keys(manifest.vectors).length !== VECTOR_FILES.length || VECTOR_FILES.some(name => !SHA.test(manifest.vectors[name] || ""))) fail("canonical_correction_parity_manifest_invalid")
  const vectors = {}
  for (const name of VECTOR_FILES) {
    let raw
    try { raw = readFile(resolve(root, name), "utf8") } catch { fail("canonical_correction_parity_vector_missing") }
    if (sha256(raw) !== manifest.vectors[name]) fail("canonical_correction_parity_vector_hash_mismatch")
    try { vectors[name] = JSON.parse(raw) } catch { fail("canonical_correction_parity_vector_invalid") }
  }
  for (const name of REQUEST_FILES) {
    const request = vectors[name]
    const validated = validateCanonicalCorrectionRequest(request, Date.parse("2026-08-31T16:01:00.000Z"))
    if (correctionRequestFingerprint(request) !== request.request_fingerprint || validated.proposed_value !== request.proposed_value) fail("canonical_correction_parity_request_fingerprint_mismatch")
  }
  return Object.freeze({ outcome: "miller_canonical_correction_parity_bundle_self_consistent_verified", vector_count: VECTOR_FILES.length, request_vector_count: REQUEST_FILES.length, manifest_sha256 })
}
