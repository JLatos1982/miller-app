begin;

-- One row is the durable, append-only authorization record for one stable
-- planner task.  It is deliberately not a general queue or scheduler.
create table public.planner_task_executions (
  id uuid primary key default gen_random_uuid(),
  task_id text not null unique,
  resource_id uuid not null references public.resource_registry(id) on delete restrict,
  claim_id uuid references public.resource_fact_claims(id) on delete restrict,
  task_type text not null check (task_type in ('resolve_authoritative_address_conflict','verify_programme_at_site','reconfirm_stale_authoritative_evidence')),
  actor_id uuid not null references auth.users(id),
  research_run_id uuid references public.canonical_authoritative_research_runs(id) on delete restrict,
  adapter text not null check (adapter='bounded_authoritative_web_research_v1'),
  status text not null default 'running' check (status in ('running','completed','stale_task','human_review','failed')),
  outcome text check (outcome in ('resolved','reduced','unchanged','human_review','stale_task','failed')),
  source_urls jsonb not null default '[]'::jsonb check (jsonb_typeof(source_urls)='array'),
  evidence_id uuid references public.resource_fact_evidence(id) on delete restrict,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.planner_task_executions enable row level security;
revoke all on public.planner_task_executions from public, anon, authenticated;
grant select, insert, update on public.planner_task_executions to service_role;
create trigger planner_task_executions_append_only before delete on public.planner_task_executions for each row execute function public.prevent_resource_fact_audit_mutation();

create or replace function public.begin_planner_task_execution_v1(
  p_task_id text, p_resource_id uuid, p_claim_id uuid, p_task_type text, p_actor_id uuid, p_research_run_id uuid
) returns public.planner_task_executions language plpgsql security definer set search_path=public as $$
declare v public.planner_task_executions;
begin
  if length(coalesce(p_task_id,'')) not between 1 and 500 or p_task_type not in ('resolve_authoritative_address_conflict','verify_programme_at_site','reconfirm_stale_authoritative_evidence') then raise exception 'invalid planner task binding'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_task_id, 400));
  select * into v from public.planner_task_executions where task_id=p_task_id for update;
  if found then
    if v.resource_id<>p_resource_id or v.claim_id is distinct from p_claim_id or v.task_type<>p_task_type then raise exception 'planner task identity mismatch'; end if;
    return v;
  end if;
  insert into public.planner_task_executions(task_id,resource_id,claim_id,task_type,actor_id,research_run_id,adapter)
    values(p_task_id,p_resource_id,p_claim_id,p_task_type,p_actor_id,p_research_run_id,'bounded_authoritative_web_research_v1') returning * into v;
  return v;
end $$;

create or replace function public.finish_planner_task_execution_v1(
  p_task_id text, p_status text, p_outcome text, p_source_urls jsonb, p_evidence_id uuid
) returns public.planner_task_executions language plpgsql security definer set search_path=public as $$
declare v public.planner_task_executions;
begin
  if p_status not in ('completed','stale_task','human_review','failed') or p_outcome not in ('resolved','reduced','unchanged','human_review','stale_task','failed') or jsonb_typeof(coalesce(p_source_urls,'[]'::jsonb))<>'array' then raise exception 'invalid planner execution result'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_task_id, 400));
  select * into v from public.planner_task_executions where task_id=p_task_id for update;
  if not found then raise exception 'planner execution not found'; end if;
  if v.status<>'running' then return v; end if;
  update public.planner_task_executions set status=p_status,outcome=p_outcome,source_urls=p_source_urls,evidence_id=p_evidence_id,completed_at=now() where id=v.id returning * into v;
  return v;
end $$;

revoke all on function public.begin_planner_task_execution_v1(text,uuid,uuid,text,uuid,uuid),public.finish_planner_task_execution_v1(text,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.begin_planner_task_execution_v1(text,uuid,uuid,text,uuid,uuid),public.finish_planner_task_execution_v1(text,text,text,jsonb,uuid) to service_role;
commit;
