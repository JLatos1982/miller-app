-- Private recommendation/commitment and policy/legal context for Miller North.
-- This migration is additive only: it seeds nothing, creates no browser policy,
-- and provides no public publication path.

create table if not exists public.miller_north_accountability_commitments (
  id uuid primary key default gen_random_uuid(),
  accountability_commitment_id text not null unique check (accountability_commitment_id ~ '^macm_[a-f0-9]{24}$'),
  accountability_action_id uuid not null references public.miller_north_accountability_actions(id) on delete restrict,
  accountability_chain_id text not null check (accountability_chain_id ~ '^[a-z0-9][a-z0-9_]{2,119}$'),
  working_title text not null check (char_length(btrim(working_title)) between 1 and 240),
  commitment_summary text not null check (char_length(btrim(commitment_summary)) between 1 and 6000),
  original_wording_excerpt text check (original_wording_excerpt is null or char_length(original_wording_excerpt) <= 1200),
  commitment_type text not null check (commitment_type in ('recommendation', 'formal_commitment', 'corrective_action_requirement', 'promised_reform', 'required_policy_change', 'required_training', 'governance_reform', 'oversight_mechanism', 'service_commitment', 'reporting_requirement', 'legislative_commitment', 'regulatory_requirement', 'settlement_obligation', 'tribunal_directed_action', 'audit_recommendation')),
  originating_organization text not null,
  responsible_organizations text[] not null default '{}'::text[] check (cardinality(responsible_organizations) > 0),
  responsible_authority text,
  date_issued date,
  date_issued_text text,
  date_accepted date,
  expected_completion_date date,
  expected_completion_date_text text,
  implementation_status text not null check (implementation_status in ('implemented', 'partially_implemented', 'implementation_underway', 'implementation_announced', 'no_clear_evidence_found', 'implementation_unclear', 'implementation_disputed', 'superseded', 'not_applicable', 'owner_review_required')),
  implementation_status_date date,
  implementation_status_date_text text,
  implementation_scope text not null check (implementation_scope in ('local', 'pilot', 'organization_wide', 'regional', 'provincial', 'system_wide', 'interprovincial', 'federal', 'unclear', 'not_applicable')),
  implementation_evidence_summary text check (implementation_evidence_summary is null or char_length(implementation_evidence_summary) <= 6000),
  follow_up_due_date date,
  follow_up_due_date_text text,
  repeat_recommendation_flag boolean not null default false,
  repeated_from_commitment_id uuid references public.miller_north_accountability_commitments(id) on delete restrict,
  superseded_by_commitment_id uuid references public.miller_north_accountability_commitments(id) on delete restrict,
  evidence_classification text not null check (evidence_classification in ('official_primary_source', 'official_plus_independent_corroboration', 'independent_corroboration', 'reported_unconfirmed', 'owner_review_required')),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  owner_review_flag boolean not null default true,
  owner_review_reason text,
  publication_state text not null default 'staged_private_review' check (publication_state in ('staged_private_review', 'owner_review_required', 'approved_for_publication', 'publication_blocked')),
  commitment_fingerprint text not null unique check (commitment_fingerprint ~ '^[a-f0-9]{24,128}$'),
  research_version text not null,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (repeated_from_commitment_id is null or repeated_from_commitment_id <> id),
  check (superseded_by_commitment_id is null or superseded_by_commitment_id <> id),
  check ((owner_review_flag and owner_review_reason is not null and char_length(btrim(owner_review_reason)) between 1 and 2000) or (not owner_review_flag and owner_review_reason is null)),
  check (not owner_review_flag or publication_state in ('staged_private_review', 'owner_review_required', 'publication_blocked'))
);

create table if not exists public.miller_north_accountability_commitment_sources (
  id uuid primary key default gen_random_uuid(),
  accountability_commitment_id uuid not null references public.miller_north_accountability_commitments(id) on delete restrict,
  source_organization text not null check (char_length(btrim(source_organization)) between 1 and 240),
  source_title text,
  source_url text not null check (source_url ~ '^https://'),
  source_type text,
  publication_date date,
  source_role text not null check (source_role in ('originating_recommendation', 'acceptance', 'implementation', 'evaluation', 'repeat_signal', 'supersession')),
  relevant_evidence text check (relevant_evidence is null or char_length(relevant_evidence) <= 6000),
  evidence_classification text not null check (evidence_classification in ('official_primary_source', 'official_plus_independent_corroboration', 'independent_corroboration', 'reported_unconfirmed', 'owner_review_required')),
  is_independent boolean not null default false,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (accountability_commitment_id, source_url, source_role)
);

