# Accountability commitment model validation

Status: local fixture validation only; no database rows created

## Outcome

All **27** previously tracked recommendations and commitments are representable. One maps without date/scope normalization; 26 need deterministic normalization from free text to date text, responsibility arrays, controlled commitment type or implementation scope. None is rejected or structurally ambiguous. Seven retain owner review and four retain repeat-recommendation signals.

| Result | Count |
|---|---:|
| Cleanly compatible | 1 |
| Compatible after deterministic normalization | 26 |
| Ambiguous | 0 |
| Rejected | 0 |
| Owner review required | 7 |

## Model decisions

- A commitment belongs to one originating accountability action and carries the same chain ID.
- Responsible organizations are an array because joint responsibility is common.
- Evidence is a child table with roles for origin, acceptance, implementation, evaluation, repetition and supersession.
- An implementation claim has a status, evidence date/text, scope and evidence summary. Announcement is never converted to implementation.
- Repeated recommendations and supersession are optional self-links; the boolean supports fixture triage before a confident target is resolved.
- Original wording is optional and capped at 1,200 characters. Neutral summary is the required research field.
- Owner-review items cannot be publication-approved by the database constraint.
- Stable action IDs in artifacts require trusted resolution to the action table UUID before insertion. This prevents fixture text from masquerading as a database foreign key.

## Capability tests

- Multiple responsible organizations: supported and present.
- Multiple implementation sources/stages: supported and present.
- Repeated later recommendations: supported; four existing signals.
- Superseding commitments: supported; no fixture self-link is asserted without a resolved predecessor.
- Multiple distinct commitments per action: supported by a non-unique action foreign key and unique commitment stable ID/fingerprint.
- Anonymized patient matter: retained without patient, complainant, facility or worker identification.

No additional schema change is recommended before owner review.
