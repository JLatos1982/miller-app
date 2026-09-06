begin;
select plan(7);

select ok(to_regclass('public.miller_north_social_leads') is not null, 'private social lead table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.miller_north_social_leads'::regclass), 'social lead RLS is enabled');
select ok((select relforcerowsecurity from pg_class where oid = 'public.miller_north_social_leads'::regclass), 'social lead RLS is forced');
select ok(not has_table_privilege('anon', 'public.miller_north_social_leads', 'select'), 'anonymous cannot read social leads');
select ok(not has_table_privilege('authenticated', 'public.miller_north_social_leads', 'select'), 'ordinary authenticated users cannot read social leads');
select ok(has_table_privilege('service_role', 'public.miller_north_social_leads', 'select,insert,update,delete'), 'trusted service role can manage social leads');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'miller_north_social_leads'), 0, 'no direct browser RLS policies are created');

select * from finish();
rollback;
