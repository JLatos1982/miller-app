# Palantír — Samwise Public Records Intelligence

## Purpose

Palantír is Samwise's private, read-only intelligence capability for discovering, monitoring, reconciling and routing public-record evidence. “Samwise Public Records Intelligence” remains its formal description. The stable capability ID is still `samwise_public_records_intelligence`, so listener memory, run history and downstream references do not break. It is architecturally independent from Miller and Miller North.

The capability matured from listener and evidence-reconciliation work first developed while building Miller North. Miller North did not become Samwise. Samwise now owns the reusable machinery; Miller North and Miller are consumers with separate public purposes and publication gates.

It now supports research that begins with a public topic rather than a preselected project. A bounded request can produce an explainable source plan, remembered work, reviewed cross-domain relationships, continuation or a limited child investigation, actionability, and consumer opportunities without asking the owner to choose a destination first.

## Boundaries

Samwise owns:

- public-source and capability registries;
- listener contracts and adapters;
- document fingerprints and change detection;
- canonical event and entity reconciliation;
- source and evidence roles;
- domain and secondary-domain classification;
- legal citation relationships;
- milestones, yield metrics and owner-review packets;
- the private public-record relationship graph.

Miller North owns its public Indigenous-accountability projection, Incidents, Accountability Watch, Watching, search and publication decisions. Original Miller owns its practical resource finder, guidance, Email Results and resource presentation.

Original Miller never receives investigations, legal findings, policing evidence, coroner material, child-welfare investigations, accountability research, systemic evidence or private review records. Research may reveal a useful service, but only the separately verified canonical service record can enter Miller's resource projection.

## Data flow

```text
PUBLIC SOURCE
  → LISTEN → FETCH → PARSE → NORMALIZE → FINGERPRINT
  → RECONCILE → CLASSIFY → CROSS-DOMAIN ANALYZE
  → VERIFY → CONNECT → ROUTE → MONITOR → REPORT
```

Listeners continue to run through the existing Farm scheduler, locking, backoff, anomaly quarantine and append-only history. No parallel scheduler was introduced. Existing listener IDs remain stable to preserve memory and run history, even where an older ID begins with `mn_`.

## Listener contract

The adapter retains the existing Farm listener contract:

- listener and source-family identity;
- jurisdiction, fetch adapter and parser;
- document and event fingerprints;
- last and next run state;
- checked, changed, duplicate, failure and owner-review counts;
- source-yield metrics;
- `mutation_authority: false`;
- `publication_authority: false`.

The Samwise capability registry selects compatible existing source families and adds capability ownership plus consumer hints. Consumer hints are not publication decisions.

## Intelligence and routing

One canonical finding can have a primary domain, reviewed secondary domains, entities, related events, related accountability chains, resource opportunities and actionability fields. Secondary-domain relationships require an explicit source, reviewed citation or deterministic canonical match; keyword similarity is insufficient.

Available routes are:

- `miller_north_evidence_candidate`;
- `miller_north_watch_candidate`;
- `miller_north_live_candidate`;
- `miller_resource_candidate`;
- `shared_resource_candidate`;
- `owner_intelligence`;
- `future_project_candidate`;
- `research_context_only`;
- `irrelevant`.

All Miller North routes require a consumer review gate. Miller resource routes must independently pass the verified-resource publication guardrail. Samwise never publishes.

## Universal research workflow

The first-class `research_public_records` workflow accepts only bounded typed parameters:

- topic;
- jurisdiction and date range;
- one or more controlled domains;
- known organization or entity;
- a known person or pseudonym where appropriate;
- a known case or citation;
- depth and recent/historical mode;
- a hard document cap.

The source selector ranks only registered sources. It explains each selection using jurisdiction, domain, topic, citation and operational-adapter reasons, chooses no more than eight sources, and never accepts an arbitrary URL, SQL statement, shell command or unrestricted crawl instruction. For every proposed source, the supervised plan records why it was selected, expected document roles, its budget, whether listener data already exists, prior research, estimated cost and the registered adapter. A plan is not an execution or publication instruction.

### Supervised planning and execution

Research-plan states are `draft`, `approved`, `running`, `paused`, `completed`, `cancelled`, `failed` and `owner_review`. Only the owner can move a draft plan to approved. The executor will not run a draft, and no plan grants publication or mutation authority.

