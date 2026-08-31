# Miller canonical profile fingerprint v1

`miller-canonical-profile-v1` is the shared Miller/Samwise canonicalization
contract. JavaScript (`server/canonicalProfile.js`) is the normative portable
implementation; PostgreSQL function
`public.canonical_profile_fingerprint_v1` must produce the identical digest.

## SHA-256 input bytes

The input is UTF-8 text assembled in this exact order:

1. Literal domain tag: `miller-canonical-profile-v1`
2. `phone`
3. `website`
4. `canonical_location_id` serialized as lower-case PostgreSQL UUID text
5. `city`
6. `province`
7. `public_street_address`
8. Decimal `version`

Values are separated by the single byte `0x1f` (ASCII Unit Separator), not the
four-character text sequence `\\x1f`. The domain tag and every non-null value
are encoded as `<UTF-8-byte-length>:<value>`; nullable values are encoded as
`-1:`. The SHA-256 digest is returned as lower-case hexadecimal.

Phone and website values must already have passed their correction-contract
normalizers before entering this function. City, province, and street text are
stored/derived canonical values and are not case-folded or otherwise changed by
the fingerprint function. Version is an explicit concurrency input.

Migration `202608700001` also repairs the existing profile E.164 CHECK's
literal double-backslash escape. It preserves the intended normalized-phone
acceptance rule and is required for the fixed contact-field transaction path.

Fixed cross-language vectors are in
`test/fixtures/canonical-profile-fingerprint-v1.json`; they include null and
UTF-8 cases. The local canonical-correction E2E runner invokes PostgreSQL for
every vector before any synthetic test data is seeded.
