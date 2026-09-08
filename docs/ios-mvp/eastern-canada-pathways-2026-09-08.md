# Miller Navigator — Eastern Canada pathway foundation

## Boundary

This pass keeps Miller focused on addiction, mental health, and the practical barriers that affect access and continuity. Healthcare-adjacent resources form a supporting layer, not a general healthcare directory. They are eligible only when a request explicitly describes a connected workflow such as no primary care for OAT, wound or hepatitis support connected to substance use, hospital discharge, or Indigenous patient navigation.

The public mobile contract receives verified Miller resources only. Palantír research records, Miller North evidence, investigations, legal findings, and owner-review metadata are excluded.

## Source strategy and reconciliation

The bounded pass reviewed 68 official or first-party pages/index entries across Ontario, Quebec, New Brunswick, Nova Scotia, Prince Edward Island, and Newfoundland and Labrador. Thirty-two canonical records were produced: 28 new records and four enrichments. Eleven duplicate representations were avoided, nine candidates were deferred for insufficient access detail, and 14 general-health candidates were rejected because no direct Miller workflow connection was established.

Source families used:

- provincial governments and provincial health systems;
- regional health organizations and hospitals;
- Indigenous health and governance organizations;
- official addiction-service providers;
- official income, medical-travel, and community-transport programs.

Stable source-level verification opportunities include Ontario's provincial navigation pages, AccessMHA's regional service index, New Brunswick's provincial addiction and Horizon program pages, Nova Scotia Health's provincial program pages, Health PEI's addiction topic pages, and NL Health Services' navigation and phone-directory pages. These are better listener targets than independent checks against every downstream location.

## Regional model

- Ontario uses a provincial navigator, regional coordinated access, and selected local RAAM or withdrawal/treatment pathways where access materially differs.
- Quebec retains official French names and language metadata. English availability is not inferred. Nunavik and Eeyou Istchee use Indigenous-governed regional pathways.
- New Brunswick preserves the anglophone/francophone provincial entry point and represents Horizon programs as parent programs with official site lists.
- Nova Scotia uses provincial intake plus zone-based withdrawal, OAT, and recovery programs without cloning them into every municipality.
- PEI is modeled primarily as a province-wide pathway, with distinct OAT, withdrawal, extended-care, travel, and patient-navigation functions.
- Newfoundland and Labrador uses one provincial mental-health/addictions navigator plus selected local/regional ODT and Indigenous patient-navigation pathways.

## Healthcare-adjacent yield

Nineteen candidates were evaluated. Six verified records were accepted into the supporting layer, three were deferred, and 14 were rejected because the connection to Miller's frontline workflow was too weak.

Useful seams:

- primary-care or health-system navigation when it blocks addiction follow-up;
- integrated wound, HIV/hepatitis, and addiction medicine;
- Indigenous patient navigation involving travel, discharge, or culturally appropriate access;
- hospital-to-community mental-health/addiction navigation.

Recommendation: keep healthcare-adjacent data as an internal supporting layer and expose it only through explicit workflow relevance. The observed yield does not justify a general healthcare category.

## Search and client behavior

`resource_layer`, `workflow_relevance`, and `languages` are preserved canonically. The mobile API includes those bounded public-safe fields on a returned card. A healthcare-adjacent record is filtered out unless the query explicitly names the linked health need or the record itself directly matches a requested core addiction/mental-health intent.

The deterministic professional workflow now recognizes `hospital_to_community` and supporting needs including primary-care navigation, wound care, infectious-disease navigation, pharmacy access, and perinatal support. These are navigation needs, not diagnoses or clinical recommendations.

## 211 integration note

211 Canada publishes a data-request path and says partner data may be provided by API, map-ready files, or spreadsheets. 211 Ontario separately directs integration requests to `211data@211ontario.ca`. Public website access does not establish commercial reuse rights; some provincial terms are expressly limited. Miller must not scrape or ingest 211 records until scope, commercial use, attribution, update cadence, and redistribution terms are agreed in writing.

## Current measured result

- Shared canonical registry: 309 records.
- Miller mobile projection: 552 records.
- Mobile-ready: 274/552 (49.6%).
- Eastern benchmark: 15/15.
- Healthcare-adjacent benchmark: 5/5.
- National regression: 15/15.
- Western mobile regression: 25/25.
- Northern pathway regression: 10/10.
- Incorrect local-facility claims: 0.

The remaining 278-record mobile-readiness backlog is dominated by legacy source currency, followed by missing verified contact/access data and two duplicate conflicts. The increase to 49.6% came from verified additions/enrichments; the readiness standard was not lowered.

## Scope recommendation

Miller should remain addiction/practical-navigation focused. Healthcare-adjacent capability should remain a limited supporting layer until frontline pilot evidence shows that another health category repeatedly shortens the path from a messy request to a safe, useful handoff.