create table if not exists public.miller_north_policy_legal_instruments (
  id uuid primary key default gen_random_uuid(),
  policy_legal_instrument_id text not null unique check (policy_legal_instrument_id ~ '^mpli_[a-f0-9]{24}$'),
  benchmark_candidate_id text unique,
  working_title text not null check (char_length(btrim(working_title)) between 1 and 300),
  instrument_type text not null check (instrument_type in ('legislation', 'regulation', 'government_policy', 'ministry_directive', 'health_authority_policy', 'professional_standard', 'regulatory_standard', 'practice_standard', 'code_of_ethics_conduct', 'government_order', 'ministerial_directive', 'tribunal_decision', 'human_rights_decision', 'court_judgment', 'settlement_public_resolution', 'coroner_recommendation', 'inquest_recommendation', 'commissioned_review_recommendation', 'ombudsperson_recommendation', 'oversight_complaint_mechanism', 'implementation_framework', 'formal_action_plan', 'government_response', 'regulatory_action_plan')),
  jurisdiction text not null check (jurisdiction in ('british_columbia', 'alberta', 'saskatchewan', 'canada_federal', 'interprovincial_national')),
  province text check (province is null or province in ('british_columbia', 'alberta', 'saskatchewan')),
  issuing_authority text not null,
  responsible_organizations text[] not null default '{}'::text[],
  date_issued date,
  date_issued_text text,
  effective_date date,
  effective_date_text text,
  repeal_or_supersession_date date,
  repeal_or_supersession_date_text text,
  current_status text not null check (current_status in ('proposed', 'announced', 'adopted', 'in_force', 'operational', 'under_review', 'amended', 'superseded', 'repealed', 'expired', 'settled', 'decided', 'unknown')),
  binding_status text not null check (binding_status in ('binding', 'non_binding', 'mixed', 'unknown')),
  binding_status_evidence text check (binding_status_evidence is null or char_length(binding_status_evidence) <= 2000),
  scope text,
  healthcare_setting text,
  indigenous_specific_relevance text not null check (char_length(btrim(indigenous_specific_relevance)) between 1 and 4000),
  neutral_summary text not null check (char_length(btrim(neutral_summary)) between 1 and 6000),
  key_obligations_or_recommendations text,
  evidence_classification text not null check (evidence_classification in ('official_primary_source', 'official_plus_independent_corroboration', 'independent_corroboration', 'reported_unconfirmed', 'owner_review_required')),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  recurrence_signal text not null default 'no_recurrence_assessed' check (recurrence_signal in ('no_recurrence_assessed', 'later_related_signal_found', 'repeated_recommendation', 'continued_gap_reported', 'later_incident_found', 'insufficient_evidence')),
  owner_review_flag boolean not null default true,
  owner_review_reason text,
  publication_state text not null default 'staged_private_review' check (publication_state in ('staged_private_review', 'owner_review_required', 'approved_for_publication', 'publication_blocked')),
  instrument_fingerprint text not null unique check (instrument_fingerprint ~ '^[a-f0-9]{24,128}$'),
  research_version text not null,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((jurisdiction in ('british_columbia', 'alberta', 'saskatchewan') and province = jurisdiction) or jurisdiction in ('canada_federal', 'interprovincial_national')),
  check ((owner_review_flag and owner_review_reason is not null and char_length(btrim(owner_review_reason)) between 1 and 2000) or (not owner_review_flag and owner_review_reason is null)),
  check (not owner_review_flag or publication_state in ('staged_private_review', 'owner_review_required', 'publication_blocked'))
);

create table if not exists public.miller_north_policy_legal_instrument_sources (
  id uuid primary key default gen_random_uuid(),
  policy_legal_instrument_id uuid not null references public.miller_north_policy_legal_instruments(id) on delete restrict,
  source_organization text not null,
  source_title text,
  source_url text not null check (source_url ~ '^https://'),
  source_type text not null,
  publication_date date,
  source_role text not null check (source_role in ('official_text', 'issuance', 'implementation', 'evaluation', 'legal_context', 'corroboration', 'recurrence_signal', 'supersession')),
  relevant_evidence text check (relevant_evidence is null or char_length(relevant_evidence) <= 6000),
  evidence_classification text not null check (evidence_classification in ('official_primary_source', 'official_plus_independent_corroboration', 'independent_corroboration', 'reported_unconfirmed', 'owner_review_required')),
  is_independent boolean not null default false,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (policy_legal_instrument_id, source_url, source_role)
);

create table if not exists public.miller_north_policy_legal_instrument_incident_links (
  id uuid primary key default gen_random_uuid(),
  policy_legal_instrument_id uuid not null references public.miller_north_policy_legal_instruments(id) on delete restrict,
  incident_id uuid not null references public.miller_north_incidents(id) on delete restrict,
  relationship_type text not null check (relationship_type in ('governed_by', 'investigated_under', 'complaint_under', 'decision_under', 'resulted_in', 'prompted_change_to', 'responds_to', 'creates_oversight_for', 'candidate_match')),
  relationship_confidence text not null check (relationship_confidence in ('strong', 'bounded', 'review_required')),
  relationship_summary text not null,
  owner_review_flag boolean not null default true,
  owner_review_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (policy_legal_instrument_id, incident_id, relationship_type),
  check ((owner_review_flag and owner_review_reason is not null) or (not owner_review_flag and owner_review_reason is null))
);

