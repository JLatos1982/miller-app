# Miller limited-launch security checklist

## Before deployment

- Keep `SITE_PASSWORD` configured. This milestone does not make the public site anonymous.
- In Supabase Auth, disable public user signup.
- Create or invite the single administrator directly from the Supabase dashboard.
- Use a strong unique administrator password and enable MFA when supported by the selected sign-in flow.
- Set `ADMIN_EMAIL_ALLOWLIST` on Render to the administrator's normalized email. Do not add this value to Netlify or the browser build.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, and `TAVILY_API_KEY` on Render only.
- Set `NODE_ENV=production`.
- If Netlify and Render use different origins, set `CORS_ALLOWED_ORIGINS` on Render to the exact HTTPS Netlify/custom-domain origin. Separate multiple origins with commas; do not use `*`.
- Confirm HTTPS is enforced on both hosting providers.
- Confirm Render runs one intended server entry point and that Netlify forwards API requests to it if Netlify serves the frontend.

## Supabase checks

The repository verifies that `ai_resource_reviews` has RLS enabled and grants no `anon` or `authenticated` access. Production policy inspection on 2026-07-23 identified and addressed a legacy unrestricted Tavily SELECT policy:

- Apply `202607230001_drop_broad_tavily_read_policy.sql` manually. It drops only `Enable read access for all users`.
- Keep `Public can read approved tavily resources`; it restricts browser reads to approved, non-hidden rows.
- `site_events` currently allows anonymous inserts. Public reads, updates, and deletes should remain denied.
- `resource_submissions` currently allows public inserts. Public reads, updates, and deletes should remain denied.

Do not restore a broad moderation-update policy for `anon` or `authenticated`. Approve, hide, and AI-review writes use the Express service-role client after server authorization.

### Planned INSERT-policy replacement

Browser inspection found these current direct writes:

- `site_events`: `page_view`, `search`, and `resource_click` events.
- `resource_submissions`: optional resource name, optional city, and a required note currently stored in `category`.

Both are suitable for rate-limited Express endpoints. Before removing either INSERT policy:

1. Add an event endpoint that accepts only the three known event types and their allow-listed fields, applies short string limits, and avoids storing free-text search queries unless explicitly retained.
2. Add a submission endpoint with a low per-IP rate limit, required-note validation, field length limits, and generic errors.
3. Switch every browser call to those endpoints and test failure handling.
4. Deploy and verify the server endpoints.
5. Apply a separate migration dropping only `Allow public inserts` and `Allow anon insert to resource_submissions`.

Until all five steps are complete, the existing INSERT policies remain direct database bypass paths around Express validation and rate limiting.

## Verification

1. Visit the site without the preview cookie; confirm `/` and `/admin/login` show the preview-password page.
2. Call `/api/miller` without the preview cookie; confirm HTTP 401.
3. Unlock the site and call `/api/admin/session` without a bearer token; confirm HTTP 401.
4. Sign in at `/admin/login` with a non-allowlisted Supabase account; confirm the same generic rejection message and no admin interface.
5. Sign in with the allowlisted account; confirm the queue loads and approve/hide/review work.
6. Remove the email from `ADMIN_EMAIL_ALLOWLIST`, redeploy, and confirm admin endpoints fail closed.
7. From an unlisted web origin, confirm API requests receive HTTP 403.
8. Review Render logs and confirm search questions, model output, tokens, and database rows are not logged.

## Rate-limit limitation

Current rate limits are stored in one Node process. They reset on restart and do not coordinate across multiple Render instances. Keep a single instance for the limited launch or add a shared limiter such as Redis before scaling horizontally or removing the site password.

## Later removal of the public password

Do not remove `SITE_PASSWORD` yet. After admin authentication and RLS are verified in production:

1. Change the site-access middleware so public pages and intended public APIs no longer require `miller_access`.
2. Keep every `/api/admin/*` route behind Supabase token verification and the server allowlist.
3. Retain strict rate limits on `/api/miller`, `/api/handout-card-draft`, and authentication attempts.
4. Re-test that draft/hidden rows, analytics, service-role operations, and admin UI are unavailable to ordinary visitors.
5. Monitor errors and abuse during a limited rollout.

Rollback: restore `SITE_PASSWORD`, deploy the previous known-good application version, revoke administrator sessions in Supabase, and rotate any credential suspected of exposure.

## Remaining privacy decisions

Miller currently stores full search queries in `site_events` and in `tavily_resources.original_query`. Before a broader launch, decide whether those fields are genuinely required, shorten their retention, and consider storing coarse categories instead of free text. Search text may contain sensitive personal information.
