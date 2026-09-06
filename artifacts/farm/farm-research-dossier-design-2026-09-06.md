# Research Dossier / Evidence Case Design

## Decision

Use a read-only assembled projection, not a new shared production table. `farm-research-dossier-v1` references stable Miller or Miller North object IDs and retains each domain’s records, publication gates and subject semantics underneath.

This is the least disruptive design because the dossier is a deliverable and validation boundary, not a new source of truth. If editing, collaboration or high-volume dossier persistence later becomes necessary, the same contract can become a private materialized object without changing its evidence semantics.

## Contract

Every dossier contains:

- a stable private dossier ID and canonical-fixture ID;
- domain identity and existing subject identifiers;
- an owner synthesis capped at five findings and five uncertainties;
- source-backed timeline events;
- organizations, policy/law/governance, accountability, funding, service implementation and follow-up sections;
- a bounded evidence graph whose nodes reference domain objects;
- explicit policy-context, funding-attribution and implementation-state scopes;
- bounded knowledge gaps and draft-only information-request concepts;
- an owner significance decision and a research-completeness assessment;
- zero-production-mutation and zero-publication-mutation assertions.

## Scope preservation

The projection keeps three independent scope dimensions:

| Dimension | Values used by the dossier |
|---|---|
| Policy/legal context | `directly_applicable`, `response_context`, `governance_context`, `territorial_context_only` |
| Funding attribution | `program_level`, `recipient_level`, `project_level`, `service_level`, `not_applicable` |
| Implementation | `announced`, `funded`, `operational`, `partially_implemented`, `implemented`, `reporting_unclear` |

These dimensions cannot substitute for each other. Funding does not prove operation; operation does not prove effectiveness; territorial context does not prove a treaty or legal conclusion.

## Evidence graph rule

Every material edge must identify:

- source and target object IDs;
- a controlled relationship type;
- one or more dossier source IDs;
- a neutral summary;
- confidence;
- a date when applicable;
- an applicable funding, context or implementation scope.

The validator rejects source-free edges, unknown source families, duplicate edge IDs, public scope and non-zero mutation assertions.

## Completeness assessment

The score measures research completeness only. Its eight two-point dimensions are identity, primary-source coverage, timeline, policy/legal coverage, funding traceability, implementation evidence, follow-up evidence and unresolved-question burden. Bands are `strong`, `moderate` and `incomplete`.

It is not an evidence-quality verdict, moral score, effectiveness assessment, compliance assessment or reputational ranking. A dossier can be strong because it clearly documents uncertainty.

## Assembly workflow

1. Select a subject and canonical fixture.
2. Assemble known domain records without copying them into a shared subject database.
3. Identify missing dimensions.
4. Use authoritative sources for bounded follow-up only when needed.
5. Validate every evidence edge and timeline source.
6. Extract bounded gaps and safe information-request concepts.
7. calculate research completeness and owner significance.
8. Generate a concise owner report and a private research brief.
9. Require owner review before any downstream publication decision.

## Deterministic and model-assisted split

Deterministic now: schema validation, privacy checks, source-family checks, ID uniqueness, evidence-edge validation, timeline extraction, scope validation, completeness scoring and deliverable rendering.

Potential local 3B assistance later: document classification, organization extraction and draft topic labels. Potential local 7B assistance later: ambiguous relationship comparison, competing implementation evidence and draft gap generation. Both require deterministic output validation and owner review; neither was invoked in this pass.

## Migration and UI decision

No migration is warranted. No admin UI was added because the generated private owner reports already exercise summary, timeline, evidence path, funding, policy/law, unresolved-question and source views without adding an unwired maintenance surface.
