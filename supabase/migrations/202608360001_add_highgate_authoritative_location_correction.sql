begin;

create table public.authoritative_location_corrections (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resource_registry(id) on delete restrict,
  legacy_source_record_id uuid not null references public.trusted_master_resource_records(id) on delete restrict,
  correction_policy text not null check (correction_policy = 'authoritative_location_correction_v1'),
  corrected_address text not null check (corrected_address = 'Unit 320, 7155 Kingsway, Burnaby, BC'),
  authoritative_sources jsonb not null,
  reason_code text not null check (reason_code = 'legacy_hash_prefixed_unit_misclassified_nonphysical'),
  actor_id uuid not null references auth.users(id),
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(resource_id, correction_policy)
);
alter table public.authoritative_location_corrections enable row level security;
revoke all on public.authoritative_location_corrections from public, anon, authenticated;
grant select, insert on public.authoritative_location_corrections to service_role;

create or replace function public.prevent_authoritative_location_correction_mutation() returns trigger language plpgsql as $$
begin raise exception 'authoritative location corrections are append-only'; end $$;
create trigger authoritative_location_corrections_append_only before update or delete on public.authoritative_location_corrections for each row execute function public.prevent_authoritative_location_correction_mutation();

create table public.location_qc_supersessions (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resource_registry(id) on delete restrict,
  correction_id uuid not null references public.authoritative_location_corrections(id) on delete restrict,
  prior_qc_version integer not null,
  new_qc_version integer not null,
  reason_code text not null check (reason_code = 'authoritative_location_correction'),
  machine_actor text not null default 'miller_map_automation',
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(resource_id, correction_id)
);
alter table public.location_qc_supersessions enable row level security;
revoke all on public.location_qc_supersessions from public, anon, authenticated;
grant select, insert on public.location_qc_supersessions to service_role;
create trigger location_qc_supersessions_append_only before update or delete on public.location_qc_supersessions for each row execute function public.prevent_authoritative_location_correction_mutation();

