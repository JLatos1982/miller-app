# Email My Results clinician-pilot setup

The user interface, server validation, deterministic message generator, selection limits, rate limit, and provider adapter are implemented. Sending remains disabled until all server-side settings below are configured in the deployment environment:

- `MILLER_EMAIL_PROVIDER=resend`
- `MILLER_EMAIL_FROM` set to a verified sender identity
- `RESEND_API_KEY` set only on the server/deployment environment

No credential belongs in Vite/browser variables. The status endpoint reports only whether delivery is enabled; it never returns credentials or sender configuration.

V1 limits:

- one recipient
- no more than 15 curated Miller resources
- three send attempts per IP/path per hour in the current process-local limiter
- no user-supplied subject, headers, HTML, or message body
- no raw search query in the message
- no database logging or long-term recipient storage

## Minimal Resend enablement checklist

1. In Resend, add a sending domain controlled by the owner. Copy the exact DKIM, SPF, and MX records Resend provides into that domain's DNS and wait for Resend to show the domain as verified.
2. Choose a privacy-safe sender on that verified domain, preferably one that can receive replies, for example `Miller Resources <resources@verified-domain.example>`.
3. Create a Resend API key for this deployment. Keep it only in Render; do not put it in a Vite variable, browser code, repository file, screenshot, or research artifact.
4. In the existing Render service environment, add exactly:
   - `MILLER_EMAIL_PROVIDER=resend`
   - `MILLER_EMAIL_FROM=Miller Resources <resources@verified-domain.example>`
   - `RESEND_API_KEY=<the server-side Resend key>`
5. Redeploy or restart the existing service so the server receives the new environment values.
6. Confirm `GET /api/email-results/status` returns `enabled: true`; it must not reveal the key or sender value.
7. Run a controlled delivery check to an owner/clinician test inbox using non-sensitive resource selections. Verify sender authentication, plain-text and HTML rendering, phone numbers, links, and failure behaviour.
8. Review Resend's retention/privacy terms before using real recipient addresses. The Miller application does not persist recipient addresses or email bodies, but the delivery provider necessarily processes them.
9. Keep the initial pilot to one Render instance or add a shared rate limiter before scaling. The current three-attempts-per-IP/path-per-hour limit is process-local.

Resend currently requires a verified domain to send beyond the account owner's test address. Domain verification establishes SPF and DKIM; DMARC is a recommended follow-up but is not required by this implementation.

## Tiny clinician pilot

1. Search for the client's practical need and location.
2. Open **Email these results**.
3. Select no more than 15 curated resources and review the preview.
4. Enter one recipient address and explicitly choose **Send email**.
5. Confirm delivery with the recipient during the pilot and note only operational failure categories—not the address or message body.

The email contains structured resource information only. It excludes raw search text, diagnoses, substance-use details, private notes, candidate records, and Miller North private fields.
