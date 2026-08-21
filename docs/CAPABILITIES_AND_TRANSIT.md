# Miller capabilities and transit context

Miller keeps external integrations behind its Express server. The protected administrator dashboard exposes configuration states, never credential values.

## Transit providers

- BC Transit: a Central Fraser Valley pilot uses the official static GTFS operator feed. The provider also publishes GTFS-realtime alerts, trip updates, and positions; alert decoding is the next bounded increment.
- TransLink: the official weekly static GTFS feed is configured. With the server-only `TRANSLINK_GTFS_REALTIME_API_KEY`, Miller decodes the official service-alert, trip-update, and vehicle-position protobuf feeds. Deprecated RTTI is not used.
- 211 British Columbia: placeholder pending authorized API access. Miller does not scrape or infer an API.
- Pathways BC: future-provider placeholder; no integration is claimed.

The public endpoint accepts only a Miller location UUID. It rechecks that the location is fixed, public, verified, and approved before loading transit data. Feed URLs are code-owned HTTPS URLs on an allowlist, with redirects disabled, response/extraction size bounds, timeouts, and an in-memory cache. Static feeds remain cached for six hours. Realtime feeds use a separate 45-second cache: short enough for disruption context, while sharing one fetch across users and coalescing concurrent requests to protect the TransLink quota. A complete provider failure is also held for 45 seconds rather than retried on every public request.

The public interface receives normalized alerts only when they are active and identify a route or stop serving the nearby-stop result. Trip updates and vehicle positions are normalized and cached internally for future deterministic navigation work, but are not dumped into the interface. Static nearby stops continue to work when realtime is unavailable.

`server/transit/accessContext.js` composes approved location facts, optional straight-line user distance, nearby stops and routes, relevant alerts, and source freshness. This is intended to be the factual input to a later AI explanation; the model must not invent transit facts.

## Adding a provider

Add provider metadata and a fixed official feed URL in `server/transit/providers.js`, retain the shared normalized output, add fixtures and mocked tests, and extend the capability status. Credentials belong in server environment variables and must never use a `VITE_` prefix.
