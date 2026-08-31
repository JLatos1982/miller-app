# Miller schema baseline epoch v1

## Policy

`miller-schema-baseline-v1` is a reproducible **local/test clean-rebuild
epoch**, captured from the verified current Miller production schema at ledger
boundary `202608690001`.

It is not a recovered deployment chronology, an active Supabase migration, or
a production deployment artifact. Historical files under `supabase/migrations`
remain unchanged for provenance. In particular, the original provenance of
`202608300003` and `202608300004` remains unknown. Their verified resulting
quality schema is represented by the current-state baseline, not claimed as
recovered history.

## Artifact and privacy

The committed artifact is:

- `supabase/baselines/miller-schema-baseline-v1/schema.sql`
- SHA-256: `e03ca4874885957bf63371244aeafd475b4ce448b6fe2eeeecc892f305ef7fca`

It is a schema-only dump of `public` and `miller_internal`. It contains no
production table rows, credentials, canonical resource values, binding values,
or reader identities. Governing reference rows remain data: local/test callers
must create synthetic values only when a test needs them.

## Clean local rebuild

Start an empty, isolated local Supabase stack using its normal CLI workflow.
Do not run `supabase db reset` for this epoch: that command correctly replays
the historical chain, which is intentionally not the v1 rebuild mechanism.

From the Miller checkout, run:

```sh
node scripts/apply-miller-schema-baseline-v1.mjs --workdir /path/to/empty/local/supabase/project
```

The bootstrap checks the dedicated local Supabase Postgres container, refuses
a non-empty application database, then replays the schema dump through that
container's `psql` with `ON_ERROR_STOP=1`. It then applies only numbered files
with a version greater than `202608690001`. This avoids the CLI query API's
single-prepared-statement limitation for full schema dumps. It never runs
`--linked`, `db push`, or a production command.

Before replay it removes the fresh local stack's automatic `anon`,
`authenticated`, and `service_role` default grants. The dump then restores the
production default-privilege posture. This is required to avoid local-only
extra grants from the fresh Supabase template.

At the epoch creation point there are no post-epoch migrations, so the result
is exactly the captured schema. Future forward migrations remain ordinary
files in `supabase/migrations`, must have a version greater than the epoch
boundary, and are applied by the bootstrap in numeric order.

## Production workflow

Production keeps its existing migration ledger. Do not apply this baseline to
production and do not mark it applied there. Continue to deploy only normal
forward migrations with the approved `supabase db push --linked` workflow.

## Parity scope

Schema parity covers relations, columns/types, constraints, indexes,
functions, triggers, RLS, policies, grants, and publication membership. The
intentional data-only difference is that the local baseline has no production
rows, including the governed HighGate, project-binding, and quality-reader
authorization rows.
