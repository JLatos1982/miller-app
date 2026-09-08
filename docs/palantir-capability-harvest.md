# Palantír capability harvest

Palantír — Samwise Public Records Intelligence — owns reusable public-record intelligence. Miller North and original Miller are consumers. Neither public product owns these primitives or can bypass its own publication gate.

## Migration map

| Capability | Previous home | Classification before harvest | Palantír disposition |
|---|---|---|---|
| Listener lifecycle, locks, backoff, memory | Farm listener framework | Partially generic | Adapted as the Palantír listener primitive; existing scheduler and listener IDs remain authoritative |
| Supervised research plan and memory | Samwise | Already generic | Reused without migration |
| Event reconciliation | Farm/Miller North | Reusable but listener-oriented | Promoted to canonical event identity with exact-document matching and owner review for ambiguous merges |
| Evidence and legal roles | Miller North legal corpus | Reusable | Promoted to deterministic evidence-role semantics |
| Recommendation ledgers | Child/youth, corrections, fatality responses | Miller North-specific but reusable | Promoted with many responders, independent implementation evidence, outcomes and unresolved gaps |
| `farmRecommendationLedger` v1 rows | Farm | Superseded for new Palantír writes | Retained as a read-compatible legacy format; an adapter migrates rows without rewriting source artifacts |
| Watching and documentary milestones | Miller North Watching | Miller North-specific but reusable | Promoted to generic milestone intelligence and milestone-aware schedule advice |
| Coverage matrices | Miller North research reports | Partially generic | Promoted with explicit gap causes instead of treating every blank cell as absent evidence |
| Cross-lane relevance | Samwise/Farm | Already generic | Retained as reviewed secondary relevance |
| Institutional aliases/history | Samwise | Already generic | Reused |
| Owner review | Farm private interface | Partially generic | Promoted with durable decisions and an append-preserving audit record |
| Resource discovery | Shared resource pipeline | Partially generic | Promoted as an opportunity only; verified resource records still pass consumer gates |
| Change detection | Watch/resource ledgers | Scattered | Promoted with material, non-material, uncertain and owner-review classes |
| Claim and provenance tracking | Legal, audit, ombuds, recommendation and accountability records | Scattered inside domain records | Promoted to addressable claims, source locators, reviewed claim relationships, temporal status and consumer-safe routing |
| `farmEvidenceGraph` | Farm | Partially generic / compatibility | Existing artifacts remain valid; new Palantír relationships use the Samwise graph primitive |
| Miller North coverage and Watch presentation | Miller North | Product-specific | Remains downstream; only its structural gap and milestone lessons were harvested |
| Original Miller coverage hypotheses and guidance | Original Miller | Product-specific | Remains downstream and is not imported by Palantír |
| Source yield | Farm | Already generic | Reused; transparent counts only |
| Igor tasks | Worker v1 | Already generic | Reused; no mutation or publication authority |
| Conversational status/control | Private Farm/Supabase | Already generic | Extended with Palantír primitive summaries |
| Miller/Miller North presentation | Public products | Product-specific | Remains downstream |
| Public publication decisions | Public products/owner gate | Product-specific | Remains downstream |

## Primitive flow

```text
registered source → listener → document fingerprint → event identity
                                             ↓
evidence role → recommendation chain → milestone/watch → coverage matrix
             ↘ claim + provenance → reviewed claim relationship → claim timeline
                                             ↓
cross-domain relevance → institution map → owner review → consumer candidate
```

The listener adapter uses the existing Farm scheduler. There is no second timer or run-history store.

## Structural rules harvested from Miller North

- A document is not an incident. Several documents may strengthen one canonical event.
- Allegations, procedural rulings, merits findings, responses, implementation evidence and outcomes are different evidence roles.
- A response is not implementation. Acceptance is not completion. A policy announcement is not a measured outcome.
- Multiple responders can answer one recommendation without duplicating the recommendation.
- A future public document becomes a private watch candidate; vague timing requires review and does not create a schedule automatically.
- An empty coverage cell can mean evidence scarcity, missing source coverage, acquisition failure, incomplete coding, or an unreviewed backlog.
- Secondary relevance requires explicit source support, a reviewed citation, or a deterministic canonical match.
- Owner review decisions survive refresh and continuation.
- Research may reveal a practical service, but the research record never becomes a public Miller resource.
- An institution's implementation claim is not independent implementation evidence. Later claims qualify, contradict or supersede earlier claims without deleting them.

## Boundaries

Palantír primitives are read-only and have neither mutation nor publication authority. Igor may perform bounded deterministic normalization, index diffing, alias comparison, URL checks, fingerprint validation and manifest validation. Qwen remains optional and disabled for recurring work.

Miller North continues to own Indigenous accountability presentation, Incidents, Accountability Watch, Watching, public search and publication decisions. Original Miller continues to own practical resource presentation, guidance and Email Results. Consumer adapters are isolated from the primitive modules.