create table if not exists public.miller_north_policy_legal_instrument_cohort_links (
  id uuid primary key default gen_random_uuid(),
  policy_legal_instrument_id uuid not null references public.miller_north_policy_legal_instruments(id) on delete restrict,
  accountability_cohort_id uuid not null references public.miller_north_accountability_cohorts(id) on delete restrict,
  relationship_type text not null check (relationship_type in ('governed_by', 'investigated_under', 'complaint_under', 'resulted_in', 'prompted_change_to', 'responds_to', 'creates_oversight_for', 'candidate_match')),
  relationship_confidence text not null check (relationship_confidence in ('strong', 'bounded', 'review_required')),
  relationship_summary text not null,
  owner_review_flag boolean not null default true,
  owner_review_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (policy_legal_instrument_id, accountability_cohort_id, relationship_type),
  check ((owner_review_flag and owner_review_reason is not null) or (not owner_review_flag and owner_review_reason is null))
);

create table if not exists public.miller_north_policy_legal_instrument_action_links (
  id uuid primary key default gen_random_uuid(),
  policy_legal_instrument_id uuid not null references public.miller_north_policy_legal_instruments(id) on delete restrict,
  accountability_action_id uuid not null references public.miller_north_accountability_actions(id) on delete restrict,
  relationship_type text not null check (relationship_type in ('governed_by', 'investigated_under', 'complaint_under', 'decision_under', 'resulted_in', 'prompted_change_to', 'implements', 'partially_implements', 'responds_to', 'operationalizes', 'cited_by', 'repeated_by', 'creates_oversight_for')),
  relationship_confidence text not null check (relationship_confidence in ('strong', 'bounded', 'review_required')),
  relationship_summary text not null,
  owner_review_flag boolean not null default true,
  owner_review_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (policy_legal_instrument_id, accountability_action_id, relationship_type),
  check ((owner_review_flag and owner_review_reason is not null) or (not owner_review_flag and owner_review_reason is null))
);

create table if not exists public.miller_north_policy_legal_instrument_commitment_links (
  id uuid primary key default gen_random_uuid(),
  policy_legal_instrument_id uuid not null references public.miller_north_policy_legal_instruments(id) on delete restrict,
  accountability_commitment_id uuid not null references public.miller_north_accountability_commitments(id) on delete restrict,
  relationship_type text not null check (relationship_type in ('resulted_in', 'prompted_change_to', 'implements', 'partially_implements', 'responds_to', 'operationalizes', 'cited_by', 'repeated_by', 'creates_oversight_for')),
  relationship_confidence text not null check (relationship_confidence in ('strong', 'bounded', 'review_required')),
  relationship_summary text not null,
  owner_review_flag boolean not null default true,
  owner_review_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (policy_legal_instrument_id, accountability_commitment_id, relationship_type),
  check ((owner_review_flag and owner_review_reason is not null) or (not owner_review_flag and owner_review_reason is null))
);

create table if not exists public.miller_north_policy_legal_instrument_relations (
  id uuid primary key default gen_random_uuid(),
  source_instrument_id uuid not null references public.miller_north_policy_legal_instruments(id) on delete restrict,
  target_instrument_id uuid not null references public.miller_north_policy_legal_instruments(id) on delete restrict,
  relationship_type text not null check (relationship_type in ('amends', 'supersedes', 'implements', 'partially_implements', 'responds_to', 'operationalizes', 'cites', 'repeats', 'predecessor_of')),
  relationship_confidence text not null check (relationship_confidence in ('strong', 'bounded', 'review_required')),
  relationship_summary text not null,
  owner_review_flag boolean not null default true,
  owner_review_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (source_instrument_id, target_instrument_id, relationship_type),
  check (source_instrument_id <> target_instrument_id),
  check ((owner_review_flag and owner_review_reason is not null) or (not owner_review_flag and owner_review_reason is null))
);

create index if not exists miller_north_commitments_action_idx on public.miller_north_accountability_commitments (accountability_action_id, implementation_status);
create index if not exists miller_north_commitments_chain_idx on public.miller_north_accountability_commitments (accountability_chain_id, date_issued desc);
create index if not exists miller_north_commitment_sources_idx on public.miller_north_accountability_commitment_sources (accountability_commitment_id, source_role);
create index if not exists miller_north_policy_instruments_review_idx on public.miller_north_policy_legal_instruments (jurisdiction, instrument_type, publication_state, owner_review_flag);
create index if not exists miller_north_policy_sources_idx on public.miller_north_policy_legal_instrument_sources (policy_legal_instrument_id, source_role);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'miller_north_accountability_commitments', 'miller_north_accountability_commitment_sources',
    'miller_north_policy_legal_instruments', 'miller_north_policy_legal_instrument_sources',
    'miller_north_policy_legal_instrument_incident_links', 'miller_north_policy_legal_instrument_cohort_links',
    'miller_north_policy_legal_instrument_action_links', 'miller_north_policy_legal_instrument_commitment_links',
    'miller_north_policy_legal_instrument_relations'
  ] loop
    execute format('drop trigger if exists %I_touch on public.%I', table_name, table_name);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.miller_north_touch_research_row()', table_name, table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
  end loop;
end;
$$;
