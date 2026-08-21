# Miller evidence and orchestration architecture

Status: local observe-only checkpoint. None of the automation modes described here are production-enabled.

## Human-review audit and risk

Miller currently asks an administrator to review AI resource reports, duplicate candidates, discovery candidates, address evidence, geocoding/location candidates, location QC samples, curated-list imports, PDF publication, and final location/list publication. Much of the location burden comes from separating an accurate parcel coordinate from proof that the specific program actually operates there.

Field risk is contextual and field-level:

| Risk | Examples | Default handling |
| --- | --- | --- |
| Low | public phone, canonical website, operator, municipality, postal code, licensed geocoder coordinates | May auto-accept with fresh authoritative evidence and no conflict |
| Medium | address/occupancy, hours, cost, accessibility | Corroborate; monitor or review depending on consequence and conflict |
| High | eligibility, referral/walk-in requirements, immediate availability, clinical suitability, confidential locations | Human review; private locations are rejected from mapping |

Publication, confidential/sensitive locations, clinical interpretation, contradictory trusted facts, uncertain program occupancy, heterogeneous bulk decisions, and high-risk access requirements remain human decisions.

## Evidence engine

`server/intelligence/evidenceEngine.js` evaluates one claim about one field. It retains the subject, proposed and existing values, bounded source records, extraction method, retrieval time, authority, independence, agreement, risk, decision, and reason codes. Unknown remains unknown. An LLM extraction is untrusted evidence and can never independently authorize acceptance.

```text
retrieved source records
        ↓ normalize as untrusted data
field-specific authority + freshness + independence
        ↓ compare values and existing trusted fact
auto_accept | accept_with_monitoring | human_review | reject | unknown
        ↓
append-only proposal or exception queue (never silent mutation)
```

Authority is field-specific. A human override is strongest local knowledge. Official provider/health/government sources are strong for program facts. An authorized structured provider can be strong within its licensed fields. BC Geocoder is authoritative for coordinate resolution, municipality and postal geography, but not program occupancy. Established directories corroborate. Existing approved Miller records are trusted state. Tavily and snippets are discovery evidence. Model extraction is only a parsing aid.

## Location automation

`locationAutomation.js` consumes the existing v1.2.1 evidence policy rather than weakening it. `auto_validatable` requires Tier A, supported program occupancy, an exact licensed BC result, public/fixed/client-facing status, stable identity, and no conflicts. `needs_review` includes missing program evidence, parent offices, shared occupancy ambiguity, unresolved units and conflicts. `do_not_map` includes invalid geography and private/non-fixed locations.

An eventual automated action must append the original candidate, full geocoder response, policy version/fingerprint, evidence, rule, timestamp, actor `miller_automation`, previous state, and rollback value before any state transition. This checkpoint produces recommendations only.

## Multi-source orchestration

`orchestration.js` creates an explicit bounded provider plan. Ordinary search starts with Miller. It adds geocoding only for an explicit specific place, transit only for a selected mapped candidate when transit matters, and Tavily only for discovery/current verification. Provider failure falls back to trusted Miller data. There is no all-provider fan-out.

External text is data, never instructions. Provider adapters must enforce HTTPS allowlists or the existing SSRF-safe fetch path, size/time limits, schemas, caching, rate limits, and provenance. Prompt injection contained in retrieved content has no tool authority.

## Active evidence research and shadow observation

`server/intelligence/research.js` plans at most two queries and two opened pages per occupancy claim, with duplicate suppression and a twenty-second per-claim budget. It searches for the program/address and program/municipality, prefers first-party or institutional sources, stops after sufficient authoritative evidence or conflict, and treats the BC Geocoder only as address-normalization corroboration. Opened documents pass the existing DNS/IP SSRF controls, redirects and bodies are bounded, and hostile instructions are retained only as ignored security signals. Exact program-name and street-number co-occurrence is required; a generic operator office page does not prove occupancy.

Shadow observations never mutate trusted facts or publication state. The protected local admin prototype separates `Miller needs your review` from `Handled by Miller`. Decision controls remain disabled while the production ledger and evidence migration are unverified. The in-memory decision model demonstrates optimistic concurrency, append-only events, rollback and agreement measurement for tests; it is not represented as durable production storage.

## Provider-neutral candidates and entity resolution

