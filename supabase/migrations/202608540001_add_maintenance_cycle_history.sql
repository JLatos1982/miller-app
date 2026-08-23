begin;
create table public.miller_maintenance_cycles (
 id uuid primary key default gen_random_uuid(),
 cycle_key text not null unique check(cycle_key ~ '^[a-f0-9]{64}$'),
 mode text not null check(mode in ('observe','maintain','preview_growth')),
 trigger_type text not null check(trigger_type in ('manual_admin','manual_preview')),
 phase text not null check(phase in ('waking','orienting','working','reflecting','consolidating','idle')),
 status text not null check(status in ('running','completed','degraded','failed')),
 completeness text not null check(completeness in ('complete','partial','failed')),
 started_at timestamptz not null default now(), completed_at timestamptz, duration_ms integer check(duration_ms >= 0),
 needs_discovered integer not null default 0, growth_opportunities integer not null default 0, work_attempted integer not null default 0, work_improved integer not null default 0, work_unchanged integer not null default 0, work_failed integer not null default 0, work_deferred integer not null default 0, healing_attempted integer not null default 0, lessons_created integer not null default 0, attention_created integer not null default 0,
 summary jsonb not null default '{}'::jsonb, schema_version text not null default 'maintenance-cycle-v1'
);
create unique index miller_maintenance_cycles_single_active_idx on public.miller_maintenance_cycles ((1)) where status='running';
create index miller_maintenance_cycles_recent_idx on public.miller_maintenance_cycles(started_at desc);
alter table public.miller_maintenance_cycles enable row level security;
revoke all on public.miller_maintenance_cycles from public,anon,authenticated;
grant select,insert,update on public.miller_maintenance_cycles to service_role;
commit;
