begin;

create table public.miller_sensor_inspections (
  id uuid primary key default gen_random_uuid(),
  sensor_id text not null check (sensor_id = 'health_canada_drug_safety'),
  actor_id uuid not null references auth.users(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  request_count integer not null default 0 check (request_count between 0 and 1),
  bytes_read integer not null default 0 check (bytes_read between 0 and 524288),
  records_inspected integer not null default 0 check (records_inspected between 0 and 100),
  records_accepted integer not null default 0 check (records_accepted between 0 and 100),
  duplicates_ignored integer not null default 0 check (duplicates_ignored between 0 and 100),
  signals_created integer not null default 0 check (signals_created between 0 and 100),
  topics_affected integer not null default 0 check (topics_affected between 0 and 100),
  reflections_created integer not null default 0 check (reflections_created between 0 and 100),
  health_state text not null check (health_state in ('healthy','degraded','failed')),
  outcome text not null check (outcome in ('healthy_new_relevant_change','healthy_no_relevant_change','failed')),
  stop_reason text not null check (length(stop_reason) between 1 and 120),
  parser_version text not null,
  error_code text,
  metadata jsonb not null default '{}'::jsonb
);
create index miller_sensor_inspections_sensor_started_idx on public.miller_sensor_inspections(sensor_id, started_at desc);
alter table public.miller_sensor_inspections enable row level security;
revoke all on public.miller_sensor_inspections from public, anon, authenticated;
grant select, insert, update on public.miller_sensor_inspections to service_role;
create trigger miller_sensor_inspections_no_change before update or delete on public.miller_sensor_inspections for each row execute function public.prevent_resource_fact_audit_mutation();

commit;
