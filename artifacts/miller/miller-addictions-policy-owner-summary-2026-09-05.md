# Owner summary — Miller addictions policy/law/government pass

Date: 2026-09-05
Publication status: private only

## Research

- 73 distinct policy/legal/government/public-health candidates
- 60 British Columbia and 13 directly relevant federal records
- 73 supported by official primary sources
- 0 independently corroborated in this primary-source-first pass
- 6 instrument candidates requiring owner review
- 21 policy chains
- 68 source-catalog records

The type distribution is led by 12 service implementations, 8 professional standards, 7 implementation reports, 5 government responses, 5 statutes, 4 federal exemptions, 4 outcome-surveillance records and 4 public-health recommendations. The remaining records cover coroner panels, regulations, funding announcements, evaluations, strategy, clinical guidance, audit, order, judgment and policy direction.

## Commitments and implementation

- 30 commitments/recommendations modeled
- 8 implemented
- 12 partially implemented
- 6 implementation underway
- 3 with no clear evidence found
- 1 implementation unclear
- 9 commitment records requiring owner review
- 7 repeated-recommendation signals

Strongest confirmed examples: OPS rollout after Ministerial Order 488; provincial drug checking; OAT Access Line; nurse OAT prescribing; OPS minimum standards; 105 funded treatment/recovery beds reported operational; 12 First Nations-led beds; and publication of the revised prescribed-alternatives policy.

Strongest partial examples: OAT/iOAT access, prescribed alternatives, the evidence-based continuum of care, Road to Recovery provincewide expansion, supportive-recovery oversight and decriminalization.

No clear evidence was found for an exact 30/60/90-day action plan matching the 2022 coroner recommendation, a non-prescriber alternatives model matching the 2023 panel recommendation, or a comprehensive national service-standard instrument matching the federal task-force recommendation. These are search outcomes, not findings of noncompliance.

## Coroner and public health

- 7 high-value coroner/public-health/audit report families inspected in depth
- 13 specific expert/coroner/PHO/audit commitments represented
- official response documents found for the 2022 death review panel
- implementation evidence found for drug checking, OAT expansion, prescribed alternatives, continuum-of-care work and OPS
- recurring recommendations found in treatment oversight, OAT/iOAT, safer alternatives, continuum of care, decriminalization, national standards and public reporting

## Miller resource connections

- 15 proposed policy-to-resource relationships
- 12 named service openings/expansions have official operational evidence
- 1 clearly planned/not-yet-operational site (Terrace withdrawal management)
- 2 additional association-only links do not establish a new opening or expansion
- 0 canonical foreign keys assigned because the local `resource_registry` has no seeded rows

Existing Miller bundle names discovered in the relationship pass include Creekside Withdrawal Management Centre, Creekside RAAC/RAC, Access Central, Maple Ridge Treatment Centre, Last Door Recovery Centre and Foundry. All 15 canonical identity matches remain unresolved and owner-gated.

## Architecture

New additive migration:

- `supabase/migrations/20260906053000_miller_addictions_policy_research_v1.sql`

New private tables:

- policy chains
- policy instruments and action-level sources
- commitments and commitment-level sources
- instrument amendment/supersession relationships
- policy/commitment-to-resource candidate links

New deterministic code:

- `server/millerAddictionsPolicyResearch.js`

New admin-only preview component:

- `src/admin/MillerAddictionsPolicyPreview.jsx` (not routed publicly)

Architecture recommendation: keep Miller and Miller North base tables separate for now. Generalize vocabularies, evidence/source handling, fingerprints, temporal relations, review gates and bounded discovery-loop contracts as Farm primitives after reviewed records exist in both domains.

## Discovery

- 0 new individual incident candidates created; the source lane was aggregate/systemic and did not justify turning deaths or complaints into person-level records
- 7 high-value new accountability/report-stage candidates (three coroner panels, two PHO reports, the Auditor General audit and federal expert-task-force material), represented as private instruments rather than duplicated incidents
- useful organizations: BC Coroners Service, Office of the Provincial Health Officer, Auditor General of B.C., BCCSU, BCCNM, College of Pharmacists of B.C., CPSBC, regional health authorities, FNHA and Health Canada
- useful search terms: `death review panel response letter`, `implementation of harm reduction programs`, `minimum service standards overdose prevention`, `policy direction prescribed alternatives`, `professional practice policy opioid agonist`, `Access Central`, `Road to Recovery service expectations`, `section 56 exemption status`, and `treatment beds opened`

## Farm learning

The strongest reusable capability is evidence-stage separation combined with forward research: a recommendation generates a bounded response search; a commitment generates an implementation search; a funding promise generates named-service and operational-evidence searches. Exact dates, URLs, types, IDs, numeric capacity and explicit supersession are deterministic. Recommendation equivalence, legal scope, policy effectiveness and ambiguous resource identity remain owner-review tasks.

No local 3B/7B model, Tavily call or extra cloud-research model was needed. Tavily would be most useful for archived/changed-page discovery; local models could propose classification or similarity candidates but should not decide binding status, causal effect or publication.

## Validation and operations

- focused cross-domain Node: 18/18 passing
- focused pgTAP: 28/28 passing against local Docker
- lint: passing
- production build: passing (existing bundle-size warning only)
- web discovery calls: 10
- search queries: 40
- inspection units: 81 (68 source records plus 13 local architecture/fixture inspections)
- Tavily calls: 0
- local-model calls: 0
- additional cloud-model calls: 0
- measurable external cost: $0

## Mutation confirmation

- Production Miller resources changed: no
- Production Miller policy/accountability records changed: no
- Miller North records changed: no
- Candidate records imported: no
- Migration applied: local Docker only for validation; not applied to production
- Public routes or publication gates changed: no

Recommended next step: owner-review the nine commitment judgments and 15 service-link candidates, resolve canonical resource IDs against an approved registry snapshot, then approve a small pilot chain before any data import.
