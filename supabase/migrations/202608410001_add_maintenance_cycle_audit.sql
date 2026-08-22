begin;
create table public.miller_maintenance_cycles (
  id uuid primary key,
  mode text not null check (mode in ('inspect_only','maintenance')),
  actor_id uuid not null references auth.users(id),
  status text not null default 'running' check (status in ('running','completed','security_halt','failed')),
  tasks_considered integer not null default 0 check (tasks_considered>=0),
  tasks_executed integer not null default 0 check (tasks_executed>=0),
  useful_evidence_gained integer not null default 0 check (useful_evidence_gained>=0),
  external_call_count integer not null default 0 check (external_call_count>=0),
  knowledge_finding_count integer not null default 0 check (knowledge_finding_count>=0),
  security_finding_count integer not null default 0 check (security_finding_count>=0),
  stop_reason text not null default 'running',
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(), completed_at timestamptz
);
create table public.miller_maintenance_cycle_items (
  cycle_id uuid not null references public.miller_maintenance_cycles(id) on delete restrict,
  task_id text not null,
  resource_id uuid references public.resource_registry(id) on delete restrict,
  outcome text not null check (outcome in ('selected','resolved','reduced','unchanged','human_review','stale_task','failed','skipped')),
  created_at timestamptz not null default now(),
  primary key(cycle_id,task_id)
);
alter table public.miller_maintenance_cycles enable row level security;
alter table public.miller_maintenance_cycle_items enable row level security;
revoke all on public.miller_maintenance_cycles,public.miller_maintenance_cycle_items from public,anon,authenticated;
grant select,insert,update on public.miller_maintenance_cycles,miller_maintenance_cycle_items to service_role;
create trigger miller_maintenance_cycles_no_delete before delete on public.miller_maintenance_cycles for each row execute function public.prevent_resource_fact_audit_mutation();
create trigger miller_maintenance_cycle_items_no_change before update or delete on public.miller_maintenance_cycle_items for each row execute function public.prevent_resource_fact_audit_mutation();
commit;
