# Private Research Dossier Evidence-Edge Maps

Every edge below is backed by one or more source IDs in its dossier. Nodes remain references to the separate Miller or Miller North domain objects; this artifact does not create a merged subject dataset.

## New Roads Therapeutic Recovery Community

- `government_of_british_columbia` → **announced_by** → `fmoney_miller_new_roads_439m` — The Province announced a named $4.39-million, three-year funding commitment for New Roads. Confidence: high; scope: service_level. Sources: `fdsource_new_roads_bc_funding`.
- `fmoney_miller_new_roads_439m` → **received_by** → `our_place_society` — The official announcement associates the funding with the Our Place Society-operated New Roads program. Confidence: high; scope: recipient_level. Sources: `fdsource_new_roads_bc_funding`.
- `our_place_society` → **operated_by** → `new_roads_therapeutic_recovery_community` — The operator and health-authority pages identify New Roads as a current service. Confidence: high; scope: operational. Sources: `fdsource_new_roads_island_health`, `fdsource_new_roads_operator`.
- `fmoney_miller_new_roads_439m` → **operationalized_as** → `new_roads_therapeutic_recovery_community` — Current service evidence supports a service-level funding-to-operation path; it does not provide detailed expenditure attribution. Confidence: high; scope: service_level; operational. Sources: `fdsource_new_roads_bc_funding`, `fdsource_new_roads_island_health`.
- `new_roads_therapeutic_recovery_community` → **expanded_by** → `new_roads_womens_twenty_bed_program` — An official opening notice documents the later 20-bed women’s facility as an expansion of the New Roads model. Confidence: high; scope: implemented. Sources: `fdsource_new_roads_women_opening`.

## Creekside Withdrawal Management Centre — Road to Recovery expansion

- `bc_treatment_access_and_capacity_need` → **responds_to** → `map_road_to_recovery_launch_2023` — The Province presented Road to Recovery as a response to treatment-access and continuity needs. Confidence: high; scope: response_context. Sources: `fdsource_creekside_road_launch`.
- `map_road_to_recovery_expansion_2024` → **announced_by** → `fmoney_miller_road_expansion_154m` — The Province announced nearly $154 million over three years for the wider expansion. Confidence: high; scope: program_level. Sources: `fdsource_creekside_bc_expansion`.
- `madc_road_100_beds` → **implements** → `map_creekside_expansion_2026` — Fraser Health’s reported Creekside expansion is a named implementation stage within the wider 100-bed commitment. Confidence: high; scope: implemented. Sources: `fdsource_creekside_bc_expansion`, `fdsource_creekside_fraser_expansion`.
- `curated:1ldala` → **expanded_by** → `map_creekside_expansion_2026` — The health authority names Creekside as the facility where ten beds were added, without providing a site-level funding amount. Confidence: high; scope: program_level; operational. Sources: `fdsource_creekside_fraser_expansion`.
- `map_creekside_expansion_2026` → **linked_to_resource** → `curated:1ldala` — The current Fraser Health directory corroborates the expanded service’s canonical resource identity and operation. Confidence: high; scope: operational. Sources: `fdsource_creekside_current_service`.
- `map_road_to_recovery_launch_2023` → **evaluated_by** → `bc_health_annual_report_2024_25` — The ministry annual report supplies wider-program utilization evidence, not Creekside-specific outcome evidence. Confidence: high; scope: response_context. Sources: `fdsource_creekside_health_annual`.

## Saskatchewan First Nations Health Ombudsperson Office — governance and funding

- `fsin_resolution_2046` → **created_by** → `sk_first_nations_health_ombudsperson` — The office identifies Chiefs-in-Assembly Resolution 2046 as its governance authority. Confidence: high; scope: directly_applicable. Sources: `fdsource_fnho_governance`.
- `sk_first_nations_health_ombudsperson` → **has_context** → `treaty_and_inherent_rights_context` — The office frames its mission in the spirit and intent of Treaty and inherent rights; no judicial treaty-right determination is inferred. Confidence: high; scope: governance_context. Sources: `fdsource_fnho_governance`.
- `isc_fnho_funding_2022` → **funded_by** → `fsin_fnho` — Indigenous Services Canada announced $1.17 million for first-year establishment through FSIN. Confidence: high; scope: recipient_level. Sources: `fdsource_fnho_isc_launch`.
- `isc_fnho_funding_2022` → **operationalizes** → `sk_first_nations_health_ombudsperson` — Current office information and annual-report access demonstrate operation after establishment funding. Confidence: high; scope: recipient_level; operational. Sources: `fdsource_fnho_isc_launch`, `fdsource_fnho_about`, `fdsource_fnho_annual_reports`.
- `fmoney_north_fnhoo_775k` → **received_by** → `sk_first_nations_health_ombudsperson` — Federal proactive disclosure confirms a later $775,000 agreement at recipient level without itemized activity spending. Confidence: high; scope: recipient_level. Sources: `fdsource_fnho_open_grant`.
- `sk_first_nations_health_ombudsperson` → **reported_by** → `fnho_annual_report_registry` — The office maintains an annual-report registry for continuing accountability follow-up. Confidence: high; scope: governance_context. Sources: `fdsource_fnho_annual_reports`.

## In Plain Sight — implementation and public-reporting accountability

- `bc_indigenous_specific_healthcare_racism_findings` → **documents** → `bc_in_plain_sight` — The independent review documented systemic concerns and established the 24-recommendation accountability set. Confidence: high; scope: directly_applicable. Sources: `fdsource_ips_fnha_one_year`, `fdsource_ips_24_month_update`.
- `bc_in_plain_sight` → **recommends** → `bc_ips_24_recommendations` — The report issued 24 recommendations that later official sources track in whole or in part. Confidence: high; scope: directly_applicable. Sources: `fdsource_ips_fnha_one_year`, `fdsource_ips_24_month_update`.
- `bc_in_plain_sight` → **responds_to** → `bc_drap_action_3_07` — Declaration Act Action 3.07 is the Province’s formal implementation vehicle for the recommendation set. Confidence: high; scope: response_context. Sources: `fdsource_ips_action_307`.
- `bc_drap_action_3_07` → **partially_implements** → `bc_ips_recommendation_level_activities` — Official sources document specific activities for recommendations 1, 2, 17, 22, 23 and 24 without resolving the status of all recommendations. Confidence: high; scope: partially_implemented. Sources: `fdsource_ips_estimates_notes`, `fdsource_ips_canada_health_act`, `fdsource_ips_action_307`.
- `bc_indigenous_health_cultural_safety_fund_171_8m` → **funded_by** → `bc_ips_recommendation_17` — Federal annual reporting connects the $171.8-million fund to recommendation 17 at program level. Confidence: high; scope: program_level; funded. Sources: `fdsource_ips_canada_health_act`.
- `bc_drap_action_3_07` → **limits_reporting_for** → `bc_ips_current_reporting_gap` — The current action page says its framework has limited capacity to report comprehensively across all 24 recommendations. Confidence: high; scope: reporting_unclear. Sources: `fdsource_ips_action_307`.
- `bc_in_plain_sight` → **evaluated_by** → `bc_ips_follow_up_reporting_series` — FNHA and provincial updates create a follow-up series with differing scopes and levels of detail. Confidence: high; scope: response_context. Sources: `fdsource_ips_fnha_one_year`, `fdsource_ips_24_month_update`, `fdsource_ips_action_307`.
