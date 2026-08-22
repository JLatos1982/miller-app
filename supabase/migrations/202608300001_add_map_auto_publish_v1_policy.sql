begin;

-- Stage 1 is deliberately dry-run only.  This is durable, append-only
-- provenance of database-derived qualification; it cannot publish a pin.
create table public.map_auto_publication_decisions (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resource_registry(id) on delete cascade,
  qc_version integer not null check (qc_version > 0),
  occupancy_claim_id uuid not null references public.resource_fact_claims(id) on delete restrict,
  policy_version text not null check (policy_version = 'map_auto_publish_v1'),
  decision text not null check (decision in ('auto_publish_eligible','manual_review')),
  reason_code text not null,
  machine_actor text not null default 'miller_map_automation' check (machine_actor = 'miller_map_automation'),
  candidate jsonb not null,
  created_at timestamptz not null default now(),
  unique (resource_id, qc_version, occupancy_claim_id, policy_version)
);
create index map_auto_publication_decisions_resource_created_idx on public.map_auto_publication_decisions (resource_id, created_at desc);
alter table public.map_auto_publication_decisions enable row level security;
revoke all on table public.map_auto_publication_decisions from public, anon, authenticated;
grant select on table public.map_auto_publication_decisions to service_role;

create or replace function public.prevent_map_auto_publication_decision_mutation()
returns trigger language plpgsql set search_path = public as $$
begin raise exception 'map auto publication decisions are append-only'; end $$;
create trigger map_auto_publication_decisions_append_only before update or delete
  on public.map_auto_publication_decisions for each row execute function public.prevent_map_auto_publication_decision_mutation();

