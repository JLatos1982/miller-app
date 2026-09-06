# Miller Funding Listener — bounded operational design

Date: 2026-09-06
Status: private owner artifact

## Lifecycle

discovery → authoritative-source verification → identity deduplication → publication-safe candidate → publication gate → live record → scheduled source recheck → safe status update or owner review

The listener checks known authoritative program and application pages. It does not crawl broadly, submit applications, contact funders or infer that a missing page means a program ended.

## Status and cadence

| Public status | Display | Default check cadence |
| --- | --- | --- |
| `open` | Open now | Weekly; also shortly after a fixed deadline |
| `upcoming` | Opens soon | Weekly as the opening date approaches |
| `recurring` | Recurring intake | Monthly |
| `contact_to_confirm` | Contact to confirm availability | Monthly |
| `intake_unknown` | Intake status unclear | Monthly |
| `verify_before_applying` | Verify before applying | Monthly |
| `paused` | Paused | Quarterly |
| `closed` | Closed / watch for next intake | Quarterly |
| `archived` | Archived | Every six months or when a successor signal appears |

## Safe automatic updates

An automatic public-field update is permitted only when the authoritative source clearly supports it and record identity is stable:

- opening or deadline date;
- open/closed state;
- application URL;
- explicitly stated amount;
- last-verified and next-check dates.

Owner review remains required for material eligibility changes, changed applicant classes, ambiguous replacement/supersession, governance interpretation or changed program purpose.

## Change history

Store a bounded change record containing record ID, checked date, field changed, previous public value, new public value, source URL and whether owner review was required. Do not store applicant data or page-wide scraped content.

## Stopping and cost controls

- One authoritative program page and, where separate, one official intake/application page per scheduled check.
- No high-frequency crawling.
- Monthly broad discovery is a future bounded job, separate from known-record checks.
- A blocked page or ambiguous wording creates an owner-review item; it does not trigger repeated retries or an automatic status downgrade.