create or replace function public.apply_highgate_authoritative_location_correction(p_resource_id uuid, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_resource public.resource_registry; v_legacy public.trusted_master_resource_records; v_correction public.authoritative_location_corrections; v_claim public.resource_fact_claims; v_fingerprint text; v_sources jsonb := jsonb_build_array(
  'https://www.fraserhealth.ca/Service-Directory/Locations/Burnaby/highgate-village',
  case when p_resource_id='23b498ab-7fed-5fbc-9f21-c9bea51cdf46'::uuid then 'https://www.fraserhealth.ca/Service-Directory/Service-at-Location/E/B/community-substance-use-services-clinic---burnaby' else 'https://www.fraserhealth.ca/Service-Directory/Service-at-Location/D/7/opioid-treatment---burnaby' end
); begin
  if p_resource_id not in ('23b498ab-7fed-5fbc-9f21-c9bea51cdf46'::uuid,'b980ad5f-6dfc-5c03-ab5e-bbaaaf3d499f'::uuid) then raise exception 'resource is not authorized for the fixed HighGate correction'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_resource_id::text, 36));
  select * into v_resource from public.resource_registry where id=p_resource_id for update;
  if not found or v_resource.lifecycle_state<>'active' or v_resource.editorial_status='hidden' then raise exception 'canonical resource is not eligible'; end if;
  select * into v_legacy from public.trusted_master_resource_records where resource_id=p_resource_id and active and physical_address=false and original_address='#320-7155 Kingsway' order by recorded_at desc limit 1 for update;
  if not found then raise exception 'required legacy hash-prefixed HighGate assertion is absent'; end if;
  select * into v_correction from public.authoritative_location_corrections where resource_id=p_resource_id and correction_policy='authoritative_location_correction_v1';
  if found then return jsonb_build_object('outcome','idempotent','correction_id',v_correction.id); end if;
  insert into public.authoritative_location_corrections(resource_id,legacy_source_record_id,correction_policy,corrected_address,authoritative_sources,reason_code,actor_id)
  values(p_resource_id,v_legacy.id,'authoritative_location_correction_v1','Unit 320, 7155 Kingsway, Burnaby, BC',v_sources,'legacy_hash_prefixed_unit_misclassified_nonphysical',p_actor_id) returning * into v_correction;
  v_fingerprint:=encode(extensions.digest('authoritative_location_correction_v1:'||p_resource_id::text||':unit320-7155-kingsway-burnaby','sha256'),'hex');
  select * into v_claim from public.resource_fact_claims where claim_fingerprint=v_fingerprint for update;
  if not found then
    insert into public.resource_fact_claims(resource_id,field_name,proposed_value,risk,recommendation,confidence,reason_codes,engine_version,status,claim_fingerprint,decision_category,research_summary,last_observed_at)
    values(p_resource_id,'location_occupancy',to_jsonb('Unit 320, 7155 Kingsway, Burnaby, BC'::text),'medium','human_review','high',array['authoritative_location_correction','public_physical_service_location'],'authoritative_location_correction_v1','observed',v_fingerprint,'location_occupancy','Current authoritative HighGate evidence supersedes a legacy hash-prefixed non-physical parser conclusion.',now()) returning * into v_claim;
  end if;
  insert into public.resource_fact_evidence(claim_id,source_type,source_record_id,source_url,extracted_value,extraction_method,retrieved_at,source_authority,independent_key,stale,evidence_fingerprint)
  select v_claim.id,'official',v_correction.id::text,source,jsonb_build_object('address','Unit 320, 7155 Kingsway, Burnaby, BC','physical_address',true,'public_service_location',true,'correction_id',v_correction.id),'fixed_highgate_authoritative_location_correction',now(),95,'highgate:'||p_resource_id::text||':'||source,false,encode(extensions.digest('highgate-evidence:'||p_resource_id::text||':'||source,'sha256'),'hex')
  from jsonb_array_elements_text(v_sources) source on conflict (evidence_fingerprint) where evidence_fingerprint is not null do nothing;
  insert into public.resource_fact_change_audit(claim_id,resource_id,field_name,previous_value,new_value,action,reason_codes,actor_type,actor_id) values(v_claim.id,p_resource_id,'location_occupancy',to_jsonb(v_legacy.original_address),v_claim.proposed_value,'observe',array['authoritative_location_correction_v1','legacy_preserved'],'miller_automation',p_actor_id);
  return jsonb_build_object('outcome','created','correction_id',v_correction.id,'claim_id',v_claim.id);
end $$;

revoke all on function public.apply_highgate_authoritative_location_correction(uuid,uuid) from public, anon, authenticated;
grant execute on function public.apply_highgate_authoritative_location_correction(uuid,uuid) to service_role;

