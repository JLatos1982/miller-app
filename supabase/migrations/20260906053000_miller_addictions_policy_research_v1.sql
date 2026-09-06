-- Private Miller addictions policy, commitment, implementation, and service-link layer.
-- Additive only: no seed data, no browser policy, and no public publication path.

create or replace function public.miller_touch_private_research_row()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.miller_addictions_policy_chains (
  id uuid primary key default gen_random_uuid(),
  policy_chain_id text not null unique check (policy_chain_id ~ '^mapc_[a-z0-9_]{3,100}$'),
  research_domain text not null default 'miller_addictions' check (research_domain = 'miller_addictions'),
  title text not null check (char_length(btrim(title)) between 1 and 240),
  topic_tags text[] not null default '{}',
  neutral_summary text not null check (char_length(btrim(neutral_summary)) between 1 and 6000),
  owner_review_flag boolean not null default true,
  owner_review_reason text,
  publication_state text not null default 'staged_private_review' check (publication_state in ('staged_private_review', 'owner_review_required', 'approved_for_publication', 'publication_blocked')),
  research_version text not null,
  provenance jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((owner_review_flag and owner_review_reason is not null and char_length(btrim(owner_review_reason)) > 0) or (not owner_review_flag and owner_review_reason is null)),
  check (not owner_review_flag or publication_state <> 'approved_for_publication')
);

create table public.miller_addictions_policy_instruments (
  id uuid primary key default gen_random_uuid(),
  policy_instrument_id text not null unique check (policy_instrument_id ~ '^mapi_[a-f0-9]{24}$'),
  benchmark_candidate_id text unique,
  policy_chain_id uuid not null references public.miller_addictions_policy_chains(id) on delete restrict,
  research_domain text not null default 'miller_addictions' check (research_domain = 'miller_addictions'),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  instrument_type text not null check (instrument_type in ('legislation', 'regulation', 'federal_exemption', 'government_order', 'ministerial_order', 'government_policy', 'policy_direction', 'formal_framework', 'government_strategy', 'government_response', 'funding_announcement', 'service_implementation', 'professional_standard', 'clinical_guideline', 'court_judgment', 'tribunal_decision', 'coroner_death_review_report', 'coroner_inquest_recommendation', 'public_health_recommendation', 'implementation_report', 'audit_report', 'evaluation_report', 'outcome_surveillance')),
  jurisdiction text not null check (jurisdiction in ('british_columbia', 'canada_federal', 'canada_national', 'alberta_comparison', 'saskatchewan_comparison')),
  province text check (province is null or province in ('british_columbia', 'alberta', 'saskatchewan')),
  issuing_authority text not null,
  date_issued date,
  date_issued_text text,
  effective_date date,
  effective_date_text text,
  current_status text not null check (current_status in ('proposed', 'announced', 'adopted', 'in_force', 'operational', 'under_review', 'amended', 'superseded', 'repealed', 'expired', 'decided', 'published', 'unknown')),
  binding_status text not null check (binding_status in ('binding', 'non_binding', 'mixed', 'unknown')),
  binding_status_evidence text,
  topic_tags text[] not null default '{}',
  neutral_summary text not null check (char_length(btrim(neutral_summary)) between 1 and 6000),
  implementation_status text not null check (implementation_status in ('implemented', 'partially_implemented', 'implementation_underway', 'implementation_announced', 'no_clear_evidence_found', 'implementation_unclear', 'implementation_disputed', 'superseded', 'not_applicable', 'owner_review_required')),
  implementation_status_date date,
  implementation_status_date_text text,
  implementation_scope text not null check (implementation_scope in ('facility', 'local', 'regional', 'provincial', 'federal', 'pilot', 'system_wide', 'unclear', 'not_applicable')),
  implementation_evidence_summary text,
  recurrence_signal text not null default 'no_recurrence_assessed' check (recurrence_signal in ('no_recurrence_assessed', 'later_related_signal_found', 'repeated_recommendation', 'continued_gap_reported', 'later_incident_found', 'insufficient_evidence')),
  recurrence_notes text,
  evidence_classification text not null check (evidence_classification in ('official_primary_source', 'official_plus_independent_corroboration', 'independent_corroboration', 'reported_unconfirmed', 'owner_review_required')),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  owner_review_flag boolean not null default true,
  owner_review_reason text,
  publication_state text not null default 'staged_private_review' check (publication_state in ('staged_private_review', 'owner_review_required', 'approved_for_publication', 'publication_blocked')),
  instrument_fingerprint text not null unique check (instrument_fingerprint ~ '^[a-f0-9]{64}$'),
  research_version text not null,
  provenance jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((owner_review_flag and owner_review_reason is not null and char_length(btrim(owner_review_reason)) > 0) or (not owner_review_flag and owner_review_reason is null)),
  check (not owner_review_flag or publication_state <> 'approved_for_publication')
);

