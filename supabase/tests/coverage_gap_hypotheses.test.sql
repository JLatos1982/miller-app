begin;
select plan(5);
select has_table('public','miller_coverage_hypotheses','private coverage hypothesis table exists');
select ok(not has_table_privilege('anon','public.miller_coverage_hypotheses','select,insert,update,delete'),'anonymous callers cannot access hypotheses');
select ok(not has_table_privilege('authenticated','public.miller_coverage_hypotheses','select,insert,update,delete'),'ordinary callers cannot access hypotheses');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='miller_coverage_hypotheses' and column_name in ('query','session_id','user_id','ip_address')),'hypotheses have no raw-query or identifier columns');
select has_column('public','miller_coverage_hypotheses','uncertainty_reason','uncertainty is explicit');
select * from finish();
rollback;
