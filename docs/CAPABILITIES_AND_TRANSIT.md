# Miller capabilities and transit context

Miller keeps external integrations behind its Express server. The protected administrator dashboard exposes configuration states, never credential values.

## Transit providers

- BC Transit: a Central Fraser Valley pilot uses the official static GTFS operator feed. The provider also publishes GTFS-realtime alerts, trip updates, and positions; alert decoding is the next bounded increment.
- TransLink: the official weekly static GTFS feed is configured. Current GTFS-realtime URLs are represented server-side but remain `not_configured` unless `TRANSLINK_GTFS_REALTIME_API_KEY` is present. Deprecated RTTI is not used.
- 211 British Columbia: placeholder pending authorized API access. Miller does not scrape or infer an API.
- Pathways BC: future-provider placeholder; no integration is claimed.

The public endpoint accepts only a Miller location UUID. It rechecks that the location is fixed, public, verified, and approved before loading transit data. Feed URLs are code-owned HTTPS URLs on an allowlist, with redirects disabled, response/extraction size bounds, timeouts, and an in-memory cache. Client output describes nearby stops and straight-line distance only; it is not a trip plan.

## Adding a provider

Add provider metadata and a fixed official feed URL in `server/transit/providers.js`, retain the shared normalized output, add fixtures and mocked tests, and extend the capability status. Credentials belong in server environment variables and must never use a `VITE_` prefix.
