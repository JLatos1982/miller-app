# HighGate Catalog-Verified Regression v1

This increment used a temporary, ignored, local-only fixture. It is not an active migration, a clean baseline, historical reconstruction, or an export. Production access was limited to read-only PostgreSQL catalog queries. No production row was read and no production function was invoked.

## Reviewed closure

The machine-readable reviewed closure is `docs/HIGHGATE_REVIEWED_DEPENDENCY_MANIFEST_V1.json`. Exact `pg_get_functiondef`, `pg_get_constraintdef`, `pg_get_triggerdef`, `pg_get_indexdef`, column metadata, and sequence metadata were checked in two catalog passes. Both PL/pgSQL bodies contain no dynamic SQL, computed relation name, or unresolved project-function call.

`pg_depend` exposed only the PL/pgSQL language, public namespace, and the `location_qc_reviews` composite return type. Static body review added the nine directly referenced public tables plus `extensions.digest(text,text)`. Trigger and foreign-key traversal added the append-only trigger function, `auth.users(id uuid)`, and three identity sequences. No name-similarity inference was used.

## Local regression

Two disposable databases in the existing local Supabase PostgreSQL container received the same minimal prerequisite schema and synthetic rows. The legacy database loaded the committed historical HighGate migration. The refactor database then loaded the prepared reference-data migration.

The identical vectors produced the same semantic result:

| Vector | Legacy | Refactor |
| --- | --- | --- |
| authorized correction | `created` | `created` |
| unauthorized resource | rejected `P0001` | rejected `P0001` |
| wrong address | rejected `23514` | rejected `23514` |
| wrong policy | rejected `23514` | rejected `23514` |
| exact replay | `idempotent` | `idempotent` |
| QC supersession | version 1 → 2, `machine_initial` | version 1 → 2, `machine_initial` |
| stale supersession | rejected `40001` | rejected `40001` |

Both states had one correction, one claim, two official evidence rows, one change-audit row, two QC snapshots, one QC audit row, and one supersession row. The normalized audit, snapshot, and supersession values were equal. The source legacy row remained unchanged. Generated UUIDs, timestamps, and their derived fingerprint bytes were treated as nondeterministic identities; fingerprint format and input semantics were equivalent.

## Prepared refactor

The pending migration creates `public.highgate_authoritative_location_reference`, seeds exactly the two currently embedded workflow references, enables RLS, denies public/anonymous/authenticated access, grants backend read only, replaces the fixed-address check with a reference-backed validating trigger, and replaces both functions with lookup-backed definitions. It has not been applied to production.

A clean schema-only dump of the refactored disposable database was scanned for both HighGate resource UUIDs, the corrected and legacy address markers, Fraser Health URLs, and the locality literal. The scan returned zero matches after the temporary vector-runner function was removed. Those values remain only in typed reference rows.

## Fixture handling

The temporary fixture components had SHA-256 values:

- prerequisite schema: `84719b0e0d850921cf648a8bc5054efe8d1ba4064280e6f73973d1dcab879c4a`
- synthetic seed: `080942870e3a8739c04e53792dc32e1ff4e73702223d3339b620cf54f793da7e`
- vector runner: `8bfd8624b0ce6100a7dbb65232490683bf0c42f0603b7c2268d115b293e3638b`
- exact historical migration source: `b0675f62b927094befe46287dcbaebeaacfe8c6ae1879868f2a1813d3b043374`

The raw fixture, vector SQL, schema dumps, and disposable databases are deleted after verification. Only hashes and bounded results are retained.
