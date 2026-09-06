# Shared Research-Object Recommendation

Date: 2026-09-06

## Recommendation

Use a shared object envelope and evidence-edge interface, not shared production tables.

### Shared envelope

| Field | Purpose |
|---|---|
| `object_id` | Stable domain-qualified identifier |
| `research_domain` | Prevent Miller/Miller North leakage |
| `object_type` | Source, organization, actor, event, instrument, action, commitment, funding, evidence, or resource reference |
| `title` / `neutral_summary` | Bounded factual representation |
| `jurisdiction` / dates | Temporal and jurisdiction context |
| `evidence_classification` / `confidence` | Claim-quality metadata |
| `owner_review_flag` / reason | Human-review gate |
| `publication_state` | Explicit private/public boundary |
| `provenance` | Research run, source, normalization version, and no-import marker |

### Shared evidence edge

| Field | Purpose |
|---|---|
| source and target IDs/types | Typed relationship endpoints |
| relationship type | Evidence-backed semantic link |
| source references | Evidence for this link, not only the endpoint objects |
| effective/evidence date | Time at which the relationship or claim is supported |
| confidence and ambiguity | Conservative interpretation |
| owner/publication gates | Prevent automatic promotion |

## Shared primitives now justified

- source-family registry and discovery metadata;
- legal/government relationship vocabulary;
- evidence-edge validation;
- implementation-depth vocabulary;
- cross-chain finding candidates;
- significance ranking for owner attention;
- owner-summary and research-brief generation;
- read-only multi-view projections.

## Remain Miller-specific

Service modality, eligibility, intake, hours, location, virtual-service semantics, bed/site capacity, resource identity, and resource publication workflow.

## Remain Miller North-specific

Indigenous healthcare harm taxonomy, incident/cohort identity, anonymity controls, nation/community context, racism/discrimination findings, and accountability-action semantics.

## Later shared-layer trigger

A shared database layer should be reconsidered only when two domains need live cross-domain queries, have stable compatible ID semantics, and can enforce domain isolation and publication gating through tested RLS. Until then, adapters avoid migration risk and schema coupling.
