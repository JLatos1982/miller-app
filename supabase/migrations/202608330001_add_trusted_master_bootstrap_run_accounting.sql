begin;

create table public.trusted_master_bootstrap_runs (
  id uuid primary key,
  operation text not null check (operation = 'trusted_master_occupancy_bootstrap_v1'),
  project_ref text not null check (project_ref = 'wccagykzugrahwugefqt'),
  policy_version text not null check (policy_version = 'trusted_master_occupancy_v1'),
  authorized_max_successes integer not null check (authorized_max_successes between 1 and 50),
  attempted_count integer not null default 0 check (attempted_count >= 0),
  successful_count integer not null default 0 check (successful_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  status text not null default 'running' check (status in ('running','completed','stopped')),
  machine_actor text not null default 'miller_map_automation' check (machine_actor = 'miller_map_automation'),
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now(), started_at timestamptz not null default now(), resumed_at timestamptz,
  completed_at timestamptz, stopped_at timestamptz,
  check (successful_count <= authorized_max_successes)
);
create table public.trusted_master_bootstrap_run_items (
  run_id uuid not null references public.trusted_master_bootstrap_runs(id) on delete restrict,
  resource_id uuid not null references public.resource_registry(id) on delete restrict,
  source_record_id uuid not null references public.trusted_master_resource_records(id) on delete restrict,
  claim_id uuid references public.resource_fact_claims(id) on delete restrict,
  outcome text not null check (outcome in ('reserved','created','idempotent','failed','refused')),
  failure_code text,
  attempted_at timestamptz not null default now(), committed_at timestamptz,
  primary key (run_id, resource_id)
);
create index trusted_master_bootstrap_run_items_claim_idx on public.trusted_master_bootstrap_run_items(claim_id);
alter table public.trusted_master_bootstrap_runs enable row level security;
alter table public.trusted_master_bootstrap_run_items enable row level security;
revoke all on public.trusted_master_bootstrap_runs, public.trusted_master_bootstrap_run_items from public, anon, authenticated;
grant select, insert, update on public.trusted_master_bootstrap_runs, public.trusted_master_bootstrap_run_items to service_role;

create table public.trusted_master_bootstrap_reconciliations (
  id uuid primary key default gen_random_uuid(),
  operation text not null check (operation = 'trusted_master_occupancy_bootstrap_v1'),
  intended_authorized_max integer not null check (intended_authorized_max = 50),
  actual_successful_writes integer not null check (actual_successful_writes >= intended_authorized_max),
  cause text not null,
  corrective_policy_version text not null check (corrective_policy_version = 'trusted_master_bootstrap_run_accounting_v1'),
  no_public_location_consequence boolean not null,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (operation, corrective_policy_version)
);
alter table public.trusted_master_bootstrap_reconciliations enable row level security;
revoke all on public.trusted_master_bootstrap_reconciliations from public, anon, authenticated;
grant select, insert on public.trusted_master_bootstrap_reconciliations to service_role;

create or replace function public.begin_trusted_master_occupancy_bootstrap_run(
  p_run_id uuid, p_authorized_max_successes integer, p_actor_id uuid
) returns public.trusted_master_bootstrap_runs language plpgsql security definer set search_path=public as $$
declare v_run public.trusted_master_bootstrap_runs;
begin
  if p_authorized_max_successes not between 1 and 50 then raise exception 'authorized maximum must be between 1 and 50'; end if;
  select * into v_run from public.trusted_master_bootstrap_runs where id=p_run_id for update;
  if found then
    if v_run.operation <> 'trusted_master_occupancy_bootstrap_v1' or v_run.project_ref <> 'wccagykzugrahwugefqt' or v_run.policy_version <> 'trusted_master_occupancy_v1' or v_run.authorized_max_successes <> p_authorized_max_successes then raise exception 'run binding does not match existing authorization'; end if;
    if v_run.status <> 'running' then raise exception 'completed or stopped run cannot be restarted'; end if;
    update public.trusted_master_bootstrap_runs set resumed_at=now() where id=p_run_id returning * into v_run;
    return v_run;
  end if;
  insert into public.trusted_master_bootstrap_runs(id,operation,project_ref,policy_version,authorized_max_successes,actor_id)
    values(p_run_id,'trusted_master_occupancy_bootstrap_v1','wccagykzugrahwugefqt','trusted_master_occupancy_v1',p_authorized_max_successes,p_actor_id) returning * into v_run;
  return v_run;
end $$;

create or replace function public.create_occupancy_claim_from_trusted_master_run(
  p_run_id uuid, p_resource_id uuid, p_source_record_id uuid, p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_run public.trusted_master_bootstrap_runs; v_item public.trusted_master_bootstrap_run_items; v_result jsonb;
begin
  select * into v_run from public.trusted_master_bootstrap_runs where id=p_run_id for update;
  if not found then raise exception 'bootstrap run not found'; end if;
  if v_run.status <> 'running' then raise exception 'bootstrap run is not resumable'; end if;
  select * into v_item from public.trusted_master_bootstrap_run_items where run_id=p_run_id and resource_id=p_resource_id for update;
  if found and v_item.outcome in ('created','idempotent') then return jsonb_build_object('outcome','idempotent','claim_id',v_item.claim_id,'run_id',p_run_id); end if;
  if v_run.successful_count >= v_run.authorized_max_successes then
    insert into public.trusted_master_bootstrap_run_items(run_id,resource_id,source_record_id,outcome,failure_code)
      values(p_run_id,p_resource_id,p_source_record_id,'refused','authorized_success_cap_reached')
      on conflict (run_id,resource_id) do update set outcome='refused',failure_code='authorized_success_cap_reached',attempted_at=now();
    return jsonb_build_object('outcome','refused','reason_code','authorized_success_cap_reached','run_id',p_run_id);
  end if;
  insert into public.trusted_master_bootstrap_run_items(run_id,resource_id,source_record_id,outcome)
    values(p_run_id,p_resource_id,p_source_record_id,'reserved')
    on conflict (run_id,resource_id) do update set source_record_id=excluded.source_record_id,outcome='reserved',failure_code=null,attempted_at=now();
  update public.trusted_master_bootstrap_runs set attempted_count=attempted_count+1 where id=p_run_id;
  begin
    v_result := public.create_occupancy_claim_from_trusted_master_record(p_resource_id,p_source_record_id,p_actor_id);
    update public.trusted_master_bootstrap_run_items set outcome=case when v_result->>'outcome'='idempotent' then 'idempotent' else 'created' end,claim_id=(v_result->>'claim_id')::uuid,committed_at=now() where run_id=p_run_id and resource_id=p_resource_id;
    if v_result->>'outcome' = 'created' then update public.trusted_master_bootstrap_runs set successful_count=successful_count+1 where id=p_run_id; end if;
    return v_result || jsonb_build_object('run_id',p_run_id);
  exception when others then
    update public.trusted_master_bootstrap_run_items set outcome='failed',failure_code=left(SQLSTATE || ':' || SQLERRM,500) where run_id=p_run_id and resource_id=p_resource_id;
    update public.trusted_master_bootstrap_runs set failed_count=failed_count+1 where id=p_run_id;
    return jsonb_build_object('outcome','failed','reason_code',SQLSTATE,'run_id',p_run_id);
  end;
end $$;

create or replace function public.complete_trusted_master_occupancy_bootstrap_run(p_run_id uuid,p_actor_id uuid)
returns public.trusted_master_bootstrap_runs language plpgsql security definer set search_path=public as $$
declare v_run public.trusted_master_bootstrap_runs;
begin
  select * into v_run from public.trusted_master_bootstrap_runs where id=p_run_id for update;
  if not found then raise exception 'bootstrap run not found'; end if;
  if v_run.status <> 'running' then return v_run; end if;
  update public.trusted_master_bootstrap_runs set status='completed',completed_at=now(),actor_id=coalesce(actor_id,p_actor_id) where id=p_run_id returning * into v_run;
  return v_run;
end $$;

create or replace function public.reconcile_trusted_master_bootstrap_cap_failure(p_actor_id uuid)
returns public.trusted_master_bootstrap_reconciliations language plpgsql security definer set search_path=public as $$
declare v_actual integer; v_result public.trusted_master_bootstrap_reconciliations;
begin
  select count(*) into v_actual from public.resource_fact_claims where engine_version='trusted_master_occupancy_v1';
  if v_actual < 55 then raise exception 'existing over-cap cohort does not match expected reconciliation minimum'; end if;
  insert into public.trusted_master_bootstrap_reconciliations(operation,intended_authorized_max,actual_successful_writes,cause,corrective_policy_version,no_public_location_consequence,actor_id)
  values('trusted_master_occupancy_bootstrap_v1',50,v_actual,'Interrupted and resumed runner used invocation-local limits without durable run accounting.','trusted_master_bootstrap_run_accounting_v1',true,p_actor_id)
  on conflict (operation,corrective_policy_version) do nothing
  returning * into v_result;
  if not found then select * into v_result from public.trusted_master_bootstrap_reconciliations where operation='trusted_master_occupancy_bootstrap_v1' and corrective_policy_version='trusted_master_bootstrap_run_accounting_v1'; end if;
  return v_result;
end $$;

revoke all on function public.begin_trusted_master_occupancy_bootstrap_run(uuid,integer,uuid),public.create_occupancy_claim_from_trusted_master_run(uuid,uuid,uuid,uuid),public.complete_trusted_master_occupancy_bootstrap_run(uuid,uuid),public.reconcile_trusted_master_bootstrap_cap_failure(uuid) from public,anon,authenticated;
grant execute on function public.begin_trusted_master_occupancy_bootstrap_run(uuid,integer,uuid),public.create_occupancy_claim_from_trusted_master_run(uuid,uuid,uuid,uuid),public.complete_trusted_master_occupancy_bootstrap_run(uuid,uuid),public.reconcile_trusted_master_bootstrap_cap_failure(uuid) to service_role;
commit;
