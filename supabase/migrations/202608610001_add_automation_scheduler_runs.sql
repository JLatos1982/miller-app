begin;
create table public.miller_automation_scheduler_runs (
 id uuid primary key default gen_random_uuid(), status text not null default 'running' check(status in ('running','completed','degraded','failed','disabled')), started_at timestamptz not null default now(), completed_at timestamptz, lease_expires_at timestamptz not null, heartbeat_status text check(heartbeat_status in ('healthy','never_started','overdue','running','degraded','disabled','unknown')), due_capabilities jsonb not null default '[]'::jsonb, started_capabilities jsonb not null default '[]'::jsonb, failure_code text check(length(failure_code)<=120), schema_version text not null default 'automation-scheduler-run-v1'
);
create unique index miller_automation_scheduler_one_live_idx on public.miller_automation_scheduler_runs ((1)) where status='running';
create index miller_automation_scheduler_recent_idx on public.miller_automation_scheduler_runs(started_at desc);
alter table public.miller_automation_scheduler_runs enable row level security;
revoke all on public.miller_automation_scheduler_runs from public,anon,authenticated;
grant select,insert,update on public.miller_automation_scheduler_runs to service_role;
revoke delete,truncate,references,trigger on public.miller_automation_scheduler_runs from service_role;
commit;
