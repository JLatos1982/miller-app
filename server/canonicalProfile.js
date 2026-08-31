import { createHash } from "node:crypto"

export const CANONICAL_PROFILE_POLICY_VERSION = "miller-canonical-contact-location-projection-v1"
export const CANONICAL_PROFILE_CONTRACT = "miller-canonical-profile-preview-v1"

function fingerprintPart(value) {
  return value == null ? "-1:" : `${Buffer.byteLength(String(value), "utf8")}:${value}`
}

export function normalizeCanonicalPhone(value) {
  if (value == null || value === "") return null
  const normalized = String(value).replace(/[^0-9+]/g, "")
  if (!/^\+[1-9][0-9]{7,14}$/.test(normalized)) throw new Error("canonical_phone_must_be_e164")
  return normalized
}

export function normalizeCanonicalWebsite(value) {
  if (value == null || value === "") return null
  const normalized = String(value).trim().toLowerCase().replace(/\/+$/, "")
  if (!/^https:\/\/[^/?#\s]+[^\s]*$/.test(normalized)) throw new Error("canonical_website_must_be_https")
  return normalized
}

export function canonicalProfileFingerprint({ phone = null, website = null, canonical_location_id = null, city = null, province = null, public_street_address = null, version = 1 } = {}) {
  const source = ["miller-canonical-profile-v1", phone, website, canonical_location_id, city, province, public_street_address, version]
    .map(fingerprintPart)
    .join("\x1f")
  return createHash("sha256").update(source).digest("hex")
}

export function buildCanonicalProfilePreview({ resourceId, profile = null, location = null } = {}) {
  if (!profile) return {
    contract: CANONICAL_PROFILE_CONTRACT,
    policy_version: CANONICAL_PROFILE_POLICY_VERSION,
    resource_id: resourceId,
    has_canonical_profile: false,
    canonical_location_id: null,
    phone: null,
    website: null,
    city: null,
    province: null,
    public_street_address: null,
    version: null,
    canonical_fingerprint: null,
  }
  if (profile.canonical_location_id && (!location || location.id !== profile.canonical_location_id || location.resource_id !== resourceId)) throw new Error("canonical_profile_location_binding_invalid")
  const derived = location ? { city: location.city ?? null, province: location.province ?? null, public_street_address: location.street_address ?? null } : { city: null, province: null, public_street_address: null }
  const fingerprint = canonicalProfileFingerprint({ phone: profile.phone, website: profile.website, canonical_location_id: profile.canonical_location_id, ...derived, version: profile.version })
  return {
    contract: CANONICAL_PROFILE_CONTRACT,
    policy_version: CANONICAL_PROFILE_POLICY_VERSION,
    resource_id: resourceId,
    has_canonical_profile: true,
    canonical_location_id: profile.canonical_location_id ?? null,
    phone: profile.phone ?? null,
    website: profile.website ?? null,
    ...derived,
    version: profile.version,
    canonical_fingerprint: fingerprint,
  }
}

export const canonicalCorrectionFieldMapping = Object.freeze({
  phone: "resource_canonical_profile.phone",
  website: "resource_canonical_profile.website",
  city: "resource_locations.city via resource_canonical_profile.canonical_location_id",
  province: "resource_locations.province via resource_canonical_profile.canonical_location_id",
  public_street_address: "resource_locations.street_address via resource_canonical_profile.canonical_location_id",
})
