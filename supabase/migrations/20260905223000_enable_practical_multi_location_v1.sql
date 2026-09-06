begin;

-- A distinct, independently supported site may be added to the same resource.
-- Existing single-site reconciliation remains unchanged unless the trusted
-- package explicitly says its source supports a multi-location service.
do $$
declare
  v_definition text;
  v_old text := $old$
    if public.practical_public_location_key_v1(v_existing.street_address)
         <> public.practical_public_location_key_v1(v_geo_address)
       or v_existing.latitude is null
       or abs(v_existing.latitude - v_latitude) > 0.0002
       or abs(v_existing.longitude - v_longitude) > 0.0002 then
      return jsonb_build_object('status', 'hold_existing_location_conflict');
    end if;
    v_existing_mode := case
      when v_existing.street_address = v_geo_address then 'same_location_confirmation'
      else 'same_location_normalization'
    end;
$old$;
  v_new text := $new$
    if public.practical_public_location_key_v1(v_existing.street_address)
         = public.practical_public_location_key_v1(v_geo_address)
       and v_existing.latitude is not null
       and abs(v_existing.latitude - v_latitude) <= 0.0002
       and abs(v_existing.longitude - v_longitude) <= 0.0002 then
      v_existing_mode := case
        when v_existing.street_address = v_geo_address then 'same_location_confirmation'
        else 'same_location_normalization'
      end;
    elsif coalesce(p_package->>'multi_location_supported', 'false') <> 'true' then
      return jsonb_build_object('status', 'hold_existing_location_conflict');
    else
      v_existing_mode := 'additional_supported_location';
    end if;
$new$;
begin
  select pg_get_functiondef('public.preflight_public_location_v1(uuid,jsonb)'::regprocedure) into v_definition;
  if position(v_new in v_definition) = 0 then
    if position(v_old in v_definition) = 0 then raise exception 'unexpected practical preflight definition'; end if;
    execute replace(v_definition, v_old, v_new);
  end if;
end $$;

-- The practical writer locks/reconciles only the same physical site.  A
-- distinct site already accepted by preflight is inserted as another row for
-- the same resource; it is never merged with a different resource.
do $$
declare
  v_definition text;
  v_old text := $old$
  select * into v_existing
  from public.resource_locations l
  where l.resource_id = p_resource_id
    and l.location_type = 'fixed'
    and l.review_status = 'approved'
  order by l.public_map desc, l.updated_at desc
  limit 1
  for update;
$old$;
  v_new text := $new$
  select * into v_existing
  from public.resource_locations l
  where l.resource_id = p_resource_id
    and l.location_type = 'fixed'
    and l.review_status = 'approved'
    and public.practical_public_location_key_v1(l.street_address)
        = public.practical_public_location_key_v1(v_preflight->>'canonical_address')
    and l.latitude is not null
    and abs(l.latitude - (v_preflight#>>'{coordinates,latitude}')::double precision) <= 0.0002
    and abs(l.longitude - (v_preflight#>>'{coordinates,longitude}')::double precision) <= 0.0002
  order by l.public_map desc, l.updated_at desc
  limit 1
  for update;
$new$;
begin
  select pg_get_functiondef('public.publish_practical_public_location_v1(uuid,jsonb,uuid)'::regprocedure) into v_definition;
  if position(v_new in v_definition) = 0 then
    if position(v_old in v_definition) = 0 then raise exception 'unexpected practical publication definition'; end if;
    execute replace(v_definition, v_old, v_new);
  end if;
end $$;

revoke all on function public.preflight_public_location_v1(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.publish_practical_public_location_v1(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.preflight_public_location_v1(uuid, jsonb) to service_role;
grant execute on function public.publish_practical_public_location_v1(uuid, jsonb, uuid) to service_role;
commit;
