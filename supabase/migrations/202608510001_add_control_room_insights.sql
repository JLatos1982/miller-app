begin;
create table public.miller_attention_directives (
 id uuid primary key default gen_random_uuid(), directive_key text not null unique check(directive_key ~ '^[a-f0-9]{64}$'), actor_id uuid not null references auth.users(id) on delete restrict,
 directive_type text not null check(directive_type in ('focus','investigate','keep_watch','de_emphasize')),
 topic_id uuid references public.miller_attention_topics(id) on delete restrict,
 topic_key text not null check(topic_key ~ '^[a-z0-9:_|-]{3,240}$'), strength integer not null check(strength between 1 and 3), reason text not null check(length(reason) between 1 and 280),
 status text not null default 'active' check(status in ('active','expired','cancelled')),
 created_at timestamptz not null default now(), expires_at timestamptz not null, updated_at timestamptz not null default now(),
 check(expires_at > created_at and expires_at <= created_at + interval '31 days')
);
create index miller_attention_directives_active_idx on public.miller_attention_directives(status,expires_at,topic_key);
create table public.miller_attention_directive_events (
 id uuid primary key default gen_random_uuid(), directive_id uuid not null references public.miller_attention_directives(id) on delete restrict,
 event_type text not null check(event_type in ('created','expired','cancelled')), actor_id uuid references auth.users(id) on delete restrict,
 provenance jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.miller_insights (
 id uuid primary key default gen_random_uuid(), insight_fingerprint text not null unique check(insight_fingerprint ~ '^[a-f0-9]{64}$'), material_fingerprint text not null check(material_fingerprint ~ '^[a-f0-9]{64}$'),
 insight_type text not null check(insight_type in ('directory_navigation_gap','directory_evidence_gap','coverage_question_resolved','derived_state_inconsistency','source_context_convergence')),
 status text not null default 'new' check(status in ('new','acknowledged','watching','superseded','resolved','dismissed')),
 topic_id uuid references public.miller_attention_topics(id) on delete restrict, hypothesis_id uuid references public.miller_coverage_hypotheses(id) on delete restrict,
 observation jsonb not null default '{}'::jsonb, relationship jsonb not null default '{}'::jsonb, interpretation text not null check(length(interpretation)<=700), confidence numeric(4,3) not null check(confidence between 0 and 1), uncertainty text not null check(length(uncertainty)<=500), alternative_explanation text not null check(length(alternative_explanation)<=500), provenance jsonb not null default '{}'::jsonb,
 first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), recurrence_count integer not null default 1 check(recurrence_count>0), acknowledged_at timestamptz, resolved_at timestamptz, dismissed_at timestamptz
);
create index miller_insights_active_idx on public.miller_insights(status,last_seen_at desc);
create table public.miller_insight_events (
 id uuid primary key default gen_random_uuid(), insight_id uuid not null references public.miller_insights(id) on delete restrict, event_type text not null check(event_type in ('created','reinforced','materially_changed','acknowledged','watching','resolved','dismissed','superseded')), actor_id uuid references auth.users(id) on delete restrict, reason_code text not null check(length(reason_code)<=100), provenance jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.miller_attention_directives enable row level security; alter table public.miller_attention_directive_events enable row level security; alter table public.miller_insights enable row level security; alter table public.miller_insight_events enable row level security;
revoke all on public.miller_attention_directives,public.miller_attention_directive_events,public.miller_insights,public.miller_insight_events from public,anon,authenticated;
grant select,insert,update on public.miller_attention_directives,public.miller_insights to service_role;
grant select,insert on public.miller_attention_directive_events,public.miller_insight_events to service_role;
create trigger miller_attention_directive_events_no_change before update or delete on public.miller_attention_directive_events for each row execute function public.prevent_resource_fact_audit_mutation();
create trigger miller_insight_events_no_change before update or delete on public.miller_insight_events for each row execute function public.prevent_resource_fact_audit_mutation();
create trigger miller_insights_no_delete before delete on public.miller_insights for each row execute function public.prevent_resource_fact_audit_mutation();
commit;
