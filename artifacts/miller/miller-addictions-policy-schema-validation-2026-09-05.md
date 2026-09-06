# Miller addictions policy schema and fixture validation

## Architecture implemented

Prepared migration: `20260906053000_miller_addictions_policy_research_v1.sql`

Private tables:

- `miller_addictions_policy_chains`
- `miller_addictions_policy_instruments`
- `miller_addictions_policy_instrument_sources`
- `miller_addictions_commitments`
- `miller_addictions_commitment_sources`
- `miller_addictions_policy_instrument_relations`
- `miller_addictions_policy_resource_links`

All tables force RLS, have no browser policies, revoke `public`, `anon` and `authenticated`, and grant CRUD only to `service_role`. The migration seeds no rows and creates no public route.

## Fixture result

- 73/73 instrument candidates compatible without rejection
- 30/30 commitments compatible
- 15/15 service-link candidates compatible
- 68 source-catalog entries resolved
- 3 explicit amendment/supersession links resolved to fixture candidates
- 6 instrument records owner-gated
- 9 commitment records owner-gated
- 15 service links owner-gated pending canonical resource resolution

The schema supports multiple responsible organizations, multiple sources, repeat recommendations, superseding commitments, numeric funding/service promises, implementation stages and optional canonical resources. A resource link cannot be marked `exact_candidate` without a canonical UUID.

## Validation coverage

Node tests cover enum handling, domain isolation, deterministic duplicate prevention, source-catalog resolution, relationship targets, commitment owners/statuses, owner-review publication blocking, service-match state and private-field rejection.

pgTAP covers table presence, forced RLS, browser-role denial, service-role grants, no browser policies, no seeded candidates, deduplication constraints, domain checks, review gates, canonical exact-match requirements and self-relation prevention.

Final results: 18/18 focused cross-domain Node tests passed, 28/28 focused pgTAP assertions passed, lint passed, and the production build passed with only the repository's existing bundle-size advisory.

## Smallest future improvements

- Add a source-level table for outcome measures only when multiple time series need first-class storage.
- Add an explicit commitment-stage child table only when one commitment needs more than the current evidence-source history.
- Add a shared read-only Farm view after both domains have reviewed production data; do not merge base tables yet.
