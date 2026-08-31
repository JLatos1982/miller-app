# Miller Resource Quality Historical Baseline v1

This document is a non-executable, non-original historical baseline for the
already-existing production state of `public.miller_resource_quality_v1` in the
Miller Supabase project. It is documentation only; it is not in
`supabase/migrations`, does not create a migration version, and has no
deployment effect.

## What this baseline is—and is not

- It is **not** the original `202608300003` migration.
- It is **not** the original `202608300004` migration.
- It does not recover an original deployment sequence, timestamp, actor, or
  command. That provenance remains unknown.
- It records the production state independently verified by read-only catalog
  inspection, together with the best surviving descriptions of intended
  predecessor effects.

The Miller migration ledger records `202608300005` only. Its recorded SQL
creates and populates `miller_resource_quality_detail_v1` by joining
`miller_resource_quality_v1`; therefore the predecessor quality table existed
before `300005` was successfully applied. That dependency proves prerequisite
existence, not the exact original predecessor migration history.

## Verified current production baseline

### Quality table

`public.miller_resource_quality_v1` exists with the following verified shape:

| Column | Type | Nullable | Default | Verified constraint |
| --- | --- | --- | --- | --- |
| `resource_id` | `uuid` | no | none | primary key |
| `quality_state` | `text` | no | none | `clean`, `missing`, or `stale` |
| `completeness_score` | `integer` | no | none | inclusive `0..5` |
| `source_fingerprint` | `text` | no | none | lower-case 64-character SHA-256 hex |
| `updated_at` | `timestamp with time zone` | no | none | none |

No non-primary-key index, function, trigger, or operational comment was
verified for this quality surface.

### Access-control baseline

- Row-level security is enabled and forced.
- `authenticated` has `SELECT` and no broader verified table privilege.
- The reader policy is
  `miller_resource_quality_reader_select`, for `SELECT` to `authenticated`.
- Its verified predicate is the hardened form:

  ```sql
  (select auth.uid()) = 'f92a36ed-9af8-4fe5-be35-2fecb4d8e6a7'::uuid
  ```

This describes an observed state; it does not claim that each grant, revoke,
or policy clause was originally executed as a separate historical step.

## Reference descriptions and limits

The best surviving committed descriptions of predecessor intent are currently
in Samwise:

- `/Users/admin/samwise-private/supabase/migrations/202608300003_create_miller_resource_quality.sql`
  (Git blob `2a29006e0b56360e6c8ad5347136028ac8fcf68d`)
- `/Users/admin/samwise-private/supabase/migrations/202608300004_harden_miller_resource_quality_grants.sql`
  (Git blob `3e6146a2c3699fed640e3c2f6f2b106a4295b490`)
- [Samwise recovery audit](../../samwise-private/docs/MILLER_MIGRATION_HISTORY_RECOVERY_300003_300004_V1.md)
  (repository-local reference; not an active migration)

They are reference descriptions, not proven original Miller deployment
artifacts. In particular, the seed query in `300003` is a historical data
effect that cannot be reconstructed or verified from current catalog state.

## Ownership and future cleanup

Miller owns this baseline and the quality surface. Samwise should not execute
or retain Miller migration history indefinitely. However, Samwise’s copies
must remain until a separately reviewed cleanup satisfies all conditions:

1. This Miller baseline is committed.
2. Miller ownership is recorded in the project-scope reconciliation.
3. The baseline captures every verified material predecessor effect and the
   two source blob identities.
4. Miller and Samwise migration-list/dry-run checks are recorded.
5. The removal or relocation is separately reviewed and authorized.
6. No Samwise deployment tool depends on the copies.

This baseline does not authorize a Miller ledger repair, a fake applied
migration, a schema change, data backfill, or removal of the Samwise copies.