create index miller_addictions_policy_instruments_chain_idx on public.miller_addictions_policy_instruments(policy_chain_id, date_issued);
create index miller_addictions_policy_instruments_topic_idx on public.miller_addictions_policy_instruments using gin(topic_tags);

create table public.miller_addictions_policy_instrument_sources (
  id uuid primary key default gen_random_uuid(),
  policy_instrument_id uuid not null references public.miller_addictions_policy_instruments(id) on delete restrict,
  source_organization text not null,
  source_title text,
  source_url text not null check (source_url ~ '^https://'),
  source_type text not null,
  publication_date date,
  source_role text not null check (source_role in ('official_text', 'issuance', 'recommendation', 'response', 'implementation', 'evaluation', 'outcome', 'legal_context', 'supersession', 'corroboration', 'recurrence_signal')),
  relevant_evidence text,
  evidence_classification text not null check (evidence_classification in ('official_primary_source', 'official_plus_independent_corroboration', 'independent_corroboration', 'reported_unconfirmed', 'owner_review_required')),
  is_independent boolean not null default false,
  provenance jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(policy_instrument_id, source_url, source_role)
);

create table public.miller_addictions_commitments (
  id uuid primary key default gen_random_uuid(),
  commitment_id text not null unique check (commitment_id ~ '^madc_[a-f0-9]{24}$'),
  candidate_commitment_id text unique,
  policy_chain_id uuid not null references public.miller_addictions_policy_chains(id) on delete restrict,
  originating_policy_instrument_id uuid references public.miller_addictions_policy_instruments(id) on delete restrict,
  research_domain text not null default 'miller_addictions' check (research_domain = 'miller_addictions'),
  title text not null check (char_length(btrim(title)) between 1 and 240),
  summary text not null check (char_length(btrim(summary)) between 1 and 6000),
  commitment_type text not null check (commitment_type in ('recommendation', 'formal_commitment', 'funding_commitment', 'service_commitment', 'policy_change', 'regulatory_change', 'reporting_requirement', 'corrective_action', 'implementation_obligation', 'evaluation_commitment', 'audit_recommendation')),
  originating_organization text not null,
  responsible_organizations text[] not null check (cardinality(responsible_organizations) > 0),
  date_issued date,
  date_issued_text text,
  date_accepted date,
  expected_completion_date date,
  expected_completion_date_text text,
  implementation_status text not null check (implementation_status in ('implemented', 'partially_implemented', 'implementation_underway', 'implementation_announced', 'no_clear_evidence_found', 'implementation_unclear', 'implementation_disputed', 'superseded', 'not_applicable', 'owner_review_required')),
  implementation_status_date date,
  implementation_status_date_text text,
  implementation_scope text not null check (implementation_scope in ('facility', 'local', 'regional', 'provincial', 'federal', 'pilot', 'system_wide', 'unclear', 'not_applicable')),
  implementation_evidence_summary text,
  expected_service_quantity numeric check (expected_service_quantity is null or expected_service_quantity >= 0),
  expected_service_unit text,
  funding_amount_cad numeric check (funding_amount_cad is null or funding_amount_cad >= 0),
  follow_up_due_date date,
  repeat_recommendation_flag boolean not null default false,
  repeated_from_commitment_id uuid references public.miller_addictions_commitments(id) on delete restrict,
  superseded_by_commitment_id uuid references public.miller_addictions_commitments(id) on delete restrict,
  evidence_classification text not null check (evidence_classification in ('official_primary_source', 'official_plus_independent_corroboration', 'independent_corroboration', 'reported_unconfirmed', 'owner_review_required')),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  owner_review_flag boolean not null default true,
  owner_review_reason text,
  publication_state text not null default 'staged_private_review' check (publication_state in ('staged_private_review', 'owner_review_required', 'approved_for_publication', 'publication_blocked')),
  commitment_fingerprint text not null unique check (commitment_fingerprint ~ '^[a-f0-9]{64}$'),
  research_version text not null,
  provenance jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (repeated_from_commitment_id is null or repeated_from_commitment_id <> id),
  check (superseded_by_commitment_id is null or superseded_by_commitment_id <> id),
  check ((owner_review_flag and owner_review_reason is not null and char_length(btrim(owner_review_reason)) > 0) or (not owner_review_flag and owner_review_reason is null)),
  check (not owner_review_flag or publication_state <> 'approved_for_publication')
);

