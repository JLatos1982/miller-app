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

## Getting there and routing boundary

The current official TransLink developer offering documents static GTFS and GTFS-Realtime feeds, while BC Transit publishes open static and realtime GTFS feeds. Neither currently documents a developer origin-to-destination itinerary endpoint that Miller is authorized to call. Their consumer trip planners are not treated as undocumented APIs.

Miller therefore stops at deterministic access context: approved destination, optional ephemeral origin, straight-line origin distance, nearby destination stops and routes, and relevant alerts. Complete transit directions use the documented cross-platform Google Maps directions URL with `travelmode=transit`. No Google credential is required. Miller does not claim that nearby routes form a complete journey.

Browser geolocation is requested only after the user chooses it. Typed origins use the existing server-side BC Address Geocoder. Origins are held only in the open navigation component and request body, use no analytics, receive `private, no-store` responses, and are never written to Supabase or browser storage.

## Search intent, location privacy, and web discovery

Natural-language search produces a strict, server-validated intent packet. Explicit statements, normalized search concepts, and uncertain concepts remain separate. A named substance may normalize to a broader search topic, but Miller does not turn that into a diagnosis or a fact about risk, withdrawal, housing, or treatment needs. Invalid model output falls back to conservative deterministic extraction and ordinary search.

Textual place phrases may be resolved through the existing server-side BC Address Geocoder. Community-only searches remain community scoped; ambiguous landmarks are not assigned arbitrary coordinates. Resolved origins are returned only to the active client, held in transient state, omitted from analytics and storage, and reused by Get there only during that page session. Search ranking remains service-relevance based. Distance and transit availability are separate deterministic access context, not an opaque combined score.

Tavily remains an unverified discovery aid. It may later help identify changed public information or missing resource details, but its output must pass administrator review and Miller's evidence workflow before becoming a trusted resource fact. It is not a source of location, hours, transit, or clinical truth for the navigation packet.

## Adding a provider

Add provider metadata and a fixed official feed URL in `server/transit/providers.js`, retain the shared normalized output, add fixtures and mocked tests, and extend the capability status. Credentials belong in server environment variables and must never use a `VITE_` prefix.
