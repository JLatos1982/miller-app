begin;

-- The original curated directory is a separately maintained, administrator
-- curated source.  Keep an immutable, versioned copy of only the provenance
-- needed to make its address assertion auditable; it is not a public table.
create table if not exists public.trusted_master_resource_records (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resource_registry(id) on delete cascade,
  source_type text not null check (source_type = 'curated_bundle'),
  source_native_id text not null,
  source_class text not null check (source_class = 'trusted_curated_master_v1'),
  source_version text not null,
  source_record_hash text not null check (source_record_hash ~ '^[0-9a-f]{64}$'),
  original_address text not null,
  normalized_address text not null,
  municipality text not null,
  province text not null default 'BC' check (upper(province) = 'BC'),
  public_service_location boolean not null default true,
  physical_address boolean not null,
  source_url text check (source_url is null or source_url ~ '^https://'),
  source_payload jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  recorded_at timestamptz not null default now(),
  unique (source_type, source_native_id, source_record_hash)
);
create index if not exists trusted_master_resource_records_active_idx
  on public.trusted_master_resource_records(resource_id, active, recorded_at desc);
alter table public.trusted_master_resource_records enable row level security;
revoke all on public.trusted_master_resource_records from public, anon, authenticated;
grant select, insert on public.trusted_master_resource_records to service_role;

