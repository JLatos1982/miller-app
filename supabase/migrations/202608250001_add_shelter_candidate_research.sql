begin;

create table public.shelter_candidate_research_claims (
  id bigint generated always as identity primary key,
  candidate_id bigint not null references public.resource_discovery_candidates(id) on delete cascade,
  recommendation text not null check (recommendation in ('ready_to_approve','brief_review','possible_duplicate','safety_sensitive_ready','needs_research','reject_obsolete')),
  proposed_value jsonb,
  current_value jsonb,
  confidence text not null check (confidence in ('high','medium','low','unknown')),
  reason_codes jsonb not null default '[]'::jsonb check (jsonb_typeof(reason_codes) = 'array'),
  research_version text not null,
  claim_fingerprint text not null unique check (claim_fingerprint ~ '^[0-9a-f]{64}$'),
  research_summary text,
  last_retrieved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shelter_candidate_research_evidence (
  id bigint generated always as identity primary key,
  claim_id bigint not null references public.shelter_candidate_research_claims(id) on delete cascade,
  source_url text not null check (source_url ~ '^https://'),
  source_title text,
  source_type text not null,
  source_authority integer not null check (source_authority between 0 and 100),
  retrieved_at timestamptz not null,
  extraction_method text not null,
  extracted_value jsonb,
  evidence_fingerprint text not null unique check (evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  stale boolean not null default false,
  created_at timestamptz not null default now()
);

create index shelter_candidate_research_claims_queue_idx on public.shelter_candidate_research_claims(candidate_id, recommendation, last_retrieved_at desc);
create index shelter_candidate_research_evidence_claim_idx on public.shelter_candidate_research_evidence(claim_id, retrieved_at desc);

alter table public.shelter_candidate_research_claims enable row level security;
alter table public.shelter_candidate_research_evidence enable row level security;
revoke all on table public.shelter_candidate_research_claims, public.shelter_candidate_research_evidence from anon, authenticated;
grant select, insert, update, delete on table public.shelter_candidate_research_claims, public.shelter_candidate_research_evidence to service_role;
grant usage, select on sequence public.shelter_candidate_research_claims_id_seq, public.shelter_candidate_research_evidence_id_seq to service_role;

commit;
