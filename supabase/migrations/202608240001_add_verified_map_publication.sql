begin;
create or replace function public.publish_verified_map_pin(p_resource_id uuid,p_expected_qc_version integer,p_actor_id uuid) returns public.resource_locations language plpgsql security definer set search_path=public as $$
declare r public.resource_registry; q public.location_qc_reviews; l public.resource_locations; n public.resource_locations; s jsonb; evidence_ok boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_resource_id::text,0));
 select * into r from public.resource_registry where id=p_resource_id for update;
 if not found or r.lifecycle_state<>'active' or r.editorial_status='hidden' then raise exception 'resource is not publishable'; end if;
 select * into q from public.location_qc_reviews where canonical_resource_id=p_resource_id for update;
 if not found or q.version<>p_expected_qc_version then raise exception 'publication QC version conflict' using errcode='40001'; end if;
 if q.decision<>'pilot_eligible' then raise exception 'human QC confirmation required'; end if;
 s:=q.review_snapshot;
 if coalesce(s->>'program_occupancy_confidence','')<>'supported' or coalesce((s->>'score')::numeric,0)<>100 or lower(coalesce(s->>'location_descriptor',''))<>'parcelpoint' or coalesce(s->>'submitted_address','')='' or coalesce(s->>'returned_address','')='' or coalesce(s->'coordinates'->>'latitude','')='' or coalesce(s->'coordinates'->>'longitude','')='' or jsonb_array_length(coalesce(s->'conflicts','[]'::jsonb))>0 or jsonb_array_length(coalesce(s->'sensitivity_flags','[]'::jsonb))>0 then raise exception 'publication evidence package is incomplete or unsafe'; end if;
 select exists(select 1 from public.resource_fact_evidence e join public.resource_fact_claims c on c.id=e.claim_id where c.resource_id=p_resource_id and c.field_name='location_occupancy' and e.source_url is not null and e.source_authority>=85 and e.stale is not true) into evidence_ok;
 if not evidence_ok then raise exception 'authoritative occupancy evidence required'; end if;
 select * into l from public.resource_locations where resource_id=p_resource_id and location_type='fixed' and street_address=s->>'submitted_address' for update;
 if found and l.public_map then return l; end if;
 if found then update public.resource_locations set latitude=(s->'coordinates'->>'latitude')::double precision,longitude=(s->'coordinates'->>'longitude')::double precision,geocode_source='bc_address_geocoder',geocode_status='verified',review_status='approved',public_map=true,reviewed_by=p_actor_id,reviewed_at=now(),location_last_verified=now(),updated_at=now() where id=l.id returning * into n;
 else insert into public.resource_locations(resource_id,location_label,location_type,original_address_text,street_address,city,province,country,latitude,longitude,geocode_source,geocode_confidence,geocode_status,review_status,public_map,reviewed_by,reviewed_at,location_last_verified) values(p_resource_id,'Administrator-published verified location','fixed',s->>'submitted_address',s->>'submitted_address',s->>'locality','BC','Canada',(s->'coordinates'->>'latitude')::double precision,(s->'coordinates'->>'longitude')::double precision,'bc_address_geocoder',1,'verified','approved',true,p_actor_id,now(),now()) returning * into n; end if;
 insert into public.resource_location_audit(location_id,action,previous_values,new_values,actor_id,reason) values(n.id,'publication_changed',to_jsonb(l),to_jsonb(n),p_actor_id,'Human-confirmed transactional verified map publication.'); return n;
end $$;
revoke all on function public.publish_verified_map_pin(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.publish_verified_map_pin(uuid,integer,uuid) to service_role;
commit;
