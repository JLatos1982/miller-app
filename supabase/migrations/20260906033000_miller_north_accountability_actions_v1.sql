-- Private, review-gated accountability history for Miller North.  This
-- migration adds no public table, browser-facing grants, or publication path.
-- An accountability action is distinct from the underlying incident: it records
-- what an organization, regulator, court, or reviewer did afterwards.

create table if not exists public.miller_north_accountability_cohorts (
  id uuid primary key default gen_random_uuid(),
  accountability_cohort_id text not null unique check (accountability_cohort_id ~ '^mac_[a-f0-9]{24}$'),
  working_title text not null check (char_length(btrim(working_title)) between 1 and 240),
  province text not null check (province in ('british_columbia', 'alberta', 'saskatchewan')),
  community_location text,
  healthcare_organization text,
  population_summary text not null check (char_length(btrim(population_summary)) between 1 and 2000),
  cohort_summary text not null check (char_length(btrim(cohort_summary)) between 1 and 6000),
  identity_protection text not null check (identity_protection in ('public_named_cohort', 'anonymized_cohort', 'systemic_pattern')),
  evidence_classification text not null check (evidence_classification in ('official_primary_source', 'official_plus_independent_corroboration', 'independent_corroboration', 'reported_unconfirmed', 'owner_review_required')),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  owner_review_flag boolean not null default true,
  owner_review_reason text,
  publication_state text not null default 'staged_private_review' check (publication_state in ('staged_private_review', 'owner_review_required', 'approved_for_publication', 'publication_blocked')),
  cohort_fingerprint text not null unique check (cohort_fingerprint ~ '^[a-f0-9]{24,128}$'),
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((owner_review_flag and owner_review_reason is not null and char_length(btrim(owner_review_reason)) between 1 and 2000) or (not owner_review_flag and owner_review_reason is null)),
  check (not owner_review_flag or publication_state in ('staged_private_review', 'owner_review_required', 'publication_blocked'))
);

create table if not exists public.miller_north_accountability_actions (
  id uuid primary key default gen_random_uuid(),
  accountability_action_id text not null unique check (accountability_action_id ~ '^maa_[a-f0-9]{24}$'),
  benchmark_candidate_id text unique,
  accountability_chain_id text not null check (accountability_chain_id ~ '^[a-z0-9][a-z0-9_]{2,119}$'),
  working_title text not null check (char_length(btrim(working_title)) between 1 and 240),
  province text not null check (province in ('british_columbia', 'alberta', 'saskatchewan')),
  community_location text,
  healthcare_organization text,
  relevant_indigenous_community text,
  action_type text not null check (action_type in ('formal_review', 'final_report_recommendations', 'apology', 'governance_change', 'policy_practice_change', 'training_standard', 'regulatory_legislative_change', 'progress_report', 'oversight_complaint_mechanism', 'legal_human_rights_process')),
  accountability_stage text not null check (accountability_stage in ('allegation', 'investigation_started', 'investigation_completed', 'finding', 'recommendation', 'commitment', 'implementation_started', 'implementation_partial', 'implementation_completed', 'implementation_unclear', 'follow_up_review')),
  action_date date,
  action_year integer check (action_year between 1800 and 2200),
  approximate_action_year integer check (approximate_action_year between 1800 and 2200),
  action_date_text text,
  action_timing_semantic text not null check (action_timing_semantic in ('exact_action_date', 'action_year', 'approximate_action_year', 'date_range_or_month', 'unknown')),
  triggering_incident_summary text not null check (char_length(btrim(triggering_incident_summary)) between 1 and 6000),
  action_summary text not null check (char_length(btrim(action_summary)) between 1 and 6000),
  recommendations text,
  implementation_status text not null check (implementation_status in ('not_applicable', 'announced_or_planned', 'underway', 'partial', 'implemented', 'completed', 'operational', 'outcome_not_public', 'unclear')),
  implementation_status_detail text,
  implementation_evidence_date date,
  implementation_evidence_date_text text,
  evidence_classification text not null check (evidence_classification in ('official_primary_source', 'official_plus_independent_corroboration', 'independent_corroboration', 'reported_unconfirmed', 'owner_review_required')),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  owner_review_flag boolean not null default true,
  owner_review_reason text,
  publication_state text not null default 'staged_private_review' check (publication_state in ('staged_private_review', 'owner_review_required', 'approved_for_publication', 'publication_blocked')),
  action_fingerprint text not null unique check (action_fingerprint ~ '^[a-f0-9]{24,128}$'),
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
    (action_timing_semantic = 'exact_action_date' and action_date is not null and action_year = extract(year from action_date)::integer and approximate_action_year is null)
    or (action_timing_semantic = 'action_year' and action_date is null and action_year is not null and approximate_action_year is null)
    or (action_timing_semantic = 'approximate_action_year' and action_date is null and action_year is null and approximate_action_year is not null)
    or (action_timing_semantic = 'date_range_or_month' and action_date is null and action_year is null and approximate_action_year is null and action_date_text is not null)
    or (action_timing_semantic = 'unknown' and action_date is null and action_year is null and approximate_action_year is null)
  ),
  check ((owner_review_flag and owner_review_reason is not null and char_length(btrim(owner_review_reason)) between 1 and 2000) or (not owner_review_flag and owner_review_reason is null)),
  check (not owner_review_flag or publication_state in ('staged_private_review', 'owner_review_required', 'publication_blocked'))
);

