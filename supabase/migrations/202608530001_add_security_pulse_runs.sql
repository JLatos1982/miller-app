begin;
create table public.miller_security_pulse_runs (
 id uuid primary key default gen_random_uuid(), run_key text not null unique check(run_key ~ '^[a-f0-9]{64}$'), trigger_type text not null check(trigger_type in ('manual_admin','daily_preview','deep_preview')), mode text not null check(mode in ('local_manual','preview')), status text not null check(status in ('running','completed','failed','degraded')), completeness text not null check(completeness in ('complete','partial','failed','unavailable','timed_out')), started_at timestamptz not null default now(), completed_at timestamptz, duration_ms integer check(duration_ms>=0), instruments_attempted integer not null default 0, instruments_succeeded integer not null default 0, instruments_degraded integer not null default 0, instruments_unavailable integer not null default 0, findings_observed integer not null default 0, findings_new integer not null default 0, findings_recurring integer not null default 0, findings_reappeared integer not null default 0, findings_resolved integer not null default 0, findings_preserved integer not null default 0, attention_worthy integer not null default 0, schema_version text not null default 'security-pulse-v1', summary jsonb not null default '{}'::jsonb
);
create index miller_security_pulse_runs_recent_idx on public.miller_security_pulse_runs(started_at desc);
create unique index miller_security_pulse_runs_single_active_idx on public.miller_security_pulse_runs ((1)) where status='running';
alter table public.miller_security_pulse_runs enable row level security;
revoke all on public.miller_security_pulse_runs from public,anon,authenticated;
grant select,insert,update on public.miller_security_pulse_runs to service_role;

alter table public.miller_security_findings add column instrument_id text;
create index miller_security_findings_instrument_lifecycle_idx on public.miller_security_findings(instrument_id,lifecycle,last_observed_at desc);

create or replace function public.record_security_instrument_finding(p_instrument_id text,p_fingerprint text,p_type text,p_subsystem text,p_severity text,p_confidence text,p_description text,p_control text,p_result text,p_recommendation text,p_metadata jsonb default '{}'::jsonb)
returns public.miller_security_findings language plpgsql security definer set search_path=public as $$
declare found public.miller_security_findings; was_resolved boolean := false;
begin
 if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
 if p_instrument_id !~ '^[a-z0-9_]{1,80}$' or p_fingerprint !~ '^[a-f0-9]{64}$' or p_type is null or p_subsystem is null or p_description is null or p_recommendation is null then raise exception 'invalid_security_finding'; end if;
 select * into found from public.miller_security_findings where finding_fingerprint=p_fingerprint for update;
 if found.id is null then
  insert into public.miller_security_findings(instrument_id,finding_fingerprint,finding_type,subsystem,severity,confidence,lifecycle,description,defensive_control,defensive_result,recommended_action,evidence_metadata)
  values(p_instrument_id,p_fingerprint,p_type,p_subsystem,p_severity,p_confidence,case when p_result in ('authorization_denied','blocked_as_expected','rejected_by_validation','rate_limited','quarantined','failed_closed') then 'expected_behavior' else 'new' end,p_description,p_control,p_result,p_recommendation,p_metadata)
  returning * into found;
  insert into public.miller_security_finding_events(finding_id,event_type,provenance) values(found.id,'created',jsonb_build_object('aggregate_only',true,'instrument_id',p_instrument_id));
 else
  if found.instrument_id is not null and found.instrument_id <> p_instrument_id then raise exception 'security_finding_instrument_mismatch'; end if;
  was_resolved := found.lifecycle='resolved';
  update public.miller_security_findings set instrument_id=coalesce(instrument_id,p_instrument_id),last_observed_at=now(),recurrence_count=found.recurrence_count+1,lifecycle=case when found.lifecycle='resolved' then 'recurring' when found.lifecycle='new' then 'recurring' else found.lifecycle end,resolved_at=case when found.lifecycle='resolved' then null else resolved_at end,updated_at=now() where id=found.id returning * into found;
  insert into public.miller_security_finding_events(finding_id,event_type,provenance) values(found.id,'recurred',jsonb_build_object('aggregate_only',true,'instrument_id',p_instrument_id,'reappeared',was_resolved));
 end if;
 return found;
end $$;
create or replace function public.resolve_security_instrument_finding(p_instrument_id text,p_fingerprint text)
returns public.miller_security_findings language plpgsql security definer set search_path=public as $$
declare found public.miller_security_findings;
begin
 if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
 select * into found from public.miller_security_findings where finding_fingerprint=p_fingerprint and instrument_id=p_instrument_id for update;
 if found.id is null then raise exception 'security_finding_not_found'; end if;
 if found.lifecycle not in ('resolved','false_positive') then
  update public.miller_security_findings set lifecycle='resolved',resolved_at=now(),updated_at=now() where id=found.id returning * into found;
  insert into public.miller_security_finding_events(finding_id,event_type,provenance) values(found.id,'resolved',jsonb_build_object('aggregate_only',true,'instrument_id',p_instrument_id));
 end if;
 return found;
end $$;
revoke all on function public.record_security_instrument_finding(text,text,text,text,text,text,text,text,text,text,jsonb),public.resolve_security_instrument_finding(text,text) from public,anon,authenticated;
grant execute on function public.record_security_instrument_finding(text,text,text,text,text,text,text,text,text,text,jsonb),public.resolve_security_instrument_finding(text,text) to service_role;
commit;
