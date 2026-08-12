# Phase 1F final migration and seed plan

The schema and seed have not been executed. Live preflight on 2026-08-11 failed closed because the registry tables are not yet present in the confirmed project.

## Expected initial seed counts

- 300 top-level JSON slots. Recursive normalization finds 333 valid resource rows representing 327 unique `curated:*` aliases.
- 105 approved numeric Tavily aliases.
- 2 confirmed cross-source pairs.
- 1 deferred pair that remains two canonical resources.
- 430 canonical registry records (`327 + 105 - 2`).
- 432 unique aliases (`327 + 105`).
- 3 source-match decision rows.
- 0 locations, geocode-cache rows or location-audit rows at initial registry seed.

The old 383/385 report was erroneous: its parser ignored 20 lowercase rows and did not recursively flatten top-level slot 299, which contains 34 resources. Six of the 333 normalized rows are duplicate copies of the same six resources (same deterministic source alias, with less-complete address data), leaving 327 source identities. No valid identity is excluded for location or mapping reasons.

## Migration objects

Tables:

1. `resource_registry`: UUID primary key, display name, lifecycle state, editorial state, merge target and timestamps.
2. `resource_source_aliases`: canonical foreign key, source type/native ID, URL, fingerprint and provenance; unique source type/native ID.
3. `resource_match_candidates`: source pair, classification, evidence, human decision and decision audit fields.
4. `resource_locations`: multiple locations per canonical resource, location type, address, service area, coordinates, geocode state, review state and publication controls.
5. `geocode_cache`: provider/query cache independent of location approval.
6. `resource_location_audit`: append-only review and publication history.

Indexes:

- Unique source fingerprint per source when present.
- Alias lookup by canonical resource.
- Location lookup by canonical resource.
- Partial public-coordinate index for fixed, verified, approved public locations.
- Lowercase city location index.
- Unique provider/query hash cache key.
- Location audit ordered by location and creation time.
- Primary, foreign-key and unique indexes supplied by PostgreSQL constraints.

All six tables have RLS enabled. All privileges are revoked from `anon` and `authenticated`; no client policies are created. Writes are service-role-only through authenticated, allowlisted admin endpoints. Public reads go through Express and require approved source/editorial state plus fixed, verified, approved, explicitly public locations.

The migration creates the `pgcrypto` extension if missing. It does not alter, update or delete `tavily_resources`.

## Seed order and idempotency

1. Apply the reviewed schema migration.
2. Insert canonical registry UUIDs with `ON CONFLICT (id)` updates limited to display name/timestamp.
3. Insert unique source aliases with `ON CONFLICT (source_type, source_native_id) DO NOTHING`.
4. Run fail-closed ownership assertions for every alias. An existing alias pointing at another UUID aborts the transaction.
5. Insert the three reviewed match-decision records without changing location state.
6. Commit.

The seed is deterministic and transactional. Re-running it produces the same UUIDs and alias ownership. It creates no locations and cannot approve a map point.

## Future commands — do not run without approval

Keep database credentials in an environment variable or secret manager, never source control or chat.

Backup:

```bash
mkdir -p /tmp/miller-phase1f
pg_dump --format=custom --file=/tmp/miller-phase1f/pre-registry.backup "$SUPABASE_DB_URL"
```

Generate and inspect the seed locally:

```bash
node --env-file-if-exists=.env scripts/registry-seed-plan.mjs > /tmp/miller-phase1f/registry-seed.sql
less /tmp/miller-phase1f/registry-seed.sql
```

Apply only the reviewed migration, then the reviewed seed:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/202608070001_add_resource_geography.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f /tmp/miller-phase1f/registry-seed.sql
```

Post-seed count verification:

```sql
select count(*) from public.resource_registry;          -- 430
select count(*) from public.resource_source_aliases;    -- 432
select count(*) from public.resource_match_candidates;  -- 3
select count(*) from public.resource_locations;         -- 0
```

## Rollback

If migration/seed verification fails and no later feature depends on the new tables:

```sql
begin;
drop table if exists public.resource_location_audit;
drop table if exists public.geocode_cache;
drop table if exists public.resource_locations;
drop table if exists public.resource_match_candidates;
drop table if exists public.resource_source_aliases;
drop table if exists public.resource_registry;
commit;
```

Restore from backup only if necessary:

```bash
pg_restore --clean --if-exists --dbname="$SUPABASE_DB_URL" /tmp/miller-phase1f/pre-registry.backup
```

Dropping these new tables does not delete or alter `tavily_resources`. Export audit/location data before rollback once those tables contain reviewed work.

## Geocoder contact configuration

Later, configure `GEOCODER_CONTACT_EMAIL` as a secret environment variable on the Render Miller web service that runs `server.js`. For local-only testing, it may be placed in the uncommitted local `.env`. Do not put it in `.env.example`, source code, migration SQL, generated seed SQL, command history, screenshots or chat. Restart the service after configuring it and verify only that the variable is present—not its value.
