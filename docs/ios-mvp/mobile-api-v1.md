# Miller mobile search API v1

## Endpoint

`POST /api/mobile/v1/search`

Authentication for the prototype is `public_read_only_rate_limited`. This is intentional: only already-public Miller resources are returned, and no privileged credential is embedded in the app. Organization authentication can be added later in front of the same contract.

Request:

```json
{
  "query": "Find detox and housing options in Surrey",
  "location": "Surrey",
  "province": "British Columbia",
  "categories": ["detox", "housing"],
  "limit": 12
}
```

- `query` is required, trimmed, and limited to 500 characters.
- `location` is optional and limited to 100 characters.
- `province` is optional: British Columbia/BC, Alberta/AB, Saskatchewan/SK, or Canada-wide.
- Up to eight bounded categories are accepted.
- `limit` is 1–20.

Response contract: `miller-mobile-search-v1`.

```json
{
  "contract": "miller-mobile-search-v1",
  "generated_at": "2026-09-08T12:00:00.000Z",
  "interpreted": {
    "primary_intent": "detox",
    "secondary_intents": ["housing"],
    "location": "Surrey",
    "province": "British Columbia"
  },
  "guidance": {
    "title": "Miller’s guide",
    "interpretation": "Sounds like you’re looking for detox or withdrawal-management support.",
    "context": "Services can differ in intake and setting.",
    "next_step": "A good next step might be to call a withdrawal-management service and confirm its current intake instructions.",
    "access_note": "Calling a listed service first can help confirm access.",
    "navigation_note": "",
    "related_collections": [],
    "safeguards": ["Confirm current intake, eligibility, and availability with the service."]
  },
  "search_scope": {
    "exact_location_matches": 4,
    "geography_broadened": false,
    "mode": "local_first",
    "message": ""
  },
  "result_count": 18,
  "returned_count": 12,
  "results": [],
  "privacy": {
    "query_stored": false,
    "client_record_created": false,
    "patient_identifiers_requested": false
  },
  "source_policy": "verified_original_miller_practical_resources_only"
}
```

Each resource card contains a canonical ID, name, organization, category/service type, concise description, province/city/region/address, public phone/email/website, `access_type`, `referral_note`, eligibility/funding/transportation notes, `verified_status`, `last_verified`, `source_url`, a derived `mobile_ready` flag, bounded tags, and compact public source verification metadata. It never exposes ranking scores, private review metadata, incidents, investigations, legal findings, or Miller North evidence.

`mobile_ready` is derived, not manually asserted. It requires a stable canonical ID, current public-source verification, a verified contact path, clear geography or service scope, sufficient basic access information, and no unresolved deterministic duplicate conflict.

`search_scope` explains whether local matches were available or results were safely broadened to verified provincial/Canada-wide navigation. Sparse searches never fabricate a nearby service.

`GET /api/mobile/v1/about` returns the contract name, geography, privacy posture, and current public catalog counts.

Resource feedback uses the existing `POST /api/resource-submissions` contract with a fixed note containing only the selected feedback reason and canonical resource ID.
