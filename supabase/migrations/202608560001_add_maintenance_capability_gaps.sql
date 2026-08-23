begin;
create table public.miller_capability_gaps (
 id uuid primary key default gen_random_uuid(), gap_fingerprint text not null unique check(gap_fingerprint ~ '^[a-f0-9]{64}$'), subsystem text not null check(length(subsystem)<=80), problem_class text not null check(length(problem_class)<=120), target_key text not null check(length(target_key)<=180), worker_candidates jsonb not null default '[]'::jsonb, reason text not null check(length(reason)<=500), safety_category text not null check(safety_category in ('low','research_required','human_review','security_review')), suggested_direction text not null check(length(suggested_direction)<=300), evidence_refs jsonb not null default '[]'::jsonb, status text not null default 'candidate' check(status in ('candidate','prioritized','human_review','addressed','retired')), observation_count integer not null default 1 check(observation_count>=1), first_observed_at timestamptz not null default now(), last_observed_at timestamptz not null default now(), schema_version text not null default 'maintenance-capability-gap-v1'
);
create index miller_capability_gaps_status_observed_idx on public.miller_capability_gaps(status,last_observed_at desc);
alter table public.miller_capability_gaps enable row level security;
revoke all on public.miller_capability_gaps from public,anon,authenticated;
grant select,insert,update on public.miller_capability_gaps to service_role;
commit;