An approved plan runs one source at a time. After every source Palantír atomically records:

- the source state and attempt count;
- documents checked and their fingerprints;
- index-only versus full-document review;
- useful findings and reviewed cross-domain discoveries;
- errors, cost and stopping reason.

A resumed execution skips completed sources and known fingerprints. Cancellation preserves completed checkpoints and findings while preventing future source work. Missing adapters, worker unavailability and time or cost ceilings pause safely; radical source changes are quarantined for owner review. The depth caps remain 12 documents for `single`, 50 for `bounded` and 100 for `standard`; branches remain capped at depth two and 50 documents.

Research memory retains the request ID, bounded plan, sources actually checked, document fingerprints, reviewed findings, secondary relevance, stop reason, cost and milestone state. `continue_research` reuses this memory, excludes previously seen document fingerprints, and records why a productive source may be revisited. It does not restart the search blindly.

A reviewed finding may start a child investigation, but branches are parent-linked, limited to two levels and capped at 50 documents. Valid stopping reasons include exhausted sources, a document or depth limit, no material novelty, a pending milestone, source unavailability or an owner stop.

## Universal secondary relevance

Every useful finding receives a secondary-relevance review across the controlled domains. An edge requires an explicit source, reviewed citation or deterministic canonical match. Keyword similarity alone cannot create a relationship.

The research origin does not constrain routing. A benefits investigation may also be relevant to housing and healthcare; a workplace-safety conviction may also be legal and government-service intelligence. This is represented as one canonical finding with reviewed relationships, not duplicate events.

## Institutional knowledge map

The versioned institutional registry currently recognizes ministries, public programs, oversight offices, regulators, police and corrections bodies, health authorities and Indigenous organizations through exact normalized aliases. It records jurisdiction where known. Fuzzy similarity remains an owner-review suggestion.

Institution histories are factual timelines of source-traceable findings and reviewed graph relationships. Samwise does not generate reputational scores. Organization, document, event, investigation, recommendation, response, implementation and program-administrator relationships can be projected without automatically merging events.

## Independent proof domains

Public-benefits and administrative-service accountability is the first independent domain. The second proof lane is workplace-safety enforcement. It uses the same request, source-selection, normalization, secondary-relevance, memory and routing pipeline for WorkSafeBC investigation findings, Alberta OHS convictions, Saskatchewan prosecution outcomes and federal Labour Program penalties.

Cycle 2 ran both proof lanes through the supervised executor. A third small proof used Canadian Transportation Agency accessibility/compliance reporting to test a transportation-regulator index and annual aggregate report. These tests use the same planner, source checkpoint, fingerprint, cross-domain and review-packet machinery. They did not require a consumer-specific parser.

Neither proof lane created a public Miller or Miller North record. Their current output is private owner intelligence, resource opportunities where separately verified, and future-project candidates.

### Workplace health and safety proof domain

The workplace-safety lane now separates provincial investigation, enforcement, compensation-appeal and human-rights-adjacent source roles. Registered sources include WorkSafeBC investigation and penalty surfaces, B.C. WCAT, Alberta OHS conviction and prosecution outcomes, the Alberta Workers' Compensation Appeals Commission, Saskatchewan OHS prosecution outcomes, Saskatchewan WCB appeal-publication material, and provincial human-rights sources used only for bounded discrimination intersections.

Each reviewed record carries separate Indigenous-relevance and discrimination states. An explicitly named Indigenous institution is not evidence that an affected worker is Indigenous, and an OHS violation is not evidence of racism. Human-rights merits findings, procedural referrals and mediated resolutions remain distinct. Only explicit Indigenous person/group evidence combined with material public-institution conduct can create a private Miller North candidate, and that candidate still has no publication authority. Workplace investigations never route to public Miller.

The current three-province comparison is retained as an occasional research domain rather than a permanent scheduled listener family. Formal safety findings were productive, but Indigenous-specific Miller North yield was sparse and comparable longitudinal cycles are not yet sufficient to justify recurring scheduling. Continuation should focus on bounded WCAT/appeal decisions and later enforcement or corrective-action evidence rather than bulk collection.

## Operational learning ledger

Palantír keeps a private operational-learning ledger. This is not model training. Lessons may describe source access behavior, document shape, date conventions, recommendation numbering, false positives, aliases, pagination, stopping rules, document roles and access blockers.

