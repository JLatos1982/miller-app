# Western Canada Miller iOS MVP architecture

## Purpose and boundary

The MVP helps a frontline worker move from a generic need to a privacy-safe resource pack in under one minute. It provides practical navigation, not clinical decision support. Original Miller owns the public resource experience. Palantír and the Farm remain private maintenance systems and have no client-facing endpoint in the app.

```text
iPhone / iPad SwiftUI app
  -> POST /api/mobile/v1/search
  -> deterministic Miller mobile search projection
  -> Miller practical-intelligence guidance
  -> canonical public Miller resource registry
  <- compact verified resource cards

Farm listeners / Palantír
  -> verify and propose resource changes through existing gates
  -> canonical registry only after approval
```

Healthcare-adjacent records are held in a bounded supporting layer. The mobile API returns one only when explicit query language or a core addiction/mental-health intent establishes a direct workflow relationship. This prevents the Navigator from drifting into a general healthcare directory while supporting hospital discharge, primary-care access, Indigenous patient navigation, and integrated wound or infectious-disease care where material.

## Reused Miller assets

- Canonical legacy resource rows and stable resource IDs.
- Practical Supports and Funding & Assistance projections.
- Shared verified resource registry with explicit `miller` visibility.
- Deterministic 12-intent practical-intelligence and next-step templates.
- Public Miller projection guardrail, concise descriptions, and existing resource-correction intake.
- Native sharing replaces a bespoke mobile mail service in v1; canonical IDs preserve compatibility with Email Results later.

## Client modules

- `HomeView`: typed input, Canadian English speech recognition, province override, and demo prompts.
- `ResultsView`: concise Miller guidance, verified resource cards, calls/web links, multi-select.
- `ResourceDetailView`: contacts, access, eligibility/funding notes, source verification, bounded feedback.
- `ResourcePackView`: privacy-safe preview, Mail/Messages/iOS share sheet, and printable HTML.
- `PilotMetrics`: local aggregate searches, result latency, no-result count, and share count. It never records query text.

## MVP operating choices

- Online-first. No resource database is bundled with the app.
- Public-safe, read-only, rate-limited search needs no privileged client credential.
- Feedback reuses the existing bounded resource-submission workflow and contains only a canonical resource ID and enum reason.
- iOS 17 minimum, universal iPhone/iPad target, Canadian English speech recognition.
- No account, billing, EMR integration, case management, clinical recommendation, or App Store submission in v1.

## Offline decision

An offline cache is deferred. A later pilot may cache a signed, time-bounded public resource projection if poor connectivity materially blocks real use. That cache should carry a generation date, expire conservatively, and never include requests or client data.
