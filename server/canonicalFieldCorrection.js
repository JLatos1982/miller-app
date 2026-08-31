import { createHash } from "node:crypto"
import { CANONICAL_PROFILE_POLICY_VERSION, normalizeCanonicalPhone, normalizeCanonicalWebsite } from "./canonicalProfile.js"

export const CANONICAL_CORRECTION_CONTRACT = "miller-canonical-field-correction-v1"
const FIELDS = new Set(["city", "province", "public_street_address", "phone", "website"])
const REQUEST_KEYS = new Set(["contract", "correction_id", "resource_id", "field", "expected_current_value", "expected_profile_version", "expected_profile_absent", "expected_canonical_fingerprint", "proposed_value", "canonical_location_id", "supporting_evidence_bindings", "policy_version", "requester_id", "created_at", "expires_at", "request_fingerprint"])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HASH = /^[0-9a-f]{64}$/

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
  return JSON.stringify(value)
}
export function correctionRequestFingerprint(request) {
  const copy = { ...request }; delete copy.request_fingerprint
  return createHash("sha256").update(canonical(copy)).digest("hex")
}
export function validateCanonicalCorrectionRequest(input, now = Date.now()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("rejected")
  for (const key of Object.keys(input)) if (!REQUEST_KEYS.has(key)) throw new Error("rejected")
  if (input.contract !== CANONICAL_CORRECTION_CONTRACT || input.policy_version !== CANONICAL_CORRECTION_CONTRACT || !UUID.test(input.correction_id || "") || !UUID.test(input.resource_id || "") || !FIELDS.has(input.field) || !HASH.test(input.request_fingerprint || "") || typeof input.requester_id !== "string" || !/^[A-Za-z0-9:_-]{3,120}$/.test(input.requester_id)) throw new Error("rejected")
  if (!Array.isArray(input.supporting_evidence_bindings) || !input.supporting_evidence_bindings.length || !input.supporting_evidence_bindings.every((item) => item && Object.keys(item).length === 3 && UUID.test(item.evidence_id || "") && HASH.test(item.evidence_fingerprint || "") && item.field === input.field)) throw new Error("evidence_gate_failed")
  if (!Number.isFinite(Date.parse(input.created_at)) || !Number.isFinite(Date.parse(input.expires_at)) || Date.parse(input.expires_at) <= now || Date.parse(input.created_at) > now + 5 * 60_000) throw new Error("rejected")
  if (input.expected_profile_absent === true) {
    if (input.expected_profile_version !== null || input.expected_canonical_fingerprint !== null) throw new Error("rejected")
  } else if (!Number.isInteger(input.expected_profile_version) || input.expected_profile_version < 1 || !HASH.test(input.expected_canonical_fingerprint || "")) throw new Error("rejected")
  if (["city", "province", "public_street_address"].includes(input.field) && !UUID.test(input.canonical_location_id || "")) throw new Error("rejected")
  if (input.canonical_location_id != null && !UUID.test(input.canonical_location_id)) throw new Error("rejected")
  const proposed_value = input.field === "phone" ? normalizeCanonicalPhone(input.proposed_value) : input.field === "website" ? normalizeCanonicalWebsite(input.proposed_value) : typeof input.proposed_value === "string" && input.proposed_value.trim() ? input.proposed_value.trim() : null
  if (proposed_value == null || correctionRequestFingerprint(input) !== input.request_fingerprint) throw new Error("rejected")
  return { ...input, proposed_value }
}

export function correctionResultStatus(error) {
  const code = String(error?.message || error || "")
  return code.includes("evidence_gate_failed") ? 422 : code.includes("stale_before_write") ? 409 : 400
}

export function correctionRouteContract({ request, preview = false }) {
  return { contract: CANONICAL_CORRECTION_CONTRACT, operation: preview ? "preview" : "apply", request }
}
