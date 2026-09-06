# Miller North email reuse and “Request More Information” design

Date: 2026-09-06
Status: private product design note; no information request has been sent.

## Email reuse

The existing Miller Email Results path is suitable for publication-safe practical supports because it already provides explicit selection, preview, one-recipient confirmation, a 15-item maximum, server-side allowlisting, rate limiting, escaping, and provider-disabled fallback behaviour.

This pass reuses that path for the public First Nations Supports projection. The browser sends only stable public support identifiers. The server resolves those identifiers against the committed publication-safe projection before generating the message. Private records, arbitrary browser text, dossier notes, evidence workflow states, and owner-review fields cannot enter the email.

“Email me this dossier” and “Email me these sources” should remain future work. They need dedicated, typed public records and separate templates so a browser cannot submit arbitrary prose or URLs. A safe later design is:

public dossier/source identifier → server allowlist resolution → concise public-page link and approved source links → preview → explicit confirmation → existing send provider

The email must never contain more detail than the corresponding public page.

## Request More Information

Purpose: turn a documented public-reporting gap into a narrow draft request for aggregate institutional information. The feature should help a reader prepare text; it must not submit a request or collect complaint-level information.

### Proposed inputs

- approved public gap identifier
- public body likely to hold the records
- exact aggregate fields sought
- bounded date range
- public sources already checked
- suggested record category
- why the aggregate information would clarify the public record

The browser should not accept patient names, narratives, medical records, complaint identifiers, or free-form allegations.

### Safe workflow

approved public reporting gap → server-resolved request template → privacy and scope validation → reader preview → copy or download draft

No automatic email, portal submission, recipient lookup, or information-request filing should be included.

### Required safeguards

- Aggregate counts only by default.
- Minimum-cell or suppression language where small numbers could create re-identification risk.
- No patient, complainant, staff, or provider identities.
- No medical records or complaint files.
- A fixed, bounded date range and record category.
- Neutral wording that does not imply inactivity, wrongdoing, or legal non-compliance.
- Clear separation between a missing public metric and an assertion that the underlying activity did not occur.
- Owner/editorial review before a new gap template becomes available.

### Alberta example

A future approved template could ask the appropriate Alberta public body for annual aggregate counts associated specifically with the Indigenous Patient Safety Investigator and Advocate: contacts received, matters screened or accepted, reviews initiated and completed, referrals, recommendations, and recorded follow-up status. It should explicitly exclude names, narratives, case files, health information, and any small-cell breakdown that could identify a person.

The currently published figure of 321 correspondence items in 2025 must remain labelled as correspondence volume; it cannot be restated as complaints, accepted cases, investigations, completed reviews, recommendations, resolutions, or outcomes.
