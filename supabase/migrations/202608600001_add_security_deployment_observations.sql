begin;

alter table public.miller_security_capabilities drop constraint miller_security_capabilities_environment_scope_check;
alter table public.miller_security_capabilities add constraint miller_security_capabilities_environment_scope_check check(environment_scope in ('local_only','local_owned_target_only','production_safe_passive','local_or_production_passive'));
alter table public.miller_security_incidents drop constraint miller_security_incidents_category_check;
alter table public.miller_security_incidents add constraint miller_security_incidents_category_check check(category in ('auth_boundary','http_posture','availability','dependency','capability','deployment'));

create table public.miller_security_deployment_observations (
  id uuid primary key default gen_random_uuid(),
  observation_fingerprint text not null unique check(observation_fingerprint ~ '^[a-f0-9]{64}$'),
  target_id text not null check(target_id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  observed_at timestamptz not null default now(),
  build_identity text check(length(build_identity) between 1 and 120),
  schema_head text check(length(schema_head) between 1 and 80),
  schema_contract text check(length(schema_contract) between 1 and 120),
  profile_version text not null check(length(profile_version) between 1 and 80),
  alignment_state text not null check(alignment_state in ('aligned','build_unknown','schema_unknown','schema_behind_build','schema_ahead_of_build','migration_gap','compatibility_unknown')),
  reason_codes jsonb not null default '[]'::jsonb,
  evidence_summary jsonb not null default '{}'::jsonb,
  schema_version text not null default 'security-deployment-observation-v1'
);
create index miller_security_deployment_observations_recent_idx on public.miller_security_deployment_observations(target_id, observed_at desc);
alter table public.miller_security_deployment_observations enable row level security;
revoke all on public.miller_security_deployment_observations from public, anon, authenticated;
grant select, insert on public.miller_security_deployment_observations to service_role;
revoke delete, truncate, references, trigger, update on public.miller_security_deployment_observations from service_role;
create trigger miller_security_deployment_observations_no_change
before update or delete on public.miller_security_deployment_observations
for each row execute function public.prevent_resource_fact_audit_mutation();

commit;
