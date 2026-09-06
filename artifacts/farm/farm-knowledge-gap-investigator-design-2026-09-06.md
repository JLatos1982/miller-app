# Farm Knowledge-Gap Investigator — Bounded Design

## Workflow

`dossier → unresolved question → significance rank → bounded plan → authoritative-source search → evidence-edge validation → versioned knowledge update → remaining gaps → owner synthesis`

## Deterministic steps

- Validate private scope, immutable lineage, exact record cardinality and source references.
- Generate queries from recommendation number, subject, responsible organization and named mechanism.
- Normalize dates, statuses, evidence depth and organization names.
- Reject completion statuses without operational, institutional-creation or policy-adoption evidence.
- Record the stop reason and preserve old dossier artifacts.

## Model-assisted opportunities

- A local 3B model could triage recommendation topics, organizations and document classes after deterministic extraction.
- A local 7B model could compare ambiguous program/recommendation matches or conflicting implementation descriptions, always returning review candidates rather than final statuses.
- Neither is required for this fixture; no local model was invoked.

## Owner-review gates

Owner review is mandatory for conflicting source numbering, broad multi-part recommendations, legal-effect or effectiveness claims, ambiguous organization responsibility, institution-to-system extrapolation and any publication decision.

## Stopping rules

Stop when authoritative evidence answers the bounded question, likely official sources are exhausted, the remaining gap appears non-public, the question becomes a narrow information-request candidate, or successive queries yield only duplicate/low-value material. Each unresolved recommendation carries its stop reason.

## Cost controls

Use the private source registry first, search by named mechanism second, cap recommendation-specific query families, deduplicate documents, reuse a shared baseline report and avoid paid discovery unless an important official source remains inaccessible. Tavily and local/cloud auxiliary models were not used; measurable external API cost was $0.
