begin;

alter table public.resource_fact_claims
  add column if not exists claim_fingerprint text,
  add column if not exists decision_category text not null default 'other',
  add column if not exists research_summary text,
  add column if not exists last_observed_at timestamptz not null default now();

alter table public.resource_fact_evidence
  add column if not exists evidence_fingerprint text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.resource_fact_claims'::regclass
      and conname = 'resource_fact_claims_fingerprint_format'
  ) then
    alter table public.resource_fact_claims
      add constraint resource_fact_claims_fingerprint_format
      check (claim_fingerprint is null or claim_fingerprint ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.resource_fact_evidence'::regclass
      and conname = 'resource_fact_evidence_fingerprint_format'
  ) then
    alter table public.resource_fact_evidence
      add constraint resource_fact_evidence_fingerprint_format
      check (evidence_fingerprint is null or evidence_fingerprint ~ '^[0-9a-f]{64}$');
  end if;
end
$$;

create unique index if not exists resource_fact_claims_fingerprint_unique
  on public.resource_fact_claims (claim_fingerprint)
  where claim_fingerprint is not null;

create unique index if not exists resource_fact_evidence_fingerprint_unique
  on public.resource_fact_evidence (evidence_fingerprint)
  where evidence_fingerprint is not null;

create index if not exists resource_fact_claims_queue_idx
  on public.resource_fact_claims (status, decision_category, last_observed_at desc);

alter table public.resource_fact_claims enable row level security;
alter table public.resource_fact_evidence enable row level security;
revoke all on table public.resource_fact_claims, public.resource_fact_evidence
from anon, authenticated;

commit;
