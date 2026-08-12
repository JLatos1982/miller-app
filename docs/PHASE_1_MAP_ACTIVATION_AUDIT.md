# Miller geography activation audit (superseded)

This Phase 1 audit describes the original Tavily-only proposal. The canonical Phase 1E design in `PHASE_1E_RESOURCE_IDENTITY.md` and the revised unapplied migration supersede its schema and rollback sections.

Status: stopped before migration and geocoding because resource identity is unresolved.

## Pending migration

`resource_geography`

- Identity primary key: `id bigint`.
- Required foreign key: `resource_id bigint` → `tavily_resources(id)`, cascading on resource deletion, unique per resource.
- Public-address fields: original address text, street address, city, province, postal code.
- Coordinate fields: latitude and longitude with geographic range checks.
- Provenance/review fields: source, confidence, region, service area, status, last verified time, reviewer and review time.
- Service controls: virtual, mobile and `public_map` booleans.
- Status is constrained to geocoded, verified, approximate, failed or needs review; default is needs review.
- Indexes cover public coordinates and lowercase city.

`geocode_runs`

- Identity primary key: `id bigint`.
- Stores provider, normalized cache key, success/failed/skipped status, response summary, error summary and creation time.
- A partial unique index prevents more than one successful response for the same cache key.

Both tables enable RLS and revoke all access from `anon` and `authenticated`. No client policies are created. Reads and writes therefore require the server/service role. The public Express map endpoint additionally requires `approved = true`, `hidden = false`, `public_map = true`, and `geocode_status = verified`. Pending coordinates are not returned.

The migration creates new tables and indexes only. It does not update, delete or alter existing Miller resources.

Safe rollback before dependent production use:

```sql
begin;
drop table if exists public.geocode_runs;
drop table if exists public.resource_geography;
commit;
```

Take a database backup first. After geography records are in use, export review and audit rows before rollback.

## Identity stop condition

- Bundled curated resources: 300, with deterministic client IDs such as `curated:9g1vft`.
- Approved, non-hidden Supabase/Tavily resources: 105, identified by numeric `tavily_resources.id`.
- Obvious exact-URL overlaps: 3.
- Exact normalized name-and-city overlaps: 0, partly because many Supabase rows use `All Cities`.
- Supabase records without an obvious bundled match: 102.
- `resource_geography.resource_id` can reference only a Tavily numeric ID.
- The bundled dataset contains the address candidates, but it has no database registry row that `resource_geography` can reference.
- The approved Tavily registry has websites and city labels but no address fields suitable for the pilot.

Consequently there is no safe authoritative ID joining bundled search results, geography, handouts and the Supabase registry. Applying the migration is structurally safe, but running the proposed pilot now would require guessing or manually conflating records.

Recommended resolution: create an authoritative resource registry covering curated and approved-web resources, assign immutable IDs, store source aliases/fingerprints in a separate table, and point geography and handouts to that registry. Deduplicate through reviewed aliases rather than automatic name matching.

## Dry run

Run the complete JSON inventory without network or database writes:

```bash
node scripts/geography-dry-run.mjs
```

Summary: 300 inspected, 101 mechanically eligible, 199 excluded, five duplicate normalized-address groups, and 84 suspicious or outside the initial Lower Mainland scope. The first 15 are proposed for human review only; they were not geocoded. Some are shared-address resources and some may be sensitive residential programs, so the list must not be treated as approved merely because it passed mechanical checks.

Geocoding is also blocked until `GEOCODER_CONTACT_EMAIL` is configured. The adapter now fails before making a request when identifying contact information is absent.
