begin;

create or replace function public.create_machine_initial_location_qc_from_evidence(
  p_resource_id uuid, p_occupancy_claim_id uuid, p_geocoder_evidence_id uuid, p_actor_id uuid
) returns public.location_qc_reviews
language plpgsql security definer set search_path = public as $$
declare
  v_resource public.resource_registry; v_claim public.resource_fact_claims; v_existing public.location_qc_reviews;
  v_geo jsonb := '{}'::jsonb; v_snapshot jsonb; v_fingerprint text; v_sensitive boolean; v_occupancy_supported boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_resource_id::text, 2));
  select * into v_resource from public.resource_registry where id=p_resource_id for update;
  if not found or v_resource.lifecycle_state <> 'active' or v_resource.editorial_status = 'hidden' then raise exception 'canonical resource is not eligible'; end if;
  select * into v_existing from public.location_qc_reviews where canonical_resource_id=p_resource_id for update;
  if found then raise exception 'current QC already exists; machine initial QC will not overwrite it' using errcode='PT409'; end if;
  select * into v_claim from public.resource_fact_claims where id=p_occupancy_claim_id and resource_id=p_resource_id and field_name='location_occupancy';
  if not found then raise exception 'location occupancy claim is not bound to this resource'; end if;
  if p_geocoder_evidence_id is not null then
    select coalesce(e.extracted_value,'{}'::jsonb) into v_geo from public.resource_fact_evidence e join public.resource_fact_claims c on c.id=e.claim_id
      where e.id=p_geocoder_evidence_id and c.resource_id=p_resource_id;
    if not found then raise exception 'geocoder evidence is not bound to this resource'; end if;
  end if;
  select exists(select 1 from public.resource_fact_evidence e where e.claim_id=v_claim.id and e.source_url is not null and e.source_authority>=85 and e.stale is not true) into v_occupancy_supported;
  v_sensitive := lower(v_resource.display_name) like any (array['%safe home%','%transition house%','%confidential%','%undisclosed%'])
    or exists(select 1 from public.resource_locations where resource_id=p_resource_id and location_type in ('confidential','undisclosed'));
  v_snapshot := jsonb_build_object(
    'submitted_address', case when v_sensitive then null else v_claim.proposed_value #>> '{}' end,
    'returned_address', case when v_sensitive then null else coalesce(v_geo->>'standardized_address',v_geo->>'returned_address') end,
    'locality', v_geo->>'locality', 'municipality_match', coalesce((v_geo->>'municipality_match')::boolean,false),
    'score', coalesce((v_geo->>'score')::numeric,0), 'precision_points', coalesce((v_geo->>'precision_points')::numeric,0),
    'location_descriptor', coalesce(v_geo->>'location_descriptor','unknown'),
    'coordinates', coalesce(v_geo->'coordinates',jsonb_build_object('latitude',v_geo->>'latitude','longitude',v_geo->>'longitude')),
    'provider', v_geo->>'provider', 'program_occupancy_confidence', case when v_occupancy_supported then 'supported' else 'unverified' end,
    'sensitivity_flags', case when v_sensitive then jsonb_build_array('confidential_or_protected_service') else '[]'::jsonb end,
    'conflicts', '[]'::jsonb, 'branch_ambiguity', false, 'move_or_closure', false,
    'evidence_fresh', v_occupancy_supported, 'source_evidence_tier', case when v_occupancy_supported then 'E1' else 'unverified' end,
    'machine_actor', 'miller_map_automation'
  );
  v_fingerprint := encode(extensions.digest(v_snapshot::text || ':' || v_claim.id::text || ':' || coalesce(p_geocoder_evidence_id::text,''),'sha256'),'hex');
  return public.create_location_qc_machine_review(p_resource_id,'machine_initial_evidence_v1',v_fingerprint,v_snapshot,'Server-derived persisted evidence package.',p_actor_id);
end $$;
revoke all on function public.create_machine_initial_location_qc_from_evidence(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_machine_initial_location_qc_from_evidence(uuid,uuid,uuid,uuid) to service_role;
commit;
