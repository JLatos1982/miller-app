import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { buildCanonicalProfilePreview, canonicalProfileFingerprint, canonicalCorrectionFieldMapping, normalizeCanonicalPhone, normalizeCanonicalWebsite } from "../server/canonicalProfile.js"

const resourceId = "2739fba4-51d8-5c57-b433-9e31cd99a01d"
const location = { id: "a39cd1b9-7942-4c7e-b5c0-101e4c2e702b", resource_id: resourceId, street_address: "323 Eighth St", city: "New Westminster", province: "BC" }
const profile = { canonical_location_id: location.id, phone: "+16045551234", website: "https://example.org", version: 1 }

test("one-to-one projection is explicitly empty until selected", () => {
  const preview = buildCanonicalProfilePreview({ resourceId })
  assert.equal(preview.has_canonical_profile, false)
  assert.equal(preview.canonical_fingerprint, null)
})

test("preview derives location fields only through the selected location", () => {
  const preview = buildCanonicalProfilePreview({ resourceId, profile, location })
  assert.deepEqual([preview.city, preview.province, preview.public_street_address], ["New Westminster", "BC", "323 Eighth St"])
  assert.equal(preview.canonical_fingerprint, canonicalProfileFingerprint({ ...profile, city: location.city, province: location.province, public_street_address: location.street_address }))
  assert.match(canonicalCorrectionFieldMapping.city, /canonical_location_id/)
})

test("a canonical pointer must bind to its own resource; unrelated source locations are not selected", () => {
  assert.throws(() => buildCanonicalProfilePreview({ resourceId, profile, location: { ...location, resource_id: "b980ad5f-6dfc-5c03-ab5e-bbaaaf3d499f" } }), /binding_invalid/)
  assert.throws(() => buildCanonicalProfilePreview({ resourceId, profile, location: { ...location, id: "b980ad5f-6dfc-5c03-ab5e-bbaaaf3d499f" } }), /binding_invalid/)
})

test("multiple source locations remain untouched and a confidential location is prohibited", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/202608620001_create_resource_canonical_profile.sql", import.meta.url), "utf8")
  assert.match(sql, /v_location\.location_type in \('confidential', 'undisclosed'\) or v_location\.review_status = 'confidential'/)
  assert.doesNotMatch(sql, /update public\.resource_locations/i)
  assert.doesNotMatch(sql, /insert into public\.resource_locations/i)
})

test("fingerprint is deterministic and version is a concurrency input", () => {
  const one = canonicalProfileFingerprint({ ...profile, city: location.city, province: location.province, public_street_address: location.street_address })
  const two = canonicalProfileFingerprint({ ...profile, city: location.city, province: location.province, public_street_address: location.street_address })
  const changedVersion = canonicalProfileFingerprint({ ...profile, version: 2, city: location.city, province: location.province, public_street_address: location.street_address })
  assert.equal(one, two); assert.notEqual(one, changedVersion)
})

test("phone and website normalization is bounded", () => {
  assert.equal(normalizeCanonicalPhone("+1 (604) 555-1234"), "+16045551234")
  assert.throws(() => normalizeCanonicalPhone("604-555-1234"), /e164/)
  assert.equal(normalizeCanonicalWebsite(" HTTPS://Example.Org/ "), "https://example.org")
  assert.throws(() => normalizeCanonicalWebsite("http://example.org"), /https/)
})

test("migration constrains one profile, its owned non-confidential location, immutable audit, and no backfill", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/202608620001_create_resource_canonical_profile.sql", import.meta.url), "utf8")
  assert.match(sql, /resource_id uuid primary key references public\.resource_registry/)
  assert.match(sql, /v_location\.resource_id <> new\.resource_id/)
  assert.match(sql, /location_type in \('confidential', 'undisclosed'\)/)
  assert.match(sql, /before update or delete on public\.resource_canonical_profile_audit/)
  assert.match(sql, /version integer not null default 1 check \(version >= 1\)/)
  assert.doesNotMatch(sql, /insert into public\.resource_canonical_profile\s+select/i)
})

test("Samwise preview is fixed, read-only, and trusted-backend authenticated", () => {
  const source = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  assert.match(source, /app\.get\("\/api\/integrations\/samwise\/canonical-profile-preview\/:resourceId",requireSamwiseStatus/)
  assert.doesNotMatch(source, /app\.(?:post|patch|put|delete)\("\/api\/integrations\/samwise\/canonical-profile-preview/)
})
