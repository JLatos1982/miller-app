begin;

alter table public.miller_security_pulse_runs
  add column target_id text not null default 'miller_local' check(target_id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  add column profile_version text not null default 'miller-security-profile-v1' check(length(profile_version) between 1 and 80);
create index miller_security_pulse_runs_target_recent_idx on public.miller_security_pulse_runs(target_id,started_at desc);

create table public.miller_security_capabilities (
  target_id text not null check(target_id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  capability_id text not null check(capability_id ~ '^[a-z0-9][a-z0-9_]{0,79}$'),
  capability_version text not null check(length(capability_version) between 1 and 80),
  category text not null check(length(category) between 1 and 80),
  execution_class text not null check(execution_class in ('passive','active_negative_probe')),
  environment_scope text not null check(environment_scope in ('local_only','local_owned_target_only','production_safe_passive')),
  enabled boolean not null default true,
  mutation_ability text not null default 'none' check(mutation_ability='none'),
  timeout_ms integer not null check(timeout_ms between 1 and 60000),
  expected_cost text not null check(expected_cost in ('none','low','bounded_external')),
  status text not null default 'available_not_run' check(status in ('available_not_run','verified','failed','unavailable','disabled')),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  disabled_reason text check(length(disabled_reason)<=180),
  profile_version text not null check(length(profile_version) between 1 and 80),
  updated_at timestamptz not null default now(),
  primary key(target_id,capability_id)
);

create table public.miller_security_sensor_outcomes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.miller_security_pulse_runs(id) on delete restrict,
  target_id text not null check(target_id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  profile_version text not null check(length(profile_version) between 1 and 80),
  instrument_id text not null check(instrument_id ~ '^[a-z0-9][a-z0-9_]{0,79}$'),
  instrument_version text not null check(length(instrument_version) between 1 and 80),
  state text not null check(state in ('verified','failed','unavailable')),
  completeness text not null check(completeness in ('complete','partial','unavailable','failed')),
  finding_count integer not null default 0 check(finding_count>=0),
  finished_at timestamptz not null default now(),
  evidence_summary jsonb not null default '{}'::jsonb,
  schema_version text not null default 'security-sensor-outcome-v1',
  unique(run_id,instrument_id)
);
create index miller_security_sensor_outcomes_target_recent_idx on public.miller_security_sensor_outcomes(target_id,instrument_id,finished_at desc);

create table public.miller_security_observers (
  id uuid primary key default gen_random_uuid(),
  observer_key text not null unique check(observer_key ~ '^[a-z0-9][a-z0-9_-]{2,79}$'),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  target_id text not null check(target_id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  enabled boolean not null default true,
  observer_version text not null check(length(observer_version) between 1 and 80),
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);
create table public.miller_external_security_observations (
  id uuid primary key default gen_random_uuid(),
  observer_id uuid not null references public.miller_security_observers(id) on delete restrict,
  target_id text not null check(target_id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  observation_key text not null check(observation_key ~ '^[a-f0-9]{64}$'),
  observation_type text not null check(observation_type in ('availability','http_headers','auth_negative_probe','tls_posture','latency_anomaly')),
  observed_at timestamptz not null,
  status text not null check(status in ('pass','fail','inconclusive')),
  evidence_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  schema_version text not null default 'external-security-observation-v1',
  unique(observer_id,observation_key)
);
create index miller_external_security_observations_target_recent_idx on public.miller_external_security_observations(target_id,observed_at desc);

alter table public.miller_security_capabilities enable row level security;
alter table public.miller_security_sensor_outcomes enable row level security;
alter table public.miller_security_observers enable row level security;
alter table public.miller_external_security_observations enable row level security;
revoke all on public.miller_security_capabilities,public.miller_security_sensor_outcomes,public.miller_security_observers,public.miller_external_security_observations from public,anon,authenticated;
grant select,insert,update on public.miller_security_capabilities,public.miller_security_sensor_outcomes,public.miller_security_observers to service_role;
grant select,insert on public.miller_external_security_observations to service_role;
revoke delete,truncate,references,trigger on public.miller_security_capabilities,public.miller_security_sensor_outcomes,public.miller_security_observers,public.miller_external_security_observations from service_role;

create or replace function public.record_external_security_observation(p_observer_key text,p_observation_key text,p_observation_type text,p_observed_at timestamptz,p_status text,p_evidence_summary jsonb default '{}'::jsonb)
returns public.miller_external_security_observations language plpgsql security definer set search_path=public as $$
declare observer public.miller_security_observers; saved public.miller_external_security_observations;
begin
 if auth.role() <> 'authenticated' then raise exception 'authenticated_observer_required'; end if;
 if p_observer_key !~ '^[a-z0-9][a-z0-9_-]{2,79}$' or p_observation_key !~ '^[a-f0-9]{64}$' or p_observation_type not in ('availability','http_headers','auth_negative_probe','tls_posture','latency_anomaly') or p_status not in ('pass','fail','inconclusive') or p_observed_at is null or jsonb_typeof(coalesce(p_evidence_summary,'{}'::jsonb)) <> 'object' or octet_length(coalesce(p_evidence_summary,'{}'::jsonb)::text)>2048 or exists(select 1 from jsonb_object_keys(coalesce(p_evidence_summary,'{}'::jsonb)) as key where key ~* '(token|secret|authorization|cookie|body|payload)') then raise exception 'invalid_external_security_observation'; end if;
 select * into observer from public.miller_security_observers where observer_key=p_observer_key and auth_user_id=auth.uid() and enabled=true for update;
 if observer.id is null then raise exception 'observer_not_authorized'; end if;
 insert into public.miller_external_security_observations(observer_id,target_id,observation_key,observation_type,observed_at,status,evidence_summary)
 values(observer.id,observer.target_id,p_observation_key,p_observation_type,p_observed_at,p_status,jsonb_build_object('aggregate_only',true,'observer_key',p_observer_key,'summary',coalesce(p_evidence_summary,'{}'::jsonb)))
 on conflict(observer_id,observation_key) do nothing returning * into saved;
 if saved.id is null then select * into saved from public.miller_external_security_observations where observer_id=observer.id and observation_key=p_observation_key; end if;
 return saved;
end $$;
revoke all on function public.record_external_security_observation(text,text,text,timestamptz,text,jsonb) from public,anon;
grant execute on function public.record_external_security_observation(text,text,text,timestamptz,text,jsonb) to authenticated;

create trigger miller_security_sensor_outcomes_no_change before update or delete on public.miller_security_sensor_outcomes for each row execute function public.prevent_resource_fact_audit_mutation();
create trigger miller_external_security_observations_no_change before update or delete on public.miller_external_security_observations for each row execute function public.prevent_resource_fact_audit_mutation();
commit;
