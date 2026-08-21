begin;

alter table public.resource_fact_claims
  add column if not exists version integer;

update public.resource_fact_claims
set version = 0
where version is null;

alter table public.resource_fact_claims
  alter column version set default 0,
  alter column version set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.resource_fact_claims'::regclass
      and conname = 'resource_fact_claims_version_check'
  ) then
    alter table public.resource_fact_claims
      add constraint resource_fact_claims_version_check check (version >= 0);
  end if;
end
$$;

alter table public.miller_automation_controls
  add column if not exists shadow_enabled boolean,
  add column if not exists automatic_location_publication_enabled boolean,
  add column if not exists automatic_resource_publication_enabled boolean;

update public.miller_automation_controls
set
  shadow_enabled = true,
  observe_only = true,
  low_risk_fact_updates_enabled = false,
  routine_location_validation_enabled = false,
  automatic_location_publication_enabled = false,
  automatic_resource_publication_enabled = false,
  maintenance_updates_enabled = false;

alter table public.miller_automation_controls
  alter column shadow_enabled set default true,
  alter column shadow_enabled set not null,
  alter column automatic_location_publication_enabled set default false,
  alter column automatic_location_publication_enabled set not null,
  alter column automatic_resource_publication_enabled set default false,
  alter column automatic_resource_publication_enabled set not null;

create or replace function public.save_resource_fact_shadow_decision(
  p_claim_id uuid,
  p_expected_version integer,
  p_action text,
  p_actor_id uuid
) returns public.resource_fact_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.resource_fact_claims;
  v_status text;
begin
  if p_action not in ('accept','keep_existing','reject','mark_unknown') then
    raise exception 'invalid action';
  end if;

  select * into v_claim
  from public.resource_fact_claims
  where id = p_claim_id
  for update;

  if not found then
    raise exception 'claim not found';
  end if;

  if v_claim.version <> p_expected_version then
    raise exception using
      errcode = '40001',
      message = 'shadow decision version conflict';
  end if;

  v_status := case p_action
    when 'accept' then 'accepted'
    when 'reject' then 'rejected'
    when 'mark_unknown' then 'unknown'
    else 'superseded'
  end;

  insert into public.resource_fact_change_audit (
    claim_id, resource_id, field_name, previous_value, new_value,
    action, reason_codes, actor_type, actor_id
  ) values (
    v_claim.id, v_claim.resource_id, v_claim.field_name,
    v_claim.existing_value, v_claim.proposed_value,
    p_action, v_claim.reason_codes, 'administrator', p_actor_id
  );

  update public.resource_fact_claims
  set status = v_status,
      version = version + 1,
      updated_at = now()
  where id = v_claim.id
  returning * into v_claim;

  return v_claim;
end
$$;

alter table public.resource_fact_claims enable row level security;
alter table public.resource_fact_evidence enable row level security;
alter table public.resource_fact_change_audit enable row level security;
alter table public.miller_automation_controls enable row level security;

revoke all on table public.resource_fact_claims,
  public.resource_fact_evidence,
  public.resource_fact_change_audit,
  public.miller_automation_controls
from anon, authenticated;

revoke all on function public.save_resource_fact_shadow_decision(uuid, integer, text, uuid)
from public, anon, authenticated;
grant execute on function public.save_resource_fact_shadow_decision(uuid, integer, text, uuid)
to service_role;

commit;
