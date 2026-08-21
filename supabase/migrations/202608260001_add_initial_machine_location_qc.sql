begin;

alter table public.location_qc_reviews add column if not exists origin text not null default 'human_qc' check (origin in ('human_qc','machine_initial','evidence_refresh'));
alter table public.location_qc_review_snapshots drop constraint if exists location_qc_review_snapshots_origin_check;
alter table public.location_qc_review_snapshots add constraint location_qc_review_snapshots_origin_check check (origin in ('human_qc','machine_initial','evidence_refresh'));

create or replace function public.create_location_qc_machine_review(
  p_canonical_resource_id uuid, p_policy_version text, p_classification_fingerprint text,
  p_review_snapshot jsonb, p_reason text, p_actor_id uuid
) returns public.location_qc_reviews language plpgsql security definer set search_path = public as $$
declare v_next public.location_qc_reviews;
begin
  if not exists (select 1 from public.resource_registry where id = p_canonical_resource_id and lifecycle_state = 'active' and editorial_status <> 'hidden') then raise exception 'canonical resource is not eligible'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_canonical_resource_id::text, 0));
  if exists (select 1 from public.location_qc_reviews where canonical_resource_id = p_canonical_resource_id for update) then raise exception 'initial machine review already exists or QC is already human-reviewed' using errcode = 'PT409'; end if;
  insert into public.location_qc_reviews(canonical_resource_id,policy_version,classification_fingerprint,decision,decision_note,review_snapshot,version,reviewed_by,reviewed_at,updated_at,origin)
  values(p_canonical_resource_id,p_policy_version,p_classification_fingerprint,'manual_review',left('Machine evidence package awaiting human review. '||coalesce(p_reason,''),1000),p_review_snapshot,1,p_actor_id,now(),now(),'machine_initial') returning * into v_next;
  insert into public.location_qc_review_snapshots(canonical_resource_id,qc_version,snapshot,origin,refresh_reason,prior_version,actor_id)
  values(p_canonical_resource_id,1,p_review_snapshot,'machine_initial',left(coalesce(p_reason,''),1000),null,p_actor_id);
  insert into public.location_qc_review_audit(canonical_resource_id,previous_decision,new_decision,previous_version,new_version,policy_version,classification_fingerprint,decision_note,actor_id)
  values(p_canonical_resource_id,null,'manual_review',0,1,p_policy_version,p_classification_fingerprint,left('Machine-origin initial QC: '||coalesce(p_reason,''),1000),p_actor_id);
  return v_next;
end $$;

revoke all on function public.create_location_qc_machine_review(uuid,text,text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.create_location_qc_machine_review(uuid,text,text,jsonb,text,uuid) to service_role;
commit;
