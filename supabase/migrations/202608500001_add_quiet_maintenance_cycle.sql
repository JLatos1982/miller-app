begin;

-- Quiet maintenance is deliberately separate from the existing maintenance-cycle
-- audit used by the bounded research planner.  It only regulates derived internal
-- working state; it has no foreign keys to public locations or publication tables.
create table public.miller_quiet_maintenance_runs (
  id uuid primary key default gen_random_uuid(),
  request_key text not null unique check (request_key ~ '^[a-f0-9]{64}$'),
  trigger_type text not null check (trigger_type in ('manual_admin','local_test')),
  mode text not null check (mode in ('local_manual','manual')),
  policy_version text not null default 'quiet-maintenance-v1',
  actor_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'running' check (status in ('running','completed','failed')),
  as_of timestamptz not null,
  inspected_counts jsonb not null default '{}'::jsonb,
  action_counts jsonb not null default '{}'::jsonb,
  carry_forward jsonb not null default '[]'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  failure_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check (jsonb_typeof(inspected_counts) = 'object'),
  check (jsonb_typeof(action_counts) = 'object'),
  check (jsonb_typeof(carry_forward) = 'array'),
  check (jsonb_typeof(result_summary) = 'object')
);
create unique index miller_quiet_maintenance_one_running_idx on public.miller_quiet_maintenance_runs ((status)) where status = 'running';

create table public.miller_quiet_maintenance_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.miller_quiet_maintenance_runs(id) on delete restrict,
  action_key text not null unique check (action_key ~ '^[a-f0-9]{64}$'),
  action_type text not null check (action_type in ('attention_regulated','hypothesis_expired','hypothesis_resolved','expired_aggregate_forgotten','duplicate_suppressed','integrity_finding')),
  target_kind text not null check (target_kind in ('attention_topic','coverage_hypothesis','need_bucket','workspace','system')),
  target_id text,
  reason_codes jsonb not null default '[]'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(reason_codes) = 'array'),
  check (jsonb_typeof(provenance) = 'object')
);
create index miller_quiet_maintenance_actions_run_idx on public.miller_quiet_maintenance_actions(run_id, created_at);

-- The previous reflection categories intentionally had no lifecycle vocabulary.
-- These remain private, deterministic summaries of derived internal state.
alter table public.miller_reflections drop constraint miller_reflections_category_check;
alter table public.miller_reflections add constraint miller_reflections_category_check check(category in ('new_learning','attention_increased','attention_decreased','attention_reactivated','uncertainty_resolved','uncertainty_reduced','persistent_uncertainty','emerging_theme','human_impact_concern','coverage_gap','sensor_degraded','research_method_observation','human_review_recommended','maintenance_regulation','maintenance_forgetting','maintenance_repair','maintenance_learning','maintenance_uncertainty'));

alter table public.miller_quiet_maintenance_runs enable row level security;
alter table public.miller_quiet_maintenance_actions enable row level security;
revoke all on public.miller_quiet_maintenance_runs, public.miller_quiet_maintenance_actions from public, anon, authenticated;
grant select, insert, update on public.miller_quiet_maintenance_runs to service_role;
grant select, insert on public.miller_quiet_maintenance_actions to service_role;
create trigger miller_quiet_maintenance_runs_no_delete before delete on public.miller_quiet_maintenance_runs for each row execute function public.prevent_resource_fact_audit_mutation();
create trigger miller_quiet_maintenance_actions_no_change before update or delete on public.miller_quiet_maintenance_actions for each row execute function public.prevent_resource_fact_audit_mutation();

create or replace function public.start_quiet_maintenance_cycle(
  p_request_key text,
  p_trigger_type text,
  p_mode text,
  p_actor_id uuid,
  p_as_of timestamptz
) returns public.miller_quiet_maintenance_runs language plpgsql security definer set search_path = public as $$
declare result public.miller_quiet_maintenance_runs;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  select * into result from public.miller_quiet_maintenance_runs where request_key = p_request_key;
  if found then return result; end if;
  insert into public.miller_quiet_maintenance_runs(request_key, trigger_type, mode, actor_id, as_of)
  values (p_request_key, p_trigger_type, p_mode, p_actor_id, p_as_of)
  returning * into result;
  return result;
exception when unique_violation then
  select * into result from public.miller_quiet_maintenance_runs where request_key = p_request_key;
  if found then return result; end if;
  raise;
end $$;

create or replace function public.fail_quiet_maintenance_cycle(p_run_id uuid, p_failure_code text)
returns public.miller_quiet_maintenance_runs language plpgsql security definer set search_path = public as $$
declare result public.miller_quiet_maintenance_runs;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  update public.miller_quiet_maintenance_runs set status = 'failed', failure_code = left(regexp_replace(coalesce(p_failure_code,'maintenance_failed'),'[^a-z0-9_-]','','g'),100), completed_at = now()
  where id = p_run_id and status = 'running' returning * into result;
  if not found then raise exception 'maintenance_cycle_not_running' using errcode = 'P0001'; end if;
  return result;
end $$;

