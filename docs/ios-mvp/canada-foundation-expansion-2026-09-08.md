# Miller Canada foundation expansion — 2026-09-08

## Purpose and boundary

This pass extends Miller's verified practical-resource foundation beyond British Columbia, Alberta and Saskatchewan without presenting Miller Navigator as a complete national directory. It adds practical access, treatment, navigation and travel pathways only. Investigations, legal findings, accountability evidence, Palantír owner intelligence and Miller North evidence remain excluded from Miller and the mobile API.

The operational rule remains: discover through bounded public-source research, verify against a current first-party or official page, reconcile once in the shared canonical registry, and project only to an approved consumer.

## Research scope

Twenty-one distinct official or first-party pages supported 25 canonical resources across Manitoba, Ontario, Quebec, New Brunswick, Nova Scotia, Prince Edward Island, Newfoundland and Labrador, Yukon, Northwest Territories and Nunavut. The source families were:

- provincial or territorial health-system intake and service pages;
- provincial or territorial medical-travel programs;
- official addiction and mental-health service finders;
- Indigenous-governed treatment providers;
- government program and community-health-centre contact material.

No 211 bulk data was copied or ingested. Three already-canonical Canada-wide programs—NIHB medical transportation, Hope for Wellness and the First Nations/Inuit treatment directory—were reconciled as duplicates and not re-added. Two candidates were deferred: 211 data pending licensed access, and an expired Nunavut Client Travel policy that could not safely support a current record.

## Canonical outcomes

- 25 genuinely new canonical practical resources
- 9 existing high-use legacy Miller resources enriched from current first-party pages
- 3 national duplicates avoided
- 2 candidates deferred
- 2 Indigenous-specific resources routed to both Miller and Miller North Supports & Funding
- 0 investigations, legal findings or private research records routed to Miller

The second legacy verification batch refreshed current source, contact, scope or intake details for Last Door, Carrier Sekani's Substance Use Recovery Program, Archway Abbotsford Addictions Centre, Hope and Area Transition Society, Langley Community Services, Charlford House, Dixon Transition House, Wenda's Place and Talitha Koum. North Wind Wellness Centre remains deferred from mobile-ready status because two legacy IDs still represent the same current service.

## Coverage maturity

| Geography | Maturity | Rationale |
| --- | --- | --- |
| British Columbia | deep | Broad resource base, tested regional pathways and substantial local/service-area detail; legacy verification remains incomplete. |
| Alberta | developing | Strong provincial and major regional pathways, but rural housing, transportation and local access detail remain uneven. |
| Saskatchewan | developing | Useful provincial and northern pathway modeling, with remaining local OAT, counselling, transport and housing gaps. |
| Manitoba | foundation | Provincial intake, two RAAM hubs and northern patient travel establish an initial pathway, not full regional coverage. |
| Ontario | foundation | Provincial navigation, northern travel and Indigenous treatment navigation provide a representative base, not comprehensive city coverage. |
| Quebec | foundation | Province-wide bilingual addiction referral, Info-Social and a Nunavik Indigenous treatment pathway form a bounded base. English service availability is not inferred. |
| New Brunswick | foundation | Provincial addiction navigation plus one documented withdrawal location. |
| Nova Scotia | foundation | Provincial intake and the multi-location Recovery Support Centre program. |
| Prince Edward Island | foundation | Provincial intake and the provincial withdrawal facility. |
| Newfoundland and Labrador | foundation | HealthLine, provincial withdrawal and medical-travel pathways. |
| Yukon | exploratory | Territorial navigation and the Whitehorse withdrawal pathway only. |
| Northwest Territories | exploratory | Community counselling contacts and medical-travel navigation only. |
| Nunavut | exploratory | Community health-centre and regional medical-travel pathways only. |

Coverage maturity is returned by the mobile API. Foundation and exploratory regions receive explicit text saying Miller is showing the verified options currently available; the response does not imply completeness.

## Geography and parent/location modeling

The mobile contract now recognizes every province and territory and preserves:

- physical location;
- local and regional service areas;
- province-wide scope;
- Canada-wide scope;
- virtual delivery;
- navigation-only status.

Multi-location systems are represented as a parent program when access and contact are genuinely shared. Distinct locations are separate only when local intake or facility facts materially differ. For example, Nova Scotia Recovery Support Centres remain one parent program with an official location list, while the New Brunswick Moncton withdrawal site is distinct from the provincial navigation record.

## Rural, remote and transportation findings

The strongest early remote-access pathways are Manitoba's Northern Patient Transportation Program, Ontario's Northern Health Travel Grant, Newfoundland and Labrador's MTAP, Northwest Territories Medical Travel and Nunavut's regional medical-travel coordination. These records state the administering body and application or referral route while avoiding any promise of eligibility or coverage.

Nunavut community health-centre access and Northwest Territories community counselling are navigation records, not claims that identical treatment is physically present in every community. Isuarsivik retains Kuujjuaq as its physical location while documenting the broader eligible beneficiary pathway stated by the provider.

## Benchmark and data scale

The generated mobile catalogue has 507 publication-safe resources. Of those, 226 are mobile-ready (44.6%), up from 192 of 482 (39.8%). Twenty-five of the readiness gains came from newly verified national resources and nine came from enrichment; the remaining catalogue still has 281 records without a sufficiently current public source, 37 without a verified contact path, four with insufficient access information and two unresolved duplicate conflicts.

The national benchmark passes 13 of 15 representative queries with zero incorrect local-facility claims. The two weak rows are Nunavut mental-health/addiction access and northern Ontario Indigenous treatment support because fewer than half of the returned parent/navigation records have a single phone number. Both still return official websites and access paths; inventing a universal number would be worse than retaining the explicit limitation.

Measured in the generated benchmark, average in-process search latency is about 92 ms, p95 is about 119 ms and the average JSON response is about 17.5 KB. The production build remains the meaningful bundle check. At this scale, the versioned JSON registry and in-memory search remain appropriate; there is no measured reason to introduce a second database or search service.

## Verification strategy

National expansion increases review workload more than runtime cost. Prefer source-level monitoring rather than one job per service:

- milestone/change-based checks for stable government benefit and travel pages;
- quarterly checks for provincial intake and service-finder pages;
- more frequent checks only for known volatile intake, closure or location pages;
- ranked legacy enrichment based on search frequency, frontline importance and lack of alternatives.

No new recurring listeners should be enabled until source-level change yield is measured. Palantír resource-discovery outcomes for this pass are: accepted 25, enriched 9, duplicate 3, deferred 2, inaccessible 0, plus one legacy duplicate deferred.

## Highest-value next coverage areas

1. Northern Manitoba beyond Thompson: withdrawal, OAT and travel handoffs for The Pas, Flin Flon and remote communities.
2. Northwestern Ontario: Thunder Bay-to-remote-community treatment, housing and Indigenous medical-travel sequencing.
3. Labrador and western Newfoundland: local intake, withdrawal handoff and travel details outside St. John's.
4. Nunavut regional access: current region-specific mental-health/addiction contacts that do not imply identical local service capacity.
5. Rural Atlantic housing after treatment: verified transition/recovery housing and transport pathways outside Halifax and Moncton.
