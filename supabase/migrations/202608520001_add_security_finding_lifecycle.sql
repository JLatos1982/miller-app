begin;
create table public.miller_security_findings (
 id uuid primary key default gen_random_uuid(), finding_fingerprint text not null unique check(finding_fingerprint ~ '^[a-f0-9]{64}$'), finding_type text not null check(length(finding_type)<=120), subsystem text not null check(length(subsystem)<=120), severity text not null check(severity in ('informational','low','medium','high','critical')), confidence text not null check(confidence in ('verified','observed','inferred','unknown')), lifecycle text not null default 'new' check(lifecycle in ('new','recurring','acknowledged','mitigated','resolved','false_positive','expected_behavior')),
 description text not null check(length(description)<=700), defensive_control text, defensive_result text not null check(defensive_result in ('blocked_as_expected','rejected_by_validation','rate_limited','quarantined','authorization_denied','failed_closed','protection_uncertain','protection_failed')), recommended_action text not null check(length(recommended_action)<=500), evidence_metadata jsonb not null default '{}'::jsonb, schema_version text not null default 'security-finding-v1', first_observed_at timestamptz not null default now(), last_observed_at timestamptz not null default now(), recurrence_count integer not null default 1 check(recurrence_count>0), acknowledged_at timestamptz, resolved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.miller_security_finding_events (
 id uuid primary key default gen_random_uuid(), finding_id uuid not null references public.miller_security_findings(id) on delete restrict, event_type text not null check(event_type in ('created','recurred','acknowledged','mitigated','resolved','false_positive','verification_passed','verification_failed')), actor_id uuid references auth.users(id) on delete restrict, provenance jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index miller_security_findings_active_idx on public.miller_security_findings(lifecycle,severity,last_observed_at desc);
alter table public.miller_security_findings enable row level security; alter table public.miller_security_finding_events enable row level security;
revoke all on public.miller_security_findings,public.miller_security_finding_events from public,anon,authenticated;
grant select,insert,update on public.miller_security_findings to service_role; grant select,insert on public.miller_security_finding_events to service_role;
create trigger miller_security_finding_events_no_change before update or delete on public.miller_security_finding_events for each row execute function public.prevent_resource_fact_audit_mutation();
create or replace function public.record_security_finding(p_fingerprint text,p_type text,p_subsystem text,p_severity text,p_confidence text,p_description text,p_control text,p_result text,p_recommendation text,p_metadata jsonb default '{}'::jsonb)
returns public.miller_security_findings language plpgsql security definer set search_path=public as $$
declare found public.miller_security_findings;
begin
 if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
 if p_fingerprint !~ '^[a-f0-9]{64}$' or p_type is null or p_subsystem is null or p_description is null or p_recommendation is null then raise exception 'invalid_security_finding'; end if;
 select * into found from public.miller_security_findings where finding_fingerprint=p_fingerprint for update;
 if found.id is null then insert into public.miller_security_findings(finding_fingerprint,finding_type,subsystem,severity,confidence,lifecycle,description,defensive_control,defensive_result,recommended_action,evidence_metadata) values(p_fingerprint,p_type,p_subsystem,p_severity,p_confidence,case when p_result in ('authorization_denied','blocked_as_expected','rejected_by_validation','rate_limited','quarantined','failed_closed') then 'expected_behavior' else 'new' end,p_description,p_control,p_result,p_recommendation,p_metadata) returning * into found; insert into public.miller_security_finding_events(finding_id,event_type,provenance) values(found.id,'created',jsonb_build_object('aggregate_only',true));
 else update public.miller_security_findings set last_observed_at=now(),recurrence_count=found.recurrence_count+1,lifecycle=case when found.lifecycle='new' then 'recurring' else found.lifecycle end,updated_at=now() where id=found.id returning * into found; insert into public.miller_security_finding_events(finding_id,event_type,provenance) values(found.id,'recurred',jsonb_build_object('aggregate_only',true)); end if;
 return found;
end $$;
revoke all on function public.record_security_finding(text,text,text,text,text,text,text,text,text,jsonb) from public,anon,authenticated; grant execute on function public.record_security_finding(text,text,text,text,text,text,text,text,text,jsonb) to service_role;
commit;
