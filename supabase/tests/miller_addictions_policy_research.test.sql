begin;
select plan(28);

select ok(to_regclass('public.miller_addictions_policy_chains') is not null, 'private policy chains table exists');
select ok(to_regclass('public.miller_addictions_policy_instruments') is not null, 'private policy instruments table exists');
select ok(to_regclass('public.miller_addictions_policy_instrument_sources') is not null, 'instrument source table exists');
select ok(to_regclass('public.miller_addictions_commitments') is not null, 'private commitments table exists');
select ok(to_regclass('public.miller_addictions_commitment_sources') is not null, 'commitment source table exists');
select ok(to_regclass('public.miller_addictions_policy_instrument_relations') is not null, 'instrument relation table exists');
select ok(to_regclass('public.miller_addictions_policy_resource_links') is not null, 'policy resource link table exists');

select ok((select relrowsecurity from pg_class where oid='public.miller_addictions_policy_instruments'::regclass), 'instrument RLS enabled');
select ok((select relforcerowsecurity from pg_class where oid='public.miller_addictions_policy_instruments'::regclass), 'instrument RLS forced');
select ok((select relrowsecurity from pg_class where oid='public.miller_addictions_commitments'::regclass), 'commitment RLS enabled');
select ok((select relforcerowsecurity from pg_class where oid='public.miller_addictions_commitments'::regclass), 'commitment RLS forced');
select ok((select relrowsecurity from pg_class where oid='public.miller_addictions_policy_resource_links'::regclass), 'resource-link RLS enabled');
select ok((select relforcerowsecurity from pg_class where oid='public.miller_addictions_policy_resource_links'::regclass), 'resource-link RLS forced');

select ok(not has_table_privilege('anon','public.miller_addictions_policy_instruments','select'), 'anonymous cannot read instruments');
select ok(not has_table_privilege('authenticated','public.miller_addictions_commitments','insert'), 'authenticated cannot write commitments');
select ok(not has_table_privilege('anon','public.miller_addictions_policy_resource_links','select'), 'anonymous cannot read resource links');
select ok(has_table_privilege('service_role','public.miller_addictions_policy_instruments','select,insert,update,delete'), 'service role manages instruments');
select ok(has_table_privilege('service_role','public.miller_addictions_commitments','select,insert,update,delete'), 'service role manages commitments');

select is((select count(*)::integer from pg_policies where schemaname='public' and tablename like 'miller_addictions_%'),0,'no browser policies exist');
select is((select count(*)::integer from public.miller_addictions_policy_instruments),0,'migration imports no policy candidates');
select is((select count(*)::integer from public.miller_addictions_commitments),0,'migration imports no commitments');
select is((select count(*)::integer from public.miller_addictions_policy_resource_links),0,'migration changes no Miller resources');
select is((select count(*)::integer from information_schema.table_constraints where table_schema='public' and table_name='miller_addictions_policy_instrument_sources' and constraint_type='UNIQUE'),1,'instrument sources deduplicate');
select is((select count(*)::integer from information_schema.table_constraints where table_schema='public' and table_name='miller_addictions_commitment_sources' and constraint_type='UNIQUE'),1,'commitment sources deduplicate');
select ok(exists(select 1 from pg_constraint where conrelid='public.miller_addictions_policy_instruments'::regclass and pg_get_constraintdef(oid) like '%research_domain%'), 'instrument domain constrained');
select ok(exists(select 1 from pg_constraint where conrelid='public.miller_addictions_commitments'::regclass and pg_get_constraintdef(oid) like '%approved_for_publication%'), 'commitment review gate blocks approval');
select ok(exists(select 1 from pg_constraint where conrelid='public.miller_addictions_policy_resource_links'::regclass and pg_get_constraintdef(oid) like '%exact_candidate%'), 'exact resource match requires canonical id');
select ok(exists(select 1 from pg_constraint where conrelid='public.miller_addictions_policy_instrument_relations'::regclass and pg_get_constraintdef(oid) like '%from_policy_instrument_id <> to_policy_instrument_id%'), 'instrument cannot self-link');

select * from finish();
rollback;
