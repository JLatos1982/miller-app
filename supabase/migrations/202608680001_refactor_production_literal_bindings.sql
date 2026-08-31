begin;

-- These are typed, singleton operational bindings.  They are reference data,
-- not a general-purpose configuration surface, and may only be changed by a
-- reviewed schema/data migration owned by the database administrator.
create table public.miller_project_binding_v1 (
  binding_key text primary key check (binding_key = 'miller_project_binding_v1'),
  project_ref text not null unique check (project_ref ~ '^[a-z0-9]{20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.miller_resource_quality_reader_authorization_v1 (
  authorization_key text primary key check (authorization_key = 'miller_resource_quality_reader_authorization_v1'),
  reader_id uuid not null unique references auth.users(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (active)
);

-- The only production-bound values introduced here are governed row data.
insert into public.miller_project_binding_v1 (binding_key, project_ref)
values ('miller_project_binding_v1', 'wccagykzugrahwugefqt');

insert into public.miller_resource_quality_reader_authorization_v1 (authorization_key, reader_id)
values ('miller_resource_quality_reader_authorization_v1', 'f92a36ed-9af8-4fe5-be35-2fecb4d8e6a7');

alter table public.miller_project_binding_v1 enable row level security;
alter table public.miller_project_binding_v1 force row level security;
alter table public.miller_resource_quality_reader_authorization_v1 enable row level security;
alter table public.miller_resource_quality_reader_authorization_v1 force row level security;

revoke all on table public.miller_project_binding_v1 from public, anon, authenticated, service_role;
revoke all on table public.miller_resource_quality_reader_authorization_v1 from public, anon, authenticated, service_role;

create or replace function public.validate_miller_project_run_binding_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_project_ref text;
begin
  select project_ref
    into v_project_ref
    from public.miller_project_binding_v1
   where binding_key = 'miller_project_binding_v1';

  if not found then
    raise exception 'Miller project binding is not configured' using errcode = '23514';
  end if;

  if new.project_ref is distinct from v_project_ref then
    raise exception 'project_ref does not match Miller project binding' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_miller_project_run_binding_v1() from public, anon, authenticated, service_role;

alter table public.canonical_authoritative_research_runs
  drop constraint canonical_authoritative_research_runs_project_ref_check;
alter table public.map_auto_publication_runs
  drop constraint map_auto_publication_runs_project_ref_check;
alter table public.trusted_master_bootstrap_runs
  drop constraint trusted_master_bootstrap_runs_project_ref_check;

create trigger canonical_authoritative_research_runs_project_binding_v1
before insert or update of project_ref on public.canonical_authoritative_research_runs
for each row execute function public.validate_miller_project_run_binding_v1();

create trigger map_auto_publication_runs_project_binding_v1
before insert or update of project_ref on public.map_auto_publication_runs
for each row execute function public.validate_miller_project_run_binding_v1();

create trigger trusted_master_bootstrap_runs_project_binding_v1
before insert or update of project_ref on public.trusted_master_bootstrap_runs
for each row execute function public.validate_miller_project_run_binding_v1();

create or replace function public.begin_canonical_authoritative_research_run(p_run_id uuid,p_authorized_max_attempts integer,p_actor_id uuid)
returns public.canonical_authoritative_research_runs language plpgsql security definer set search_path=public as $$
declare v public.canonical_authoritative_research_runs; v_project_ref text;
begin
 if p_authorized_max_attempts not between 1 and 50 then raise exception 'research cap must be between 1 and 50'; end if;
 select project_ref into v_project_ref from public.miller_project_binding_v1 where binding_key='miller_project_binding_v1';
 if not found then raise exception 'Miller project binding is not configured'; end if;
 select * into v from public.canonical_authoritative_research_runs where id=p_run_id for update;
 if found then
   if v.project_ref<>v_project_ref or v.operation<>'canonical_authoritative_research_v1' or v.authorized_max_attempts<>p_authorized_max_attempts then raise exception 'research run binding mismatch'; end if;
   if v.status<>'running' then raise exception 'completed or stopped run cannot resume'; end if;
   update public.canonical_authoritative_research_runs set resumed_at=now() where id=p_run_id returning * into v; return v;
 end if;
 insert into public.canonical_authoritative_research_runs(id,operation,project_ref,authorized_max_attempts,actor_id) values(p_run_id,'canonical_authoritative_research_v1',v_project_ref,p_authorized_max_attempts,p_actor_id) returning * into v; return v;
end $$;

create or replace function public.begin_map_auto_publication_run(p_run_id uuid,p_authorized_max_successes integer,p_actor_id uuid) returns public.map_auto_publication_runs language plpgsql security definer set search_path=public as $$ declare v public.map_auto_publication_runs; v_project_ref text; begin
 if p_authorized_max_successes not between 1 and 23 then raise exception 'automatic publication cap must be between 1 and 23'; end if;
 select project_ref into v_project_ref from public.miller_project_binding_v1 where binding_key='miller_project_binding_v1';
 if not found then raise exception 'Miller project binding is not configured'; end if;
 select * into v from public.map_auto_publication_runs where id=p_run_id for update;
 if found then if v.project_ref<>v_project_ref or v.policy_version<>'map_auto_publish_v1' or v.authorized_max_successes<>p_authorized_max_successes then raise exception 'publication run binding mismatch'; end if; if v.status<>'running' then raise exception 'publication run is not resumable'; end if; update public.map_auto_publication_runs set resumed_at=now() where id=p_run_id returning * into v; return v; end if;
 insert into public.map_auto_publication_runs(id,operation,project_ref,policy_version,authorized_max_successes,actor_id) values(p_run_id,'map_auto_publish_v1_execution',v_project_ref,'map_auto_publish_v1',p_authorized_max_successes,p_actor_id) returning * into v; return v; end $$;

create or replace function public.begin_trusted_master_occupancy_bootstrap_run(
  p_run_id uuid, p_authorized_max_successes integer, p_actor_id uuid
) returns public.trusted_master_bootstrap_runs language plpgsql security definer set search_path=public as $$
declare v_run public.trusted_master_bootstrap_runs; v_project_ref text;
begin
  if p_authorized_max_successes not between 1 and 50 then raise exception 'authorized maximum must be between 1 and 50'; end if;
  select project_ref into v_project_ref from public.miller_project_binding_v1 where binding_key='miller_project_binding_v1';
  if not found then raise exception 'Miller project binding is not configured'; end if;
  select * into v_run from public.trusted_master_bootstrap_runs where id=p_run_id for update;
  if found then
    if v_run.operation <> 'trusted_master_occupancy_bootstrap_v1' or v_run.project_ref <> v_project_ref or v_run.policy_version <> 'trusted_master_occupancy_v1' or v_run.authorized_max_successes <> p_authorized_max_successes then raise exception 'run binding does not match existing authorization'; end if;
    if v_run.status <> 'running' then raise exception 'completed or stopped run cannot be restarted'; end if;
    update public.trusted_master_bootstrap_runs set resumed_at=now() where id=p_run_id returning * into v_run;
    return v_run;
  end if;
  insert into public.trusted_master_bootstrap_runs(id,operation,project_ref,policy_version,authorized_max_successes,actor_id)
    values(p_run_id,'trusted_master_occupancy_bootstrap_v1',v_project_ref,'trusted_master_occupancy_v1',p_authorized_max_successes,p_actor_id) returning * into v_run;
  return v_run;
end $$;

create or replace function public.is_miller_resource_quality_reader_v1()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.miller_resource_quality_reader_authorization_v1
     where authorization_key = 'miller_resource_quality_reader_authorization_v1'
       and active
       and reader_id = (select auth.uid())
  );
$$;

revoke all on function public.is_miller_resource_quality_reader_v1() from public, anon, service_role;
grant execute on function public.is_miller_resource_quality_reader_v1() to authenticated;

drop policy miller_resource_quality_reader_select on public.miller_resource_quality_v1;
create policy miller_resource_quality_reader_select on public.miller_resource_quality_v1
  for select to authenticated using ((select public.is_miller_resource_quality_reader_v1()));

drop policy miller_resource_quality_detail_reader_select on public.miller_resource_quality_detail_v1;
create policy miller_resource_quality_detail_reader_select on public.miller_resource_quality_detail_v1
  for select to authenticated using ((select public.is_miller_resource_quality_reader_v1()));

commit;
