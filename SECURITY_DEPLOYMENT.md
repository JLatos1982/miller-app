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

### INSERT-policy replacement deployment gate

Browser inspection found these current direct writes:

- `site_events`: `page_view`, `search`, and `resource_click` events.
- `resource_submissions`: optional resource name, optional city, and a required note currently stored in `category`.

The application now routes these through:

- `POST /api/events`: permits only `page_view`, `search`, and `resource_click`; 120 requests per IP per 10 minutes.
- `POST /api/resource-submissions`: requires a meaningful note and permits five requests per IP per hour.

Both endpoints reject unknown fields, enforce type and length limits, and use the server-side service-role client. Search text is no longer sent for analytics and the server explicitly stores `query = null`. This preserves counts, city, theme, pseudonymous session, and public-resource click measurement while giving up exact keyword reporting.

Do **not** apply `202607230002_drop_public_insert_policies_after_endpoint_verification.sql` merely because the code exists. It becomes safe only after all of the following production checks pass:

1. Deploy the updated Express server and frontend together.
2. Unlock the password-protected site and confirm page view, search, and resource-click requests reach `/api/events` with HTTP 202.
3. Submit a suggested resource and confirm `/api/resource-submissions` returns HTTP 201.
4. Confirm browser network traffic contains no direct `POST` to `/rest/v1/site_events` or `/rest/v1/resource_submissions`.
5. Confirm the new rows appear in Supabase and search-event `query` is null.
6. Confirm invalid and repeated requests receive HTTP 400 and 429 as appropriate.
7. Keep the deployment stable long enough to exercise each public workflow.

Only then apply the migration. Verify policy state afterward:

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('site_events', 'resource_submissions')
order by tablename, policyname;
```

The policies `Allow public inserts` and `Allow anon insert to resource_submissions` should be absent. The Express endpoints should continue working because service-role operations bypass RLS.

Rollback before applying the migration: redeploy the previous frontend and server. Rollback after applying it: prefer fixing or rolling back the Express deployment while leaving public INSERT blocked. Only if the old direct-write frontend must be restored temporarily, recreate the previous policies:

```sql
create policy "Allow public inserts"
  on public.site_events for insert to anon
  with check (true);

create policy "Allow anon insert to resource_submissions"
  on public.resource_submissions for insert to public
  with check (true);
```

These rollback policies reopen unvalidated direct database writes and should be removed again promptly.

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

Miller no longer sends full search queries to `site_events`; new search-event rows store `query = null`. Tavily discovery still stores the search text in `tavily_resources.original_query`. Before a broader launch, decide whether that field is genuinely required, shorten its retention, and consider storing coarse categories instead. Search text may contain sensitive personal information.