create or replace function public.classify_map_auto_publish_v1(
  p_resource_id uuid, p_expected_qc_version integer, p_occupancy_claim_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_resource public.resource_registry; v_qc public.location_qc_reviews;
  v_claim public.resource_fact_claims; v_snapshot jsonb; v_evidence_ids jsonb;
  v_evidence_ok boolean;
begin
  select * into v_resource from public.resource_registry where id = p_resource_id;
  if not found or v_resource.lifecycle_state <> 'active' or v_resource.editorial_status = 'hidden' then
    return jsonb_build_object('decision','manual_review','reason_code','resource_ineligible');
  end if;
  -- Conservatively protect every previously public approved location.  Stage 1
  -- never replaces an existing human-approved pin.
  if exists (select 1 from public.resource_locations where resource_id=p_resource_id and public_map and review_status='approved') then
    return jsonb_build_object('decision','manual_review','reason_code','existing_human_location');
  end if;
  select * into v_qc from public.location_qc_reviews where canonical_resource_id=p_resource_id;
  if not found or v_qc.version <> p_expected_qc_version or v_qc.origin <> 'machine_initial' then
    return jsonb_build_object('decision','manual_review','reason_code','current_machine_qc_required');
  end if;
  v_snapshot := v_qc.review_snapshot;
  select * into v_claim from public.resource_fact_claims
   where id=p_occupancy_claim_id and resource_id=p_resource_id and field_name='location_occupancy';
  if not found then return jsonb_build_object('decision','manual_review','reason_code','authoritative_occupancy_claim_required'); end if;
  select coalesce(jsonb_agg(e.id order by e.id),'[]'::jsonb), bool_or(e.source_url is not null and e.source_authority >= 85 and e.stale is not true)
    into v_evidence_ids, v_evidence_ok from public.resource_fact_evidence e where e.claim_id=v_claim.id;
  if coalesce(v_evidence_ok,false) is false then return jsonb_build_object('decision','manual_review','reason_code','authoritative_occupancy_evidence_required'); end if;
  if jsonb_typeof(coalesce(v_snapshot->'sensitivity_flags','null'::jsonb)) <> 'array'
     or jsonb_array_length(v_snapshot->'sensitivity_flags') > 0 or coalesce(v_snapshot->>'confidential','false')='true' then
    return jsonb_build_object('decision','manual_review','reason_code','sensitive_location');
  end if;
  if jsonb_typeof(coalesce(v_snapshot->'conflicts','null'::jsonb)) <> 'array' or jsonb_array_length(v_snapshot->'conflicts') > 0 then
    return jsonb_build_object('decision','manual_review','reason_code','address_conflict');
  end if;
  if coalesce(v_snapshot->>'branch_ambiguity','false')='true' then return jsonb_build_object('decision','manual_review','reason_code','multiple_branches'); end if;
  if coalesce(v_snapshot->>'move_or_closure','false')='true' then return jsonb_build_object('decision','manual_review','reason_code','possible_move_or_closure'); end if;
  if coalesce(v_snapshot->>'submitted_address','') !~ '^[[:space:]]*[0-9]+[[:alpha:]]?[[:space:]]+.+' or coalesce(v_snapshot->>'returned_address','')='' then
    return jsonb_build_object('decision','manual_review','reason_code','incomplete_or_nonphysical_address');
  end if;
  if coalesce(v_snapshot->>'municipality_match','false') <> 'true' then return jsonb_build_object('decision','manual_review','reason_code','municipality_mismatch'); end if;
  if coalesce(v_snapshot->>'program_occupancy_confidence','') <> 'supported'
     or coalesce(v_snapshot->>'score','') <> '100'
     or coalesce(v_snapshot->>'location_descriptor','') <> 'parcelpoint'
     or coalesce(v_snapshot->>'precision_points','') !~ '^[0-9]+([.][0-9]+)?$'
     or (v_snapshot->>'precision_points')::numeric < 95
     or coalesce(v_snapshot->'coordinates'->>'latitude','') !~ '^-?[0-9]+([.][0-9]+)?$'
     or coalesce(v_snapshot->'coordinates'->>'longitude','') !~ '^-?[0-9]+([.][0-9]+)?$'
     or (v_snapshot->'coordinates'->>'latitude')::double precision not between -90 and 90
     or (v_snapshot->'coordinates'->>'longitude')::double precision not between -180 and 180 then
    return jsonb_build_object('decision','manual_review','reason_code','weak_or_invalid_geocode');
  end if;
  return jsonb_build_object('decision','auto_publish_eligible','reason_code','auto_publish_exact_trusted_address','policy_version','map_auto_publish_v1','qc_version',v_qc.version,'occupancy_claim_id',v_claim.id,'occupancy_evidence_ids',v_evidence_ids,'review_snapshot',v_snapshot);
end $$;

create or replace function public.dry_run_map_auto_publish_v1(
  p_resource_id uuid, p_expected_qc_version integer, p_occupancy_claim_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb; v_qc public.location_qc_reviews;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_resource_id::text,1));
  select * into v_qc from public.location_qc_reviews where canonical_resource_id=p_resource_id for update;
  if found and v_qc.version <> p_expected_qc_version then raise exception using errcode='40001', message='map auto publication QC version conflict'; end if;
  v_result := public.classify_map_auto_publish_v1(p_resource_id,p_expected_qc_version,p_occupancy_claim_id);
  insert into public.map_auto_publication_decisions(resource_id,qc_version,occupancy_claim_id,policy_version,decision,reason_code,candidate)
  values(p_resource_id,p_expected_qc_version,p_occupancy_claim_id,'map_auto_publish_v1',v_result->>'decision',v_result->>'reason_code',v_result)
  on conflict (resource_id,qc_version,occupancy_claim_id,policy_version) do nothing;
  return v_result || jsonb_build_object('mode','dry_run');
end $$;

revoke all on function public.prevent_map_auto_publication_decision_mutation() from public, anon, authenticated;
revoke all on function public.classify_map_auto_publish_v1(uuid,integer,uuid) from public, anon, authenticated;
revoke all on function public.dry_run_map_auto_publish_v1(uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.classify_map_auto_publish_v1(uuid,integer,uuid) to service_role;
grant execute on function public.dry_run_map_auto_publish_v1(uuid,integer,uuid) to service_role;
commit;
