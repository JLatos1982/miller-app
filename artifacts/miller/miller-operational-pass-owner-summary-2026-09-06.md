# Miller operational pass — owner summary

Date: 2026-09-06
Status: private owner artifact; publication-safe product changes deployed

## Deployment

Commit `3639793` (`Add practical supports and funding navigation`) was pushed to `main` and is live through the existing Render deployment at `https://miller-app.onrender.com`.

Verified live routes:

- `/practical-supports` — 17 publication-safe records
- `/funding-assistance` — 7 Miller funding/benefit records
- `/indigenous-healthcare-evidence/funding-assistance` — 22 high-confidence First Nations / Indigenous funding records

The deployed email preview is working and remains safely disabled until the server-side Resend configuration is complete. No browser console errors were observed on the checked live views.

## Email

The Email My Results backend, preview and privacy controls are ready. Resend is not enabled in the checked local or deployed environment: no provider, verified sender or API key is configured. The Resend and Render account pages required authentication, so domain verification and secret configuration could not be performed from the available session. No external test email was sent.

The server accepts one recipient and at most 15 server-authorized records, generates the message from structured public fields, omits raw search text and private fields, and uses a process-local limit of three attempts per IP/path per hour. Practical supports and public funding records are now supported by the server allowlist. Funding emails use a neutral subject and a funding-specific freshness disclaimer.

Activation requires a verified Resend domain and these server-only Render variables: `MILLER_EMAIL_PROVIDER`, `MILLER_EMAIL_FROM` and `RESEND_API_KEY`.

A controlled transport-level test packaged seven existing, non-sensitive Miller resources and verified the subject, result count, safe formatting, structured allowlist and private-field exclusions without retaining a recipient address.

## Practical Supports

- Browser-facing records: 17
- Existing Miller identities reused: 4
- Publication-safe projection records that do not mutate the canonical registry: 13
- Held back: 2
- Categories: housing, employment, training, ID, income/benefits, transportation, advocacy/navigation and basic needs

The held records remain Fraserside Emergency Family Shelter and the SUSAT/Access Central identity relationship. No canonical resources were inserted or duplicated.

## Funding & Assistance

- Miller general funding records displayed: 7
- First Nations / Indigenous high-confidence records displayed on Miller North: 22
- First Nations private benchmark records retained: 41
- Lower-confidence or interpretation-dependent First Nations records withheld: 19

Every public record includes an explicit status, official application/source link, last-verified date and next scheduled check. The first projection is intentionally smaller than the discovery target because current evidence quality, not quantity, determines publication.

## Recommended next move

Sign in to Resend and Render, verify the sending domain, add the three server-only environment variables, and designate one non-sensitive test inbox. Then run one real seven-resource delivery before inviting clinicians into the pilot.
