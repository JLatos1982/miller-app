# Policy-to-Resource Traceability

Date: 2026-09-06
Scope: 12 operationally verified policy-to-service candidates; private review only

## Evidence paths

| Service | Policy/commitment anchor | Implementation/current evidence | Miller endpoint | State |
|---|---|---|---|---|
| Creekside Withdrawal Management Centre | `map_creekside_expansion_2026` → `madc_road_100_beds` | Fraser Health expansion notice → current facility page | `curated:1ldala` | Existing resource expansion |
| Rapid Access to Addiction Care Clinic at Creekside | `map_creekside_expansion_2026` | Current Fraser directory → Fraser operational notice | `curated:1l1r25s` | Exact existing service |
| Hope RAAC satellite clinic | `map_creekside_expansion_2026` → `madc_road_access_lines` | Fraser operational notice | `curated:1flyb9f` | Exact existing service |
| Access Central — Detox Referral Line | `map_road_to_recovery_launch_2023` → `madc_road_access_lines` | Current VCH service page → provincial utilization evidence | `curated:juxtfc` | Exact existing service |
| Withdrawal Management at Oak Care Centre | `map_vch_withdrawal_relocation_2024` | VCH relocation/opening notice → current VCH service page | `marc_oak_care_withdrawal` | Private candidate; address reconciliation |
| Downtown Eastside Connections Clinic | `map_dtes_connections_2017` | Current VCH service page → VCH utilization report | `curated:19557cr` | Exact existing service |
| Maple Ridge Treatment Centre | `map_youth_beds_2022` → `madc_youth_123_beds` | Fraser opening notice → current facility page | `curated:1kugyxn` | Existing resource expansion |
| Last Door Recovery Centre | `map_fraser_50_beds_2016` | Fraser implementation notice → current operator page | `curated:1ykkt91` | Existing resource expansion; owner review retained |
| Inlet Recovery Home | `map_inlet_recovery_2026` → `madc_road_100_beds` | Provincial implementation notice → Island Health directory | `marc_inlet_recovery_home` | Private candidate |
| Adams Lake treatment beds | `map_fn_beds_2026` → `madc_fn_12_beds_open` | Provincial/FNHA/First Nations partner implementation notice | No endpoint resolved | Service operation reported; identity insufficient |
| Tll Daagwiiyah Naay | `map_fn_beds_2026` → `madc_fn_12_beds_open` | Provincial/FNHA/First Nations partner implementation notice | No endpoint resolved | Service operation reported; identity insufficient |
| Opioid Treatment Access Line | `map_oat_access_line_2024` → `madc_oat_access_line_launch` | Current provincial service page → provincial utilization report | `marc_opioid_treatment_access_line` | Private virtual-service candidate |

## Source-role rule

The deterministic path builder attaches source evidence to every step. When a verification object lacks a separately tagged announcement/funding source, it preserves the available authoritative service evidence without relabeling it. This prevents a current service page from silently becoming proof of a funding claim.

## Completeness

- 12/12 operationally verified relationships produce a valid evidence path.
- Seven terminate in existing curated resources.
- Three terminate in private resource candidates in this set.
- Two terminate at an unresolved service identity and remain owner-gated.
- The partially verified Red Fish relationship and two announcement-only records are excluded from the operational-path count; they remain in the wider 15-record verification dataset.

## Funding caveat

None of the 15 source records contains a normalized public dollar amount. Quantities such as beds, sites, or access lines are retained only where stated. No amount was inferred from aggregate budgets.
