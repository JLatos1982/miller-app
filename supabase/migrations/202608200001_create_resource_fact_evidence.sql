-- Local proposal only: durable evidence, exceptions, rollback history, and disabled automation controls.
create table if not exists public.resource_fact_claims (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid references public.resource_registry(id) on delete cascade,
  field_name text not null check (char_length(field_name) between 1 and 80),
  proposed_value jsonb,
  existing_value jsonb,
  risk text not null check (risk in ('low','medium','high')),
  recommendation text not null check (recommendation in ('auto_accept','accept_with_monitoring','human_review','reject','unknown')),
  confidence text not null check (confidence in ('high','bounded','unknown')),
  reason_codes text[] not null default '{}',
  engine_version text not null,
  status text not null default 'observed' check (status in ('observed','needs_review','accepted','rejected','unknown','superseded')),
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resource_fact_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.resource_fact_claims(id) on delete cascade,
  source_type text not null,
  source_record_id text,
  source_url text check (source_url is null or source_url ~ '^https://'),
  extracted_value jsonb,
  extraction_method text not null,
  retrieved_at timestamptz,
  source_authority integer not null check (source_authority between 0 and 100),
  independent_key text not null,
  stale boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.resource_fact_change_audit (
  id bigint generated always as identity primary key,
  claim_id uuid not null references public.resource_fact_claims(id),
  resource_id uuid references public.resource_registry(id),
  field_name text not null,
  previous_value jsonb,
  new_value jsonb,
  action text not null check (action in ('observe','accept','keep_existing','reject','mark_unknown','rollback')),
  reason_codes text[] not null default '{}',
  actor_type text not null check (actor_type in ('administrator','miller_automation','system')),
  actor_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.miller_automation_controls (
  id boolean primary key default true check (id),
  shadow_enabled boolean not null default true,
  observe_only boolean not null default true,
  low_risk_fact_updates_enabled boolean not null default false,
  routine_location_validation_enabled boolean not null default false,
  automatic_location_publication_enabled boolean not null default false,
  automatic_resource_publication_enabled boolean not null default false,
  maintenance_updates_enabled boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.miller_automation_controls (id) values (true) on conflict (id) do nothing;

create index if not exists resource_fact_claims_review_idx on public.resource_fact_claims (status, risk, created_at desc);
create index if not exists resource_fact_claims_resource_idx on public.resource_fact_claims (resource_id, field_name, created_at desc);
create index if not exists resource_fact_evidence_claim_idx on public.resource_fact_evidence (claim_id);
create index if not exists resource_fact_change_audit_resource_idx on public.resource_fact_change_audit (resource_id, field_name, created_at desc);

alter table public.resource_fact_claims enable row level security;
alter table public.resource_fact_evidence enable row level security;
alter table public.resource_fact_change_audit enable row level security;
alter table public.miller_automation_controls enable row level security;
revoke all on public.resource_fact_claims, public.resource_fact_evidence, public.resource_fact_change_audit, public.miller_automation_controls from anon, authenticated;

create or replace function public.prevent_resource_fact_audit_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'resource fact audit is append-only';
end $$;
drop trigger if exists resource_fact_audit_append_only on public.resource_fact_change_audit;
create trigger resource_fact_audit_append_only before update or delete on public.resource_fact_change_audit for each row execute function public.prevent_resource_fact_audit_mutation();
drop trigger if exists resource_fact_evidence_append_only on public.resource_fact_evidence;
create trigger resource_fact_evidence_append_only before update or delete on public.resource_fact_evidence for each row execute function public.prevent_resource_fact_audit_mutation();

create or replace function public.save_resource_fact_shadow_decision(
  p_claim_id uuid,
  p_expected_version integer,
  p_action text,
  p_actor_id uuid
) returns public.resource_fact_claims language plpgsql security definer set search_path = public as $$
declare v_claim public.resource_fact_claims; v_status text;
begin
  if p_action not in ('accept','keep_existing','reject','mark_unknown') then raise exception 'invalid action'; end if;
  select * into v_claim from public.resource_fact_claims where id = p_claim_id for update;
  if not found then raise exception 'claim not found'; end if;
  if v_claim.version <> p_expected_version then raise exception using errcode = '40001', message = 'shadow decision version conflict'; end if;
  v_status := case p_action when 'accept' then 'accepted' when 'reject' then 'rejected' when 'mark_unknown' then 'unknown' else 'superseded' end;
  insert into public.resource_fact_change_audit (claim_id,resource_id,field_name,previous_value,new_value,action,reason_codes,actor_type,actor_id)
    values (v_claim.id,v_claim.resource_id,v_claim.field_name,v_claim.existing_value,v_claim.proposed_value,p_action,v_claim.reason_codes,'administrator',p_actor_id);
  update public.resource_fact_claims set status=v_status,version=version+1,updated_at=now() where id=v_claim.id returning * into v_claim;
  return v_claim;
end $$;

revoke all on function public.prevent_resource_fact_audit_mutation() from public, anon, authenticated;
revoke all on function public.save_resource_fact_shadow_decision(uuid,integer,text,uuid) from public, anon, authenticated;
grant execute on function public.save_resource_fact_shadow_decision(uuid,integer,text,uuid) to service_role;
