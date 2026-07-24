begin;

-- DEPLOYMENT GATE:
-- Apply this migration only after the /api/events and
-- /api/resource-submissions endpoints are deployed and verified in production.
-- The application must no longer insert into either table from the browser.

drop policy if exists "Allow public inserts"
  on public.site_events;

drop policy if exists "Allow anon insert to resource_submissions"
  on public.resource_submissions;

commit;
