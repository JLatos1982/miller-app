begin;
create table public.location_qc_review_snapshots (
  id bigint generated always as identity primary key,
  canonical_resource_id uuid not null references public.resource_registry(id) on delete cascade,
  qc_version integer not null check (qc_version > 0),
  snapshot jsonb not null,
  origin text not null check (origin in ('human_qc','evidence_refresh')),
  refresh_reason text not null default '',
  prior_version integer,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (canonical_resource_id, qc_version)
);
alter table public.location_qc_review_snapshots enable row level security;
revoke all on table public.location_qc_review_snapshots from anon, authenticated;
create or replace function public.refresh_location_qc_evidence(p_canonical_resource_id uuid,p_policy_version text,p_classification_fingerprint text,p_refreshed_snapshot jsonb,p_reason text,p_expected_version integer,p_actor_id uuid) returns public.location_qc_reviews language plpgsql security definer set search_path=public as $$
declare current_row public.location_qc_reviews; next_row public.location_qc_reviews;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_canonical_resource_id::text,0));
 select * into current_row from public.location_qc_reviews where canonical_resource_id=p_canonical_resource_id for update;
 if not found or current_row.version <> p_expected_version then raise exception 'QC refresh version conflict' using errcode='40001'; end if;
 insert into public.location_qc_review_snapshots(canonical_resource_id,qc_version,snapshot,origin,refresh_reason,prior_version,actor_id) values(p_canonical_resource_id,current_row.version,current_row.review_snapshot,'human_qc','historical snapshot preserved before evidence refresh',null,p_actor_id) on conflict do nothing;
 update public.location_qc_reviews set policy_version=p_policy_version,classification_fingerprint=p_classification_fingerprint,decision='manual_review',decision_note=left('Evidence refreshed; human QC confirmation required. '||coalesce(p_reason,''),1000),review_snapshot=p_refreshed_snapshot,version=current_row.version+1,reviewed_by=p_actor_id,reviewed_at=now(),updated_at=now() where canonical_resource_id=p_canonical_resource_id returning * into next_row;
 insert into public.location_qc_review_snapshots(canonical_resource_id,qc_version,snapshot,origin,refresh_reason,prior_version,actor_id) values(p_canonical_resource_id,next_row.version,p_refreshed_snapshot,'evidence_refresh',left(coalesce(p_reason,''),1000),current_row.version,p_actor_id);
 insert into public.location_qc_review_audit(canonical_resource_id,previous_decision,new_decision,previous_version,new_version,policy_version,classification_fingerprint,decision_note,actor_id) values(p_canonical_resource_id,current_row.decision,'manual_review',current_row.version,next_row.version,p_policy_version,p_classification_fingerprint,left('Evidence refresh: '||coalesce(p_reason,''),1000),p_actor_id);
 return next_row;
end $$;
revoke all on function public.refresh_location_qc_evidence(uuid,text,text,jsonb,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.refresh_location_qc_evidence(uuid,text,text,jsonb,text,integer,uuid) to service_role;
commit;
