begin;
-- 202608410001 introduced the first compact cycle audit. Evolve that ledger
-- in place so both the original Heartbeat audit and the newer maintenance
-- rhythm retain their history and constraints.
alter table public.miller_maintenance_cycles alter column id set default gen_random_uuid();
alter table public.miller_maintenance_cycles alter column actor_id drop not null;
alter table public.miller_maintenance_cycles drop constraint miller_maintenance_cycles_mode_check;
alter table public.miller_maintenance_cycles drop constraint miller_maintenance_cycles_status_check;
alter table public.miller_maintenance_cycles add constraint miller_maintenance_cycles_mode_check check(mode in ('inspect_only','maintenance','observe','maintain','preview_growth'));
alter table public.miller_maintenance_cycles add constraint miller_maintenance_cycles_status_check check(status in ('running','completed','degraded','security_halt','failed'));
alter table public.miller_maintenance_cycles
 add column cycle_key text default encode(digest(gen_random_uuid()::text,'sha256'),'hex'),
 add column trigger_type text default 'manual_admin' check(trigger_type in ('manual_admin','manual_preview')),
 add column phase text default 'waking' check(phase in ('waking','orienting','working','reflecting','consolidating','idle')),
 add column completeness text default 'partial' check(completeness in ('complete','partial','failed')),
 add column duration_ms integer check(duration_ms >= 0),
 add column needs_discovered integer not null default 0,
 add column growth_opportunities integer not null default 0,
 add column work_attempted integer not null default 0,
 add column work_improved integer not null default 0,
 add column work_unchanged integer not null default 0,
 add column work_failed integer not null default 0,
 add column work_deferred integer not null default 0,
 add column healing_attempted integer not null default 0,
 add column lessons_created integer not null default 0,
 add column attention_created integer not null default 0,
 add column schema_version text not null default 'maintenance-cycle-v1';
update public.miller_maintenance_cycles set cycle_key=encode(digest('legacy-maintenance-cycle|'||id::text,'sha256'),'hex'),trigger_type='manual_admin',phase=case when status='running' then 'working' else 'idle' end,completeness=case when status='completed' then 'complete' when status='failed' then 'failed' else 'partial' end where cycle_key is null;
alter table public.miller_maintenance_cycles alter column cycle_key set not null,alter column trigger_type set not null,alter column phase set not null,alter column completeness set not null;
alter table public.miller_maintenance_cycles add constraint miller_maintenance_cycles_cycle_key_key unique(cycle_key),add constraint miller_maintenance_cycles_cycle_key_check check(cycle_key ~ '^[a-f0-9]{64}$');
create unique index miller_maintenance_cycles_single_active_idx on public.miller_maintenance_cycles ((1)) where status='running';
create index miller_maintenance_cycles_recent_idx on public.miller_maintenance_cycles(started_at desc);
revoke all on public.miller_maintenance_cycles from public,anon,authenticated;
grant select,insert,update on public.miller_maintenance_cycles to service_role;
commit;
