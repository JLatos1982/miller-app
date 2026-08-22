begin;
create table public.miller_trend_sensor_runs (
  id uuid primary key,
  actor_id uuid not null references auth.users(id),
  status text not null default 'running' check (status in ('running','completed','security_halt','failed')),
  requests_used integer not null default 0 check (requests_used>=0),
  new_observations integer not null default 0 check (new_observations>=0),
  duplicates_ignored integer not null default 0 check (duplicates_ignored>=0),
  stop_reason text not null default 'running',
  started_at timestamptz not null default now(), completed_at timestamptz
);
create table public.miller_trend_sensor_run_items (
  run_id uuid not null references public.miller_trend_sensor_runs(id) on delete restrict,
  source_id text not null,
  source_url text not null,
  outcome text not null check (outcome in ('observed','unchanged','failed','blocked')),
  reason_code text not null,
  created_at timestamptz not null default now(),
  primary key(run_id,source_id)
);
alter table public.miller_trend_sensor_runs enable row level security;
alter table public.miller_trend_sensor_run_items enable row level security;
revoke all on public.miller_trend_sensor_runs,public.miller_trend_sensor_run_items from public,anon,authenticated;
grant select,insert,update on public.miller_trend_sensor_runs,miller_trend_sensor_run_items to service_role;
create trigger miller_trend_sensor_runs_no_delete before delete on public.miller_trend_sensor_runs for each row execute function public.prevent_resource_fact_audit_mutation();
create trigger miller_trend_sensor_run_items_no_change before update or delete on public.miller_trend_sensor_run_items for each row execute function public.prevent_resource_fact_audit_mutation();
commit;