create index miller_addictions_commitments_chain_idx on public.miller_addictions_commitments(policy_chain_id, date_issued);

create table public.miller_addictions_commitment_sources (
  id uuid primary key default gen_random_uuid(),
  commitment_id uuid not null references public.miller_addictions_commitments(id) on delete restrict,
  source_organization text not null,
  source_title text,
  source_url text not null check (source_url ~ '^https://'),
  source_type text not null,
  publication_date date,
  source_role text not null check (source_role in ('recommendation', 'acceptance', 'commitment', 'funding', 'implementation', 'service_availability', 'evaluation', 'repeat_signal', 'supersession')),
  relevant_evidence text,
  evidence_classification text not null check (evidence_classification in ('official_primary_source', 'official_plus_independent_corroboration', 'independent_corroboration', 'reported_unconfirmed', 'owner_review_required')),
  is_independent boolean not null default false,
  provenance jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(commitment_id, source_url, source_role)
);

create table public.miller_addictions_policy_instrument_relations (
  id uuid primary key default gen_random_uuid(),
  from_policy_instrument_id uuid not null references public.miller_addictions_policy_instruments(id) on delete restrict,
  to_policy_instrument_id uuid not null references public.miller_addictions_policy_instruments(id) on delete restrict,
  relationship_type text not null check (relationship_type in ('amends', 'supersedes', 'implements', 'partially_implements', 'responds_to', 'operationalizes', 'cited_by', 'repeated_by', 'created_by', 'evaluates')),
  relationship_summary text not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  owner_review_flag boolean not null default true,
  owner_review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(from_policy_instrument_id, to_policy_instrument_id, relationship_type),
  check (from_policy_instrument_id <> to_policy_instrument_id),
  check ((owner_review_flag and owner_review_reason is not null and char_length(btrim(owner_review_reason)) > 0) or (not owner_review_flag and owner_review_reason is null))
);

create table public.miller_addictions_policy_resource_links (
  id uuid primary key default gen_random_uuid(),
  policy_instrument_id uuid references public.miller_addictions_policy_instruments(id) on delete restrict,
  commitment_id uuid references public.miller_addictions_commitments(id) on delete restrict,
  canonical_resource_id uuid references public.resource_registry(id) on delete restrict,
  resource_candidate_name text not null check (char_length(btrim(resource_candidate_name)) between 1 and 300),
  resource_match_state text not null check (resource_match_state in ('exact_candidate', 'possible_candidate', 'unresolved', 'no_match_expected')),
  relationship_type text not null check (relationship_type in ('funds', 'authorizes', 'regulates', 'creates', 'expands', 'restricts', 'governs', 'requires', 'implements', 'partially_implements', 'associated_with')),
  relationship_summary text not null,
  service_quantity numeric check (service_quantity is null or service_quantity >= 0),
  service_unit text,
  operational_evidence_date date,
  operational_evidence_summary text,
  evidence_source_url text not null check (evidence_source_url ~ '^https://'),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  owner_review_flag boolean not null default true,
  owner_review_reason text,
  publication_state text not null default 'staged_private_review' check (publication_state in ('staged_private_review', 'owner_review_required', 'approved_for_publication', 'publication_blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (policy_instrument_id is not null or commitment_id is not null),
  check (resource_match_state <> 'exact_candidate' or canonical_resource_id is not null),
  check ((owner_review_flag and owner_review_reason is not null and char_length(btrim(owner_review_reason)) > 0) or (not owner_review_flag and owner_review_reason is null)),
  check (not owner_review_flag or publication_state <> 'approved_for_publication')
);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'miller_addictions_policy_chains',
    'miller_addictions_policy_instruments',
    'miller_addictions_policy_instrument_sources',
    'miller_addictions_commitments',
    'miller_addictions_commitment_sources',
    'miller_addictions_policy_instrument_relations',
    'miller_addictions_policy_resource_links'
  ] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.miller_touch_private_research_row()', table_name, table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
  end loop;
end;
$$;
