# Miller product-readiness owner summary

Date: 2026-09-06
Status: private owner artifact; no production resource changes

## What changed

- Added height-aware companion fallbacks. Tablet landscape and very short desktop layouts now remove the decorative scene before it can compete with search, results, filters, or email controls.
- On moderately short wide screens, the dog is removed, Miller is reduced to a small static presence, and companion animation/switching is disabled.
- Made the Email My Results dialog internally scrollable on short viewports and kept its confirmation controls visible in a sticky footer.
- Reverified and manually reconciled a 19-record Fraser / Lower Mainland practical-support shortlist against current authoritative pages and existing Miller identities.
- Corrected the Alberta Employment Partnerships Program freshness state from open to closed because its stated September 1, 2026 deadline has passed.

## Exact layout issue

At 1280×600, the result companion dog extended left from the illustration rail into the result panel and could crowd the email-results control area. At 1024×768, the previous width-only tablet layout placed a tall companion scene ahead of the primary search experience. Both problems were caused by width-only responsive rules that did not account for reduced viewport height.

## Short-screen behavior

- 1024×768 landscape tablet: decorative hero scene hidden; full search/results experience retained.
- 1280×600 short desktop: decorative hero scene hidden; single content column retained.
- Wide viewports at 761px height or less: dog hidden; Miller reduced to 210×315 pixels and made static.
- 768×1024 portrait tablet and 390×844 phone: existing compact companion presentation retained because it does not overlap content.
- Standard desktop: existing visual treatment retained.

## Fraser / Lower Mainland practical supports

- Reverified shortlist: 19
- Already represented in Miller: 6
- Genuinely new candidates: 13
- Ready now or after a non-destructive source/copy update: 17
- Held for identity or current-program confirmation: 2

Category counts:

| Category | Records | Already in Miller | New candidates |
| --- | ---: | ---: | ---: |
| Housing | 4 | 4 | 0 |
| Employment | 4 | 0 | 4 |
| Training | 2 | 0 | 2 |
| ID | 1 | 0 | 1 |
| Income / benefits | 1 | 0 | 1 |
| Transportation | 2 | 0 | 2 |
| Advocacy / navigation | 4 | 2 | 2 |
| Basic needs | 1 | 0 | 1 |

The two held items are Fraserside Emergency Family Shelter, whose organization is current but whose program-specific public page was not located, and the existing SUSAT record, whose relationship to Fraser Health Access Central requires identity/successor reconciliation.

## Email My Results pilot readiness

The clinician workflow is implemented as:

search → select up to 15 approved resources → preview → enter one recipient → explicitly confirm → send

The generated message is resource-only. It excludes raw search text, diagnoses, substance-use details, private notes, candidates, and owner-review fields.

Delivery remains disabled until Resend is configured server-side. Minimal setup:

1. Add and verify a sending domain in Resend, including the required DNS records.
2. Choose a privacy-safe sender on that verified domain.
3. Create a restricted Resend API key.
4. Add these Render environment variables:
   - `MILLER_EMAIL_PROVIDER=resend`
   - `MILLER_EMAIL_FROM=Miller Resources <resources@verified-domain.example>`
   - `RESEND_API_KEY=<secret>`
5. Restart/redeploy, verify that the server reports email as enabled, and run one controlled non-sensitive delivery test.

Current safeguards include one recipient, a 15-result maximum, explicit confirmation, server-generated messages from approved structured results, safe escaping, and three attempts per IP/path per hour. The present limiter is process-local and is appropriate only for a small pilot.

## First Nations Funding & Assistance

All 41 records remain private and review-gated.

- Open/current: 3
- Recurring: 17
- Upcoming/periodic: 2
- Verify before applying: 17
- Stale, uncertain, or closed: 2

No funding opportunity was added to a public projection in this pass.

## Validation

- Focused tests: 14 passed, 0 failed
- ESLint: passed
- Production build: passed (existing large-chunk advisory only)
- JSON validation: passed for the 19-, 41-, and 66-record artifacts
- Secret/privacy scan: no secret or sensitive-data matches in the changed product-readiness files
- Responsive browser QA: passed at phone, tablet portrait, tablet landscape, short desktop, and standard desktop sizes
- Email modal QA: confirmation controls remained visible and the body scrolled internally on short screens
- Git diff check: passed

## Recommended next move

Configure a verified Resend sender in Render and run a controlled clinician pilot using five to ten non-sensitive existing Miller resources. Keep the 13 new practical-support candidates in normal owner review until their presentation copy and identities are approved.
