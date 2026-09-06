# Multi-View Miller Architecture

Date: 2026-09-06
Status: private architecture decision; no production migration

## Decision

Keep Miller and Miller North domain tables separate and add shared, read-only adapters above them. This is option A: domain-specific tables with shared interfaces.

The domains now demonstrate enough common semantics to share normalization, evidence-edge validation, source-family discovery, significance prioritization, and deliverable generation. They do not yet demonstrate that incident/cohort identity, resource publication, Indigenous governance, or addictions-service fields can safely share physical tables.

## Connected object flow

```text
official source ──supports──> instrument/action/commitment
                                  │
                                  ├── changes/supersedes ──> instrument
                                  ├── implementation evidence ──> observed state
                                  └── evidenced relationship ──> service/resource
                                                                       │
                                            ┌──────────────────────────┼────────────────────────┐
                                            │                          │                        │
                                      client projection          research projection     accountability projection
                                      access facts only          policy/backstory         promise/follow-through
```

Each edge carries its own source references. A source proving an announcement does not automatically prove operation; a current service page does not automatically prove the service resulted from a particular funding commitment.

## Projection contract

### Client projection

Only facts required to obtain help: service name, operator, location, contact, eligibility, intake, and a conservative access-status marker. It excludes policy analysis, implementation disputes, and owner-review notes.

### Research projection

Instrument and commitment IDs, responsible organizations, public funding fields, service-change type, and an authoritative source timeline.

### Accountability projection

The original claim, verification state, implementation depth, last-evidenced date, conflicts, uncertainty, and owner-review gate.

The projections are computed views. They do not copy records into three databases.

## Current proof of concept

`server/farmResearchViews.js` builds all three projections from the 12 operationally verified Miller service relationships. It also builds evidence-bearing policy-to-resource paths. The component `src/admin/FarmResearchOwnerPreview.jsx` is a bounded private preview contract and is not wired into the public site.

## Migration path

1. Keep current Miller and Miller North schemas intact.
2. Stabilize shared JavaScript contracts against another research run.
3. Add private API serializers only when an admin workflow needs live data.
4. Consider a shared schema only after stable IDs, tenant/domain isolation, and domain-specific extensions are proven.
5. Never expose a shared view through the Data API without explicit grants, RLS, and publication-gate tests.

## Risks and controls

| Risk | Control |
|---|---|
| Domain leakage | Required `research_domain`; adapters never coerce Miller North incidents into Miller resources |
| Public leakage | `private_admin_only` projection scope and rejection of approved/public payloads in this proof of concept |
| Evidence flattening | Source role and source URL retained per edge |
| Stale service facts | `last_evidenced_date` and current-service source role |
| First Nations governance collapse | Separate funder, governance, operator, and service relationships |
| Premature shared schema | No migration in this pass |

## Recommended next move

Use the adapter against one owner-reviewed resource candidate and one Miller North policy chain in a local admin workflow. Only then decide whether a private shared persistence layer is warranted.
