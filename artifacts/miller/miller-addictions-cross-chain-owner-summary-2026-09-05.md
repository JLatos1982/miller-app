# Owner Summary — Miller Addictions Cross-Chain and Service Verification

Date: 2026-09-05
Status: private, review-gated, not imported

## Cross-chain

- 21 chains, 73 instruments, 30 commitments, and 68 source-catalog entries inspected.
- 12 structured cross-chain pattern candidates across six overlapping topic clusters.
- Seven repeated/revisited recommendation signals: four strong direct/substantive repetitions and three cautious related-scope signals.
- Nine recurring organization families mapped. The B.C. government/health ministries appear in 15 chains; regional health authorities in seven; Health Canada, BC Coroners Service, and the PHO in five each.
- Five chains form a prolonged-partial-implementation review cluster: system of care, prescribed alternatives, coroner recommendations, treatment capacity, and harm-reduction audit.
- Significant intervals include 1,434 days between the 2018 and 2022 coroner panels, 978 days from prescribed-safer-supply direction to audit, and 561 days from the provincewide Road to Recovery expansion commitment to Fraser operational evidence.

## Policy to service

- 15 candidates inspected.
- 12 operationally verified, one partially verified, two announced but not verified, and zero with no evidence at all.
- Six service-verification records require owner review.
- Seven existing curated Miller matches: four exact service matches and three expansions of existing resources.
- Zero probable matches and zero canonical UUID matches because the local `resource_registry` is unseeded.
- Four direct new resource candidates: Oak Care withdrawal management, Inlet Recovery Home, Opioid Treatment Access Line, and Red Fish Healing Centre.
- Three services have insufficient public identity for a safe Miller match: Adams Lake, Skidegate, and Old Massett.
- One planned site—Terrace withdrawal management—has no operational resource match.

## Resource discovery

- Five private resource candidates created: the four direct candidates above plus Red Road North, discovered during Terrace-chain follow-up.
- Three verified expansions of existing curated resources: Creekside withdrawal beds, Maple Ridge youth/young-adult beds, and the historic Last Door bed cohort.
- One additional location, Hope RAAC, matches an existing curated resource.
- Northern/First Nations service identity remains the main reconciliation gap; missing public intake data is treated as a safety boundary, not filled by inference.

## First Nations services

- One principal policy/service chain, with five community/service stages examined.
- First Nations-led actors: Adams Lake Band Council, Skidegate Band Council, Old Massett Village Council, and Northern First Nations Alliance; FNHA and CMHA B.C. appear as support/funding partners.
- Eight beds were officially reported open on June 19 in Adams Lake and Skidegate. Four Old Massett beds were expected in July, not reported open on June 19.
- Red Road North has a First Nations-led project source and regulatory registration. The planned Terrace withdrawal-management site remains separate.

## Correction requiring owner attention

The earlier fixture's summary that all 12 Adams Lake/Skidegate/Old Massett beds were open is not supported by its cited release. This pass preserves the original fixture, records Old Massett as `announced_not_verified`, and flags the correction for review.

## Farm recommendation

Generalize cross-chain pattern candidates and commitment-to-real-world verification observations at the artifact/validation layer first. Keep subject tables separate until a second production domain confirms the semantics. Deterministic logic is suitable for dates, counts, aliases, enum validation, and exact identity signals; models should only suggest ambiguous similarity or evidence comparisons.

## Architecture and validation

- Added one deterministic synthesis/verification module and one focused Node test file.
- Extended the private admin preview with optional service-verification and cross-chain-signal sections.
- Added no migration and changed no table.
- Focused Node result: 20/20 passing across synthesis, policy-fixture, and resource-identity tests.
- Repository-wide Node result with loopback tests enabled: 745/746 passing. The one failure is an existing `FirstNationsHealthcareEvidenceFeather` integration assertion against the user's current uncommitted `App.jsx` changes; this pass did not modify that route or test.
- Lint: passing.
- Production build: passing, with the existing Vite large-chunk advisory.
- JSON parse validation and `git diff --check`: passing.
- pgTAP was not run because this pass created and applied no migration or database change.
- The existing local private-location integration script left fixed-ID test residue in the local Docker database because its cleanup attempts to delete append-only evidence. A direct cleanup attempt was rolled back when the audit trigger rejected the delete. Final verification confirmed the trigger remains enabled and the four private Miller addictions policy tables remain empty. The remaining local-only fixture residue is one test resource, one test claim, five append-only evidence rows, and five test auth users; no production environment was contacted.

## Operations

- Structured inspection units: 540 (21 chains + 73 instruments + 30 commitments + 15 service links + 68 sources + 333 curated resources).
- Web calls: 9 total, including 28 search queries and five direct URL opens; one documentation open returned an unsupported-content response.
- Tavily calls: 0.
- Local-model calls: 0.
- Additional cloud-model API calls: 0 (the current Codex task is not counted as a separately invoked model API).
- Measurable external cost: $0.

## Safety confirmation

- Production Miller resources changed: **no**.
- Public policy/accountability records published: **no**.
- Miller North data changed: **no**.
- Migrations created or applied: **none in this pass**.
- Local Docker test residue: **yes, from the pre-existing integration script**; retained rather than disabling the append-only audit safeguard.
- Original 73 candidates, 21 chains, 30 commitments, and 15 policy-to-service candidates remain private and unchanged.
- Owner-review artifacts created: six service-verification items, five private resource candidates, and six cross-chain pattern candidates (with overlap; do not sum as unique real-world entities).
