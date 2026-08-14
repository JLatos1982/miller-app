# BC shelter discovery coverage — 2026-08-14

Miller's administrator review queue contains 275 pending shelter candidates. No candidate was automatically approved. No coordinate, `resource_locations` row, or public map pin was created.

## Coverage

- 160 current BC Housing Emergency Shelter Map listings: 126 year-round and 34 temporary shelters in 52 communities. Seven drop-in-only listings were excluded.
- 107 BC Housing transition-house and safe-home listings in 87 service communities. All are confidential-location records with no street address.
- 8 corroboration-focused pilot records, including Olive Branch in Surrey, youth, inclusive, Indigenous-specific, and geographically varied examples.
- 155 candidates have intentionally public addresses and remain `awaiting_authorized_geocoder`.
- 108 are confidential and 12 are undisclosed; all 120 are `not_requested` for geocoding and excluded from mapping.
- 70 candidates have one or more possible-match references and require explicit duplicate review. None was automatically merged.

Regions are populated for the emergency-shelter inventory using health-authority geography. Region is intentionally not inferred for the 107 transition-house/safe-home records, so those remain `Not stated` until editorial review.

## Refresh process

Generate current, coordinate-free source artifacts:

```bash
node scripts/bc-housing-shelter-candidates.mjs
node scripts/bc-housing-transition-candidates.mjs
```

Validate without writing:

```bash
node scripts/shelter-candidate-import.mjs --input=data/shelter-candidates-bc-housing.json
node scripts/shelter-candidate-import.mjs --input=data/shelter-candidates-bc-transition-houses.json
```

After reviewing the dry-run counts, add `--apply` to import new fingerprints without overwriting existing review decisions. Run the live read-only report with:

```bash
node --env-file-if-exists=.env scripts/shelter-coverage-report.mjs
```

## Limitations and next checkpoint

The BC Housing emergency map does not expose a shelter-name field. Generated candidate display names combine operator, community, shelter type, eligibility where needed, and the public street label. They are deliberately medium confidence and require editorial naming review. The map also states it is not exhaustive.

The confidential-location directory provides public service area and contact details but not addresses; Miller does not attempt to reconstruct them. Additional focused passes are still recommended for refugee/newcomer emergency accommodation, 2SLGBTQIA+-specific programs, medical respite, recovery/stabilization accommodation, pet/couples policies, and Indigenous programs not represented in these two BC Housing sources.

The next checkpoint is human review of the 70 possible-match candidates, followed by approval of a small representative subset—including Olive Branch—before any high-confidence bulk directory approval. Geocoding remains paused pending authorized access.