`resourceCandidates.js` represents source identity, canonical candidate identity, program/operator, categories, location, contacts, access fields, evidence, freshness and trust without pretending unavailable fields exist. Entity resolution returns `definite_match`, `probable_match`, `uncertain`, or `distinct`. A definite match needs confirmed alias ownership or program identity plus two strong identity signals. A shared operator or website never merges different programs. Source records remain attached after linking.

## Barrier model and search

`barriers.js` models every access requirement independently with value/unknown, evidence, confidence and freshness. Explicit search constraints currently recognize no ID, no phone, walk-in need, wheelchair use and inability to pay. Compatibility is `known_compatible`, `known_incompatible`, or `unknown`; unknown never excludes a service. Facts require evidence and are not inferred by OpenAI.

## Continuity graph

`continuity.js` returns optional related support categories, not providers or clinical prescriptions. Its language is neutral: “People looking for this may also find these kinds of support useful.” The graph is a navigation aid, not a treatment pathway.

## Change detection and staleness

`maintenance.js` compares a proposed field value with trusted state through the evidence engine. Unchanged, changed and source-disappearance states remain distinct. Every proposed change includes old/new values, evidence, reasons and rollback value. Conflicts preserve the trusted value and enter review.

Recheck intervals are field-specific: hours and phone age faster than address/coordinates/operator identity. A missing source is urgent, but does not prove closure. Web checks must be scheduled, cached and bounded—never an uncontrolled crawler.

## Miller needs your review

`buildExceptionQueue` is the backend prototype for an exception-only administrator queue. Each item includes current/proposed values, evidence on both sides, risk, confidence, reason codes and four fast actions: Approve suggestion, Keep existing, Reject, Mark unknown. Routine `auto_accept` and monitoring cases are excluded. A UI should be added only alongside durable append-only storage, authorization, optimistic concurrency, rollback and a kill switch.

The local protected UI now provides exception and handled/audit views. One-click buttons are deliberately disabled until the migration is safely applied and the service-only decision function exists; this prevents a development prototype from implying that a durable decision was saved.

## Automation metrics and modes

Metrics count claims/candidates and decisions without user-search or location data. The principal rate is low-risk routine claims handled by `auto_accept` or monitoring. Location automation is reported separately so weak evidence cannot be hidden in an aggregate.

- Mode A — Observe only: implemented locally and recommended now.
- Mode B — Auto-accept enumerated low-risk facts: logic tested; needs durable audit/rollback, job controls and production observation first.
- Mode C — Auto-validate routine public locations: logic tested; needs the same controls plus a production shadow run.
- Mode D — Automated maintenance: design only; not ready.
- Human-only: safety-sensitive, clinical, confidential, ambiguous, conflicting and high-risk claims.

## 211 and Pathways readiness

211 BC remains `pending_access`; Pathways remains `pending_authorized_access`. No scraping or API guessing is permitted. An adapter needs verified authentication, endpoints, search semantics, identifiers, taxonomy, pagination, geography, update timestamps, attribution, rates, licensing, retention/storage restrictions, deletion/correction expectations and allowed caching. Pathways additionally needs explicit authorized machine-access and reuse terms. Each adapter should emit the provider-neutral candidate and evidence schemas without bypassing decision policy.

## Security and failure boundaries

Core intelligence and decision modules perform no network or database I/O. The explicit pilot runner delegates opened pages to Miller's SSRF-safe, redirect-limited and body-limited server fetch utility. URLs are HTTPS-only where retained; values are bounded; no HTML is rendered; no external text is executed; no credentials enter client code. Future persistence must use parameterized Supabase operations and service-only append functions with RLS, immutable audit triggers, optimistic concurrency, rollback, and an automation kill switch. A Tavily, geocoder, transit, OpenAI, 211 or Pathways outage cannot mutate or erase trusted knowledge.

## Miller Watch

`server/intelligence/watch.js` is the disabled scheduling foundation for future maintenance. It orders facts by source disappearance, field volatility, age, prior conflict and stable identity; assigns per-claim research budgets; limits concurrency; requires audit; and preserves trusted facts on provider failure. It has no timer, recurring job or automated write path. The global kill switch blocks fact, location, resource-publication and maintenance writes while leaving observe-only evidence gathering available.