create table if not exists public.miller_north_accountability_action_sources (
  id uuid primary key default gen_random_uuid(),
  accountability_action_id uuid not null references public.miller_north_accountability_actions(id) on delete restrict,
  source_organization text not null check (char_length(btrim(source_organization)) between 1 and 240),
  source_title text,
  source_url text not null check (source_url ~ '^https://'),
  source_type text,
  publication_date date,
  source_role text not null check (source_role in ('underlying_incident', 'investigation', 'finding', 'recommendation', 'commitment', 'implementation', 'follow_up')),
  relevant_evidence text check (relevant_evidence is null or char_length(relevant_evidence) <= 6000),
  evidence_classification text check (evidence_classification is null or evidence_classification in ('official_primary_source', 'official_plus_independent_corroboration', 'independent_corroboration', 'reported_unconfirmed', 'owner_review_required')),
  retrieval_fingerprint text,
  retrieval_state text not null default 'current' check (retrieval_state in ('current', 'needs_revisit', 'changed', 'unavailable')),
  is_independent boolean not null default true,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (accountability_action_id, source_url)
);

create table if not exists public.miller_north_accountability_action_incident_links (
  id uuid primary key default gen_random_uuid(),
  accountability_action_id uuid not null references public.miller_north_accountability_actions(id) on delete restrict,
  incident_id uuid not null references public.miller_north_incidents(id) on delete restrict,
  relationship_type text not null check (relationship_type in ('underlying_incident', 'direct_case_follow_up', 'related_case_context', 'systemic_context', 'candidate_match')),
  relationship_confidence text not null check (relationship_confidence in ('strong', 'bounded', 'review_required')),
  relationship_summary text not null check (char_length(btrim(relationship_summary)) between 1 and 2000),
  owner_review_flag boolean not null default true,
  owner_review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (accountability_action_id, incident_id, relationship_type),
  check ((owner_review_flag and owner_review_reason is not null and char_length(btrim(owner_review_reason)) between 1 and 2000) or (not owner_review_flag and owner_review_reason is null))
);

create table if not exists public.miller_north_accountability_action_cohort_links (
  id uuid primary key default gen_random_uuid(),
  accountability_action_id uuid not null references public.miller_north_accountability_actions(id) on delete restrict,
  accountability_cohort_id uuid not null references public.miller_north_accountability_cohorts(id) on delete restrict,
  relationship_type text not null check (relationship_type in ('underlying_cohort', 'direct_cohort_follow_up', 'systemic_context', 'candidate_match')),
  relationship_confidence text not null check (relationship_confidence in ('strong', 'bounded', 'review_required')),
  relationship_summary text not null check (char_length(btrim(relationship_summary)) between 1 and 2000),
  owner_review_flag boolean not null default true,
  owner_review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (accountability_action_id, accountability_cohort_id, relationship_type),
  check ((owner_review_flag and owner_review_reason is not null and char_length(btrim(owner_review_reason)) between 1 and 2000) or (not owner_review_flag and owner_review_reason is null))
);

