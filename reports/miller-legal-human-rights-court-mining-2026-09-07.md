# Miller / Miller North legal, human-rights and court-record mining

Date: 2026-09-07

## Outcome

This bounded pass established a reusable legal-source registry, a process-aware legal-evidence model, deterministic document/event fingerprints and listener memory. It reviewed ten relevant decisions or formal outcomes and added thirteen verified legal-navigation resources to the shared canonical foundation. No legal decision was automatically published as a new Miller North incident: procedural decisions, settlements, representative litigation and systemic judgments remain distinct and owner-reviewed.

The shared registry now contains 124 canonical resources: 47 Miller-only, 42 Miller North-only and 35 shared by both. The Miller projection contains 82 records and the Miller North projection contains 77. The thirteen new legal resources comprise twelve shared records and one North-only Indigenous police-accountability service.

## Legal evidence reviewed

### Miller North

- **First Nations Child and Family Caring Society, 2016 CHRT 2:** merits finding of discrimination in federal First Nations child-and-family service funding and the narrow application of Jordan's Principle. Route: legal evidence for the existing Jordan accountability work, not a new incident.
- **Canada v. Caring Society, 2021 FC 969:** judicial-review outcome leaving challenged Tribunal compensation and eligibility orders in place. Route: potential Accountability Watch strengthening; implementation remains a separate question.
- **Mr. C v. Vancouver Coastal Health Authority, 2021 BCHRT 22:** procedural timeliness decision only. It allowed a complaint to proceed and did not decide whether discrimination occurred. Kept private.
- **Radek v. Henderson Development, 2005 BCHRT 302:** merits finding of race and disability discrimination in mall-security services, with systemic remedies. It is relevant Indigenous/security/disability context but not a healthcare incident. Owner review only.
- **Ledger v. Alberta Health Services, 2021 AHRC 95:** request-for-review decision sending an Indigenous nurse's race-based workplace complaint forward. The matter later settled before a merits hearing. Kept private; no discrimination finding is claimed.

### Original Miller

- **Canada v. PHS Community Services Society, 2011 SCC 44:** final judgment protecting continued operation of Insite through a statutory exemption. Strong treatment-access and harm-reduction legal context.
- **Stewart v. Elk Valley Coal Corp., 2017 SCC 30:** final judgment illustrating that addiction and adverse treatment do not by themselves establish the required connection for discrimination on a particular record.
- **Northern Regional Health Authority v. Horrocks, 2021 SCC 42:** forum-jurisdiction judgment, not a new merits ruling on the underlying addiction-discrimination allegation.
- **VANDU v. Downtown Vancouver BIA, 2018 BCCA 132:** appeal reinstating dismissal of a representative street-homelessness/addiction complaint. The alleged discrimination was not established.
- **Kvaska v. Gateway Motors, 2020 AHRC 94:** Alberta merits decision finding failure to accommodate alcohol addiction in employment and awarding damages, lost wages and benefits.

## Source systems and listener readiness

The machine-readable registry contains 25 source systems spanning federal, B.C., Alberta and Saskatchewan courts; human-rights bodies; health regulators; patient-quality review; ombuds offices; tenancy tribunals; police oversight; and Indigenous health accountability. B.C. Human Rights Tribunal is the best new recurring-listener candidate because its recent-decision index is structured, identifies procedural posture and is updated roughly every two weeks. Its judicial-review tracker supplies a second deterministic change surface.

Alberta Human Rights is useful for curated decision summaries and links to the full CanLII corpus. Saskatchewan remains technically less uniform: annual reports and selected decisions are public, but there is no comparably complete Commission-hosted merits archive. Exact-citation and Court of King's Bench/CanLII searches are preferable to bulk collection.

The legal listener prototype records citation, process role, source URL, document fingerprint and event fingerprint. An identical second run returned ten unchanged documents. It distinguishes a duplicate copy of one decision from later legal evidence associated with the same underlying matter.

## Practical resources

New verified services include the BC Human Rights Clinic, CLAS Mental Health Law Program, Virtual Indigenous Justice Centre, BCFNJC Police Accountability Unit, Alberta Human Rights complaint navigation, Alberta Ombudsman, Legal Aid Alberta, Alberta RTDRS, Legal Aid Saskatchewan, Pro Bono Law Saskatchewan clinics, CLASSIC clinics, Saskatchewan ORT and the Canadian Human Rights Commission complaint route.

The records state when representation is limited, conditional or unavailable. Complaint intake is never described as a finding. All 33 unique URLs across the previous expansion and this legal expansion returned successful HTTP responses during verification.

## Incremental evidence listeners

The bounded current-source check found no material changes: 34 B.C. inquest verdicts, 6 CPSBC case summaries, 100 BCCNM notices, 204 OCYA recommendation rows and 62 Maskwacis fatality-response rows were unchanged. The Alberta fatality listener's optional-argument parser was corrected after an omitted `--case` flag was mistakenly read as another flag; two identical post-fix runs reproduced 62 responder rows and 40 numbered recommendations with no changes. Response labels remain separate from implementation and outcome evidence.

## Publication and safety

The resource expansion is publication-safe and uses current first-party or official service pages. Legal-evidence records remain in a private owner-review artifact and are not part of Miller North global search or Official Records. No new incident, discrimination finding, Watch chain or legal page was published in this pass. No production database write or migration was needed.

## Recommended next seam

Productionize a biweekly B.C. Human Rights Tribunal recent-decision and judicial-review listener, then perform a citation-led Alberta Human Rights backfill for addiction disability and Indigenous healthcare/workforce decisions. Saskatchewan should remain exact-document and milestone driven. For practical coverage, the gap matrix still identifies rural/remote housing access in Alberta and Saskatchewan as the highest-value non-legal gap.
