# Farm Reusable Legal/Government Capabilities

Date: 2026-09-06

| Capability | Reusable? | Deterministic core | Model-assisted opportunity | Owner review | Cost profile |
|---|---|---|---|---|---|
| Legal/government source discovery | Yes | Registry routing, jurisdiction/type filters, query budgets, URL dedupe | Query expansion and document triage | Unfamiliar or conflicting authority | $0 for direct official sources; paid search only for recovery |
| Commitment tracking | Yes | IDs, owners, dates, status enums, source roles | Group similar wording | Scope/status ambiguity | $0 |
| Funding-to-service verification | Yes | Amount/quantity fields, evidence stages, exact entity signals | Ambiguous program/service comparison | Always for unresolved identity or allocation | Usually $0; paid search may recover hard pages |
| Supersession/amendment tracking | Yes | Explicit citations, dates, predecessor/successor links | Compare materially changed text | Legal effect and implicit repeal | $0 |
| Research-run owner synthesis | Yes | Required sections, counts, ranked structured findings | Draft neutral prose from validated inputs | Final selection and tone | Local model optional |
| Deliverable generation | Yes | Templates, provenance, citations, artifact validation | Condensation | Shareability/publication decision | $0 |
| Significance prioritization | Yes | Transparent factor score and bands | Candidate factor suggestion | High-impact/uncertain items | $0 |

## Strongest reusable primitive

The strongest primitive is an evidence-bearing relationship observation: two typed objects, a normalized relationship, the exact sources supporting that link, dates, confidence, uncertainty, and review/publication gates. This supports legal change, commitment implementation, funding-to-service verification, and future domains without requiring graph infrastructure.

## Relational versus graph

Keep relational domain tables and link tables. Graph-like traversal belongs in read-only adapters and projections for now. A graph database would add operational complexity without solving the harder problem: whether each edge is actually supported.

## Discovery loop

Use bounded advisory transitions: new rule → predecessor/successor; recommendation → response; commitment → implementation; funding → named service; service → current operator page; implementation claim → utilization/evaluation. Each transition needs a query budget and stop reason.

## Local models and paid search

No local model or paid search was invoked. A 3B model may help classify instruments and extract organizations/funding fields; a 7B model may help compare supersession or ambiguous commitment/service evidence. Tavily is most defensible for historical source recovery or hard-to-index operator confirmation after direct official-source searches fail.
