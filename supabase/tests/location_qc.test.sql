begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select has_table('public', 'location_qc_reviews', 'QC decision table exists');
select has_table('public', 'location_qc_review_audit', 'QC audit table exists');
select has_function(
  'public', 'save_location_qc_review_decision',
  array['uuid','text','text','text','text','jsonb','integer','uuid'],
  'QC decision RPC exists'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'local-qc-admin@example.invalid', '',
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.resource_registry (id, display_name, lifecycle_state, editorial_status) values
  ('00000000-0000-0000-0000-000000000101', 'Pending Clinic', 'active', 'pending'),
  ('00000000-0000-0000-0000-000000000102', 'Approved Clinic', 'active', 'approved'),
  ('00000000-0000-0000-0000-000000000103', 'Hidden Clinic', 'active', 'hidden'),
  ('00000000-0000-0000-0000-000000000104', 'Retired Clinic', 'retired', 'pending'),
  ('00000000-0000-0000-0000-000000000105', 'Confidential Program', 'active', 'pending');

select is(
  (public.save_location_qc_review_decision(
    '00000000-0000-0000-0000-000000000101', 'local-v1', repeat('a',64),
    'pilot_eligible', 'pending private QC', '{"public_map":false}'::jsonb,
    0, '00000000-0000-0000-0000-000000000010'
  )).version,
  1, 'active pending resource can receive private QC'
);
select is(
  (public.save_location_qc_review_decision(
    '00000000-0000-0000-0000-000000000102', 'local-v1', repeat('b',64),
    'manual_review', 'approved private QC', '{"public_map":false}'::jsonb,
    0, '00000000-0000-0000-0000-000000000010'
  )).version,
  1, 'active approved resource can receive private QC'
);
select is(
  (public.save_location_qc_review_decision(
    '00000000-0000-0000-0000-000000000105', 'local-v1', repeat('c',64),
    'exclude_exact_location', 'confidential address remains excluded', '{"sensitive":true,"public_map":false}'::jsonb,
    0, '00000000-0000-0000-0000-000000000010'
  )).decision,
  'exclude_exact_location', 'sensitive resource can record a private exclusion decision'
);

select throws_ok(
  $$select public.save_location_qc_review_decision(
    '00000000-0000-0000-0000-000000000103', 'local-v1', repeat('d',64),
    'defer', '', '{}'::jsonb, 0, '00000000-0000-0000-0000-000000000010')$$,
  'P0001', 'canonical resource is not eligible', 'hidden resource fails closed'
);
select throws_ok(
  $$select public.save_location_qc_review_decision(
    '00000000-0000-0000-0000-000000000104', 'local-v1', repeat('e',64),
    'defer', '', '{}'::jsonb, 0, '00000000-0000-0000-0000-000000000010')$$,
  'P0001', 'canonical resource is not eligible', 'inactive resource fails closed'
);
select throws_ok(
  $$select public.save_location_qc_review_decision(
    '00000000-0000-0000-0000-000000000101', 'local-v1', repeat('f',64),
    'publish', '', '{}'::jsonb, 1, '00000000-0000-0000-0000-000000000010')$$,
  'P0001', 'invalid decision', 'publication is not a valid QC decision'
);
select throws_ok(
  $$select public.save_location_qc_review_decision(
    '00000000-0000-0000-0000-000000000101', 'local-v1', repeat('f',64),
    'manual_review', '', '{}'::jsonb, 0, '00000000-0000-0000-0000-000000000010')$$,
  'PT409', 'review version conflict', 'stale version fails immediately as an RPC conflict'
);
select is(
  (public.save_location_qc_review_decision(
    '00000000-0000-0000-0000-000000000101', 'local-v1', repeat('f',64),
    'manual_review', 'version two', '{"public_map":false}'::jsonb,
    1, '00000000-0000-0000-0000-000000000010'
  )).version,
  2, 'current version can be updated'
);
select is((select count(*)::integer from public.location_qc_review_audit where canonical_resource_id = '00000000-0000-0000-0000-000000000101'), 2, 'each successful decision appends audit');
select throws_ok(
  $$update public.location_qc_review_audit set decision_note = 'mutated' where canonical_resource_id = '00000000-0000-0000-0000-000000000101'$$,
  'P0001', 'location QC audit is append-only', 'audit rows cannot be updated'
);
select throws_ok(
  $$delete from public.location_qc_review_audit where canonical_resource_id = '00000000-0000-0000-0000-000000000101'$$,
  'P0001', 'location QC audit is append-only', 'audit rows cannot be deleted'
);

select ok(not has_table_privilege('anon', 'public.location_qc_reviews', 'select'), 'anonymous role has no QC read grant');
select ok(not has_table_privilege('anon', 'public.location_qc_reviews', 'insert'), 'anonymous role has no QC write grant');
select ok(not has_table_privilege('authenticated', 'public.location_qc_reviews', 'select'), 'ordinary authenticated role has no QC read grant');
select ok(not has_table_privilege('authenticated', 'public.location_qc_reviews', 'insert'), 'ordinary authenticated role has no QC write grant');
select ok(not has_function_privilege('anon', 'public.save_location_qc_review_decision(uuid,text,text,text,text,jsonb,integer,uuid)', 'execute'), 'anonymous role cannot execute QC RPC');
select ok(not has_function_privilege('authenticated', 'public.save_location_qc_review_decision(uuid,text,text,text,text,jsonb,integer,uuid)', 'execute'), 'ordinary authenticated role cannot execute QC RPC');
select ok(has_function_privilege('service_role', 'public.save_location_qc_review_decision(uuid,text,text,text,text,jsonb,integer,uuid)', 'execute'), 'service role can execute QC RPC');
select is((select count(*)::integer from public.resource_locations), 0, 'QC creates no location rows');
select is((select count(*)::integer from public.resource_locations where public_map), 0, 'QC creates no public map rows');
select is((select count(*)::integer from public.location_qc_reviews where canonical_resource_id in (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000104',
  '00000000-0000-0000-0000-000000000105'
)), 3, 'only eligible private QC fixture rows were created');

select * from finish();
rollback;
