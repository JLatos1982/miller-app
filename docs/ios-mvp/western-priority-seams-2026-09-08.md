# Miller Navigator: five priority Western regional seams

Reviewed 2026-09-08 from official or first-party public sources. This is a bounded practical-resource pass, not proof that an unlisted service does not exist. No Miller North evidence or private Palantír material is projected here.

## Results

| Seam | Verified practical pathway | Honest remaining gap |
|---|---|---|
| Port Hardy / Port McNeill | Separate Island Health local MHSU access points; both can screen, assess and connect people to counselling, OAT and withdrawal options. Island Health Travel Assistance is separately represented. Port Hardy sheltering/sobering is explicitly not medical withdrawal. | No separately verified medical withdrawal facility in either town in this pass; housing/recovery depth remains limited. |
| Prince Rupert / Haida Gwaii | Northern Health local MHSU/OAT in Prince Rupert, local MHSU access in Daajing Giids and Masset, specialized Prince Rupert outreach, and Northern Health Connections for eligible medical travel. | Haida Gwaii withdrawal/residential-treatment travel still depends on intake/navigation; local recovery housing remains thin. |
| La Loche / Île-à-la-Crosse | SHA facility pages establish physical local mental-health/addiction and medically supported/non-medical withdrawal services; regional intake remains distinct. Existing northern medical transportation and NIHB resources remain available where eligibility applies. | No verified local OAT clinic was established in this pass; the app must start with provincial/regional navigation rather than imply one. |
| High Level / Peace River | Official AHS/Recovery Alberta pages establish local outpatient addiction/mental-health access plus separate Indigenous Wellness Core navigation at each hub. | No verified local withdrawal facility or broad non-emergency treatment-transport program was established. The Peace River listing explicitly reports no public transportation to the service. |
| Dawson Creek / Fort St. John | Northern Health local MHSU programs include counselling, care coordination and OAT; Northern Health Connections is a separate eligible regional travel pathway. | Recovery/supportive housing and a local withdrawal facility remain unverified in this bounded pass. |

The source batch contains 17 records: 15 Miller-only and two Indigenous Wellness Core records shared canonically with Miller North Supports & Funding. Physical locations, service areas and navigation-only status are independent fields.

## Transportation

Verified pathways are Island Health Travel Assistance, Northern Health Connections, FNHA Medical Transportation, NIHB Medical Transportation, and the existing Saskatchewan Northern Medical Transportation Program. Every listing retains its administrator, eligibility caveat and application/booking route. No Alberta-wide non-emergency treatment transportation substitute was added without a qualifying official source.

## Legacy verification batch

Twenty-five high-impact legacy resources were refreshed through current official or first-party HTTPS pages. Selection factors are recorded in the versioned batch: frontline-category importance, benchmark/top-result relevance, service-area value, and lack of a stronger current alternative. Stable legacy IDs were enriched; no parallel mobile records were created.

This raises mobile readiness from 150/465 (32.3%) at the preceding baseline to 192/482 (39.8%). The remaining 290 non-ready records all lack current-source verification; 37 also lack a verified contact path, four lack sufficient access detail, and two have duplicate conflicts.

- 40% is one additional existing-record enrichment away and is worth reaching during normal verification—not by weakening the gate.
- 50% requires about 49 further current-source enrichments if the denominator remains stable; a two- or three-batch high-use audit is reasonable.
- 75% requires about 170 further enrichments and should be pursued only through sustained Farm verification with demonstrated use, not as a one-off sweep.

## Verification cadence recommendation

- High-use/top-result and volatile intake records: quarterly; monthly only when observed change yield justifies it.
- Ordinary stable provider services: six to twelve months.
- Province-wide government programs: milestone/change-based checks plus an annual full verification.
- Known closures, redirects, or correction feedback: targeted prompt recheck.

No recurring schedule changes are enabled by this pass; the initial batch does not yet establish enough yield to justify additional request load.

## Reproducibility

- `node scripts/build-miller-legacy-priority-verification.mjs`
- `node scripts/build-shared-resource-registry.mjs`
- `node scripts/audit-miller-mobile-readiness.mjs`
- `npm run benchmark:miller-navigator-rural`

The five rural scenarios pass deterministic geography, need-decomposition, pathway, transport-recognition, practical-boundary and unsupported-claim checks. That is code-level readiness, not human proof of a sub-60-second workflow.