create or replace function public.supersede_highgate_human_qc_with_machine_initial(p_resource_id uuid,p_correction_id uuid,p_geocoder_evidence_id uuid,p_expected_human_qc_version integer,p_actor_id uuid)
returns public.location_qc_reviews language plpgsql security definer set search_path=public as $$
declare v_correction public.authoritative_location_corrections; v_current public.location_qc_reviews; v_geo jsonb; v_claim public.resource_fact_claims; v_next public.location_qc_reviews; v_snapshot jsonb; v_fingerprint text;
begin
 if p_resource_id <> '23b498ab-7fed-5fbc-9f21-c9bea51cdf46'::uuid then raise exception 'only the fixed HighGate counselling QC may be superseded'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_resource_id::text,37));
 select * into v_correction from public.authoritative_location_corrections where id=p_correction_id and resource_id=p_resource_id and correction_policy='authoritative_location_correction_v1'; if not found then raise exception 'required authoritative location correction is absent'; end if;
 select * into v_current from public.location_qc_reviews where canonical_resource_id=p_resource_id for update;
 if not found or v_current.version<>p_expected_human_qc_version then raise exception 'QC supersession version conflict' using errcode='40001'; end if;
 if v_current.origin='machine_initial' then return v_current; end if;
 if v_current.origin<>'human_qc' then raise exception 'only a current human QC may use this fixed supersession path'; end if;
 select c.* into v_claim from public.resource_fact_claims c where c.resource_id=p_resource_id and c.field_name='location_occupancy' and c.engine_version='authoritative_location_correction_v1' and c.status not in ('rejected','unknown','superseded') order by c.created_at desc limit 1; if not found then raise exception 'corrected authoritative occupancy claim is absent'; end if;
 select e.extracted_value into v_geo from public.resource_fact_evidence e where e.id=p_geocoder_evidence_id and e.claim_id=v_claim.id and e.source_type='bc_geocoder' and e.stale is not true; if not found then raise exception 'bound current BC geocoder evidence is absent'; end if;
 if coalesce((v_geo->>'score')::numeric,0)<>100 or lower(coalesce(v_geo->>'location_descriptor',''))<>'parcelpoint' or coalesce((v_geo->>'municipality_match')::boolean,false) is not true then raise exception 'BC geocoder package is not exact enough'; end if;
 v_snapshot:=jsonb_build_object('submitted_address','Unit 320, 7155 Kingsway, Burnaby, BC','returned_address',coalesce(v_geo->>'standardized_address',v_geo->>'returned_address'),'locality','Burnaby','municipality_match',true,'score',100,'precision_points',coalesce((v_geo->>'precision_points')::numeric,100),'location_descriptor','parcelpoint','coordinates',v_geo->'coordinates','provider','bc_address_geocoder','program_occupancy_confidence','supported','sensitivity_flags','[]'::jsonb,'conflicts','[]'::jsonb,'branch_ambiguity',false,'move_or_closure',false,'evidence_fresh',true,'source_evidence_tier','E1','machine_actor','miller_map_automation','authoritative_location_correction_id',v_correction.id);
 v_fingerprint:=encode(extensions.digest(v_snapshot::text||':'||v_claim.id::text||':'||p_geocoder_evidence_id::text,'sha256'),'hex');
 insert into public.location_qc_review_snapshots(canonical_resource_id,qc_version,snapshot,origin,refresh_reason,prior_version,actor_id) values(p_resource_id,v_current.version,v_current.review_snapshot,'human_qc','Historical human QC preserved before authoritative HighGate location correction.',null,p_actor_id) on conflict do nothing;
 update public.location_qc_reviews set policy_version='machine_initial_evidence_v1',classification_fingerprint=v_fingerprint,decision='manual_review',decision_note='Machine-initial QC derived from authoritative HighGate correction; prior human QC preserved in history.',review_snapshot=v_snapshot,version=v_current.version+1,reviewed_by=p_actor_id,reviewed_at=now(),updated_at=now(),origin='machine_initial' where canonical_resource_id=p_resource_id returning * into v_next;
 insert into public.location_qc_review_snapshots(canonical_resource_id,qc_version,snapshot,origin,refresh_reason,prior_version,actor_id) values(p_resource_id,v_next.version,v_snapshot,'machine_initial','authoritative_location_correction',v_current.version,p_actor_id) on conflict do nothing;
 insert into public.location_qc_review_audit(canonical_resource_id,previous_decision,new_decision,previous_version,new_version,policy_version,classification_fingerprint,decision_note,actor_id) values(p_resource_id,v_current.decision,'manual_review',v_current.version,v_next.version,'machine_initial_evidence_v1',v_fingerprint,'Authoritative HighGate correction superseded current QC without deleting human history.',p_actor_id);
 insert into public.location_qc_supersessions(resource_id,correction_id,prior_qc_version,new_qc_version,reason_code,actor_id) values(p_resource_id,p_correction_id,v_current.version,v_next.version,'authoritative_location_correction',p_actor_id) on conflict(resource_id,correction_id) do nothing;
 return v_next;
end $$;
revoke all on function public.supersede_highgate_human_qc_with_machine_initial(uuid,uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.supersede_highgate_human_qc_with_machine_initial(uuid,uuid,uuid,integer,uuid) to service_role;
commit;
