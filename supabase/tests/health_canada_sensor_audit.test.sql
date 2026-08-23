begin;
select plan(7);

select has_table('public', 'miller_sensor_inspections', 'Health Canada inspection audit table exists');
select has_column('public', 'miller_sensor_inspections', 'sensor_id', 'Audit binds a fixed sensor identity');
select col_is_pk('public', 'miller_sensor_inspections', 'id', 'Audit has immutable identity');
select policies_are('public', 'miller_sensor_inspections', array[]::name[], 'No browser-facing RLS policy exists');
select ok(not has_table_privilege('anon', 'public.miller_sensor_inspections', 'select,insert,update,delete'), 'Anonymous callers have no audit-table privilege');
select ok(not has_table_privilege('authenticated', 'public.miller_sensor_inspections', 'select,insert,update,delete'), 'Ordinary users have no audit-table privilege');
select throws_ok($$insert into public.miller_sensor_inspections(sensor_id, actor_id, health_state, outcome, stop_reason, parser_version) values ('other_sensor', gen_random_uuid(), 'healthy', 'healthy_no_relevant_change', 'fixture', 'v1')$$, '23514', null, 'Only the fixed Health Canada sensor can be audited here');

select * from finish();
rollback;
