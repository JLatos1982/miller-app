begin;

alter table public.resource_canonical_profile_audit
  add column correction_id uuid unique,
  add column request_fingerprint text check (request_fingerprint is null or request_fingerprint ~ '^[0-9a-f]{64}$'),
  add column field_name text,
  add column outcome text,
  add column applied_at timestamptz,
  add column verified_at timestamptz,
  add column requester_id text;

create table public.miller_canonical_field_corrections (
  correction_id uuid primary key,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  resource_id uuid not null references public.resource_registry(id) on delete restrict,
  field_name text not null check (field_name in ('city','province','public_street_address','phone','website')),
  outcome text not null check (outcome in ('verified_updated','stale_before_write','evidence_gate_failed','write_failed','post_write_mismatch','rejected')),
  result jsonb not null,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  verified_at timestamptz
);
alter table public.miller_canonical_field_corrections enable row level security;
revoke all on public.miller_canonical_field_corrections from public, anon, authenticated;
grant select, insert on public.miller_canonical_field_corrections to service_role;

create or replace function public.apply_miller_canonical_field_correction_v1(p_request jsonb, p_preview boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_id uuid; v_resource uuid; v_field text; v_expected jsonb; v_proposed text; v_target uuid;
  v_profile public.resource_canonical_profile; v_location public.resource_locations;
  v_prior jsonb; v_next jsonb; v_actual text; v_fp text; v_next_fp text; v_version integer;
  v_request_fp text; v_existing public.miller_canonical_field_corrections; v_audit_id bigint;
  v_binding jsonb; v_evidence_count integer:=0; v_reason text; v_result jsonb;
begin
  if jsonb_typeof(p_request) <> 'object' or p_request->>'contract' <> 'miller-canonical-field-correction-v1'
    or p_request->>'policy_version' <> 'miller-canonical-field-correction-v1' then
    raise exception 'rejected: contract or policy version is invalid';
  end if;
  if p_request ?| array['sql','table','column','patch','ai_output','model_output'] then raise exception 'rejected: unknown or unsafe request field'; end if;
  v_id := (p_request->>'correction_id')::uuid; v_resource := (p_request->>'resource_id')::uuid;
  v_field := p_request->>'field'; v_proposed := p_request->>'proposed_value';
  v_request_fp := p_request->>'request_fingerprint'; v_target := nullif(p_request->>'canonical_location_id','')::uuid;
  if v_field not in ('city','province','public_street_address','phone','website') or v_proposed is null
    or v_request_fp !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_request->'supporting_evidence_bindings') <> 'array'
    or jsonb_array_length(p_request->'supporting_evidence_bindings') = 0
    or p_request->>'requester_id' !~ '^[a-zA-Z0-9:_-]{3,120}$'
    or (p_request->>'created_at')::timestamptz > now()+interval '5 minutes'
    or (p_request->>'expires_at')::timestamptz <= now() then raise exception 'rejected: invalid request shape'; end if;

  select * into v_existing from public.miller_canonical_field_corrections where correction_id=v_id for update;
  if found then
    if v_existing.request_fingerprint = v_request_fp then return v_existing.result; end if;
    raise exception 'rejected: correction ID is already bound to another request';
  end if;
  if not exists(select 1 from public.resource_registry where id=v_resource and lifecycle_state='active' and editorial_status<>'hidden') then raise exception 'rejected: resource is ineligible'; end if;

  -- Each evidence row must be immutable, same-resource, fresh, authoritative,
  -- server-marked high-confidence/no-conflict/privacy-safe, and non-AI.
  for v_binding in select value from jsonb_array_elements(p_request->'supporting_evidence_bindings') loop
    if v_binding->>'evidence_id' !~ '^[0-9a-f-]{36}$' or v_binding->>'evidence_fingerprint' !~ '^[0-9a-f]{64}$'
      or v_binding->>'field' <> v_field then raise exception 'evidence_gate_failed: invalid binding'; end if;
    if not exists(
      select 1 from public.resource_fact_evidence e join public.resource_fact_claims c on c.id=e.claim_id
      where e.id=(v_binding->>'evidence_id')::uuid and e.evidence_fingerprint=v_binding->>'evidence_fingerprint'
        and c.resource_id=v_resource and e.stale is not true and e.source_authority>=85 and e.source_url is not null
        and lower(e.source_type) !~ '(ai|llm|qwen|openai)' and lower(e.extraction_method) !~ '(ai|llm|qwen|openai)'
        and e.extracted_value @> jsonb_build_object('field',v_field,'value',v_proposed,'authoritative',true,'no_conflict',true,'confidence','high','privacy_safe',true)
    ) then raise exception 'evidence_gate_failed: authoritative binding is absent'; end if;
    v_evidence_count:=v_evidence_count+1;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(v_resource::text, 63));
  select * into v_profile from public.resource_canonical_profile where resource_id=v_resource for update;
  if found then
    if (p_request->>'expected_profile_version')::integer <> v_profile.version then return jsonb_build_object('outcome','stale_before_write'); end if;
    if v_profile.canonical_location_id is not null then select * into v_location from public.resource_locations where id=v_profile.canonical_location_id for update; end if;
    v_fp:=public.canonical_profile_fingerprint_v1(v_profile.phone,v_profile.website,v_profile.canonical_location_id,v_location.city,v_location.province,v_location.street_address,v_profile.version);
    if p_request->>'expected_canonical_fingerprint' <> v_fp then return jsonb_build_object('outcome','stale_before_write'); end if;
  else
    if p_request->>'expected_profile_version' is not null or p_request->>'expected_canonical_fingerprint' is not null or p_request->>'expected_profile_absent' <> 'true' then return jsonb_build_object('outcome','stale_before_write'); end if;
    v_profile.resource_id:=v_resource; v_profile.phone:=null; v_profile.website:=null; v_profile.version:=0;
  end if;
  if v_field in ('city','province','public_street_address') then
    if v_location.id is null then
      if v_target is null then raise exception 'rejected: explicit canonical location is required'; end if;
      select * into v_location from public.resource_locations where id=v_target and resource_id=v_resource for update;
      if not found or v_location.location_type in ('confidential','undisclosed') or v_location.review_status='confidential' then raise exception 'rejected: canonical location is ineligible'; end if;
    elsif v_target is not null and v_target <> v_location.id then raise exception 'rejected: canonical location binding changed'; end if;
  elsif v_target is not null and v_profile.canonical_location_id is distinct from v_target then raise exception 'rejected: contact correction cannot select a location'; end if;
  v_actual:=case v_field when 'phone' then v_profile.phone when 'website' then v_profile.website when 'city' then v_location.city when 'province' then v_location.province else v_location.street_address end;
  if coalesce(p_request->'expected_current_value','null'::jsonb) <> to_jsonb(v_actual) then return jsonb_build_object('outcome','stale_before_write'); end if;
  v_prior:=case when v_profile.version=0 then null else jsonb_build_object('profile',to_jsonb(v_profile),'location',to_jsonb(v_location)) end;
  v_version:=case when v_profile.version=0 then 1 else v_profile.version+1 end;
  if p_preview then
    return jsonb_build_object('outcome','preview','projected_version',v_version,'prior_profile',v_prior,'field',v_field,'proposed_value',v_proposed,'evidence_binding_count',v_evidence_count);
  end if;
  if v_field='city' then update public.resource_locations set city=v_proposed,updated_at=now() where id=v_location.id returning * into v_location;
  elsif v_field='province' then update public.resource_locations set province=v_proposed,updated_at=now() where id=v_location.id returning * into v_location;
  elsif v_field='public_street_address' then update public.resource_locations set street_address=v_proposed,updated_at=now() where id=v_location.id returning * into v_location;
  end if;
  if v_profile.version=0 then
    insert into public.resource_canonical_profile(resource_id,canonical_location_id,phone,website,version,canonical_fingerprint,provenance)
      values(v_resource,case when v_field in ('city','province','public_street_address') then v_location.id else null end,
        case when v_field='phone' then v_proposed else null end,case when v_field='website' then v_proposed else null end,1,'0',p_request->'supporting_evidence_bindings') returning * into v_profile;
  else
    update public.resource_canonical_profile set phone=case when v_field='phone' then v_proposed else phone end, website=case when v_field='website' then v_proposed else website end, version=v_version, provenance=p_request->'supporting_evidence_bindings' where resource_id=v_resource returning * into v_profile;
  end if;
  select public.canonical_profile_fingerprint_v1(v_profile.phone,v_profile.website,v_profile.canonical_location_id,v_location.city,v_location.province,v_location.street_address,v_profile.version) into v_next_fp;
  if v_profile.canonical_fingerprint <> v_next_fp then raise exception 'post_write_mismatch: fingerprint'; end if;
  v_next:=jsonb_build_object('profile',to_jsonb(v_profile),'location',to_jsonb(v_location));
  insert into public.resource_canonical_profile_audit(resource_id,correction_id,request_fingerprint,field_name,prior_profile,new_profile,supporting_evidence,policy_version,actor_type,reason,outcome,requester_id,applied_at,verified_at)
    values(v_resource,v_id,v_request_fp,v_field,v_prior,v_next,p_request->'supporting_evidence_bindings','miller-canonical-contact-location-projection-v1','samwise_trusted_backend','Fixed Samwise canonical correction transaction.','verified_updated',p_request->>'requester_id',now(),now()) returning id into v_audit_id;
  v_result:=jsonb_build_object('outcome','verified_updated','correction_id',v_id,'field',v_field,'prior_value',v_actual,'current_value',case when v_field='phone' then v_profile.phone when v_field='website' then v_profile.website when v_field='city' then v_location.city when v_field='province' then v_location.province else v_location.street_address end,'prior_fingerprint',v_fp,'new_fingerprint',v_next_fp,'prior_version',nullif(v_version-1,0),'new_version',v_profile.version,'audit_id',v_audit_id,'applied_at',now(),'verified_at',now());
  insert into public.miller_canonical_field_corrections(correction_id,request_fingerprint,resource_id,field_name,outcome,result,applied_at,verified_at) values(v_id,v_request_fp,v_resource,v_field,'verified_updated',v_result,now(),now());
  return v_result;
exception when others then
  if sqlerrm like 'evidence_gate_failed:%' then raise exception '%',sqlerrm;
  elsif sqlerrm like 'rejected:%' then raise exception '%',sqlerrm;
  elsif sqlerrm like 'post_write_mismatch:%' then raise exception '%',sqlerrm;
  else raise; end if;
end $$;
revoke all on function public.apply_miller_canonical_field_correction_v1(jsonb,boolean) from public, anon, authenticated;
grant execute on function public.apply_miller_canonical_field_correction_v1(jsonb,boolean) to service_role;
commit;
