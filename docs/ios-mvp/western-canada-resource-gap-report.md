# Western Canada regional data-readiness review — 2026-09-08

This report covers the public practical-resource projection consumed by Miller
and its mobile API. It excludes Miller North evidence, Palantír intelligence,
owner-review records, and unpublished legal or investigative material.

The audit is reproducible with the mobile benchmark and Western community
coverage functions in `server/millerMobileBenchmark.js`.

## Current projections

The shared canonical registry contains 185 verified public resources: 88 in
British Columbia, 38 in Alberta, 43 in Saskatchewan, and 16 Canada-wide. Its
consumer projections contain 147 Miller resources and 78 Miller North Supports
& Funding resources; 40 canonical records are legitimately shared.

The combined mobile search projection contains 465 unique practical records:

| Geography | Records |
|---|---:|
| British Columbia | 390 |
| Alberta | 28 |
| Saskatchewan | 35 |
| Canada-wide | 12 |

Counts describe records, not live intake capacity or proof that every community
has a physical facility.

## Mobile readiness

`mobile_ready` remains conservative: stable ID, current public source, verified
contact path, clear geography or service scope, sufficient access information,
and no unresolved deterministic duplicate conflict are all required.

The prior baseline was 95 of 446 records (21.3%). After this pass, 150 of 465
records qualify (32.3%). Correcting 38 explicit province gaps in the public
support source materially improved readiness; the remaining dominant blocker is
stale or missing current-source verification on 315 legacy records. Missing
contact paths affect 37, insufficient access detail affects four, and two have
unresolved duplicate conflicts.

## Regional pathway batch

Twenty-five official-source records were reconciled: 20 new canonical records
and five enrichments of stable identities. The batch spans 10 B.C., five Alberta,
and 10 Saskatchewan records. Twenty-three route to Miller only; two verified
Indigenous-focused services share one canonical record with Miller North
Supports & Funding.

The 22 unique source pages are from Fraser Health, HealthLink BC and health
authorities, FNHA, B.C. Housing, AHS/Recovery Alberta, Saskatchewan Health
Authority and government, and provincial 211 services. A bounded live URL check
returned HTTP 200 for all 22 on 2026-09-08.

## Local, regional, and provincial meaning

The canonical scope now keeps these facts separate:

* physical location;
* local service area;
* regional service area;
* province-wide availability;
* virtual delivery; and
* navigation-only status.

The shared registry currently has 32 records with an explicit physical location,
15 with a local service area, 12 with a regional service area, six province-wide,
23 virtual, and 11 navigation-only. These dimensions can overlap.

The bounded community inventory covers 140 communities: 66 B.C., 42 Alberta,
and 32 Saskatchewan. At current coding, 29 have at least one physical local
resource, eight have a substantive regional service relationship, and 103 rely
on province-wide or regional navigation in this dataset. “Navigation only” is a
coverage description, not proof that no local service exists.

## Burnaby withdrawal pathway

Miller no longer describes Creekside as a Burnaby detox facility. Fraser Health
places Creekside Withdrawal Management Centre at 13740 94A Avenue in Surrey.
The Fraser Health Access Line is the regional intake/navigation path, and
Creekside serves the Fraser region through that pathway. For a Burnaby detox
query the API reports zero verified physical Burnaby withdrawal facilities in
Miller's current data, labels Creekside “Located in Surrey · serves Burnaby,” and
labels the Access Line “Regional intake serving Burnaby.”

## Frontline query benchmark

The benchmark now contains 25 scenarios: the original 13 workflows plus Yorkton,
La Ronge, Swift Current, Bonnyville, High River, Canmore, Port Hardy, Terrace,
Cranbrook, Prince George, rural transportation, and northern Saskatchewan
Indigenous treatment support.

All 25 pass current relevance, province, contact/access, shareability, and
geography thresholds. There are zero incorrect local-facility claims. On this
workstation the in-process average is 73 ms, p95 is 101 ms, and the average
payload is approximately 16.2 KB; these are not network timings.

## Meaningful improvements

The new regional pathways improve truthful discovery for:

* Fraser communities, with separate Fraser Access and Surrey Creekside roles;
* Vancouver Island communities through Island Health's MHSU Service Link;
* 17 Interior/Okanagan/Kootenay communities through Access Central;
* Terrace and nearby northern communities;
* 41 Alberta communities through Recovery Alberta central intake, with local
  High River, Canmore, and Bonnyville records where official pages support them;
* Yorkton, La Ronge, Swift Current, and Buffalo Narrows through physical SHA
  withdrawal, OAT, or community-service records; and
* province-wide 211 and Saskatchewan mental-health/withdrawal navigation.

The Prince George Homeless Prevention Program outreach listing adds a practical
housing pathway, and FNHA medical transportation plus a Kwakiutl District
Council mental-health/substance-use service are shared where Indigenous-specific
visibility is supported.

## Remaining regional priorities

The next five highest-value gaps are regional, not simply the largest cities:

1. **North Vancouver Island:** verify Port Hardy/Port McNeill withdrawal and
   medical-travel pathways beyond general Island Health navigation.
2. **North Coast:** deepen Prince Rupert/Haida Gwaii withdrawal, housing, and
   transportation pathways while retaining Terrace as a distinct physical hub.
3. **Northwest Saskatchewan:** verify La Loche/Île-à-la-Crosse treatment access,
   travel, and local intake rather than treating northern-region labels as town
   locations.
4. **Northwest Alberta:** add source-specific High Level/Peace River withdrawal,
   OAT, housing, and travel pathways beyond central intake.
5. **Northeast B.C.:** verify Dawson Creek/Fort St. John withdrawal, recovery
   housing, and medical-transport pathways.

Further work should favour access and transport enrichment of high-use regional
records over shallow duplication. No investigation or accountability record was
added to Miller through this work.
