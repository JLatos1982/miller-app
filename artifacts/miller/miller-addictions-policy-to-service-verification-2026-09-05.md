# Policy-to-Service Verification

Date: 2026-09-05
Scope: private benchmark and owner review only

## Outcome

All 15 prior policy-to-service candidates were inspected.

| Verification status | Count |
|---|---:|
| Operationally verified | 12 |
| Partially verified | 1 |
| Announced, not verified | 2 |
| No clear evidence found | 0 |
| Owner-review items | 6 |

Miller comparison outcomes are seven current curated matches—four exact service matches and three expansions of existing resources—four new resource candidates, three insufficient-identity cases, and one planned site with no resource match. The local canonical registry contains zero rows, so canonical UUID matches remain zero.

## Verified curated matches

| Service | Policy relationship | Miller outcome | Operational evidence |
|---|---|---|---|
| Creekside Withdrawal Management Centre | Ten-bed expansion | expansion of existing resource | [Fraser implementation report](https://www.fraserhealth.ca/news/2026/Feb/Expanding-addictions-care-in-Lower-Mainland) and [current facility page](https://www.fraserhealth.ca/Service-Directory/Locations/Surrey/creekside-withdrawal-management-centre) |
| Creekside RAAC | Regional rapid-access model | exact existing resource | Current Creekside page lists RAAC. |
| Hope RAAC satellite | Additional location | exact existing resource | Fraser identifies same-day access at the matching Hope address. |
| VCH Access Central | Central assessment/intake | exact existing resource | [Current VCH service page](https://www.vch.ca/en/service/access-central-detox-referral-line) plus utilization reporting. |
| Downtown Eastside Connections | New clinic | exact existing resource | [Current VCH clinic page](https://www.vch.ca/en/location-service/addiction-medicine-downtown-eastside-connections-clinic). |
| Maple Ridge Treatment Centre | Four-bed youth/young-adult expansion | expansion of existing resource | 2022 opening evidence plus [current facility page](https://www.fraserhealth.ca/Service-Directory/Locations/Maple-Ridge---Pitt-Meadows/maple-ridge-treatment-centre). |
| Last Door Recovery Centre | Eight-bed 2016 expansion | expansion of existing resource | Historic health-authority inventory plus current operator site; exact current funded-bed configuration remains under review. |

## Operating services absent from Miller's curated bundle

- Withdrawal Management at Oak Care Centre, Vancouver
- Inlet Recovery Home, Port Alberni
- Opioid Treatment Access Line, provincewide virtual service
- Red Fish Healing Centre, Coquitlam

Each is a private candidate. Red Fish is only a partial policy match: the centre is operational, but its 105 existing beds do not prove implementation of every promise to expand the Red Fish model.

## Announced but not verified

- **Old Massett / Swan House:** the June 19 release says the beds were expected in July, unlike the already-open Adams Lake and Skidegate beds. No later authoritative operating page was located.
- **Terrace community withdrawal-management site:** property acquisition and planning are documented, but renovations and timing were unknown.

## Important correction signal

The source does not support the earlier summary that all 12 First Nations-led beds were open on June 19. It supports eight open beds—four in Adams Lake and four in Skidegate—and four Old Massett beds expected later. The original fixture was not mutated; the correction is held here for owner review.

## Identity boundary

The local `resource_registry` is unseeded. Curated IDs such as `curated:1ldala` are source-bundle identifiers, not production canonical UUIDs. No match was written to Supabase and no public resource changed.

Structured data: `miller-addictions-policy-to-service-verification-2026-09-05.json`.
