begin;

-- A 100/parcelpoint result receives the same conservative candidate treatment
-- as the approved 99/accesspoint branch: low-scoring fallbacks are harmless,
-- but a materially competing local civic candidate remains a hard stop.
do $$
declare
  v_definition text;
  v_old_gate text := $gate$  if v_latitude not between 48 and 60
     or v_longitude not between -140 and -114
     or coalesce(v_geocoder->>'valid_coordinate', 'false') <> 'true'
     or coalesce(v_geocoder->>'civic_number_match', 'false') <> 'true'
     or coalesce(v_geocoder->>'street_match', 'false') <> 'true'
     or coalesce(v_geocoder->>'materially_faulted', 'true') <> 'false'
     or coalesce(v_geocoder->>'precision_points', '') !~ '^[0-9]+([.][0-9]+)?$'
     or (v_geocoder->>'precision_points')::numeric < 95
     or not (
       (v_score = 100 and v_descriptor = 'parcelpoint'
        and coalesce(v_geocoder->>'result_count', '') = '1'
        and v_precision in ('civic_number', 'unit', 'site', 'occupant'))
       or (v_score = 99 and v_descriptor = 'accesspoint'
        and v_precision in ('civic_number', 'unit', 'site', 'occupant', 'block')
        and coalesce(v_geocoder->>'result_count', '') ~ '^[1-5]$'
        and (coalesce(v_geocoder->>'result_count', '') = '1'
          or (v_candidate_identity_clear and not v_materially_competing_candidate)))
     ) then
    return jsonb_build_object('status', 'rejected_weak_geocode');
  end if;$gate$;
  v_new_gate text := $gate$  if v_latitude not between 48 and 60
     or v_longitude not between -140 and -114
     or coalesce(v_geocoder->>'valid_coordinate', 'false') <> 'true'
     or coalesce(v_geocoder->>'civic_number_match', 'false') <> 'true'
     or coalesce(v_geocoder->>'street_match', 'false') <> 'true'
     or coalesce(v_geocoder->>'materially_faulted', 'true') <> 'false'
     or coalesce(v_geocoder->>'precision_points', '') !~ '^[0-9]+([.][0-9]+)?$'
     or (v_geocoder->>'precision_points')::numeric < 95
     or not (
       (v_score = 100 and v_descriptor = 'parcelpoint'
        and v_precision in ('civic_number', 'unit', 'site', 'occupant')
        and coalesce(v_geocoder->>'result_count', '') ~ '^[1-5]$'
        and (coalesce(v_geocoder->>'result_count', '') = '1'
          or (v_candidate_identity_clear and not v_materially_competing_candidate)))
       or (v_score = 99 and v_descriptor = 'accesspoint'
        and v_precision in ('civic_number', 'unit', 'site', 'occupant', 'block')
        and coalesce(v_geocoder->>'result_count', '') ~ '^[1-5]$'
        and (coalesce(v_geocoder->>'result_count', '') = '1'
          or (v_candidate_identity_clear and not v_materially_competing_candidate)))
     ) then
    return jsonb_build_object('status', 'rejected_weak_geocode');
  end if;$gate$;
begin
  select pg_get_functiondef('public.preflight_public_location_v1(uuid,jsonb)'::regprocedure) into v_definition;
  if position(v_new_gate in v_definition) = 0 then
    if position(v_old_gate in v_definition) = 0 then
      raise exception 'unexpected practical preflight v2 definition; refusing parcelpoint alignment';
    end if;
    execute replace(v_definition, v_old_gate, v_new_gate);
  end if;
end;
$$;

revoke all on function public.preflight_public_location_v1(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.preflight_public_location_v1(uuid, jsonb) to service_role;

commit;
