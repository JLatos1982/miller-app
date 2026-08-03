# Miller public-launch security checklist

## Before deployment

- Remove `SITE_PASSWORD` from Render; the application no longer reads it and has no preview-password route or cookie.
- In Supabase Auth, disable public user signup.
- Create or invite the single administrator directly from the Supabase dashboard.
- Use a strong unique administrator password and enable MFA when supported by the selected sign-in flow.
- Set `ADMIN_EMAIL_ALLOWLIST` on Render to the administrator's normalized email. Do not add this value to Netlify or the browser build.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, and `TAVILY_API_KEY` on Render only.
- Set `NODE_ENV=production`.
- Set `MILLER_RATE_LIMIT_PER_MINUTE=8`, `PAID_OPERATIONS_DAILY_LIMIT=500`, and `PROVIDER_TIMEOUT_MS=20000` initially. Adjust from observed legitimate use, not by weakening admin controls.
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
2. Open the public site and confirm page view, search, and resource-click requests reach `/api/events` with HTTP 202.
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

1. Visit `/` in a private browser session and confirm the public site loads without a password.
2. Run an ordinary search and confirm `/api/miller` accepts a valid request without authentication.
3. Call `/api/admin/session` without a bearer token; confirm HTTP 401.
4. Sign in at `/admin/login` with a non-allowlisted Supabase account; confirm the same generic rejection message and no admin interface.
5. Sign in with the allowlisted account; confirm the queue loads and approve/hide/review work.
6. Remove the email from `ADMIN_EMAIL_ALLOWLIST`, redeploy, and confirm admin endpoints fail closed.
7. From an unlisted web origin, confirm API requests receive HTTP 403.
8. Review Render logs and confirm search questions, model output, tokens, and database rows are not logged.

## Public endpoint classification

- Safe public read: static application assets and SPA routes. Browser reads from `tavily_resources` remain governed by Supabase RLS and must return only `approved = true AND hidden = false` rows.
- Controlled public write: `POST /api/events` (validated analytics; 120/IP/10 minutes) and `POST /api/resource-submissions` (validated suggestions; 5/IP/hour).
- Paid public operation: `POST /api/miller` (strict schema and 128 KB global JSON limit; default 8/IP and session/minute; default 500 operations/day; provider timeout). Raw queries are not written to analytics or new Tavily review rows.
- Authenticated administrator actions: `GET /api/admin/session`, `GET /api/admin/tavily-resources`, `PATCH /api/admin/tavily-resources/:id`, and both AI-review routes. Every route validates a Supabase bearer token and the server-only administrator email allowlist. Paid AI review is additionally rate-limited.

The removed `/api/handout-card-draft` route had no remaining frontend caller and would have exposed an unnecessary paid operation. Handout printing and HTML download remain browser-local.

## Rate-limit limitation

Rate limits and the daily counter are stored in one Node process. They reset on restart and do not coordinate across multiple Render instances. Keep one Render instance for the initial launch. Before horizontal scaling, use a shared store such as managed Redis. No response cache stores sensitive search text; this intentionally favors privacy over caching repeated personal queries.

## Browser security and indexing

Responses set CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict referrer and permissions policies, COOP, and production HSTS. CSP permits same-origin scripts/assets, data/blob images used by the UI, inline styles required by generated presentation, and the configured Supabase origin for browser authentication/data reads. CORS accepts same-origin requests, exact origins in `CORS_ALLOWED_ORIGINS`, and local origins outside production; it never uses `*`.

There is no `noindex`, `robots.txt`, canonical tag, or hard-coded Render URL. Search engines are therefore currently permitted to index the public site. Add a canonical URL when the permanent domain is chosen; do not guess one before then. `robots.txt` is not an access control.

## Remaining privacy decisions

Miller does not send full search queries to `site_events`; search-event rows store `query = null`. New Tavily discovery rows also store `original_query = null`. Existing historical values require a separate retention decision and are not modified by this deployment.

## Production RLS verification

Repository migrations cannot prove live policy state. Run this in Supabase before launch and confirm only the intended approved-resource SELECT policy remains for anonymous/authenticated users:

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('tavily_resources', 'ai_resource_reviews', 'site_events', 'resource_submissions')
order by tablename, policyname;

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('tavily_resources', 'ai_resource_reviews', 'site_events', 'resource_submissions');

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in ('tavily_resources', 'ai_resource_reviews', 'site_events', 'resource_submissions')
order by table_name, grantee, privilege_type;
```
