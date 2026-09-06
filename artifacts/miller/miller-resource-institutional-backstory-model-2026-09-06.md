# Miller Resource Institutional-Backstory Model

Date: 2026-09-06
Status: private read-only projection

## Model

A resource backstory is a projection, not a new canonical resource record.

```text
resource identity
  ├─ operated_by ── organization
  ├─ funded_by ── public funding observation
  ├─ created/expanded_by ── policy instrument or commitment
  ├─ governed/regulated_by ── law, policy, or standard
  ├─ implementation evidence ── opening/current service/utilization source
  └─ evaluated/audited_by ── later report
```

Each edge must retain its own evidence. Funding, operation, and outcomes are separate observations.

## Private projection shape

- `resource_identity`: curated ID, canonical ID, candidate ID, and match state.
- `client_projection`: name, operator, location, public contact, eligibility, intake, and conservative access status.
- `research_projection`: policy/commitment IDs, responsible organizations, service-change type, public funding fields, and authoritative timeline.
- `accountability_projection`: promise, verification status, implementation depth, last evidence date, conflicts, and review gate.

`buildResourceBackstoryProjection` constructs this shape for the 12 operationally verified service links. It never marks a resource public and rejects an approved-for-publication input in this private proof of concept.

## Funding observation

Funding belongs on an observation/relationship, not on the resource itself. A program may have multiple funders, periods, recipients, and capital/operating components. The public amount should remain null when the source does not disaggregate it.

## First Nations governance

The projection must support distinct `funded_by`, `governed_by`, `operated_by`, and `associated_with_provincial_service_system` links. FNHA participation, federal/provincial funding, Nation-led governance, and an operator relationship must not be collapsed into one provincial-program label.

## Public-view rule

No institutional backstory is public by default. A future client view should receive only current access facts after normal Miller publication review. Research and accountability projections remain separately gated.
