# Policy/legal relationship mapping — owner review

This artifact proposes relationships only. It creates no rows and changes no incident, cohort, action or commitment conclusion.

## Existing incident proposal links

| Instrument(s) | Existing proposal | Relationship | Confidence | Safety note |
|---|---|---|---|---|
| Alberta Human Rights Act | `mni_6ee2d23497a38c5e8bc6e095` — Strathmore Hospital / Crow Chief | `complaint_under` | strong | Proves the complaint route, not the alleged discrimination or outcome. |
| Alberta Health Charter; Indigenous Patient Safety Advocate mandate | `mni_6ee2d23497a38c5e8bc6e095` | `creates_oversight_for` | bounded | Do not imply the advocate reviewed this case. |
| Alberta Human Rights Act | `mni_8c619ea15a3853519e795a3f` — Pearl Gambler / Misericordia | `governed_by` | bounded | Provincial rights context; the cited sources do not establish a tribunal decision. |
| First Nations Health Ombudsperson mandate | `mni_7dc99a5d862a140bd0417dff` — Regina General / Favel | `complaint_under` | strong | Public reporting identifies the complaint; no outcome inferred. |
| SHA anti-racism framework | `mni_7dc99a5d862a140bd0417dff` | `later_related_signal_found` | bounded | Later system framework is not shown to have resulted from this case. |
| Hospital safety/security review | `mni_d67fe98eb4feec0bca7c1b28` — Brydon Lafavour | `candidate_match` | review required | System-wide scope may provide context; no direct-case review established. |
| Hospital safety/security review | `mni_b0800a1d1732b3fb35c8ebc1` — Trevor Dubois | `candidate_match` | review required | Same caution; later review does not prove cause or recurrence. |
| First Nations Health Ombudsperson mandate | `mni_b0800a1d1732b3fb35c8ebc1` | `creates_oversight_for` | bounded | Mechanism relevance only; no case use or outcome asserted. |

## Cohort links

| Instrument(s) | Cohort | Relationship | Confidence |
|---|---|---|---|
| Federal sterilization response; TRC health calls | Saskatoon coerced-tubal-ligation cohort | `responds_to` / `cited_by` | strong / bounded |
| Saskatchewan Human Rights Code; anonymized directed-mediation resolution | anonymized Saskatchewan hospital discrimination case | `complaint_under` / `decision_under` | strong |
| Critical Incident Regulation and guideline | systemic Saskatchewan serious-harm cohorts | `governed_by` | bounded; case qualification requires evidence |
| B.C. Human Rights Code; Patient Care Quality Review Board Act | In Plain Sight systemic cohort | `governed_by` / `creates_oversight_for` | bounded |
| HSO/BCCNM/CPSBC standards | In Plain Sight systemic cohort | `responds_to` | strong at system level |
| AHS roadmap and advisory report | Alberta Indigenous unsafe-care pattern | `responds_to` | bounded |

## Commitment links

The following links are high enough value to stage for owner review. The ID after the arrow is the implementation-tracker commitment ID.

- `mpl_bc_003`, `mpl_bc_010` → `mit_bc_ips_24_recommendations` (`creates_oversight_for`, `operationalizes`; strong).
- `mpl_bc_011`, `mpl_bc_012`, `mpl_bc_013` → `mit_bc_ips_cultural_safety_standard` (`implements`; strong, with organization/profession-specific scope).
- `mpl_bc_016` → `mit_bc_ips_speak_up_pida` (`implements`; bounded pending exact designation instrument).
- `mpl_bc_006`, `mpl_bc_012`, `mpl_bc_013` → `mit_bc_ips_regulatory_anti_discrimination` (`partially_implements`; bounded because commencement and profession scope vary).
- `mpl_bc_018` → `mit_bc_health_centre_commitment` (`resulted_in`; strong for announcement, not operation).
- `mpl_bc_015` → `mit_bc_fraser_salish_complaints` (`partially_implements`; bounded).
- `mpl_bc_002`, `mpl_bc_017` → `mit_bc_patient_quality_reform` (`governed_by`, `responds_to`; strong).
- `mpl_ab_014` → `mit_ab_calgary_ihap` (`operationalizes`; strong).
- `mpl_ab_005`, `mpl_ab_006` → `mit_ab_primary_care_plan` (`resulted_in`, `implements`; strong).
- `mpl_ab_004` → `mit_ab_patient_safety_advocate` (`operationalizes`; strong).
- `mpl_ab_010`, `mpl_ab_011` → `mit_ab_cpsa_path` (`operationalizes`, `partially_implements`; strong/bounded).
- `mpl_ab_013` → `mit_ab_ahrc_external_review` (`responds_to`; strong).
- `mpl_sk_006`, `mpl_sk_007`, `mpl_sk_008` → `mit_sk_sha_antiracism_framework` (`resulted_in`, `operationalizes`; bounded/strong).
- `mpl_sk_008`, `mpl_sk_011` → `mit_sk_sha_cultural_responsiveness_training` (`operationalizes`; bounded until completion data exists).
- `mpl_sk_001`, `mpl_sk_002` → `mit_sk_hrc_mediation_remedies` (`complaint_under`, `decision_under`; strong; implementation remains unclear).
- `mpl_sk_010` → `mit_sk_hospital_security_review` (`operationalizes`; strong for review launch only).
- `mpl_ca_008` → `mit_sk_tubal_report_actions` (`responds_to`; bounded because federal action does not prove Saskatchewan implementation).
- `mpl_ca_003`, `mpl_ca_004`, `mpl_ca_006`, `mpl_ca_007` → `mit_bc_ips_24_recommendations` and cross-provincial anti-racism commitments (`cited_by`/`partially_implements`; bounded, not a substitute for provincial evidence).

These represent **22 distinct commitments** after de-duplicating repeated instrument references.

## Instrument histories and supersession

- SHA 2019 TRC commitment → 2024 reaffirmed commitment: `predecessor_of` / `supersedes`, strong.
- BCCNM 2022 practice standard → 2026 ethics/bylaw form: `supersedes`, bounded until exact transition text is attached at source level.
- In Plain Sight report → annual report → Task Team report → Declaration Action 3.7: `responds_to` / `implements` / `operationalizes`, strong.
- Alberta panel report → The Way Forward plan: `implements`, strong.
- AHS roadmap/advisory recommendations → 2024–25 annual report: `partially_implements`, strong for the documented activities only.
- UN Declaration Act → federal Action Plan → Shared Priority 7 → annual report: `implements` / `operationalizes`, strong.

The structured benchmark currently contains 44 direct relationship assertions. The incident, cohort and commitment links above remain mapping proposals until owner approval and UUID resolution.
