-- The application independently classifies an incoming provider observation
-- before this service-role-only RPC is called.  The legacy SQL key is textual
-- and cannot recognize written/numeric ordinal equivalents. Preserve every
-- existing precision, provider, coordinate, and occupancy guard, but accept a
-- current submitted-address key as an alternate proof of linkage.
create or replace function public.persist_canonical_bc_geocoder_evidence_v1(p_run_id uuid,p_resource_id uuid,p_occupancy_claim_id uuid,p_geocoder_package jsonb,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.resource_fact_claims; e public.resource_fact_evidence; i public.canonical_authoritative_research_run_items; k text; f text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_resource_id::text,42));
 select * into i from public.canonical_authoritative_research_run_items where run_id=p_run_id and resource_id=p_resource_id for update;
 if not found or i.outcome not in ('reserved','confirmed') then raise exception 'reserved or confirmed canonical research item required'; end if;
 select * into c from public.resource_fact_claims where id=p_occupancy_claim_id and resource_id=p_resource_id and field_name='location_occupancy' and status not in ('superseded','rejected','unknown') for update;
 if not found or not public.canonical_authoritative_evidence_current_v1(p_occupancy_claim_id) then raise exception 'current authoritative occupancy claim required'; end if;
 if coalesce(p_geocoder_package->>'provider','')<>'bc_address_geocoder' or coalesce((p_geocoder_package->>'score')::numeric,0)<>100 or lower(coalesce(p_geocoder_package->>'location_descriptor',''))<>'parcelpoint' or coalesce((p_geocoder_package->>'municipality_match')::boolean,false) is not true or upper(coalesce(p_geocoder_package->>'province',''))<>'BC' or coalesce((p_geocoder_package->>'precision_points')::numeric,0)<95 or coalesce(p_geocoder_package->'coordinates'->>'latitude','') !~ '^-?[0-9]+([.][0-9]+)?$' or coalesce(p_geocoder_package->'coordinates'->>'longitude','') !~ '^-?[0-9]+([.][0-9]+)?$' or (p_geocoder_package->'coordinates'->>'latitude')::double precision not between 48 and 60 or (p_geocoder_package->'coordinates'->>'longitude')::double precision not between -140 and -114 or (public.canonical_authoritative_address_key_v1(coalesce(p_geocoder_package->>'standardized_address',p_geocoder_package->>'returned_address'))<>public.canonical_authoritative_address_key_v1(c.proposed_value#>>'{}') and public.canonical_authoritative_address_key_v1(coalesce(p_geocoder_package->>'submitted_address',''))<>public.canonical_authoritative_address_key_v1(c.proposed_value#>>'{}')) then raise exception 'exact matching BC geocoder package required'; end if;
 k:=public.canonical_authoritative_address_key_v1(c.proposed_value#>>'{}'); f:=encode(extensions.digest('canonical_bc_geocoder_v1:'||c.id::text||':'||k||':'||coalesce(p_geocoder_package->>'site_id',''),'sha256'),'hex');
 insert into public.resource_fact_evidence(claim_id,source_type,source_record_id,source_url,extracted_value,extraction_method,retrieved_at,source_authority,independent_key,stale,evidence_fingerprint) values(c.id,'bc_geocoder',null,'https://geocoder.api.gov.bc.ca',p_geocoder_package,'server_validated_exact_bc_geocoder',now(),85,'bc_address_geocoder',false,f) on conflict(evidence_fingerprint) where evidence_fingerprint is not null do nothing;
 select * into e from public.resource_fact_evidence where evidence_fingerprint=f; return jsonb_build_object('outcome','exact_bc_geocoder_persisted','evidence_id',e.id);
end $$;

revoke all on function public.persist_canonical_bc_geocoder_evidence_v1(uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.persist_canonical_bc_geocoder_evidence_v1(uuid,uuid,uuid,jsonb,uuid) to service_role;
