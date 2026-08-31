# Miller Production Literal Refactor v1

## Purpose

`202608680001_refactor_production_literal_bindings.sql` removes two
deployment-specific values from executable Miller schema definitions without
changing the permitted workflows or quality-reader access:

* the Miller Supabase project reference used by the three bounded run ledgers;
* the single authenticated quality-reader identity used by the two quality
  projection policies.

The values are now governed row data. This is not a generic configuration
system, does not expose a client mutation API, and does not modify canonical
resource or location state.

## Typed bindings

`public.miller_project_binding_v1` is a singleton table keyed by the constant
semantic binding key `miller_project_binding_v1`. It holds exactly one
validated project reference. It has forced RLS and no privileges for `anon`,
`authenticated`, or `service_role`.

`public.miller_resource_quality_reader_authorization_v1` is a singleton table
keyed by `miller_resource_quality_reader_authorization_v1`. It holds exactly
one active `auth.users` reference. It has the same forced-RLS, no-runtime-DML
posture. A reviewed administrator-owned migration is the administration path
for either binding.

## Workflow enforcement

The migration replaces the three fixed project-reference CHECK constraints
with one SECURITY DEFINER trigger function attached only to the three existing
run tables. The trigger rejects an inserted or changed `project_ref` unless it
equals the governed project binding. The existing operation, policy-version,
cap, status, provenance, and function-privilege checks remain unchanged.

Each existing `begin_*_run` function obtains the project reference from that
singleton binding before checking a replay or creating a run. The function
signatures, callers, grants, and bounded behavior remain unchanged.

## Quality reader access

The two existing `authenticated` SELECT policies now call
`miller_internal.is_miller_resource_quality_reader_v1()`. It is a no-argument,
SECURITY DEFINER helper with a fixed safe search path; it only evaluates the
current `auth.uid()` against the governed authorization row. It has EXECUTE
only for `authenticated`, and no arguments with which a caller can probe a
different user. `miller_internal` is not an exposed API schema, so the helper
is not a public PostgREST RPC. The quality tables retain their existing forced
RLS and authenticated SELECT grants.

## Verification and baseline relevance

An isolated local PostgreSQL regression used synthetic rows and exercised all
three run starters, replay behavior, incorrect-project rejection, and both
quality policies for the authorized and unauthorized identities. The legacy
and refactored paths had equivalent accepted results and SQLSTATE rejection.

After a production apply, the schema-only baseline scan must find these values
only in the two typed binding rows (data) and never in executable function,
constraint, or policy definitions. Historical migration files intentionally
retain their original provenance and are not rewritten.
