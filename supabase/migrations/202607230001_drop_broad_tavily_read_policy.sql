begin;

-- Remove only the legacy unrestricted SELECT policy. The narrower
-- "Public can read approved tavily resources" policy remains in place and
-- continues to require approved = true and hidden = false.
drop policy if exists "Enable read access for all users"
  on public.tavily_resources;

commit;