A source-specific lesson may guide a later continuation. A shared rule may be promoted only when at least two unambiguous examples support it, an explicit regression test passes and the change is reviewed. The first promoted rules preserve distinct enforcement rows that share a page URL, distinguish current indexes from annual outcome reports, and require GET/repeated-failure evidence before a URL-health failure becomes a closure candidate.

## Public funding intelligence

Funding/program records have a separate structured model for administrator, purpose, eligibility, jurisdiction, amount, deadline, application path, status, source and last verification. Changes to eligibility, deadline, application path, status or source are material review events. Even an active official-source record remains a resource candidate; it is never automatically published.

## Event and evidence graph

The first implementation is a deterministic JSON/relational projection, not a graph database. Supported nodes include sources, documents, events, organizations, public institutions, pseudonymized people, recommendations, legal decisions, investigations, resources and accountability chains.

Reviewed edges include same-event, investigation, corroboration, contradiction, judicial review, recommendation/response, implementation evidence, domain overlaps, related resources and legal pathways. Ambiguous same-event suggestions never merge automatically.

## Entity resolution

Entity resolution uses a versioned exact-alias registry. For example, `VPD` resolves to Vancouver Police Department, while Vancouver Police Board remains a distinct institution. Fuzzy suggestions remain owner-review candidates. Entity matching never establishes a person's Indigenous identity.

## Workers and models

Samwise coordinates source access, validation, reconciliation, routing and owner reporting. Igor may perform bounded index diffing, parsing, citation normalization, deterministic entity matching, URL checks, duplicate-document analysis and manifest validation.

Igor cannot determine discrimination, racism, legal liability, Indigenous identity, publication eligibility or final event merges. Qwen remains disabled for recurring public-record classification; model seams remain available only for a future bounded task that passes a reviewed benchmark.

## Conversational and owner-review interface

The private Farm/Supabase layer may expose counts, listener state, domain activity, bounded titles, canonical IDs, milestones and review states. It must not expose credentials, raw scraped bodies or unnecessary sensitive narratives.

The typed `research_public_records`, `approve_research_plan`, `continue_research`, `pause_research` and `cancel_research` requests accept only the stable Palantír capability target and bounded identifiers/parameters. The private interface can retrieve these requests separately from runnable scheduled jobs, so the normal Farm scheduler cannot mistake research prose for a listener ID. Review states are pending, approved, rejected, needs more research, deferred or false positive; a decided state is preserved across listener refreshes.

The coordinator converts a new typed request into a draft plan and persists it without execution. A separate valid approval request may start that exact plan through registered adapters. Pause and cancel requests are bound to the canonical plan ID; cancellation retains completed checkpoints. This owner workflow is a library boundary used by the private coordinator, not a generic command endpoint.

Owner questions can cover activity, non-Miller findings, cross-domain discoveries, running/paused/completed plans, checkpoint progress, operational lessons, institution history, new funding, resource opportunities and effects on existing Miller North chains. Status projections expose counts, canonical IDs and bounded labels rather than private narratives.

## Security and publication

- owner-private metadata only by default;
- RLS remains the Supabase enforcement boundary;
- no anonymous public access;
- no mutation authority;
- no publication authority;
- no autonomous legal conclusions;
- no raw sensitive narratives in status summaries;
- consumer publication decisions remain separate and auditable.

The existing private Supabase tables remain the transport boundary. No new public table, anonymous policy or remote-command surface is required for this phase. The server-side publisher uses the existing owner-scoped status, review and request records; research requests are fetched only through their typed capability target. No credentials, source bodies or medical narratives belong in the interaction layer.

## Independence and extraction readiness

Palantír has no runtime ownership dependency on either Miller consumer. Consumer-specific routing lives behind explicit adapters and can be omitted in independent tests. The capability still depends operationally on the shared Farm scheduler and private Supabase request/status transport; Igor is optional and a failed Igor validation pauses rather than transferring authority.

The capability remains in the shared repository because it reuses that operating scheduler, listener state, worker transport and owner interface. Its schemas, source catalog, supervised executor, checkpoint store, research memory, institutional map, learning ledger, funding model, consumer adapters and tests are independent modules. Adding the transportation proof source required a registry entry, not new engine code. A later service/repository extraction is feasible, but premature while scheduling and private owner transport remain shared operational dependencies.
