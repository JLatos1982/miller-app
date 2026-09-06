# Recurring Organization and Actor Map

Date: 2026-09-05
Method: deterministic normalization of issuers, source organizations, originating organizations, responsible organizations, and service links

This is descriptive institutional mapping, not a reputational ranking.

| Organization family | Chains | Instruments | Commitments | Recommendation-recipient occurrences | Service links | Observed roles |
|---|---:|---:|---:|---:|---:|---|
| B.C. government / health ministries | 15 | 38 | 26 | 23 | 12 | issuer, funder, recipient, responder, implementer |
| Regional health authorities | 7 | 1 | 13 | 13 | 6 | recipient, operator, implementation reporter |
| Health Canada / Government of Canada | 5 | 15 | 6 | 6 | 0 | legislator, exemption authority, funder, strategy issuer, evaluator |
| BC Coroners Service | 5 | 5 | 7 | 0 | 0 | systemic reviewer, recommendation issuer, outcome reporter |
| Office of the Provincial Health Officer | 5 | 9 | 2 | 0 | 0 | emergency authority, recommender, reviewer, progress reporter |
| Fraser Health | 3 | 5 | 0 | 0 | 5 | operator, regional implementer, service publisher |
| Vancouver Coastal Health | 2 | 2 | 1 | 1 | 2 | operator, regional implementer, service directory |
| British Columbia Centre on Substance Use | 2 | 1 | 1 | 1 | 0 | clinical guideline issuer, training partner |
| Office of the Auditor General of B.C. | 2 | 2 | 2 | 0 | 0 | public auditor, implementation assessor |

Counts are normalized occurrences, not legal responsibility findings. “Regional health authorities” is a class named in source commitments; named authorities are retained separately when an operational source identifies them.

## Other high-value actors within one chain

First Nations Health Authority, local First Nations governments, Northern First Nations Alliance, Canadian Mental Health Association B.C. Division, Northern Health, Island Health, Providence Health Care, and professional colleges are highly material even when their activity clusters within one chain. Chain count alone would understate their importance.

## Architectural implication

Future shared actor mapping should store role-by-chain rather than one global role. The same body can issue a rule, receive a recommendation, fund a program, and publish implementation evidence at different times. Alias normalization should remain deterministic and reviewable.
