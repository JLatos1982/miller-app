begin;
select plan(12);

select ok(to_regclass('public.miller_north_incidents') is not null, 'private incident table exists');
select ok(to_regclass('public.miller_north_incident_sources') is not null, 'private incident source table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.miller_north_incidents'::regclass), 'incident RLS is enabled');
select ok((select relforcerowsecurity from pg_class where oid = 'public.miller_north_incidents'::regclass), 'incident RLS is forced');
select ok(not has_table_privilege('anon', 'public.miller_north_incidents', 'select'), 'anonymous cannot read incidents');
select ok(not has_table_privilege('authenticated', 'public.miller_north_incidents', 'select'), 'ordinary authenticated users cannot read incidents');
select ok(not has_table_privilege('anon', 'public.miller_north_incident_sources', 'select'), 'anonymous cannot read incident sources');
select ok(not has_table_privilege('authenticated', 'public.miller_north_incident_sources', 'insert'), 'ordinary authenticated users cannot write incident sources');
select ok(has_table_privilege('service_role', 'public.miller_north_incidents', 'select,insert,update,delete'), 'trusted service role can manage incidents');
select ok(has_table_privilege('service_role', 'public.miller_north_incident_sources', 'select,insert,update,delete'), 'trusted service role can manage incident sources');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename in ('miller_north_incidents', 'miller_north_incident_sources')), 0, 'no direct browser RLS policies are created');
select is((select count(*)::integer from information_schema.table_constraints where table_schema = 'public' and table_name = 'miller_north_incident_sources' and constraint_type = 'UNIQUE'), 1, 'source relationship deduplication constraint exists');

select * from finish();
rollback;