create or replace function public.create_occupancy_claim_from_trusted_master_record(
  p_resource_id uuid, p_source_record_id uuid, p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_resource public.resource_registry; v_source public.trusted_master_resource_records;
  v_claim public.resource_fact_claims; v_existing public.resource_fact_claims;
  v_claim_fingerprint text; v_evidence_fingerprint text; v_sensitive boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_resource_id::text, 3));
  select * into v_resource from public.resource_registry where id=p_resource_id for update;
  if not found or v_resource.lifecycle_state <> 'active' or v_resource.editorial_status = 'hidden' then
    raise exception 'canonical resource is not eligible';
  end if;
  select * into v_source from public.trusted_master_resource_records
    where id=p_source_record_id and resource_id=p_resource_id and active
      and source_type='curated_bundle' and source_class='trusted_curated_master_v1'
      and physical_address and public_service_location and upper(province)='BC'
    for update;
  if not found then raise exception 'trusted master source record is not eligible for occupancy bootstrap'; end if;
  if not exists (select 1 from public.resource_source_aliases a where a.resource_id=p_resource_id
    and a.source_type=v_source.source_type and a.source_native_id=v_source.source_native_id) then
    raise exception 'trusted master source record is not linked to the canonical resource';
  end if;
  if v_source.normalized_address !~ '^[[:space:]]*[0-9]+[[:alpha:]]?[[:space:]]+.+'
    or v_source.normalized_address ~* '(^|[^a-z])p\.?\s*o\.?\s*(box)?([^a-z]|$)|mailing|service area|intake only' then
    raise exception 'trusted master source address is not a complete public civic address';
  end if;
  v_sensitive := lower(v_resource.display_name) ~ '(safe home|transition house|domestic violence|trafficking|confidential|undisclosed|intake only)'
    or exists (select 1 from public.resource_locations l where l.resource_id=p_resource_id and l.location_type in ('confidential','undisclosed'));
  if v_sensitive then raise exception 'sensitive or protected resource cannot bootstrap a public occupancy claim'; end if;
  if exists (select 1 from public.trusted_master_resource_records s where s.resource_id=p_resource_id and s.active
    and s.physical_address and s.public_service_location
    and lower(regexp_replace(s.normalized_address,'[^a-z0-9]','','g')) <> lower(regexp_replace(v_source.normalized_address,'[^a-z0-9]','','g'))) then
    raise exception 'conflicting active trusted master addresses exist';
  end if;
  if exists (
    select 1 from public.resource_fact_claims c
    join public.resource_fact_evidence e on e.claim_id=c.id
    where c.resource_id=p_resource_id and c.field_name='location_occupancy'
      and c.status not in ('superseded','rejected','unknown') and e.stale is not true
      and (e.source_url is not null and e.source_authority >= 85 or e.source_type='trusted_master_record' and e.source_authority=100)
      and lower(regexp_replace(c.proposed_value #>> '{}','[^a-z0-9]','','g')) <> lower(regexp_replace(v_source.normalized_address,'[^a-z0-9]','','g'))
  ) then raise exception 'material conflicting occupancy evidence exists'; end if;
  v_claim_fingerprint := encode(extensions.digest('trusted_master_occupancy_v1:'||p_resource_id::text||':'||v_source.normalized_address,'sha256'),'hex');
  select * into v_claim from public.resource_fact_claims where claim_fingerprint=v_claim_fingerprint for update;
  if found then
    return jsonb_build_object('outcome','idempotent','claim_id',v_claim.id,'source_record_id',v_source.id);
  end if;
  select * into v_existing from public.resource_fact_claims where resource_id=p_resource_id and field_name='location_occupancy'
    and status not in ('superseded','rejected','unknown')
    and lower(regexp_replace(proposed_value #>> '{}','[^a-z0-9]','','g')) = lower(regexp_replace(v_source.normalized_address,'[^a-z0-9]','','g'))
    order by last_observed_at desc limit 1 for update;
  if found then
    v_claim := v_existing;
  else
    insert into public.resource_fact_claims(resource_id,field_name,proposed_value,risk,recommendation,confidence,reason_codes,engine_version,status,claim_fingerprint,decision_category,research_summary,last_observed_at)
    values(p_resource_id,'location_occupancy',to_jsonb(v_source.normalized_address),'medium','human_review','high',array['trusted_curated_master_record','public_civic_address'],'trusted_master_occupancy_v1','observed',v_claim_fingerprint,'location_occupancy','Authoritative occupancy bootstrap from trusted curated master record.',now())
    returning * into v_claim;
  end if;
  v_evidence_fingerprint := encode(extensions.digest('trusted_master_evidence_v1:'||v_claim.id::text||':'||v_source.id::text,'sha256'),'hex');
  insert into public.resource_fact_evidence(claim_id,source_type,source_record_id,source_url,extracted_value,extraction_method,retrieved_at,source_authority,independent_key,stale,evidence_fingerprint)
  values(v_claim.id,'trusted_master_record',v_source.id::text,v_source.source_url,
    jsonb_build_object('bootstrap_policy','trusted_master_occupancy_v1','source_class',v_source.source_class,'source_version',v_source.source_version,'source_native_id',v_source.source_native_id,'original_address',v_source.original_address,'normalized_address',v_source.normalized_address,'municipality',v_source.municipality,'province',v_source.province,'physical_address',v_source.physical_address,'public_service_location',v_source.public_service_location),
    'trusted_curated_master_record',v_source.recorded_at,100,'trusted_master:'||v_source.id::text,false,v_evidence_fingerprint)
  on conflict (evidence_fingerprint) where evidence_fingerprint is not null do nothing;
  insert into public.resource_fact_change_audit(claim_id,resource_id,field_name,previous_value,new_value,action,reason_codes,actor_type,actor_id)
    values(v_claim.id,p_resource_id,'location_occupancy',null,v_claim.proposed_value,'observe',array['trusted_curated_master_record','occupancy_bootstrap_v1'],'miller_automation',p_actor_id);
  return jsonb_build_object('outcome','created','claim_id',v_claim.id,'source_record_id',v_source.id);
end $$;

-- Existing downstream policy treats this explicit persisted source class as
-- authoritative, without pretending a geocoder or arbitrary caller supplied it.
create or replace function public.create_machine_initial_location_qc_from_evidence(
  p_resource_id uuid, p_occupancy_claim_id uuid, p_geocoder_evidence_id uuid, p_actor_id uuid
) returns public.location_qc_reviews language plpgsql security definer set search_path = public as $$
declare v_resource public.resource_registry; v_claim public.resource_fact_claims; v_existing public.location_qc_reviews; v_geo jsonb := '{}'::jsonb; v_snapshot jsonb; v_fingerprint text; v_sensitive boolean; v_occupancy_supported boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_resource_id::text, 2));
  select * into v_resource from public.resource_registry where id=p_resource_id for update;
  if not found or v_resource.lifecycle_state <> 'active' or v_resource.editorial_status = 'hidden' then raise exception 'canonical resource is not eligible'; end if;
  select * into v_existing from public.location_qc_reviews where canonical_resource_id=p_resource_id for update;
  if found then raise exception 'current QC already exists; machine initial QC will not overwrite it' using errcode='PT409'; end if;
  select * into v_claim from public.resource_fact_claims where id=p_occupancy_claim_id and resource_id=p_resource_id and field_name='location_occupancy';
  if not found then raise exception 'location occupancy claim is not bound to this resource'; end if;
  if p_geocoder_evidence_id is not null then select coalesce(e.extracted_value,'{}'::jsonb) into v_geo from public.resource_fact_evidence e join public.resource_fact_claims c on c.id=e.claim_id where e.id=p_geocoder_evidence_id and c.resource_id=p_resource_id; if not found then raise exception 'geocoder evidence is not bound to this resource'; end if; end if;
  select exists(select 1 from public.resource_fact_evidence e where e.claim_id=v_claim.id and e.stale is not true and ((e.source_url is not null and e.source_authority>=85) or (e.source_type='trusted_master_record' and e.source_record_id is not null and e.source_authority=100))) into v_occupancy_supported;
  v_sensitive := lower(v_resource.display_name) like any (array['%safe home%','%transition house%','%confidential%','%undisclosed%']) or exists(select 1 from public.resource_locations where resource_id=p_resource_id and location_type in ('confidential','undisclosed'));
  v_snapshot := jsonb_build_object('submitted_address',case when v_sensitive then null else v_claim.proposed_value #>> '{}' end,'returned_address',case when v_sensitive then null else coalesce(v_geo->>'standardized_address',v_geo->>'returned_address') end,'locality',v_geo->>'locality','municipality_match',coalesce((v_geo->>'municipality_match')::boolean,false),'score',coalesce((v_geo->>'score')::numeric,0),'precision_points',coalesce((v_geo->>'precision_points')::numeric,0),'location_descriptor',coalesce(v_geo->>'location_descriptor','unknown'),'coordinates',coalesce(v_geo->'coordinates',jsonb_build_object('latitude',v_geo->>'latitude','longitude',v_geo->>'longitude')),'provider',v_geo->>'provider','program_occupancy_confidence',case when v_occupancy_supported then 'supported' else 'unverified' end,'sensitivity_flags',case when v_sensitive then jsonb_build_array('confidential_or_protected_service') else '[]'::jsonb end,'conflicts','[]'::jsonb,'branch_ambiguity',false,'move_or_closure',false,'evidence_fresh',v_occupancy_supported,'source_evidence_tier',case when v_occupancy_supported then 'E1' else 'unverified' end,'machine_actor','miller_map_automation');
  v_fingerprint := encode(extensions.digest(v_snapshot::text || ':' || v_claim.id::text || ':' || coalesce(p_geocoder_evidence_id::text,''),'sha256'),'hex');
  return public.create_location_qc_machine_review(p_resource_id,'machine_initial_evidence_v1',v_fingerprint,v_snapshot,'Server-derived persisted evidence package.',p_actor_id);
end $$;

create or replace function public.classify_map_auto_publish_v1(p_resource_id uuid,p_expected_qc_version integer,p_occupancy_claim_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_resource public.resource_registry; v_qc public.location_qc_reviews; v_claim public.resource_fact_claims; v_snapshot jsonb; v_evidence_ids jsonb; v_evidence_ok boolean;
begin
  select * into v_resource from public.resource_registry where id=p_resource_id;
  if not found or v_resource.lifecycle_state <> 'active' or v_resource.editorial_status = 'hidden' then return jsonb_build_object('decision','manual_review','reason_code','resource_ineligible'); end if;
  if exists (select 1 from public.resource_locations where resource_id=p_resource_id and public_map and review_status='approved') then return jsonb_build_object('decision','manual_review','reason_code','existing_human_location'); end if;
  select * into v_qc from public.location_qc_reviews where canonical_resource_id=p_resource_id;
  if not found or v_qc.version <> p_expected_qc_version or v_qc.origin <> 'machine_initial' then return jsonb_build_object('decision','manual_review','reason_code','current_machine_qc_required'); end if;
  v_snapshot := v_qc.review_snapshot;
  select * into v_claim from public.resource_fact_claims where id=p_occupancy_claim_id and resource_id=p_resource_id and field_name='location_occupancy';
  if not found then return jsonb_build_object('decision','manual_review','reason_code','authoritative_occupancy_claim_required'); end if;
  select coalesce(jsonb_agg(e.id order by e.id),'[]'::jsonb),bool_or(e.stale is not true and ((e.source_url is not null and e.source_authority >=85) or (e.source_type='trusted_master_record' and e.source_record_id is not null and e.source_authority=100))) into v_evidence_ids,v_evidence_ok from public.resource_fact_evidence e where e.claim_id=v_claim.id;
  if coalesce(v_evidence_ok,false) is false then return jsonb_build_object('decision','manual_review','reason_code','authoritative_occupancy_evidence_required'); end if;
  if jsonb_typeof(coalesce(v_snapshot->'sensitivity_flags','null'::jsonb)) <> 'array' or jsonb_array_length(v_snapshot->'sensitivity_flags')>0 or coalesce(v_snapshot->>'confidential','false')='true' then return jsonb_build_object('decision','manual_review','reason_code','sensitive_location'); end if;
  if jsonb_typeof(coalesce(v_snapshot->'conflicts','null'::jsonb)) <> 'array' or jsonb_array_length(v_snapshot->'conflicts')>0 then return jsonb_build_object('decision','manual_review','reason_code','address_conflict'); end if;
  if coalesce(v_snapshot->>'branch_ambiguity','false')='true' then return jsonb_build_object('decision','manual_review','reason_code','multiple_branches'); end if;
  if coalesce(v_snapshot->>'move_or_closure','false')='true' then return jsonb_build_object('decision','manual_review','reason_code','possible_move_or_closure'); end if;
  if coalesce(v_snapshot->>'submitted_address','') !~ '^[[:space:]]*[0-9]+[[:alpha:]]?[[:space:]]+.+' or coalesce(v_snapshot->>'returned_address','')='' then return jsonb_build_object('decision','manual_review','reason_code','incomplete_or_nonphysical_address'); end if;
  if coalesce(v_snapshot->>'municipality_match','false') <> 'true' then return jsonb_build_object('decision','manual_review','reason_code','municipality_mismatch'); end if;
  if coalesce(v_snapshot->>'program_occupancy_confidence','') <> 'supported' or coalesce(v_snapshot->>'score','') <> '100' or coalesce(v_snapshot->>'location_descriptor','') <> 'parcelpoint' or coalesce(v_snapshot->>'precision_points','') !~ '^[0-9]+([.][0-9]+)?$' or (v_snapshot->>'precision_points')::numeric <95 or coalesce(v_snapshot->'coordinates'->>'latitude','') !~ '^-?[0-9]+([.][0-9]+)?$' or coalesce(v_snapshot->'coordinates'->>'longitude','') !~ '^-?[0-9]+([.][0-9]+)?$' or (v_snapshot->'coordinates'->>'latitude')::double precision not between -90 and 90 or (v_snapshot->'coordinates'->>'longitude')::double precision not between -180 and 180 then return jsonb_build_object('decision','manual_review','reason_code','weak_or_invalid_geocode'); end if;
  return jsonb_build_object('decision','auto_publish_eligible','reason_code','auto_publish_exact_trusted_address','policy_version','map_auto_publish_v1','qc_version',v_qc.version,'occupancy_claim_id',v_claim.id,'occupancy_evidence_ids',v_evidence_ids,'review_snapshot',v_snapshot);
end $$;

revoke all on function public.create_occupancy_claim_from_trusted_master_record(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_occupancy_claim_from_trusted_master_record(uuid,uuid,uuid) to service_role;
commit;
