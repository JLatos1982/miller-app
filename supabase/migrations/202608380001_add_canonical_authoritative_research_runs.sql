begin;

create table public.canonical_authoritative_research_runs (
  id uuid primary key,
  operation text not null check (operation='canonical_authoritative_research_v1'),
  project_ref text not null check (project_ref='wccagykzugrahwugefqt'),
  authorized_max_attempts integer not null check (authorized_max_attempts between 1 and 50),
  attempted_count integer not null default 0 check (attempted_count>=0),
  evidence_success_count integer not null default 0 check (evidence_success_count>=0 and evidence_success_count<=authorized_max_attempts),
  failure_count integer not null default 0 check (failure_count>=0),
  status text not null default 'running' check (status in ('running','completed','stopped')),
  machine_actor text not null default 'miller_map_automation' check(machine_actor='miller_map_automation'),
  actor_id uuid not null references auth.users(id), created_at timestamptz not null default now(), resumed_at timestamptz, completed_at timestamptz
);
create table public.canonical_authoritative_research_run_items (
  run_id uuid not null references public.canonical_authoritative_research_runs(id) on delete restrict,
  resource_id uuid not null references public.resource_registry(id) on delete restrict,
  outcome text not null check(outcome in ('reserved','confirmed','conflict','insufficient','protected','failed')),
  reason_code text not null, claim_id uuid references public.resource_fact_claims(id) on delete restrict,
  evidence_id uuid references public.resource_fact_evidence(id) on delete restrict,
  attempted_at timestamptz not null default now(), completed_at timestamptz,
  primary key(run_id,resource_id)
);
alter table public.canonical_authoritative_research_runs enable row level security;
alter table public.canonical_authoritative_research_run_items enable row level security;
revoke all on public.canonical_authoritative_research_runs,public.canonical_authoritative_research_run_items from public,anon,authenticated;
grant select,insert,update on public.canonical_authoritative_research_runs,public.canonical_authoritative_research_run_items to service_role;

create or replace function public.begin_canonical_authoritative_research_run(p_run_id uuid,p_authorized_max_attempts integer,p_actor_id uuid)
returns public.canonical_authoritative_research_runs language plpgsql security definer set search_path=public as $$
declare v public.canonical_authoritative_research_runs;
begin
 if p_authorized_max_attempts not between 1 and 50 then raise exception 'research cap must be between 1 and 50'; end if;
 select * into v from public.canonical_authoritative_research_runs where id=p_run_id for update;
 if found then
   if v.project_ref<>'wccagykzugrahwugefqt' or v.operation<>'canonical_authoritative_research_v1' or v.authorized_max_attempts<>p_authorized_max_attempts then raise exception 'research run binding mismatch'; end if;
   if v.status<>'running' then raise exception 'completed or stopped run cannot resume'; end if;
   update public.canonical_authoritative_research_runs set resumed_at=now() where id=p_run_id returning * into v; return v;
 end if;
 insert into public.canonical_authoritative_research_runs(id,operation,project_ref,authorized_max_attempts,actor_id) values(p_run_id,'canonical_authoritative_research_v1','wccagykzugrahwugefqt',p_authorized_max_attempts,p_actor_id) returning * into v; return v;
end $$;

create or replace function public.complete_canonical_authoritative_research_run(p_run_id uuid,p_actor_id uuid)
returns public.canonical_authoritative_research_runs language plpgsql security definer set search_path=public as $$
declare v public.canonical_authoritative_research_runs;
begin select * into v from public.canonical_authoritative_research_runs where id=p_run_id for update; if not found then raise exception 'research run not found'; end if; if v.status='running' then update public.canonical_authoritative_research_runs set status='completed',completed_at=now(),actor_id=coalesce(actor_id,p_actor_id) where id=p_run_id returning * into v; end if; return v; end $$;

revoke all on function public.begin_canonical_authoritative_research_run(uuid,integer,uuid),public.complete_canonical_authoritative_research_run(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_canonical_authoritative_research_run(uuid,integer,uuid),public.complete_canonical_authoritative_research_run(uuid,uuid) to service_role;
commit;
