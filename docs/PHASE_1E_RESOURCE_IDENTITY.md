# Phase 1E unified resource identity proposal

Status: design, migration and dry-run tooling only. Nothing has been applied or written.

## Canonical identity

`resource_registry.id` is a Miller-owned random UUID. It is non-semantic and never changes when a name, URL, address or approval changes. Existing `curated:*` values and numeric `tavily_resources.id` values become unique source aliases. A confirmed alias is resolved only by the trusted server. Unmatched source records remain independent canonical resources.

The dry-run seed uses deterministic UUID-shaped proposals derived from the immutable source alias so repeated previews are stable. Once inserted, the database UUID is permanent; later source edits update fields and provenance rather than identity. Candidate matches remain separate registry proposals until a reviewer explicitly confirms `same_resource`.

## Field authority

- Canonical display name: editor-selected value, with all source names retained as provenance.
- Description, categories, phone, website and eligibility: most recently human-verified public source; field-level source alias and verification timestamp should be retained.
- Address and city: published location source plus separate location review. Neither bundled nor approved-web status alone makes geography authoritative.
- Editorial approval: registry-level human decision, separate from source provenance and AI review.
- AI review: advisory metadata only; it cannot approve a resource, alias or location.
- Map inclusion: location-level `public_map`, requiring fixed type, verified geocode and approved location review.
- Geocoding confidence: provider/matching evidence only; it cannot imply editorial or publication approval.
- Confidentiality: location-level decision that always overrides coordinates and public-map settings.

One canonical resource can have multiple fixed locations, shared physical addresses, virtual/mobile delivery, service areas and confidential or undisclosed locations simultaneously.

## Compatibility

The transition is additive:

1. Keep `curated:*` and numeric IDs working.
2. Resolve confirmed aliases to UUIDs on the server.
3. Preserve source IDs in search responses and existing handouts while optionally adding canonical IDs.
4. Keep unmatched aliases independent; never drop a result because it has no cross-source match.
5. Move map selection, reviews and new handouts to canonical IDs gradually.
6. Keep non-sensitive analytics event shapes unchanged; do not add chat text.
7. Do not rewrite historical handouts or analytics.

## Matching rules

The report compares canonical URL, public phone, city, address, domain, resource/program name and organization tokens. Exact URL plus supporting name/organization evidence is high confidence. Phone/city, address/name, or strong same-domain program-name evidence is possible. Weak evidence never merges records. Same organization, domain, address or proximity alone is insufficient because distinct programs commonly share them.

Review decisions are `same_resource`, `keep_separate`, or `defer`. A source-match decision cannot approve a map location.

## Commands

Read-only registry and matching report (reads approved Supabase rows, writes nothing):

```bash
node --env-file-if-exists=.env scripts/registry-dry-run.mjs
```

Summary/review format:

```bash
node --env-file-if-exists=.env scripts/registry-dry-run.mjs --summary
```

Canonical geography inventory without network or database access:

```bash
node scripts/geography-dry-run.mjs
```

## Rollback

Before use, the unapplied migration can simply be removed. After an explicitly authorized application, rollback in dependency order after exporting review/audit data:

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

This does not alter or delete `tavily_resources`.