create or replace function public.apply_quiet_maintenance_cycle(p_run_id uuid, p_plan jsonb)
returns public.miller_quiet_maintenance_runs language plpgsql security definer set search_path = public as $$
declare run_row public.miller_quiet_maintenance_runs; item jsonb; updated_count integer := 0; event_type text;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if jsonb_typeof(p_plan) <> 'object' then raise exception 'invalid_maintenance_plan' using errcode = '22023'; end if;
  select * into run_row from public.miller_quiet_maintenance_runs where id = p_run_id for update;
  if not found or run_row.status <> 'running' then raise exception 'maintenance_cycle_not_running' using errcode = 'P0001'; end if;

  for item in select * from jsonb_array_elements(coalesce(p_plan->'attention_updates','[]'::jsonb)) loop
    update public.miller_attention_topics set current_score = (item->>'next_score')::numeric, state = item->>'next_state', last_recalculated_at = run_row.as_of, version = version + 1
    where id = (item->>'topic_id')::uuid and version = (item->>'expected_version')::integer;
    get diagnostics updated_count = row_count;
    if updated_count <> 1 then raise exception 'stale_attention_plan' using errcode = '40001'; end if;
    event_type := case when (item->>'next_score')::numeric < (item->>'prior_score')::numeric then 'decayed' else 'recalculated' end;
    insert into public.miller_attention_topic_events(topic_id,event_type,prior_score,next_score,prior_state,next_state,reason_codes,provenance)
    values ((item->>'topic_id')::uuid,event_type,(item->>'prior_score')::numeric,(item->>'next_score')::numeric,item->>'prior_state',item->>'next_state',coalesce(item->'reason_codes','[]'::jsonb),jsonb_build_object('quiet_maintenance_run_id',p_run_id,'deterministic',true,'policy_version',run_row.policy_version));
    insert into public.miller_quiet_maintenance_actions(run_id,action_key,action_type,target_kind,target_id,reason_codes,provenance)
    values (p_run_id,item->>'action_key','attention_regulated','attention_topic',item->>'topic_id',coalesce(item->'reason_codes','[]'::jsonb),jsonb_build_object('deterministic',true,'policy_version',run_row.policy_version));
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_plan->'hypothesis_updates','[]'::jsonb)) loop
    if item->>'next_status' not in ('expired','resolved') then raise exception 'invalid_hypothesis_transition' using errcode = '22023'; end if;
    update public.miller_coverage_hypotheses set status = item->>'next_status', updated_at = run_row.as_of
    where id = (item->>'hypothesis_id')::uuid and status = item->>'expected_status';
    get diagnostics updated_count = row_count;
    if updated_count <> 1 then raise exception 'stale_hypothesis_plan' using errcode = '40001'; end if;
    insert into public.miller_quiet_maintenance_actions(run_id,action_key,action_type,target_kind,target_id,reason_codes,provenance)
    values (p_run_id,item->>'action_key',case when item->>'next_status' = 'expired' then 'hypothesis_expired' else 'hypothesis_resolved' end,'coverage_hypothesis',item->>'hypothesis_id',coalesce(item->'reason_codes','[]'::jsonb),jsonb_build_object('deterministic',true,'policy_version',run_row.policy_version));
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_plan->'expired_buckets','[]'::jsonb)) loop
    delete from public.miller_need_observation_buckets where bucket_key = item->>'bucket_key' and expires_at <= run_row.as_of;
    get diagnostics updated_count = row_count;
    if updated_count <> 1 then raise exception 'stale_bucket_plan' using errcode = '40001'; end if;
    insert into public.miller_quiet_maintenance_actions(run_id,action_key,action_type,target_kind,target_id,reason_codes,provenance)
    values (p_run_id,item->>'action_key','expired_aggregate_forgotten','need_bucket',item->>'bucket_key','["retention_expired","aggregate_only"]'::jsonb,jsonb_build_object('deterministic',true,'raw_query_retained',false));
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_plan->'integrity_findings','[]'::jsonb)) loop
    insert into public.miller_quiet_maintenance_actions(run_id,action_key,action_type,target_kind,target_id,reason_codes,provenance)
    values (p_run_id,item->>'action_key','integrity_finding','coverage_hypothesis',item->>'target_id',coalesce(item->'reason_codes','[]'::jsonb),jsonb_build_object('deterministic',true,'factual_mutation',false,'human_review_required',true));
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_plan->'reflections','[]'::jsonb)) loop
    insert into public.miller_reflections(reflection_key,category,topic_id,signal_ids,explanation,confidence,human_impact,recommendation)
    values (item->>'reflection_key',item->>'category',nullif(item->>'topic_id','')::uuid,coalesce(item->'signal_ids','[]'::jsonb),left(item->>'explanation',1000),(item->>'confidence')::numeric,item->>'human_impact',left(item->>'recommendation',1000))
    on conflict(reflection_key) do nothing;
  end loop;

  update public.miller_quiet_maintenance_runs set status = 'completed', inspected_counts = coalesce(p_plan->'inspected_counts','{}'::jsonb), action_counts = coalesce(p_plan->'action_counts','{}'::jsonb), carry_forward = coalesce(p_plan->'carry_forward','[]'::jsonb), result_summary = coalesce(p_plan->'result_summary','{}'::jsonb), completed_at = now()
  where id = p_run_id returning * into run_row;
  return run_row;
end $$;

revoke all on function public.start_quiet_maintenance_cycle(text,text,text,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.fail_quiet_maintenance_cycle(uuid,text) from public, anon, authenticated;
revoke all on function public.apply_quiet_maintenance_cycle(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.start_quiet_maintenance_cycle(text,text,text,uuid,timestamptz) to service_role;
grant execute on function public.fail_quiet_maintenance_cycle(uuid,text) to service_role;
grant execute on function public.apply_quiet_maintenance_cycle(uuid,jsonb) to service_role;
commit;
