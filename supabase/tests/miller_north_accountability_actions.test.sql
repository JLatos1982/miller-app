begin;
select plan(21);

select ok(to_regclass('public.miller_north_accountability_actions') is not null, 'private accountability actions table exists');
select ok(to_regclass('public.miller_north_accountability_cohorts') is not null, 'private accountability cohorts table exists');
select ok(to_regclass('public.miller_north_accountability_action_sources') is not null, 'action source table exists');
select ok(to_regclass('public.miller_north_accountability_action_incident_links') is not null, 'action incident junction exists');
select ok(to_regclass('public.miller_north_accountability_action_cohort_links') is not null, 'action cohort junction exists');
select ok((select relrowsecurity from pg_class where oid = 'public.miller_north_accountability_actions'::regclass), 'action RLS is enabled');
select ok((select relforcerowsecurity from pg_class where oid = 'public.miller_north_accountability_actions'::regclass), 'action RLS is forced');
select ok((select relrowsecurity from pg_class where oid = 'public.miller_north_accountability_action_sources'::regclass), 'source RLS is enabled');
select ok((select relforcerowsecurity from pg_class where oid = 'public.miller_north_accountability_action_incident_links'::regclass), 'incident-link RLS is forced');
select ok(not has_table_privilege('anon', 'public.miller_north_accountability_actions', 'select'), 'anonymous cannot read actions');
select ok(not has_table_privilege('authenticated', 'public.miller_north_accountability_actions', 'insert'), 'ordinary authenticated users cannot write actions');
select ok(not has_table_privilege('anon', 'public.miller_north_accountability_action_sources', 'select'), 'anonymous cannot read action sources');
select ok(not has_table_privilege('authenticated', 'public.miller_north_accountability_action_incident_links', 'insert'), 'ordinary authenticated users cannot write action links');
select ok(has_table_privilege('service_role', 'public.miller_north_accountability_actions', 'select,insert,update,delete'), 'trusted service role can manage actions');
select ok(has_table_privilege('service_role', 'public.miller_north_accountability_cohorts', 'select,insert,update,delete'), 'trusted service role can manage cohorts');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename in ('miller_north_accountability_actions', 'miller_north_accountability_cohorts', 'miller_north_accountability_action_sources', 'miller_north_accountability_action_incident_links', 'miller_north_accountability_action_cohort_links')), 0, 'no browser RLS policies are created');
select is((select count(*)::integer from information_schema.table_constraints where table_schema = 'public' and table_name = 'miller_north_accountability_action_sources' and constraint_type = 'UNIQUE'), 1, 'action source URL deduplication constraint exists');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.miller_north_accountability_actions'::regclass and lower(pg_get_constraintdef(oid)) like '%action_type = any%'), 'action type is constrained');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.miller_north_accountability_actions'::regclass and lower(pg_get_constraintdef(oid)) like '%accountability_stage = any%'), 'stage is constrained');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.miller_north_accountability_actions'::regclass and pg_get_constraintdef(oid) like '%owner_review_reason%'), 'owner review reason is constrained');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.miller_north_accountability_actions'::regclass and pg_get_constraintdef(oid) like '%approved_for_publication%'), 'owner review blocks publication approval');

select * from finish();
rollback;
