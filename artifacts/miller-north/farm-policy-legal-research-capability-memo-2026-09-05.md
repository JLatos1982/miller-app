# Farm exploratory memo — reusable policy/legal research capability

Status: bounded design analysis; no Farm architecture change in this pass

## Main finding

The most reusable capability is not a “law database.” It is a temporal, evidence-role-aware research primitive:

`document → formal instrument → commitment → implementation evidence → dated status → later signal`

This supports Miller North's public-interest question while generalizing to government promises, corporate commitments, municipal projects, remediation orders, public inquiries and regulatory action. The existing relational approach is adequate. Graph infrastructure would add operational cost before the project has query volume or cross-project semantics that justify it.

## Reusable screens

Research screens should be modular query generators over the same evidence store:

1. Incident screen: what happened and who reported it?
2. Accountability screen: what investigation, finding, apology or process followed?
3. Commitment screen: what specific action was recommended, required or promised?
4. Implementation screen: what later source demonstrates announcement, start, partial delivery, completion or unresolved status?
5. Policy/legal screen: what formal rule governed or changed?
6. Organization/person screen: who had authority or a public implementation role?
7. Recurrence screen: what later related evidence warrants review?
8. Temporal screen: what preceded this, and what happened next?

Each screen should emit bounded follow-up queries, not autonomous conclusions. A new incident can suggest an accountability query; a recommendation can suggest a forward implementation search; a policy can suggest a backward trigger search; an implementation claim can suggest a later evaluation search.

## General relational abstraction

Keep canonical domain rows and typed link tables where foreign-key integrity matters. A reusable Farm layer can standardize:

- stable research ID and content fingerprint;
- document/source with organization, date, URL, retrieval state and evidence role;
- instrument type, jurisdiction, legal/binding status and temporal status;
- commitment owner(s), due date, implementation state/date/scope;
- typed, confidence-scored relationship with owner-review gate;
- predecessor/successor/supersession edges;
- recurrence signal distinct from causal or effectiveness claim.

Project-specific tables should retain sensitive or domain-heavy semantics. Indigenous identity, community relationships, cultural-safety concepts, anonymity rules and Miller publication gates should not be generalized into a weak universal entity model.

## Temporal research

A generic “follow forward” adapter can derive search windows and terms from dated nodes:

- recommendation/report title + `implementation`, `progress`, `annual report`, `audit`, `evaluation`;
- policy title + `effective`, `in force`, `amended`, `repealed`, `superseded`;
- program/oversight name + `annual report`, `complaints`, `outcomes`, `review`.

A “look backward” adapter can search policy titles with `trigger`, `review`, `incident`, `complaint`, `recommendation`, and cited report names. Both should return candidate edges requiring evidence, not inferred causation.

## Quality scoring

Useful deterministic metrics are:

- primary-source coverage;
- source-role coverage (origin, acceptance, implementation, evaluation);
- independent corroboration for outcome claims;
- explicit date coverage;
- legal-force certainty;
- implementation certainty and evidence recency;
- source-organization diversity;
- unresolved relationship count;
- owner-review burden;
- repeat/supersession resolution rate.

Do not compress these into a single opaque “truth score.” A small scorecard is more auditable.

## Automation boundary

Good deterministic work:

- enum normalization;
- stable IDs/fingerprints and duplicate candidates;
- date parsing and status vocabulary checks;
- URL/source-role validation;
- owner-review and publication gates;
- query generation from known titles and dates;
- exact predecessor/successor matching when official citations identify both documents.

Potential local 3B work:

- rough instrument-type classification;
- candidate relationship suggestion;
- organization-name normalization;
- detecting possible repeat recommendations for human review.

Potential local 7B work:

- evidence-role review across two or three sources;
- neutral-summary consistency checks;
- distinguishing policy adoption from operational evidence;
- surfacing contradictory status statements.

Cloud research is most valuable for difficult discovery across heterogeneous sites, long reports and cross-jurisdiction chains. Tavily could help with forward searches and source discovery if configured, but it was unnecessary here. Authoritative-site queries, deterministic normalization and current Codex research kept measurable external cost at $0.

## Farm recommendation

Extract only three general seams after Miller North proves them in owner review:

1. `commitment_status` vocabulary plus source roles and dated evidence;
2. `formal_instrument` vocabulary plus binding/current-status fields;
3. an advisory `next_research_queries` generator driven by node type and missing evidence.

Keep the current private Miller tables. Revisit a graph abstraction only when at least two additional projects need cross-domain traversals that relational joins and materialized views cannot serve clearly.

Suggested next research screens are procurement/contract obligations, accreditation evidence, regulator discipline, and outcome/evaluation evidence. They should be added one at a time with owner-reviewed fixtures.