create index if not exists miller_north_accountability_actions_review_idx on public.miller_north_accountability_actions (province, publication_state, owner_review_flag, last_researched_at desc);
create index if not exists miller_north_accountability_actions_chain_idx on public.miller_north_accountability_actions (accountability_chain_id, action_date desc, action_year desc);
create index if not exists miller_north_accountability_sources_action_idx on public.miller_north_accountability_action_sources (accountability_action_id, source_role);
create index if not exists miller_north_accountability_incident_links_incident_idx on public.miller_north_accountability_action_incident_links (incident_id, relationship_type);
create index if not exists miller_north_accountability_cohort_links_cohort_idx on public.miller_north_accountability_action_cohort_links (accountability_cohort_id, relationship_type);

create or replace function public.miller_north_refresh_accountability_source_counts()
returns trigger language plpgsql set search_path = public as $$
declare target_action_id uuid := coalesce(new.accountability_action_id, old.accountability_action_id);
begin
  update public.miller_north_accountability_actions
     set source_count = (select count(*) from public.miller_north_accountability_action_sources where accountability_action_id = target_action_id),
         independent_source_count = (select count(*) from public.miller_north_accountability_action_sources where accountability_action_id = target_action_id and is_independent),
         updated_at = now()
   where id = target_action_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists miller_north_accountability_cohorts_touch on public.miller_north_accountability_cohorts;
create trigger miller_north_accountability_cohorts_touch before update on public.miller_north_accountability_cohorts for each row execute function public.miller_north_touch_research_row();
drop trigger if exists miller_north_accountability_actions_touch on public.miller_north_accountability_actions;
create trigger miller_north_accountability_actions_touch before update on public.miller_north_accountability_actions for each row execute function public.miller_north_touch_research_row();
drop trigger if exists miller_north_accountability_sources_touch on public.miller_north_accountability_action_sources;
create trigger miller_north_accountability_sources_touch before update on public.miller_north_accountability_action_sources for each row execute function public.miller_north_touch_research_row();
drop trigger if exists miller_north_accountability_incident_links_touch on public.miller_north_accountability_action_incident_links;
create trigger miller_north_accountability_incident_links_touch before update on public.miller_north_accountability_action_incident_links for each row execute function public.miller_north_touch_research_row();
drop trigger if exists miller_north_accountability_cohort_links_touch on public.miller_north_accountability_action_cohort_links;
create trigger miller_north_accountability_cohort_links_touch before update on public.miller_north_accountability_action_cohort_links for each row execute function public.miller_north_touch_research_row();
drop trigger if exists miller_north_accountability_sources_count on public.miller_north_accountability_action_sources;
create trigger miller_north_accountability_sources_count after insert or update or delete on public.miller_north_accountability_action_sources for each row execute function public.miller_north_refresh_accountability_source_counts();

alter table public.miller_north_accountability_cohorts enable row level security;
alter table public.miller_north_accountability_cohorts force row level security;
alter table public.miller_north_accountability_actions enable row level security;
alter table public.miller_north_accountability_actions force row level security;
alter table public.miller_north_accountability_action_sources enable row level security;
alter table public.miller_north_accountability_action_sources force row level security;
alter table public.miller_north_accountability_action_incident_links enable row level security;
alter table public.miller_north_accountability_action_incident_links force row level security;
alter table public.miller_north_accountability_action_cohort_links enable row level security;
alter table public.miller_north_accountability_action_cohort_links force row level security;
revoke all on public.miller_north_accountability_cohorts, public.miller_north_accountability_actions, public.miller_north_accountability_action_sources, public.miller_north_accountability_action_incident_links, public.miller_north_accountability_action_cohort_links from public, anon, authenticated;
revoke all on function public.miller_north_refresh_accountability_source_counts() from public, anon, authenticated;
grant select, insert, update, delete on public.miller_north_accountability_cohorts, public.miller_north_accountability_actions, public.miller_north_accountability_action_sources, public.miller_north_accountability_action_incident_links, public.miller_north_accountability_action_cohort_links to service_role;
