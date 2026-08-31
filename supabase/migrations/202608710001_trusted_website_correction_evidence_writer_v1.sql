begin;

-- Fixed, trusted backend writer for correction-grade website evidence. It has
-- no generic field/configuration surface: the application independently
-- fetches and validates the first-party source before invoking this RPC.
create or replace function public.persist_miller_trusted_website_correction_evidence_v1(p_request jsonb, p_preview boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_resource uuid; v_website text; v_source_url text; v_retrieved_at timestamptz;
  v_content_hash text; v_validation_version text; v_claim public.resource_fact_claims;
  v_evidence public.resource_fact_evidence; v_claim_fingerprint text; v_evidence_fingerprint text;
  v_markers jsonb;
begin
  if jsonb_typeof(p_request) <> 'object'
    or p_request ?| array['field','value','authoritative','no_conflict','confidence','privacy_safe','source_authority','extraction_method','evidence_fingerprint']
    or p_request->>'validation_version' <> 'miller-trusted-website-correction-evidence-v1'
    or (select count(*) from jsonb_object_keys(p_request)) <> 6 then
    raise exception 'rejected: invalid trusted website evidence request';
  end if;
  v_resource := (p_request->>'resource_id')::uuid;
  v_website := p_request->>'proposed_website';
  v_source_url := p_request->>'source_url';
  v_retrieved_at := (p_request->>'source_retrieved_at')::timestamptz;
  v_content_hash := p_request->>'source_content_sha256';
  v_validation_version := p_request->>'validation_version';
  if v_website !~ '^https://[^/?#[:space:]]+$' or v_source_url !~ '^https://[^[:space:]]+$'
    or v_content_hash !~ '^[0-9a-f]{64}$' or v_retrieved_at < now()-interval '24 hours' or v_retrieved_at > now()+interval '5 minutes' then
    raise exception 'rejected: invalid trusted website evidence values';
  end if;
  if not exists(select 1 from public.resource_registry r where r.id=v_resource and r.lifecycle_state='active' and r.editorial_status<>'hidden') then
    raise exception 'rejected: resource is ineligible';
  end if;
  if exists(
    select 1 from public.resource_fact_evidence e
    join public.resource_fact_claims c on c.id=e.claim_id
    where c.resource_id=v_resource and e.stale is not true and e.source_authority>=85 and e.source_url is not null
      and lower(e.source_type) !~ '(ai|llm|qwen|openai)' and lower(e.extraction_method) !~ '(ai|llm|qwen|openai)'
      and e.extracted_value @> jsonb_build_object('field','website','authoritative',true,'no_conflict',true,'confidence','high','privacy_safe',true)
      and e.extracted_value->>'value' is distinct from v_website
  ) then raise exception 'rejected: conflicting current authoritative website evidence'; end if;

  v_claim_fingerprint := encode(extensions.digest('miller-trusted-website-claim-v1:'||v_resource::text||':'||v_website,'sha256'),'hex');
  v_evidence_fingerprint := encode(extensions.digest('miller-trusted-website-evidence-v1:'||v_resource::text||':'||v_website||':'||v_source_url||':'||v_content_hash||':'||v_validation_version,'sha256'),'hex');
  v_markers := jsonb_build_object(
    'field','website','value',v_website,'authoritative',true,'no_conflict',true,'confidence','high','privacy_safe',true,
    'validation_version',v_validation_version,'source_content_sha256',v_content_hash,'server_validated_at',now()
  );
  select * into v_evidence from public.resource_fact_evidence where evidence_fingerprint=v_evidence_fingerprint;
  if found then
    return jsonb_build_object('outcome',case when p_preview then 'preview' else 'evidence_already_persisted' end,'resource_id',v_resource,'field','website','proposed_value',v_website,'evidence_id',v_evidence.id,'evidence_fingerprint',v_evidence.evidence_fingerprint,'extracted_value',v_evidence.extracted_value,'source_url',v_evidence.source_url,'source_authority',v_evidence.source_authority,'would_write',false);
  end if;
  if p_preview then
    return jsonb_build_object('outcome','preview','resource_id',v_resource,'field','website','proposed_value',v_website,'evidence_fingerprint',v_evidence_fingerprint,'extracted_value',v_markers,'source_url',v_source_url,'source_authority',95,'would_write',true);
  end if;
  select * into v_claim from public.resource_fact_claims where claim_fingerprint=v_claim_fingerprint for update;
  if not found then
    insert into public.resource_fact_claims(resource_id,field_name,proposed_value,existing_value,risk,recommendation,confidence,reason_codes,engine_version,status,claim_fingerprint,decision_category,research_summary,last_observed_at)
    values(v_resource,'website',to_jsonb(v_website),null,'low','auto_accept','high',array['trusted_first_party_website_source','server_validated_exact_resource_identity','public_website_value'],'miller-trusted-website-correction-evidence-v1','accepted',v_claim_fingerprint,'website','Server-validated first-party website correction evidence.',now())
    returning * into v_claim;
  end if;
  insert into public.resource_fact_evidence(claim_id,source_type,source_record_id,source_url,extracted_value,extraction_method,retrieved_at,source_authority,independent_key,stale,evidence_fingerprint)
  values(v_claim.id,'first_party',v_content_hash,v_source_url,v_markers,'server_validated_first_party_website_v1',v_retrieved_at,95,regexp_replace(v_source_url,'^https://([^/]+).*','\\1'),false,v_evidence_fingerprint)
  returning * into v_evidence;
  return jsonb_build_object('outcome','evidence_persisted','resource_id',v_resource,'field','website','proposed_value',v_website,'evidence_id',v_evidence.id,'evidence_fingerprint',v_evidence.evidence_fingerprint,'extracted_value',v_evidence.extracted_value,'source_url',v_evidence.source_url,'source_authority',v_evidence.source_authority,'would_write',false);
end $$;

revoke all on function public.persist_miller_trusted_website_correction_evidence_v1(jsonb,boolean) from public, anon, authenticated;
grant execute on function public.persist_miller_trusted_website_correction_evidence_v1(jsonb,boolean) to service_role;

commit;
