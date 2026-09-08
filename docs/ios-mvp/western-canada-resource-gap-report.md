# Western Canada mobile data-readiness review — 2026-09-08

This report describes the public practical-resource projection consumed by the
Miller mobile API. It does not include Miller North evidence, Farm intelligence,
owner-review records, or unpublished legal/investigative material.

The audit is reproducible with:

```sh
node scripts/audit-miller-mobile-readiness.mjs
```

## Current mobile projection

The projection contains 431 unique practical records:

| Geography | Records | Share |
|---|---:|---:|
| British Columbia | 380 | 88.2% |
| Alberta | 21 | 4.9% |
| Saskatchewan | 21 | 4.9% |
| Canada-wide | 9 | 2.1% |

Counts describe records, not live intake capacity or regional completeness.
The app continues to direct users to the service for current availability and
eligibility.

## Mobile-ready definition and count

`mobile_ready` is derived, not manually asserted. A record qualifies only when
it has:

* a stable canonical ID;
* a current, publicly traceable official/first-party source;
* a verified phone or website;
* a clear location or service area;
* sufficient access/referral information; and
* no unresolved duplicate conflict.

Seventy-six records (17.6%) currently qualify. The largest blocker is old or
missing verification metadata (318 records), followed by unclear geography or
contact fields (37 each). This intentionally conservative flag is suitable for
pilot triage; records that do not qualify may still be legitimate public Miller
resources.

## Bounded verified expansion

Twenty-five source records now live in the Western mobile expansion registry.
Fourteen were added in this data-readiness pass, alongside deeper verification
of four high-use B.C. records already in the main dataset.

The additions cover:

* Burnaby community substance-use services;
* Calgary adult addiction intake, Access Mental Health, and Renfrew withdrawal
  management;
* Edmonton Access 24/7, opioid-dependency care, and medical detox;
* Alberta recovery housing;
* Saskatoon opioid-agonist treatment and family support;
* Saskatchewan treatment discovery/navigation;
* Victoria rapid-access addiction medicine and community medical detox; and
* the Canada-wide First Nations and Inuit treatment-program directory.

All expansion sources are official government, health-system, or first-party
provider pages. The verification audit checks 29 expansion/high-use URLs: 27
respond directly, two VCH pages restrict automated clients, and none is treated
as a confirmed dead source. A restricted response never becomes a closure claim.

## Frontline query benchmark

The benchmark covers the twelve requested workflows. Eight pass every current
threshold. Every scenario returns a relevant top result, 100% website coverage,
100% access-note coverage, 100% shareability, and correct province/Canada-wide
scoping.

| Query | Top result | Status | Remaining weakness |
|---|---|---|---|
| Detox in Surrey | Creekside Withdrawal Management Centre | Pass | — |
| Detox in Burnaby | Access Central – Detox Referral Line | Weak | No program physically coded in Burnaby; appropriate regional intake fallback is shown |
| Housing after treatment in Vancouver | RainCity Housing First ACT Team | Weak | Fewer than half of returned records have a phone, though all have official links/access notes |
| OAT in Edmonton | Opioid Dependency Program – Edmonton | Pass | — |
| Counselling in Calgary | Access Mental Health – Calgary | Pass | — |
| Mental health and housing in Saskatoon | STC Emergency Wellness Centre | Pass | — |
| Funding for treatment | B.C. treatment transportation supplement | Weak | Funding records are primarily web/application based, so phone coverage is below 50% |
| Transportation to treatment | B.C. treatment transportation supplement | Weak | Transportation records are primarily web/application based, so phone coverage is below 50% |
| Indigenous-specific treatment support | ISC treatment-program directory | Pass | — |
| Legal help with housing | Indigenous Community Legal Workers | Pass | — |
| Recovery housing | Oxford House Recovery Housing – Alberta | Pass | — |
| Family support after treatment | ISC treatment-program directory | Pass | — |

In-process measurements on this workstation average 66 ms per search, with an
84 ms p95 and a 12.7 KB average JSON payload. These timings measure the search,
guidance, readiness, and serialization pipeline; they are not network latency.

## Coverage gaps

The strongest prototype paths are Alberta/Saskatchewan navigation and the newly
verified city-specific entries. The catalogue remains B.C.-heavy, while much of
the older B.C. data lacks recent source/access metadata and therefore cannot yet
receive the conservative mobile-ready flag.

Highest-priority workflow gaps:

1. **Burnaby withdrawal management:** verify whether a program-level local option
   exists; until then retain the clearly labelled regional Access Central path.
2. **Calgary and Edmonton:** add verified legal/tenancy, treatment transportation,
   funding, and family/youth entries. Calgary also lacks a coded OAT entry.
3. **Regina and Prince Albert:** add official withdrawal, outpatient/OAT,
   counselling, legal-navigation, funding, and transport services.
4. **Vancouver/Surrey legacy records:** refresh source, contact, service-area, and
   access metadata for high-ranking records rather than indiscriminately adding
   more records.
5. **Recovery and re-entry:** only four Western records are coded for
   corrections/re-entry, and B.C.'s one record is not yet mobile-ready.
6. **Rural/remote:** service-area, referral, medical-travel, and funding metadata
   remain inconsistent in all three provinces.

## No-result and share-pack behaviour

When an exact local query has no safe match, the API keeps the requested province,
labels the response as broadened, and offers a bounded verified provincial or
Canada-wide navigation path. It never fabricates a local service or silently
crosses provinces.

Three representative share packs (Surrey detox, Edmonton OAT, and Saskatoon
mental-health/housing) contain two or three relevant resources, concise guidance,
and a contact path for every item. The packs omit ranking data, owner-review metadata,
Farm/Samwise content, Miller North evidence, and private fields.

## Recommended next expansion

The next highest-value data pass is not a broad scrape. It should refresh the
top-ranked B.C. legacy records and add a small official-source batch for:

* Burnaby withdrawal management;
* Calgary OAT plus legal/transport navigation;
* Edmonton legal/transport navigation;
* Regina withdrawal/OAT/counselling; and
* Prince Albert withdrawal/OAT/transport.

Those additions directly address failed benchmark conditions and common
frontline workflows while keeping canonical verification standards intact.
