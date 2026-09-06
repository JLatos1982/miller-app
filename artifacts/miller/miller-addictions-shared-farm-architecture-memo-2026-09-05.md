# Shared Farm research architecture memo

## Recommendation

Keep the new database tables Miller-specific for now, but standardize a small set of Farm research primitives in code and documentation. This is less disruptive than moving two validated domains into shared polymorphic tables before their workflows have stabilized.

## Reusable primitives

- stable candidate identifiers and deterministic fingerprints
- source records with source role, publication date, organization and evidence class
- typed formal instruments with binding/current status
- specific commitments with responsible organizations, expected dates and implementation status
- temporal links such as amends, supersedes, responds to, implements and evaluates
- implementation evidence that distinguishes policy adoption, operationalization, service availability, utilization and outcome
- owner-review and publication gates
- candidate entity/resource links with explicit match state
- recurrence/repeat signals that do not imply causation

The reusable workflow is:

`event/system condition → accountability or recommendation → commitment → policy/legal response → implementation evidence → service/outcome evidence → later signal`

## What should remain relational

The current data is well served by tables plus constrained junctions. A graph database is not justified. Graph-like traversal can be provided by query/view helpers after relationship types stabilize. Relational integrity, RLS, explicit foreign keys and review gates are more valuable now than graph infrastructure.

## Bounded discovery loop

A deterministic queue can safely generate the next research question:

- new coroner report → extract recommendation candidates
- new recommendation → seek recipient response
- new commitment → seek later implementation evidence
- new funding announcement → seek named opening/capacity evidence
- named service → compare with Miller resource candidates
- new rule → seek predecessor/successor
- new outcome report → link to relevant chains without inferring causation

Every transition should record the initiating object, query family, time window, source domains, stop condition and owner-review state. It should not crawl without a bounded work item.

## Deterministic vs model-assisted work

Deterministic processing works well for URLs, dates, jurisdictions, exact type vocabularies, stable IDs, duplicate fingerprints, supersession links explicitly named in official text, numeric capacity and publication gates.

A local 3B model could suggest coarse document type, topic tags and candidate organization names. A local 7B model could compare recommendation wording, summarize conflicts and propose likely service matches. Neither should assign binding status, causal effectiveness or final implementation status without rule-based checks and owner review.

Tavily would add value for broad discovery and changed-page retrieval when ordinary search misses archived implementation reports. Cloud research adds most value for difficult multi-document legal histories and conflicting evidence. This benchmark needed neither; authoritative sources were discoverable at $0 external cost.

## Migration path

1. Operate Miller and Miller North domain tables independently through owner review.
2. Extract a shared TypeScript/JavaScript vocabulary package once both lanes have real reviewed records.
3. Add shared read-only views only after field equivalence is proven.
4. Consider shared base tables only in a future versioned migration with explicit domain partitions and rollback tests.

The main risk of early generalization is semantic dilution: an Indigenous healthcare accountability action and an addictions funding/service commitment can share infrastructure while meaning different things editorially.
