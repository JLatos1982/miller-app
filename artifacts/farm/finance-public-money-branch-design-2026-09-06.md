# Finance / Public Money Research Branch — Bounded Design

## Purpose

Trace public money from an authoritative decision or disclosure to a recipient and, where evidence permits, to an operating service or program. The branch is public-record research, not accounting, audit, fraud detection or value-for-money analysis.

## Recommended shared object

Use a private `funding_record` adapter with stable ID, domain, jurisdiction, authority/ministry, program, recipient and type, dates/fiscal year, numeric amount/currency, funding and capital/operating classifications, recurrence, purpose, geography, attribution scope, linked commitment/policy/service/organization IDs, implementation state, trace level, confidence, review gate and evidence edges.

Keep domain records separate. Do not add a shared writable table yet.

## Trace levels

`program_level_funding_confirmed`, `recipient_level_funding_confirmed`, `service_level_funding_confirmed`, `operational_result_confirmed`, `amount_not_service_attributable`, `announced_not_verified`, `partial_trace`, `unclear`, and `owner_review_required`.

These are traceability states, not judgments about the amount or program.

## Deterministic capabilities

- currency and amount normalization;
- fiscal-year and date validation;
- funding/recipient classification;
- duplicate announcement detection;
- edge/source enforcement;
- program-versus-service attribution safeguards;
- private/publication gates;
- transparent significance scoring.

## Model-assisted opportunities

- A local 3B model may help classify financial documents, recipients and funding types after deterministic extraction.
- A local 7B model may help compare amended agreements, ambiguous program-to-service matches and audit summaries.
- All ambiguous attribution remains owner-gated; neither model should create dollar allocations.

No local model was invoked in this pass because the 16-record sample was small and deterministic extraction was sufficient.

## Tavily opportunity

Potentially useful for historical announcements, buried implementation updates and procurement-award discovery after official-site queries fail. It was not invoked because authoritative sources were adequate and no paid search was necessary.

## Maturity

Amount/recipient normalization and evidence-edge validation are working. Service attribution is working with limits. Amendment reconciliation, contract-to-expenditure comparison and systematic audit follow-up remain prototypes.
