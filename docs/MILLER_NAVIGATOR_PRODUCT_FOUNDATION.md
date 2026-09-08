# Miller Navigator product foundation

Reviewed: 2026-09-08

## Thesis and boundary

Miller Navigator is a frontline professional workflow tool for social workers, nurses, addiction clinicians, counsellors, outreach and shelter workers, discharge planners, community workers, and Indigenous health navigators. Its job is:

> understand → navigate → hand off

A worker describes a practical situation in ordinary language. Miller decomposes the request into explicit practical needs, searches publication-safe verified resources, explains why each result is relevant, presents a bounded access order, and creates a neutral share/print pack. The pilot target is a useful handoff in under 60 seconds.

Miller is not a general consumer directory, clinical decision-support system, EMR, case-management system, or general chatbot. It does not diagnose, decide suitability, determine eligibility, predict beds, retain client records, or expose Miller North/Palantír intelligence.

## Product contract

The versioned mobile response adds four workflow concepts without creating a second database:

- `workflow.needs`: deterministic need decomposition with an explicit basis;
- `workflow.pathway`: up to four access/navigation steps tied to resource IDs and verified access facts;
- `results[].why_shown`: up to three concise reasons, never an internal score;
- `broaden_nearby`: a worker-controlled expansion beyond directly local/serving resources.

Direct service-area eligibility is not “broadening.” A regional intake that explicitly serves Burnaby may appear in a Burnaby search. A different B.C. service that is neither located there nor documented as serving it appears only after `broaden_nearby: true`. Province constraints remain in force.

Suggested resource-pack selection is deterministic and capped at three resources spanning distinct recognized needs where possible. It selects only; it never sends.

## Pathway rules

Pathways describe resource access, not care plans. Permitted inputs include official access/referral notes, regional service scope, and the universal instruction to confirm current intake. For example:

1. start with a documented regional intake when no local facility is verified;
2. contact the leading matching service using its stated access route;
3. review housing, transportation, funding, or legal-navigation options when those needs were explicitly detected.

Miller must not invent clinical ordering, eligibility, availability, or funding approval.

## Handoff and privacy

The pack omits the worker’s original query, client details, ranking data, internal metadata, and research provenance. It may contain only the neutral heading, short next step, selected service details, accurate location/service-area wording, access/referral details, and explicit funding/transport notes. Share Sheet supports Mail, Messages, and other destinations; printing uses a separate readable HTML sheet.

Pilot analytics remain on-device aggregate counts: search count, broadening use, suggested-set use, share count, no-result count, latency, province, and primary intent. The app does not store transcripts or query text. Feedback sends a canonical resource ID and a bounded correction reason, not client information.

## Architecture

```text
SwiftUI app
  → POST /api/mobile/v1/search
  → deterministic Miller practical workflow
  → public-safe Miller mobile projection
  → canonical Miller resource foundation
  → Farm verification

Palantír / Miller North private intelligence ──X──> mobile client
```

The API is public-read-only and rate-limited, requests are capped at 500 characters and 20 results, HTTP bodies are globally capped at 128 KB, responses use `no-store`, and the client uses bounded request/resource timeouts. Release clients contain only the public API URL—not service-role or private credentials.

## Scope deliberately deferred

No patient charts, case notes, PHNs, diagnoses, clinical recommendations, bed prediction, EMR integration, billing, or enterprise administration belong in this MVP.
