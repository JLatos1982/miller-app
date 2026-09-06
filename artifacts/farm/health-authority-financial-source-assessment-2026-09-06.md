# Health-Authority Financial Source Assessment

## Finding

Health-authority financial portals are reliable for audited entity-level revenue, expense categories, capital contributions, restricted/deferred funding and public supplier schedules. They are usually insufficient for allocating a ministry program envelope to one addiction service.

## Sources tested

| Source | What it can establish | What it generally cannot establish |
|---|---|---|
| Fraser Health financial reporting | Audited statements, vendor payments, compensation, fiscal-year provenance | Creekside- or RAAC-specific operating allocation without a note or funding letter |
| Vancouver Coastal Health financial accountability | Ministry contributions, MHSU category spending, supplier schedules | Access Central/Oak Care share of Road to Recovery funding |
| Island Health financial reports | Ministry funding, designated-use rules, audited statements and SOFI | Inlet or New Roads funding unless separately named |
| PHSA budget and financials | Consolidated and program-category spending; supplier schedules | Red Fish or a prescribed-alternatives project share without program note/contract |
| FNHA audits and evaluations | Audited financial position, restricted program balances, treatment-network evaluation | Centre-level allocation unless project reporting provides it |

Examples of useful context include VCH's reported mental-health and substance-use expense category and PHSA's analogous category. These are entity/program-area facts and must not be represented as spending on a selected Miller service.

## Recommended data practice

Store audited-statement facts as later financial context with `attribution_scope: organization` or `program_area`. Only promote to `service_level_funding_confirmed` when a note, contract, grant disclosure or recipient report names the service and amount.

## Registry change

Added `fogs_bc_health_authority_financials`. FNHA's registered document classes now explicitly include audited financial statements.
