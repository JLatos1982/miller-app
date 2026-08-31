# Samwise ↔ Miller integration contract

Implemented: `samwise-miller-geocode-evidence-v2` shares bounded provider observations. Miller independently validates address identity and geocode QC. Address identity, provenance, and interpretation are separate.

Prepared: `samwise-miller-location-apply-v1` binds one owner-confirmable mapping proposal to a Miller resource, identity fingerprint, geocoder evidence, machine QC, and coordinate fingerprint. A confirmation is single-use when the later Miller apply operator consumes it.

Authority: Miller owns canonical resources, `resource_locations`, and map eligibility/publication. Samwise owns observations, Farm projections, stewardship proposals, and owner attention. Igor is a future independent observer/reviewer only.

Shared rules: evidence is shared without transferring authority; observer health is distinct from target health; model output is advisory. Mapping apply is domain-specific—not a generic mutation channel. Igor/security capabilities remain deferred.

## Miller canonical contact and location projection v1

`miller-canonical-contact-location-projection-v1` creates an initially empty,
one-to-one `resource_canonical_profile` for a canonical `resource_registry`
record. It does not backfill, infer, or choose values from Tavily, aliases,
evidence, or existing locations.

The fixed read-only Samwise contract is:

`GET /api/integrations/samwise/canonical-profile-preview/:resourceId`

It uses Miller's existing dedicated trusted Samwise bearer credential and returns
`miller-canonical-profile-preview-v1`. The response always has the resource ID,
`has_canonical_profile`, canonical-location ID, `phone`, `website`, `city`,
`province`, `public_street_address`, `version`, and `canonical_fingerprint`.
Absent profiles return null values and no fingerprint; they do not imply a
canonical choice.

Correction mapping for the future `miller-canonical-field-correction-v1`
transaction is fixed:

| Samwise field | Miller target |
| --- | --- |
| `phone` | `resource_canonical_profile.phone` |
| `website` | `resource_canonical_profile.website` |
| `city` | `resource_locations.city` for the profile's `canonical_location_id` |
| `province` | `resource_locations.province` for the profile's `canonical_location_id` |
| `public_street_address` | `resource_locations.street_address` for the profile's `canonical_location_id` |

City, province, and address are deliberately derived rather than duplicated.
The profile trigger requires the selected location to belong to the same
resource and rejects confidential or undisclosed locations. The deterministic
fingerprint covers normalized phone/website, location ID, derived location
fields, and version. A later fixed write transaction must increment the version
and append `resource_canonical_profile_audit` atomically with its supporting
evidence bindings, actor, policy, reason, and before/after state.

## Canonical field correction transaction v1

`POST /api/integrations/samwise/canonical-field-correction-v1` and its fixed
`/preview` counterpart accept only `miller-canonical-field-correction-v1`.
Required request members are `correction_id`, `resource_id`, `field`,
`expected_current_value`, `expected_profile_version` (or explicit profile
absence), `expected_canonical_fingerprint`, `proposed_value`,
`supporting_evidence_bindings`, `policy_version`, `requester_id`, `created_at`,
`expires_at`, and `request_fingerprint`; location fields additionally require
`canonical_location_id`. Bindings are `{evidence_id,evidence_fingerprint,field}`.

The database accepts a binding only when its immutable evidence belongs to the
resource, is fresh, high-authority, explicitly server-marked authoritative,
high-confidence, no-conflict and privacy-safe for the exact field/value, and is
not AI/Qwen/OpenAI-derived. The response is either `preview`,
`verified_updated`, or a fail-closed rejection/staleness outcome. Successful
responses include correction ID, old/new values, fingerprints, versions, and
audit ID for a separately authorized rollback proposal.
