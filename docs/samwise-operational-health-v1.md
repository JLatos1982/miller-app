# Samwise operational health v1

`server/samwiseOperationalHealth.js` is a small, read-only reconciliation primitive. It does not start workers, change credentials, publish evidence, mutate production state, or remove audit history.

## Authoritative state and freshness

| Component | Preferred current source | Authority | Expected cadence / stale threshold | Recovery path |
| --- | --- | --- | --- | --- |
| Miller public | `/api/health` | authoritative live probe | probe-defined; record `stale_after` with each probe | retry GET, then classify stale if unavailable |
| Miller mobile API | `/api/mobile/v1/about` | authoritative live probe | probe-defined | retry GET; keep public health separate |
| Miller internal observability | authenticated Samwise status projection | authoritative when retrieved | on-demand / explicit threshold | refresh authenticated read; never imply public outage from its absence |
| Farm/listeners | `.farm-operations/farm-job-state-v1.json` plus listener registry | authoritative local state | listener schedule plus recorded next run | rerun a bounded due check; preserve backoff/locks |
| Igor | `.farm-operations/igor-worker-state-v1.json` and replay journal | authoritative local worker state | short handshake/heartbeat threshold declared by caller | safe authenticated health handshake; do not restart automatically |
| Security | security pulse history and read-only Farm security listener | authoritative when current | pulse/listener configured cadence | rerun safe read-only inspection |
| Owner advisories | append-only advisory and event journals | authoritative local history | event-driven | resolve only with documented evidence |
| Review candidates | private candidate artifacts / owner-review store | authoritative only in their owning queue | event-driven | separate owner decision from more research |

Each observation records `observed_at`, `expected_next_at`, `stale_after`, `source_latency_ms`, `state_at_observation`, `last_good_at`, and `last_failure_at`. A past `stale_after` derives `stale`; it does not derive `degraded`.

## Reconciliation rules

1. Preserve every source observation; derive a separate component state.
2. Prefer current authoritative evidence, then current derived evidence, then cached evidence.
3. A newer healthy observation supersedes—but does not erase—an older failure and marks the component recovered.
4. Miller public/mobile health and internal observability are separate components. A healthy public service remains healthy when its private monitoring path is stale or unavailable.
5. A historical completed job never proves a worker is currently online; it is reported as historical success until a current heartbeat exists.

## Warning and lifecycle rules

Warnings progress through `new`, `active`, `acknowledged`, `stale`, `resolved`, `superseded`, or `false_positive`. Resolution requires explicit evidence. Unconfirmed old warnings become `stale`, not silently resolved.

Owner requests use `queued`, `claimed`, `running`, `completed`, `failed`, `expired`, or `cancelled`. Igor handoffs use `queued`, `accepted`, `running`, `progress`, `completed`, `failed`, or `expired`. An expiration reconciliation is a derived, audit-preserving state and never invents a result code.

## Self-healing boundary

Safe automated actions: refresh a read-only probe, reread listener/worker state, derive freshness, reconcile duplicate warnings, mark a deterministically expired request in a derived projection, and regenerate the owner digest.

Owner approval remains required for deployment, production/database mutation, credentials, worker configuration/restart, evidence publication, schema changes, and destructive cleanup.

## Change-only owner notifications

The owner digest surfaces new degraded/unavailable conditions, meaningful recovery, active review decisions, and material changes. It separately lists stale/unknown observability and does not emit routine healthy noise.
