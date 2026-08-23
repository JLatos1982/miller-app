begin;
create table public.miller_security_incidents (
 id uuid primary key default gen_random_uuid(),
 correlation_key text not null unique check(correlation_key ~ '^[a-z0-9:_-]{8,500}$'),
 target_id text not null check(target_id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
 category text not null check(category in ('auth_boundary','http_posture','availability','dependency','capability')),
 state text not null check(state in ('active','resolved','needs_review')),
 severity text not null check(severity in ('informational','low','medium','high','critical')),
 reason_codes jsonb not null default '[]'::jsonb,
 first_observed_at timestamptz not null default now(),
 last_observed_at timestamptz not null default now(),
 recurrence_count integer not null default 1 check(recurrence_count>0),
 version_context jsonb not null default '{}'::jsonb,
 schema_version text not null default 'security-incident-v1'
);
create index miller_security_incidents_active_idx on public.miller_security_incidents(target_id,state,severity,last_observed_at desc);
create table public.miller_security_incident_members (
 id uuid primary key default gen_random_uuid(),
 incident_id uuid not null references public.miller_security_incidents(id) on delete restrict,
 source_kind text not null check(source_kind in ('internal_finding','external_observation')),
 source_key text not null check(length(source_key) between 1 and 200),
 reason_code text not null check(length(reason_code)<=120),
 created_at timestamptz not null default now(),
 unique(incident_id,source_kind,source_key)
);
alter table public.miller_security_incidents enable row level security;
alter table public.miller_security_incident_members enable row level security;
revoke all on public.miller_security_incidents,public.miller_security_incident_members from public,anon,authenticated;
grant select,insert,update on public.miller_security_incidents to service_role;
grant select,insert on public.miller_security_incident_members to service_role;
revoke delete,truncate,references,trigger on public.miller_security_incidents,public.miller_security_incident_members from service_role;
create trigger miller_security_incident_members_no_change before update or delete on public.miller_security_incident_members for each row execute function public.prevent_resource_fact_audit_mutation();
commit;
