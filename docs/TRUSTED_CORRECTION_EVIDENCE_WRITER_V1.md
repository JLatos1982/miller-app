# Trusted correction evidence writer v1

`miller-trusted-website-correction-evidence-v1` is a fixed, internal Samwise
backend pathway for generating correction-grade evidence for **website only**.
It is not a generic fact/evidence writer and does not update a canonical
profile or location.

## Endpoints

- `POST /api/integrations/samwise/trusted-website-correction-evidence-v1/preview`
- `POST /api/integrations/samwise/trusted-website-correction-evidence-v1`

Both use the dedicated Samwise bearer boundary. The apply endpoint is prepared
for production deployment but has not been used to create production evidence.

## Validation

The caller may provide only a resource ID, a proposed HTTPS root website, a
same-host HTTPS source URL, a bounded source excerpt, and a fresh retrieval
timestamp. It cannot provide field/value trust markers, authority, extraction
method, or an evidence fingerprint.

Miller fetches the source itself using the SSRF-safe bounded fetcher. It rejects
redirects, different hosts, inactive/hidden resources, missing exact resource
identity, missing proposed website text, stale source observations, and
non-canonical/private website forms. The supplied excerpt must be present in
the server-fetched source.

The service-role-only RPC performs the active-resource and conflicting-current-
authoritative-evidence checks, then creates the immutable claim/evidence rows.
It derives the evidence fingerprint and emits the only correction-compatible
marker shape:

```json
{
  "field": "website",
  "value": "https://example.org",
  "authoritative": true,
  "no_conflict": true,
  "confidence": "high",
  "privacy_safe": true
}
```

Preview executes all validation but creates neither claim nor evidence. This
writer deliberately does not call the canonical correction preview or apply
endpoints.
