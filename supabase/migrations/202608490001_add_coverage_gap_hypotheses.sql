begin;
create table public.miller_coverage_hypotheses (
 id uuid primary key default gen_random_uuid(), hypothesis_key text not null unique check(hypothesis_key ~ '^[a-f0-9]{64}$'), kind text not null check(kind in ('need','barrier')), theme text not null, geography text not null, strength_band text not null check(strength_band in ('emerging','recurring','elevated')), coverage_state text not null check(coverage_state in ('unknown','limited','represented')), uncertainty_reason text not null check(uncertainty_reason in ('directory_coverage_unknown','limited_directory_representation','coverage_present_discoverability_unknown','navigation_or_access_detail_unknown')), matching_resource_count integer not null check(matching_resource_count between 0 and 10000), status text not null check(status in ('proposed','awaiting_evidence','evidence_available','human_review','resolved','expired')), research_question text not null check(length(research_question)<=600), reason_codes jsonb not null default '[]'::jsonb, provenance jsonb not null default '{}'::jsonb, first_observed_at timestamptz not null default now(), last_observed_at timestamptz not null default now(), expires_at timestamptz not null, updated_at timestamptz not null default now()
);
create index miller_coverage_hypotheses_active_idx on public.miller_coverage_hypotheses(status,expires_at,updated_at desc);
alter table public.miller_coverage_hypotheses enable row level security;
revoke all on public.miller_coverage_hypotheses from public,anon,authenticated;
grant select,insert,update,delete on public.miller_coverage_hypotheses to service_role;
commit;
