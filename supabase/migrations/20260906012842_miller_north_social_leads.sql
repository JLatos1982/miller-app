-- Private social-listening lead reservoir. A lead is never an incident
-- determination; it must be separately verified and reconciled before any
-- incident proposal is created.
create table if not exists public.miller_north_social_leads (
  id uuid primary key default gen_random_uuid(),
  social_lead_id text not null unique check (social_lead_id ~ '^msl_[a-f0-9]{24}$'),
  platform text not null check (platform in ('reddit', 'facebook', 'instagram', 'tiktok', 'public_organization_post', 'other_public_social')),
  source_url text not null unique check (source_url ~ '^https://'),
  public_account_name text check (public_account_name is null or char_length(btrim(public_account_name)) between 1 and 240),
  discovered_at timestamptz not null default now(),
  province text check (province is null or province in ('british_columbia', 'alberta', 'saskatchewan')),
  municipality text,
  facility text,
  event_date date,
  event_year integer check (event_year between 1800 and 2200),
  approximate_event_year integer check (approximate_event_year between 1800 and 2200),
  timing_semantic text not null default 'unknown' check (timing_semantic in ('exact_event_date', 'event_year', 'approximate_event_year', 'publication_only', 'unknown')),
  public_excerpt text not null check (char_length(btrim(public_excerpt)) between 1 and 3000),
  lead_status text not null check (lead_status in ('new_social_lead', 'high_value_social_lead', 'possible_incident', 'existing_incident_support', 'verification_needed', 'systemic_context', 'insufficient', 'rejected')),
  source_fingerprint text not null unique check (source_fingerprint ~ '^[a-f0-9]{24,128}$'),
  potential_incident_id uuid references public.miller_north_incidents(id) on delete restrict,
  verification_state text not null default 'unverified' check (verification_state in ('unverified', 'targeted_verification_needed', 'verified_incident', 'matched_existing_incident', 'context_only', 'insufficient')),
  change_revisit_state text not null default 'current' check (change_revisit_state in ('current', 'needs_revisit', 'changed')),
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (timing_semantic = 'exact_event_date' and event_date is not null and event_year = extract(year from event_date)::integer and approximate_event_year is null)
    or (timing_semantic = 'event_year' and event_date is null and event_year is not null and approximate_event_year is null)
    or (timing_semantic = 'approximate_event_year' and event_date is null and event_year is null and approximate_event_year is not null)
    or (timing_semantic in ('publication_only', 'unknown') and event_date is null and event_year is null and approximate_event_year is null)
  )
);

create index if not exists miller_north_social_leads_triage_idx
  on public.miller_north_social_leads (lead_status, province, discovered_at desc);
create index if not exists miller_north_social_leads_revisit_idx
  on public.miller_north_social_leads (change_revisit_state, discovered_at desc);

drop trigger if exists miller_north_social_leads_touch on public.miller_north_social_leads;
create trigger miller_north_social_leads_touch
  before update on public.miller_north_social_leads
  for each row execute function public.miller_north_touch_research_row();

alter table public.miller_north_social_leads enable row level security;
alter table public.miller_north_social_leads force row level security;
revoke all on public.miller_north_social_leads from public, anon, authenticated;
