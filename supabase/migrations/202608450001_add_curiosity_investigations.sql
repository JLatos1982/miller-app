begin;
create table public.miller_curiosity_investigations (
 id uuid primary key, actor_id uuid not null references auth.users(id), question_id text not null, topic_id uuid not null references public.miller_attention_topics(id) on delete restrict,
 investigation_type text not null, tool_ids jsonb not null default '[]'::jsonb, budget jsonb not null default '{}'::jsonb, usage jsonb not null default '{}'::jsonb,
 outcome text not null check (outcome in ('answered','partially_answered','new_signal','no_material_change','insufficient_evidence','conflicting_evidence','human_review','stale_question','failed')),
 uncertainty_decreased boolean not null default false, before_score numeric(6,2), after_score numeric(6,2), stop_reason text not null, summary text not null check (length(summary) between 1 and 1000), started_at timestamptz not null default now(), completed_at timestamptz not null default now()
);
create table public.miller_curiosity_investigation_results (
 investigation_id uuid not null references public.miller_curiosity_investigations(id) on delete restrict, stable_result_id text not null, result_type text not null, compact_summary text not null check(length(compact_summary)<=1000), provenance jsonb not null default '{}'::jsonb, primary key(investigation_id,stable_result_id)
);
alter table public.miller_curiosity_investigations enable row level security;
alter table public.miller_curiosity_investigation_results enable row level security;
revoke all on public.miller_curiosity_investigations,public.miller_curiosity_investigation_results from public,anon,authenticated;
grant select,insert,update on public.miller_curiosity_investigations,miller_curiosity_investigation_results to service_role;
create trigger miller_curiosity_investigations_no_delete before delete on public.miller_curiosity_investigations for each row execute function public.prevent_resource_fact_audit_mutation();
create trigger miller_curiosity_investigation_results_no_change before update or delete on public.miller_curiosity_investigation_results for each row execute function public.prevent_resource_fact_audit_mutation();
commit;
