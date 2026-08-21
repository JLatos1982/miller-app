begin;

-- Private QC eligibility is deliberately broader than publication eligibility.
-- Pending resources may be reviewed, while hidden, merged, and retired canonical
-- identities remain ineligible. This function never writes resource_locations.
create or replace function public.save_location_qc_review_decision(
  p_canonical_resource_id uuid, p_policy_version text, p_classification_fingerprint text,
  p_decision text, p_decision_note text, p_review_snapshot jsonb,
  p_expected_version integer, p_actor_id uuid
) returns public.location_qc_reviews language plpgsql security definer set search_path = public as $$
declare v_current public.location_qc_reviews; v_next public.location_qc_reviews;
begin
  if p_decision not in ('pilot_eligible','manual_review','correct_address','exclude_exact_location','policy_problem','defer') then raise exception 'invalid decision'; end if;
  if not exists (
    select 1 from public.resource_registry
    where id = p_canonical_resource_id
      and lifecycle_state = 'active'
      and editorial_status <> 'hidden'
  ) then raise exception 'canonical resource is not eligible'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_canonical_resource_id::text, 0));
  select * into v_current from public.location_qc_reviews where canonical_resource_id = p_canonical_resource_id for update;
  -- PT409 is PostgREST's explicit HTTP-conflict SQLSTATE. Using 40001 here
  -- causes automatic serialization retries for a deterministic stale version.
  if coalesce(v_current.version, 0) <> p_expected_version then raise exception 'review version conflict' using errcode = 'PT409'; end if;
  insert into public.location_qc_reviews (canonical_resource_id,policy_version,classification_fingerprint,decision,decision_note,review_snapshot,version,reviewed_by,reviewed_at,updated_at)
  values (p_canonical_resource_id,p_policy_version,p_classification_fingerprint,p_decision,left(coalesce(p_decision_note,''),1000),p_review_snapshot,p_expected_version+1,p_actor_id,now(),now())
  on conflict (canonical_resource_id) do update set policy_version=excluded.policy_version,classification_fingerprint=excluded.classification_fingerprint,decision=excluded.decision,decision_note=excluded.decision_note,review_snapshot=excluded.review_snapshot,version=excluded.version,reviewed_by=excluded.reviewed_by,reviewed_at=now(),updated_at=now()
  returning * into v_next;
  insert into public.location_qc_review_audit (canonical_resource_id,previous_decision,new_decision,previous_version,new_version,policy_version,classification_fingerprint,decision_note,actor_id)
  values (p_canonical_resource_id,v_current.decision,p_decision,coalesce(v_current.version,0),v_next.version,p_policy_version,p_classification_fingerprint,left(coalesce(p_decision_note,''),1000),p_actor_id);
  return v_next;
end $$;

revoke all on function public.save_location_qc_review_decision(uuid,text,text,text,text,jsonb,integer,uuid) from public, anon, authenticated;
grant execute on function public.save_location_qc_review_decision(uuid,text,text,text,text,jsonb,integer,uuid) to service_role;

commit;
