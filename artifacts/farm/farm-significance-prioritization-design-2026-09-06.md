# Farm Significance and Prioritization Design

Date: 2026-09-06
Purpose: decide what the owner should inspect first

## Finding categories

`major_new_connection`, `verified_service_implementation`, `repeated_recommendation`, `prolonged_partial_implementation`, `new_resource_candidate`, `legal_or_policy_change`, `funding_to_service_match`, `implementation_gap`, `important_new_source`, and `architecture_learning`.

## Deterministic score

The proof-of-concept score is capped at 100 and records every contributing factor:

| Factor | Maximum points |
|---|---:|
| Official primary source | 20 |
| Independent sources | 10 |
| Multiple linked chains | 12 |
| Repeated recommendation | 12 |
| Prolonged partial implementation | 12 |
| Real-world service impact | 12 |
| New resource discovery | 10 |
| Legal/regulatory significance | 8 |
| Geographic reach | 10 |
| Owner-review attention | 6 |

Bands are `review_first` (70+), `review_next` (45–69), and `reference` (below 45).

## Interpretation safeguards

This is not an evidence-quality, effectiveness, compliance, blame, performance, or reputation score. It ranks review value. Uncertainty can increase review priority while decreasing claim confidence; those concepts remain separate.

## Human review

Owner review remains mandatory for causal claims, legal interpretation, conflicting sources, unresolved identity, governance ambiguity, and claims that a policy was ineffective. The scorer never publishes, changes an implementation status, or resolves an entity match.

## Model assistance

A local 3B model could suggest topics and organization aliases. A local 7B model could propose ambiguous evidence comparisons. Neither should assign the final score inputs without cited spans and deterministic validation.
