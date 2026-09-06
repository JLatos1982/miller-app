# Farm Reusable-Capability Memo

Date: 2026-09-05
Scope: bounded architecture analysis; no Farm-wide refactor

## Recommendation

Keep the current Miller tables domain-specific for now. Generalize two artifact-level primitives first, after a second domain confirms stable semantics:

1. **Cross-chain pattern candidate** — a review-gated observation linking two or more evidence chains, a normalized pattern type, source references, confidence, and ambiguity notes.
2. **Commitment-to-real-world verification observation** — a dated comparison among the promised change, implementation evidence, operational entity identity, match result, implementation depth, and review state.

These are reusable without forcing Miller and Miller North into one subject dataset.

## Capability A: cross-chain synthesis

### Deterministic steps

- Normalize organization aliases.
- Count actors, roles, topics, statuses, and source families by chain.
- Calculate intervals from explicit dates.
- Detect exact source/recommendation references and repeated normalized phrases.
- Produce candidate clusters and thresholded review signals.

### Model-assisted opportunities

- A local 3B model could suggest topic tags, organization aliases, and recommendation similarity.
- A local 7B model could compare materially different recommendation wording and implementation evidence.
- Model output must remain a candidate with cited source spans; it should not set implementation or effectiveness status autonomously.

### Risks

Alias over-merging, thematic similarity mistaken for repetition, duplicated aggregate totals, and role collapse are the primary false-positive risks. Owner review is required when the mechanism, responsible body, or scope changes.

## Capability B: commitment-to-real-world verification

### Generic flow

> commitment → expected quantity/geography/date → operational source → entity match → current status → later utilization/evaluation

This can support treatment services, housing projects, infrastructure, environmental remediation, and government programs.

### Smallest shared shape

- domain and chain IDs
- commitment ID
- expected change (quantity, unit, geography, date)
- verification status
- implementation-depth array
- operational entity candidate
- source evidence with roles
- entity-match outcome
- last-evidenced date
- conflict and owner-review fields

No shared production table is yet justified. The private JSON schema and validator are a safer proof point.

## Discovery loop

The bounded advisory loop should be:

> new recommendation → search response → search implementation → search named operational entity → compare registry → search later utilization/evaluation

Every step should have a query budget, source-priority rule, stop condition, and owner-review output. Uncontrolled crawling is not recommended.

## Local models and Tavily

No local model or Tavily call was used. Deterministic processing handled dates, enums, actor counts, and exact Miller identity matches. A 7B review may help with the three ambiguous repeated-recommendation comparisons and difficult service aliases. Tavily may add value for historical operator pages, post-announcement follow-up, and hard-to-index northern service confirmation, but it was not necessary for the current high-confidence matches.

## What remains Miller-specific

Treatment modality, bed/site/unit semantics, eligibility, referral route, virtual-service behavior, health-region geography, and resource publication rules should remain Miller-specific. Indigenous healthcare racism findings and Miller North incident/cohort semantics remain Miller North-specific.
