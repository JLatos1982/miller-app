# Farm Cross-Domain Operational Learning

## Decision

Keep Miller and Miller North domain tables separate. Continue with shared read-only adapters for sources, evidence edges, privacy checks, significance ranking and deliverable generation. The pilot does not justify a shared writable schema refactor.

## What generalized cleanly

- A source-backed edge contract worked for policy → service and law/governance → accountability.
- `responds_to`, `implements`, `governed_by`, `evaluated_by`, `created_by` and `linked_to_commitment` retained stable meanings.
- Source roles prevented an announcement from proving later operation and prevented an incident source from proving a later legal stage.
- Owner-review and publication-state gates behaved identically across domains.
- The significance score successfully elevated a well-supported implementation/reporting tension over raw document volume.

## What remains domain-specific

- Miller needs client access, eligibility, location, capacity and virtual-service concepts.
- Miller North needs incident/cohort relationships, anonymity rules, Indigenous governance and carefully bounded treaty context.
- Funding-to-service matching is central to Miller; harm/accountability and jurisdictional context are central to Miller North.

## Source reuse

B.C. ministry, legislation, health-authority and federal open-government families generalized well. Professional regulators, human-rights bodies and First Nations-governance sources were especially important to Miller North. Facility directories and health-authority implementation notices were most productive for Miller.

## Ranking assessment

Working with limits. All 12 findings were placed into the four intended bands. The score is transparent and deterministic, but closely scored review-next items still need human ordering because legal novelty, service urgency and Indigenous governance significance are not commensurable. The score must remain review priority only.

## Human review

Owner review remained essential for program-versus-resource funding scope, prospective versus enacted law, advice versus binding standards, treaty versus governance context, anonymized human-rights material, service identity reconciliation and qualified operational claims.

## Next reusable step

Add a small shared `claim_state` vocabulary—`announced`, `enacted`, `administratively_created`, `operational`, `utilization_documented`, `outcome_evaluated`—to the read-only adapter. This is a non-schema recommendation until tested on a wider sample.
