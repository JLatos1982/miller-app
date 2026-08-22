begin;
create table public.miller_attention_topics (
  id uuid primary key default gen_random_uuid(),
  topic_key text not null unique check (topic_key ~ '^[a-z0-9:_|-]{3,240}$'),
  topic_type text not null check (topic_type in ('resource','region_category','substance','treatment','policy','service_system','drug_safety','toxic_drug','cultural')),
  title text not null check (length(title) between 1 and 240),
  geographic_scope text,
  service_scope text,
  canonical_resource_id uuid references public.resource_registry(id) on delete restrict,
  state text not null default 'background' check (state in ('background','watch','focus','urgent_review')),
  status text not null default 'active' check (status in ('active','acknowledged','resolved','suppressed')),
  current_score numeric(6,2) not null default 0 check (current_score between 0 and 100),
  first_observed_at timestamptz not null default now(),
  last_reinforced_at timestamptz,
  last_recalculated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'::jsonb
);
create table public.miller_attention_signals (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.miller_attention_topics(id) on delete restrict,
  topic_key text not null check (topic_key ~ '^[a-z0-9:_|-]{3,240}$'),
  signal_fingerprint text not null unique check (signal_fingerprint ~ '^[a-f0-9]{64}$'),
  underlying_event_key text not null check (length(underlying_event_key) between 3 and 300),
  signal_type text not null check (signal_type in ('service_change','scientific_evidence','drug_safety','toxic_drug_alert','epidemiology_trend','policy_change','coverage_gap','cultural_signal','security_reflex')),
  signal_family text not null check (signal_family in ('services','scientific','pharmacology','toxic_drug','policy','growth','cultural','security')),
  source_id text not null,
  source_authority integer not null check (source_authority between 0 and 100),
  magnitude numeric(4,3) not null check (magnitude between 0 and 1),
  novelty numeric(4,3) not null check (novelty between 0 and 1),
  relevance numeric(4,3) not null check (relevance between 0 and 1),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  observed_at timestamptz not null default now(), effective_at timestamptz,
  decay_class text not null check (decay_class in ('fast','medium','slow')),
  reflex_eligible boolean not null default false,
  reason_codes jsonb not null default '[]'::jsonb,
  provenance jsonb not null default '{}'::jsonb
);
create table public.miller_attention_topic_events (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.miller_attention_topics(id) on delete restrict,
  event_type text not null check (event_type in ('created','reinforced','recalculated','decayed','acknowledged','resolved','reactivated','suppressed')),
  prior_score numeric(6,2), next_score numeric(6,2) not null check (next_score between 0 and 100),
  prior_state text, next_state text not null check (next_state in ('background','watch','focus','urgent_review')),
  reason_codes jsonb not null default '[]'::jsonb, provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index miller_attention_signals_topic_observed_idx on public.miller_attention_signals(topic_id,observed_at desc);
create index miller_attention_topics_state_score_idx on public.miller_attention_topics(state,current_score desc);
alter table public.miller_attention_topics enable row level security;
alter table public.miller_attention_signals enable row level security;
alter table public.miller_attention_topic_events enable row level security;
revoke all on public.miller_attention_topics,public.miller_attention_signals,public.miller_attention_topic_events from public,anon,authenticated;
grant select,insert,update on public.miller_attention_topics,miller_attention_signals,miller_attention_topic_events to service_role;
create trigger miller_attention_signals_no_change before update or delete on public.miller_attention_signals for each row execute function public.prevent_resource_fact_audit_mutation();
create trigger miller_attention_topic_events_no_change before update or delete on public.miller_attention_topic_events for each row execute function public.prevent_resource_fact_audit_mutation();
commit;
