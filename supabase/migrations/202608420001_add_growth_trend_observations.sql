begin;
create table public.miller_trend_observations (
  id uuid primary key default gen_random_uuid(),
  observation_fingerprint text not null unique check (observation_fingerprint ~ '^[a-f0-9]{64}$'),
  source_url text not null check (source_url ~ '^https://'),
  source_authority integer not null check (source_authority between 0 and 100),
  trend_category text not null check (trend_category in ('service_opening','service_closure','service_relocation','service_expansion','service_reduction','eligibility_change','delivery_model_change','policy_change','funding_change','regional_service_gap','emerging_service_model','other_relevant_change')),
  attention text not null check (attention in ('watch','review','important')),
  state text not null default 'new' check (state in ('new','acknowledged','incorporated','superseded','not_relevant')),
  geographic_scope text,
  canonical_resource_id uuid references public.resource_registry(id) on delete restrict,
  publication_date date,
  retrieved_at timestamptz not null default now(),
  summary text not null check (length(summary) between 1 and 1000),
  recommended_response text not null check (recommended_response in ('maintenance','growth','human_review','informational')),
  provenance jsonb not null default '{}'::jsonb,
  supersedes_id uuid references public.miller_trend_observations(id) on delete restrict
);
alter table public.miller_trend_observations enable row level security;
revoke all on public.miller_trend_observations from public,anon,authenticated;
grant select,insert,update on public.miller_trend_observations to service_role;
create trigger miller_trend_observations_no_delete before delete on public.miller_trend_observations for each row execute function public.prevent_resource_fact_audit_mutation();
commit;
