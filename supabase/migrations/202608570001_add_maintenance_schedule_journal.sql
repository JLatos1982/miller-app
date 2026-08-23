begin;

alter table public.miller_maintenance_cycles drop constraint if exists miller_maintenance_cycles_trigger_type_check;
alter table public.miller_maintenance_cycles add constraint miller_maintenance_cycles_trigger_type_check check(trigger_type in ('manual_admin','manual_preview','scheduled'));

create table public.miller_maintenance_scheduler_config (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  execution_mode text not null default 'dry_run' check(execution_mode in ('dry_run','active')),
  cadence_hours integer not null default 24 check(cadence_hours between 24 and 168),
  display_timezone text not null default 'America/Vancouver' check(length(display_timezone) between 1 and 80),
  last_scheduled_at timestamptz,
  next_expected_at timestamptz,
  updated_at timestamptz not null default now(),
  version integer not null default 1 check(version >= 1),
  schema_version text not null default 'maintenance-scheduler-v1'
);
insert into public.miller_maintenance_scheduler_config(singleton) values (true) on conflict (singleton) do nothing;

create table public.miller_maintenance_cycle_journal (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null unique references public.miller_maintenance_cycles(id) on delete restrict,
  trigger_type text not null check(trigger_type in ('manual_admin','scheduled')),
  execution_mode text not null check(execution_mode in ('dry_run','active')),
  status text not null default 'running' check(status in ('running','completed','degraded','failed','already_running','disabled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer check(duration_ms >= 0),
  security_summary jsonb not null default '{}'::jsonb,
  orientation_summary jsonb not null default '{}'::jsonb,
  considered jsonb not null default '[]'::jsonb,
  selected_action jsonb not null default '{}'::jsonb,
  refused jsonb not null default '[]'::jsonb,
  verification jsonb not null default '{}'::jsonb,
  learning_summary jsonb not null default '{}'::jsonb,
  reflection jsonb not null default '{}'::jsonb,
  failure_code text check(length(failure_code) <= 120),
  schema_version text not null default 'maintenance-cycle-journal-v1'
);
create index miller_maintenance_cycle_journal_recent_idx on public.miller_maintenance_cycle_journal(started_at desc);

alter table public.miller_maintenance_scheduler_config enable row level security;
alter table public.miller_maintenance_cycle_journal enable row level security;
revoke all on public.miller_maintenance_scheduler_config, public.miller_maintenance_cycle_journal from public, anon, authenticated;
grant select, insert, update on public.miller_maintenance_scheduler_config to service_role;
grant select, insert, update on public.miller_maintenance_cycle_journal to service_role;
revoke delete, truncate, references, trigger on public.miller_maintenance_scheduler_config, public.miller_maintenance_cycle_journal from service_role;

create or replace function public.prevent_miller_maintenance_cycle_journal_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op = 'DELETE' then raise exception 'maintenance cycle journal is append-only'; end if;
  if old.status <> 'running' then raise exception 'completed maintenance journal is immutable'; end if;
  return new;
end;
$$;
create trigger miller_maintenance_cycle_journal_append_only
before update or delete on public.miller_maintenance_cycle_journal
for each row execute function public.prevent_miller_maintenance_cycle_journal_mutation();

commit;
