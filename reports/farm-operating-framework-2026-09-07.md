# Farm operating framework checkpoint

Generated 2026-09-08T00:51:27.420Z. This checkpoint describes read-only research and maintenance operation. It grants no mutation or publication authority.

## Operating result

- 24 registered jobs: 21 enabled and 3 disabled.
- 21 enabled jobs have completed; 0 job(s) are currently deferred.
- A daily local heartbeat dispatches at most 3 due jobs. Each listener retains its own cadence.
- The activation cycle recorded 2247 checks, no material source change, no error, and no production/publication write.

## Enabled

| Job | Worker | Last status | Checked | Next run |
| --- | --- | --- | ---: | --- |
| mn_ab_fatality_responses_weekly | samwise | no_material_change | 62 | 2026-09-15T00:12:37.615Z |
| mn_bc_inquests_weekly | samwise | no_material_change | 34 | 2026-09-15T00:12:48.326Z |
| legal_bchrt_recent_biweekly | samwise | no_material_change | 106 | 2026-09-22T00:12:51.725Z |
| legal_bchrt_judicial_review_biweekly | samwise | no_material_change | 486 | 2026-09-22T00:12:56.714Z |
| legal_ab_human_rights_monthly | samwise | no_material_change | 48 | 2026-10-08T00:13:00.762Z |
| mn_bccnm_monthly | samwise | no_material_change | 133 | 2026-10-08T00:13:12.157Z |
| mn_cpsbc_monthly | samwise | no_material_change | 6 | 2026-10-08T00:13:16.553Z |
| mn_alberta_ocya_monthly | samwise | no_material_change | 204 | 2026-10-08T00:13:19.349Z |
| shared_resource_health_monthly | igor | completed | 32 | 2026-10-08T00:43:43.549Z |
| shared_resource_snapshot_monthly | igor | no_material_change | 40 | 2026-10-08T00:42:51.167Z |
| igor_listener_batch_monthly | igor | no_material_change | 20 | 2026-10-08T00:42:51.466Z |
| miller_data_quality_weekly | either | no_material_change | 124 | 2026-09-15T00:12:25.341Z |
| miller_location_quality_weekly | samwise | completed | 600 | 2026-09-15T00:48:24.441Z |
| farm_security_sanity_weekly | samwise | no_material_change | 4 | 2026-09-15T00:12:27.827Z |
| farm_production_health_weekly | samwise | no_material_change | 6 | 2026-09-15T00:17:08.754Z |
| farm_listener_memory_monthly | samwise | no_material_change | 7 | 2026-10-08T00:12:34.781Z |
| farm_weekly_owner_summary | samwise | completed | 52 | 2026-09-15T00:47:03.414Z |
| mn_fnho_publications_monthly | samwise | no_material_change | 4 | 2026-10-08T00:44:15.687Z |
| mn_saskatchewan_exact_documents_monthly | samwise | no_material_change | 3 | 2026-09-26T13:15:00.000Z |
| legal_saskatchewan_human_rights_monthly | samwise | no_material_change | 8 | 2026-10-08T00:50:37.760Z |
| farm_dependency_advisory_monthly | samwise | no_material_change | 268 | 2026-10-08T00:48:25.221Z |

## Disabled

| Job | Worker | Reason |
| --- | --- | --- |
| farm_qwen_triage_weekly | igor | paused_quality_regression |
| legal_canlii_selected_queries | samwise | manual_research |
| mn_historical_scan_retry_quarterly | igor | historical_backfill |

Disabled jobs remain registered so their purpose and prerequisites are explicit. Qwen recurring triage is disabled because its reviewed 12-item benchmark achieved 7/12 (58.3%) with 1 malformed result. The narrower extraction benchmark achieved 48.0% field accuracy with 100.0% structured compliance in 31578 ms. It remains unsuitable for recurring work.

## Igor

Igor is an authenticated, one-shot local worker with 3 declared capabilities. 3 enabled jobs are assigned to it; 3 have completed at least one cycle and 0 are currently deferred. No autonomous publishing or mutation capability was granted.

## Data quality and security

- Canonical resources checked: 124; defects: 0; safe correction proposals: 0; owner-review issues: 0.
- The location detect/propose job checked 300 legacy rows: 31 safe normalization proposals, 98 research candidates and 16 duplicate-location owner-review groups. It made zero production mutations.
- Read-only secret/config sanity, listener-memory integrity, worker availability, and public production-health checks are enabled.
- The older security pulse and local automation scheduler are implemented but intentionally inactive. Read-only dependency advisory is now monthly; backup/recovery verification remains a documented owner decision because no off-host listener-state restore test was located.

## Evidence graph and legal/support pathways

The deterministic projection contains 164 nodes and 11 reviewed edges across 20 incidents, 10 Accountability Watch chains, 10 legal records, and 124 shared support resources. It generated 63 owner-reviewed legal/support pathway suggestions. No event was auto-merged and nothing was auto-published.

## Weekly owner email

The weekly summary is generated from bounded run manifests rather than scraped logs. A privacy-filtered preview was generated. Delivery remains off because no explicit owner recipient/provider configuration is present; this is safer than guessing an address.
