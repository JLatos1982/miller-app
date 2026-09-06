# Legal & Government Research Branch — Design

Date: 2026-09-06
Status: private design; not a legal-advice system

## Purpose

The Legal & Government Research Branch is a bounded internal research capability for finding, normalizing, and relating public legal, regulatory, policy, oversight, funding, and implementation records. It serves Miller and Miller North through domain adapters while preserving separate subject datasets.

## Supported source classes

Legislation; regulation; orders and directives; government and health-authority policy; professional standards; regulator action; court and tribunal decisions; public settlements; coroner, death-review, inquest, audit, ombudsperson, commission, and inquiry reports; government responses; implementation plans; budget/funding commitments; and formal progress reports.

## Research pipeline

1. **Bounded question** — identify domain, jurisdiction, chain/object anchor, date window, allowed source classes, and query budget.
2. **Official-source discovery** — use the private open-government registry before general web discovery.
3. **Document classification** — preserve statute, regulation, policy, guidance, recommendation, announcement, decision, and implementation report as distinct types.
4. **Claim extraction** — extract who issued what, when, with what scope, authority, commitment, funding, and status.
5. **Relationship proposal** — create an evidence-bearing candidate edge; thematic similarity alone is insufficient.
6. **Forward/backward follow-up** — look backward for the trigger and forward for response, implementation, service, evaluation, amendment, or recurrence.
7. **Domain adapter** — connect to a Miller resource/service or a Miller North incident/cohort without changing either domain's underlying semantics.
8. **Owner synthesis** — rank review items, generate a short owner summary and a neutral research brief, and retain full traceability.

## Bounded questions

- What rule applies, and what authoritative text supports that classification?
- Is it binding, advisory, proposed, in force, repealed, or superseded?
- What changed and what formally amended or replaced it?
- What recommendation or incident preceded the response?
- What government or institution committed to do, fund, create, or report?
- What evidence shows administrative creation, operation, utilization, or evaluation?
- Which real service/resource or incident/cohort is connected by evidence?

## Relationship contract

Allowed shared relationship vocabulary includes `governed_by`, `funded_by`, `created_by`, `expanded_by`, `regulated_by`, `required_by`, `recommended_by`, `responds_to`, `implements`, `partially_implements`, `supersedes`, `amends`, `operationalizes`, `evaluated_by`, `audited_by`, `linked_to_resource`, `linked_to_incident`, and `linked_to_commitment`.

Every relationship proposal requires:

- source URL and organization;
- source role;
- neutral relationship summary;
- confidence;
- effective/evidence date where available;
- owner-review state;
- domain and endpoint IDs.

## Legal-safety rules

- Do not infer binding force from a title or announcement.
- Preserve complaint, allegation, investigation, finding, recommendation, commitment, law, and implementation as different claims.
- Do not offer legal advice or determine liability.
- Conflicting legal characterization, unresolved supersession, and rights/jurisdiction interpretation require owner review.
- Quote only bounded wording needed to identify an obligation; otherwise summarize neutrally.

## Operations

The branch should log query family, source family, discovery call, inspected document, extraction method, model/API use, stop reason, and measurable external cost. Crawls remain bounded and owner-reviewable.
