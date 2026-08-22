begin;
create table public.miller_reflections (
 id uuid primary key default gen_random_uuid(), reflection_key text not null unique, category text not null check(category in ('new_learning','attention_increased','attention_decreased','attention_reactivated','uncertainty_resolved','uncertainty_reduced','persistent_uncertainty','emerging_theme','human_impact_concern','coverage_gap','sensor_degraded','research_method_observation','human_review_recommended')),
 topic_id uuid references public.miller_attention_topics(id) on delete restrict, investigation_id uuid references public.miller_curiosity_investigations(id) on delete restrict, signal_ids jsonb not null default '[]'::jsonb, explanation text not null check(length(explanation)<=1000), confidence numeric(4,3) not null check(confidence between 0 and 1), human_impact text not null check(human_impact in ('low','moderate','high','critical')), recommendation text not null, created_at timestamptz not null default now()
);
create table public.miller_reflection_acknowledgements (reflection_id uuid not null references public.miller_reflections(id) on delete restrict, actor_id uuid not null references auth.users(id), acknowledged_at timestamptz not null default now(), primary key(reflection_id,actor_id));
create table public.miller_sensor_checkpoints (
 sensor_id text primary key, mode text not null check(mode in ('live_ready','fixture_validated','disabled','fixture_validated_live_disabled')), last_success_at timestamptz, last_fingerprint text, request_count integer not null default 0, records_inspected integer not null default 0, records_accepted integer not null default 0, duplicates_ignored integer not null default 0, failure_streak integer not null default 0, health_state text not null default 'unknown' check(health_state in ('healthy','degraded','unknown')), last_error_code text, updated_at timestamptz not null default now()
);
alter table public.miller_reflections enable row level security; alter table public.miller_reflection_acknowledgements enable row level security; alter table public.miller_sensor_checkpoints enable row level security;
revoke all on public.miller_reflections,public.miller_reflection_acknowledgements,public.miller_sensor_checkpoints from public,anon,authenticated;
grant select,insert,update on public.miller_reflections,miller_reflection_acknowledgements,miller_sensor_checkpoints to service_role;
create trigger miller_reflections_no_change before update or delete on public.miller_reflections for each row execute function public.prevent_resource_fact_audit_mutation();
commit;
