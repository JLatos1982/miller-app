-- Private Miller North research layer. These tables intentionally have no
-- browser-facing grants or RLS policies; only the existing trusted backend's
-- service-role client may read or write them after its own requireAdmin check.
create table if not exists public.miller_north_incidents (
  id uuid primary key default gen_random_uuid(),
  legacy_proposal_id text not null unique check (legacy_proposal_id ~ '^mni_[a-f0-9]{24}$'),
  corpus_id text not null,
  working_title text not null check (char_length(btrim(working_title)) between 1 and 240),
  province text not null check (province in ('british_columbia', 'alberta', 'saskatchewan')),
  municipality text,
  facility text,
  care_setting text,
  event_date date,
  event_year integer check (event_year between 1800 and 2200),
  approximate_event_year integer check (approximate_event_year between 1800 and 2200),
  publication_date date,
  timing_semantic text not null check (timing_semantic in ('exact_event_date', 'event_year', 'approximate_event_year', 'publication_only', 'unknown')),
  timing_confidence text not null check (timing_confidence in ('confirmed', 'strongly_supported', 'approximate', 'publication_only', 'unresolved')),
  timing_derivation jsonb not null default '{}'::jsonb,
  incident_summary text not null check (char_length(btrim(incident_summary)) between 1 and 6000),
  reported_issue text,
  evidence_status text not null check (char_length(btrim(evidence_status)) between 1 and 160),
  incident_fingerprint text not null unique check (incident_fingerprint ~ '^[a-f0-9]{24,128}$'),
  reconciliation_confidence text not null check (reconciliation_confidence in ('strong', 'bounded', 'review_required')),
  duplicate_review_state text not null check (duplicate_review_state in ('new_incident_candidate', 'existing_incident', 'probable_duplicate', 'related_context_not_same_incident', 'insufficient_identity')),
  proposal_state text not null check (proposal_state in ('staged_private_review', 'private_reconciliation_review', 'accepted_incident', 'needs_more_evidence', 'probable_duplicate', 'reject_not_incident')),
  source_count integer not null default 0 check (source_count >= 0),
  independent_source_count integer not null default 0 check (independent_source_count >= 0),
  first_discovered_at timestamptz not null default now(),
  last_researched_at timestamptz not null default now(),
  change_revisit_state text not null default 'current' check (change_revisit_state in ('current', 'needs_revisit', 'changed')),
  research_version text not null,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (timing_semantic = 'exact_event_date' and event_date is not null and event_year = extract(year from event_date)::integer and approximate_event_year is null)
    or (timing_semantic = 'event_year' and event_date is null and event_year is not null and approximate_event_year is null)
    or (timing_semantic = 'approximate_event_year' and event_date is null and event_year is null and approximate_event_year is not null)
    or (timing_semantic = 'publication_only' and event_date is null and event_year is null and approximate_event_year is null and publication_date is not null)
    or (timing_semantic = 'unknown' and event_date is null and event_year is null and approximate_event_year is null and publication_date is null)
  )
);

create table if not exists public.miller_north_incident_sources (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.miller_north_incidents(id) on delete restrict,
  source_organization text not null check (char_length(btrim(source_organization)) between 1 and 240),
  source_title text,
  source_url text not null check (source_url ~ '^https://'),
  source_type text,
  publication_date date,
  source_role text not null check (source_role in ('primary_report', 'indigenous_organization_account', 'corroborating_report', 'institutional_response', 'government_review', 'human_rights_complaint', 'regulatory_or_legal', 'finding_or_determination', 'context')),
  relevant_evidence text check (relevant_evidence is null or char_length(relevant_evidence) <= 6000),
  evidence_confidence text,
  retrieval_fingerprint text,
  retrieval_state text not null default 'current' check (retrieval_state in ('current', 'needs_revisit', 'changed', 'unavailable')),
  is_independent boolean not null default true,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (incident_id, source_url)
);

create index if not exists miller_north_incidents_research_idx on public.miller_north_incidents (province, proposal_state, last_researched_at desc);
create index if not exists miller_north_incidents_timing_idx on public.miller_north_incidents (timing_semantic, event_year, approximate_event_year);
create index if not exists miller_north_incident_sources_incident_idx on public.miller_north_incident_sources (incident_id, source_role);
create index if not exists miller_north_incident_sources_fingerprint_idx on public.miller_north_incident_sources (retrieval_fingerprint) where retrieval_fingerprint is not null;

create or replace function public.miller_north_touch_research_row()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.miller_north_refresh_source_counts()
returns trigger language plpgsql set search_path = public as $$
declare target_incident_id uuid := coalesce(new.incident_id, old.incident_id);
begin
  update public.miller_north_incidents
     set source_count = (select count(*) from public.miller_north_incident_sources where incident_id = target_incident_id),
         independent_source_count = (select count(*) from public.miller_north_incident_sources where incident_id = target_incident_id and is_independent),
         updated_at = now()
   where id = target_incident_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists miller_north_incidents_touch on public.miller_north_incidents;
create trigger miller_north_incidents_touch before update on public.miller_north_incidents for each row execute function public.miller_north_touch_research_row();
drop trigger if exists miller_north_incident_sources_touch on public.miller_north_incident_sources;
create trigger miller_north_incident_sources_touch before update on public.miller_north_incident_sources for each row execute function public.miller_north_touch_research_row();
drop trigger if exists miller_north_incident_sources_count on public.miller_north_incident_sources;
create trigger miller_north_incident_sources_count after insert or update or delete on public.miller_north_incident_sources for each row execute function public.miller_north_refresh_source_counts();

alter table public.miller_north_incidents enable row level security;
alter table public.miller_north_incidents force row level security;
alter table public.miller_north_incident_sources enable row level security;
alter table public.miller_north_incident_sources force row level security;
revoke all on public.miller_north_incidents, public.miller_north_incident_sources from public, anon, authenticated;
revoke all on function public.miller_north_touch_research_row() from public, anon, authenticated;
revoke all on function public.miller_north_refresh_source_counts() from public, anon, authenticated;
