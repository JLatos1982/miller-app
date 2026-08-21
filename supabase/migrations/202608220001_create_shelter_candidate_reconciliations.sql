begin;

create table if not exists public.shelter_candidate_reconciliations (
  id bigint generated always as identity primary key,
  left_candidate_id bigint not null references public.resource_discovery_candidates(id) on delete cascade,
  right_candidate_id bigint not null references public.resource_discovery_candidates(id) on delete cascade,
  classification_fingerprint text not null,
  decision text not null check (decision in ('same_program_duplicate','different_program','needs_more_research')),
  decision_note text not null default '',
  version integer not null default 1 check (version > 0),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (left_candidate_id < right_candidate_id),
  unique (left_candidate_id, right_candidate_id)
);
create table if not exists public.shelter_candidate_reconciliation_audit (
  id bigint generated always as identity primary key,
  reconciliation_id bigint not null references public.shelter_candidate_reconciliations(id) on delete cascade,
  previous_decision text,
  new_decision text not null,
  previous_version integer,
  new_version integer not null,
  classification_fingerprint text not null,
  decision_note text not null default '',
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists shelter_candidate_reconciliation_pair_idx on public.shelter_candidate_reconciliations(left_candidate_id, right_candidate_id);
alter table public.shelter_candidate_reconciliations enable row level security;
alter table public.shelter_candidate_reconciliation_audit enable row level security;
revoke all on table public.shelter_candidate_reconciliations, public.shelter_candidate_reconciliation_audit from anon, authenticated;

create or replace function public.prevent_shelter_candidate_reconciliation_audit_mutation() returns trigger language plpgsql as $$ begin raise exception 'shelter reconciliation audit is append-only'; end $$;
create trigger shelter_candidate_reconciliation_audit_append_only before update or delete on public.shelter_candidate_reconciliation_audit for each row execute function public.prevent_shelter_candidate_reconciliation_audit_mutation();

create or replace function public.save_shelter_candidate_reconciliation(
  p_left_candidate_id bigint, p_right_candidate_id bigint, p_classification_fingerprint text,
  p_decision text, p_decision_note text, p_expected_version integer, p_actor_id uuid
) returns public.shelter_candidate_reconciliations language plpgsql security definer set search_path = public as $$
declare v_left bigint := least(p_left_candidate_id,p_right_candidate_id); v_right bigint := greatest(p_left_candidate_id,p_right_candidate_id); v_current public.shelter_candidate_reconciliations; v_next public.shelter_candidate_reconciliations;
begin
  if p_left_candidate_id = p_right_candidate_id or p_decision not in ('same_program_duplicate','different_program','needs_more_research') then raise exception 'invalid shelter reconciliation'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_left::text || ':' || v_right::text,0));
  select * into v_current from public.shelter_candidate_reconciliations where left_candidate_id=v_left and right_candidate_id=v_right for update;
  if found and v_current.version <> p_expected_version then raise exception using errcode='40001', message='shelter reconciliation version conflict'; end if;
  if found then update public.shelter_candidate_reconciliations set classification_fingerprint=p_classification_fingerprint,decision=p_decision,decision_note=left(p_decision_note,1000),version=v_current.version+1,reviewed_by=p_actor_id,reviewed_at=now(),updated_at=now() where id=v_current.id returning * into v_next;
  else insert into public.shelter_candidate_reconciliations(left_candidate_id,right_candidate_id,classification_fingerprint,decision,decision_note,reviewed_by) values(v_left,v_right,p_classification_fingerprint,p_decision,left(p_decision_note,1000),p_actor_id) returning * into v_next; end if;
  insert into public.shelter_candidate_reconciliation_audit(reconciliation_id,previous_decision,new_decision,previous_version,new_version,classification_fingerprint,decision_note,actor_id) values(v_next.id,v_current.decision,v_next.decision,v_current.version,v_next.version,p_classification_fingerprint,left(p_decision_note,1000),p_actor_id);
  return v_next;
end $$;
revoke all on function public.save_shelter_candidate_reconciliation(bigint,bigint,text,text,text,integer,uuid) from public, anon, authenticated;
grant execute on function public.save_shelter_candidate_reconciliation(bigint,bigint,text,text,text,integer,uuid) to service_role;
commit;
