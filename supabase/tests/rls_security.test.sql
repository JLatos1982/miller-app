begin;
select plan(24);

select ok(not has_table_privilege('anon', 'public.resource_fact_claims', 'select'), 'anonymous cannot read shadow claims');
select ok(not has_table_privilege('anon', 'public.resource_fact_evidence', 'select'), 'anonymous cannot read shadow evidence');
select ok(not has_table_privilege('anon', 'public.resource_fact_change_audit', 'select'), 'anonymous cannot read shadow audit');
select ok(not has_table_privilege('anon', 'public.miller_automation_controls', 'select'), 'anonymous cannot read automation controls');
select ok(not has_table_privilege('authenticated', 'public.resource_fact_claims', 'select'), 'ordinary user cannot read shadow claims');
select ok(not has_table_privilege('authenticated', 'public.resource_fact_evidence', 'insert'), 'ordinary user cannot write shadow evidence');
select ok(not has_table_privilege('authenticated', 'public.location_qc_review_audit', 'select'), 'ordinary user cannot read QC audit');
select ok(not has_table_privilege('authenticated', 'public.resource_locations', 'update'), 'ordinary user cannot mutate locations');
select ok(not has_table_privilege('anon', 'public.resource_registry', 'select'), 'anonymous cannot query canonical registry directly');
select ok(not has_table_privilege('anon', 'public.resource_source_aliases', 'select'), 'anonymous cannot query source aliases');
select ok(not has_table_privilege('anon', 'public.resource_discovery_candidates', 'select'), 'anonymous cannot read discovery candidates');
select ok(not has_table_privilege('anon', 'public.list_import_batches', 'select'), 'anonymous cannot read import batches');

select ok(has_table_privilege('service_role', 'public.resource_fact_claims', 'select,insert,update,delete'), 'service role can run shadow backend workflows');
select ok(has_table_privilege('service_role', 'public.resource_registry', 'select,insert,update,delete'), 'service role can run canonical backend workflows');
select ok(has_table_privilege('service_role', 'public.location_qc_reviews', 'select,insert,update,delete'), 'service role can run QC backend workflows');
select ok(has_table_privilege('service_role', 'public.resource_locations', 'select,insert,update,delete'), 'service role can run location backend workflows');

select ok(has_table_privilege('anon', 'public.tavily_resources', 'select'), 'anonymous has intended Tavily select grant');
select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='tavily_resources' and policyname='Public can read approved tavily resources'),
  1, 'approved and non-hidden Tavily read policy exists'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='tavily_resources' and policyname='Enable read access for all users'),
  0, 'legacy unrestricted Tavily policy was removed'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='site_events' and cmd='INSERT'),
  0, 'browser site-event insert policy was removed'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='resource_submissions' and cmd='INSERT'),
  0, 'browser submission insert policy was removed'
);

insert into public.tavily_resources (name, website, approved, hidden) overriding system value values
  ('Public Test Resource', 'https://public.example.invalid', true, false),
  ('Hidden Test Resource', 'https://hidden.example.invalid', true, true),
  ('Pending Test Resource', 'https://pending.example.invalid', false, false);
set local role anon;
select is((select count(*)::integer from public.tavily_resources), 1, 'anonymous sees only approved non-hidden Tavily data');
reset role;

select is((select count(*)::integer from storage.buckets where id in ('curated-list-sources','curated-list-documents')), 2, 'private curated-list storage buckets exist');
select ok((select bool_and(not public) from storage.buckets where id in ('curated-list-sources','curated-list-documents')), 'curated-list storage buckets are private');

select * from finish();
rollback;
