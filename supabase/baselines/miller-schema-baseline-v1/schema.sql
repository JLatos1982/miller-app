


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "miller_internal";


ALTER SCHEMA "miller_internal" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "miller_internal"."is_miller_resource_quality_reader_v1"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  select exists (
    select 1
      from public.miller_resource_quality_reader_authorization_v1
     where authorization_key = 'miller_resource_quality_reader_authorization_v1'
       and active
       and reader_id = (select auth.uid())
  );
$$;


ALTER FUNCTION "miller_internal"."is_miller_resource_quality_reader_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_highgate_authoritative_location_correction"("p_resource_id" "uuid", "p_actor_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_reference public.highgate_authoritative_location_reference;
  v_resource public.resource_registry;
  v_legacy public.trusted_master_resource_records;
  v_correction public.authoritative_location_corrections;
  v_claim public.resource_fact_claims;
  v_fingerprint text;
begin
  select * into v_reference from public.highgate_authoritative_location_reference
   where resource_id=p_resource_id and active for share;
  if not found then raise exception 'resource is not authorized for the fixed HighGate correction'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_resource_id::text, 36));
  select * into v_resource from public.resource_registry where id=p_resource_id for update;
  if not found or v_resource.lifecycle_state<>'active' or v_resource.editorial_status='hidden' then raise exception 'canonical resource is not eligible'; end if;
  select * into v_legacy from public.trusted_master_resource_records
   where resource_id=p_resource_id and active and physical_address=false
     and original_address=v_reference.legacy_original_address
   order by recorded_at desc limit 1 for update;
  if not found then raise exception 'required legacy hash-prefixed HighGate assertion is absent'; end if;
  select * into v_correction from public.authoritative_location_corrections
   where resource_id=p_resource_id and correction_policy=v_reference.correction_policy;
  if found then return jsonb_build_object('outcome','idempotent','correction_id',v_correction.id); end if;
  insert into public.authoritative_location_corrections(resource_id,legacy_source_record_id,correction_policy,corrected_address,authoritative_sources,reason_code,actor_id)
  values(p_resource_id,v_legacy.id,v_reference.correction_policy,v_reference.corrected_address,v_reference.authoritative_sources,v_reference.reason_code,p_actor_id)
  returning * into v_correction;
  v_fingerprint:=encode(extensions.digest(v_reference.correction_policy||':'||p_resource_id::text||':'||v_reference.correction_fingerprint_key,'sha256'),'hex');
  select * into v_claim from public.resource_fact_claims where claim_fingerprint=v_fingerprint for update;
  if not found then
    insert into public.resource_fact_claims(resource_id,field_name,proposed_value,risk,recommendation,confidence,reason_codes,engine_version,status,claim_fingerprint,decision_category,research_summary,last_observed_at)
    values(p_resource_id,'location_occupancy',to_jsonb(v_reference.corrected_address),'medium','human_review','high',array['authoritative_location_correction','public_physical_service_location'],v_reference.correction_policy,'observed',v_fingerprint,'location_occupancy','Current authoritative HighGate evidence supersedes a legacy hash-prefixed non-physical parser conclusion.',now()) returning * into v_claim;
  end if;
  insert into public.resource_fact_evidence(claim_id,source_type,source_record_id,source_url,extracted_value,extraction_method,retrieved_at,source_authority,independent_key,stale,evidence_fingerprint)
  select v_claim.id,'official',v_correction.id::text,source,jsonb_build_object('address',v_reference.corrected_address,'physical_address',true,'public_service_location',true,'correction_id',v_correction.id),'fixed_highgate_authoritative_location_correction',now(),95,'highgate:'||p_resource_id::text||':'||source,false,encode(extensions.digest('highgate-evidence:'||p_resource_id::text||':'||source,'sha256'),'hex')
  from jsonb_array_elements_text(v_reference.authoritative_sources) source
  on conflict (evidence_fingerprint) where evidence_fingerprint is not null do nothing;
  insert into public.resource_fact_change_audit(claim_id,resource_id,field_name,previous_value,new_value,action,reason_codes,actor_type,actor_id)
  values(v_claim.id,p_resource_id,'location_occupancy',to_jsonb(v_legacy.original_address),v_claim.proposed_value,'observe',array['authoritative_location_correction_v1','legacy_preserved'],'miller_automation',p_actor_id);
  return jsonb_build_object('outcome','created','correction_id',v_correction.id,'claim_id',v_claim.id);
end $$;


ALTER FUNCTION "public"."apply_highgate_authoritative_location_correction"("p_resource_id" "uuid", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_miller_canonical_field_correction_v1"("p_request" "jsonb", "p_preview" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
end $_$;


ALTER FUNCTION "public"."apply_miller_canonical_field_correction_v1"("p_request" "jsonb", "p_preview" boolean) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."miller_quiet_maintenance_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_key" "text" NOT NULL,
    "trigger_type" "text" NOT NULL,
    "mode" "text" NOT NULL,
    "policy_version" "text" DEFAULT 'quiet-maintenance-v1'::"text" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "as_of" timestamp with time zone NOT NULL,
    "inspected_counts" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "action_counts" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "carry_forward" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "result_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "failure_code" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "miller_quiet_maintenance_runs_action_counts_check" CHECK (("jsonb_typeof"("action_counts") = 'object'::"text")),
    CONSTRAINT "miller_quiet_maintenance_runs_carry_forward_check" CHECK (("jsonb_typeof"("carry_forward") = 'array'::"text")),
    CONSTRAINT "miller_quiet_maintenance_runs_inspected_counts_check" CHECK (("jsonb_typeof"("inspected_counts") = 'object'::"text")),
    CONSTRAINT "miller_quiet_maintenance_runs_mode_check" CHECK (("mode" = ANY (ARRAY['local_manual'::"text", 'manual'::"text"]))),
    CONSTRAINT "miller_quiet_maintenance_runs_request_key_check" CHECK (("request_key" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "miller_quiet_maintenance_runs_result_summary_check" CHECK (("jsonb_typeof"("result_summary") = 'object'::"text")),
    CONSTRAINT "miller_quiet_maintenance_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'failed'::"text"]))),
    CONSTRAINT "miller_quiet_maintenance_runs_trigger_type_check" CHECK (("trigger_type" = ANY (ARRAY['manual_admin'::"text", 'local_test'::"text"])))
);


ALTER TABLE "public"."miller_quiet_maintenance_runs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_quiet_maintenance_cycle"("p_run_id" "uuid", "p_plan" "jsonb") RETURNS "public"."miller_quiet_maintenance_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare run_row public.miller_quiet_maintenance_runs; item jsonb; updated_count integer := 0; event_type text;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if jsonb_typeof(p_plan) <> 'object' then raise exception 'invalid_maintenance_plan' using errcode = '22023'; end if;
  select * into run_row from public.miller_quiet_maintenance_runs where id = p_run_id for update;
  if not found or run_row.status <> 'running' then raise exception 'maintenance_cycle_not_running' using errcode = 'P0001'; end if;

  for item in select * from jsonb_array_elements(coalesce(p_plan->'attention_updates','[]'::jsonb)) loop
    update public.miller_attention_topics set current_score = (item->>'next_score')::numeric, state = item->>'next_state', last_recalculated_at = run_row.as_of, version = version + 1
    where id = (item->>'topic_id')::uuid and version = (item->>'expected_version')::integer;
    get diagnostics updated_count = row_count;
    if updated_count <> 1 then raise exception 'stale_attention_plan' using errcode = '40001'; end if;
    event_type := case when (item->>'next_score')::numeric < (item->>'prior_score')::numeric then 'decayed' else 'recalculated' end;
    insert into public.miller_attention_topic_events(topic_id,event_type,prior_score,next_score,prior_state,next_state,reason_codes,provenance)
    values ((item->>'topic_id')::uuid,event_type,(item->>'prior_score')::numeric,(item->>'next_score')::numeric,item->>'prior_state',item->>'next_state',coalesce(item->'reason_codes','[]'::jsonb),jsonb_build_object('quiet_maintenance_run_id',p_run_id,'deterministic',true,'policy_version',run_row.policy_version));
    insert into public.miller_quiet_maintenance_actions(run_id,action_key,action_type,target_kind,target_id,reason_codes,provenance)
    values (p_run_id,item->>'action_key','attention_regulated','attention_topic',item->>'topic_id',coalesce(item->'reason_codes','[]'::jsonb),jsonb_build_object('deterministic',true,'policy_version',run_row.policy_version));
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_plan->'hypothesis_updates','[]'::jsonb)) loop
    if item->>'next_status' not in ('expired','resolved') then raise exception 'invalid_hypothesis_transition' using errcode = '22023'; end if;
    update public.miller_coverage_hypotheses set status = item->>'next_status', updated_at = run_row.as_of
    where id = (item->>'hypothesis_id')::uuid and status = item->>'expected_status';
    get diagnostics updated_count = row_count;
    if updated_count <> 1 then raise exception 'stale_hypothesis_plan' using errcode = '40001'; end if;
    insert into public.miller_quiet_maintenance_actions(run_id,action_key,action_type,target_kind,target_id,reason_codes,provenance)
    values (p_run_id,item->>'action_key',case when item->>'next_status' = 'expired' then 'hypothesis_expired' else 'hypothesis_resolved' end,'coverage_hypothesis',item->>'hypothesis_id',coalesce(item->'reason_codes','[]'::jsonb),jsonb_build_object('deterministic',true,'policy_version',run_row.policy_version));
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_plan->'expired_buckets','[]'::jsonb)) loop
    delete from public.miller_need_observation_buckets where bucket_key = item->>'bucket_key' and expires_at <= run_row.as_of;
    get diagnostics updated_count = row_count;
    if updated_count <> 1 then raise exception 'stale_bucket_plan' using errcode = '40001'; end if;
    insert into public.miller_quiet_maintenance_actions(run_id,action_key,action_type,target_kind,target_id,reason_codes,provenance)
    values (p_run_id,item->>'action_key','expired_aggregate_forgotten','need_bucket',item->>'bucket_key','["retention_expired","aggregate_only"]'::jsonb,jsonb_build_object('deterministic',true,'raw_query_retained',false));
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_plan->'integrity_findings','[]'::jsonb)) loop
    insert into public.miller_quiet_maintenance_actions(run_id,action_key,action_type,target_kind,target_id,reason_codes,provenance)
    values (p_run_id,item->>'action_key','integrity_finding','coverage_hypothesis',item->>'target_id',coalesce(item->'reason_codes','[]'::jsonb),jsonb_build_object('deterministic',true,'factual_mutation',false,'human_review_required',true));
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_plan->'reflections','[]'::jsonb)) loop
    insert into public.miller_reflections(reflection_key,category,topic_id,signal_ids,explanation,confidence,human_impact,recommendation)
    values (item->>'reflection_key',item->>'category',nullif(item->>'topic_id','')::uuid,coalesce(item->'signal_ids','[]'::jsonb),left(item->>'explanation',1000),(item->>'confidence')::numeric,item->>'human_impact',left(item->>'recommendation',1000))
    on conflict(reflection_key) do nothing;
  end loop;

  update public.miller_quiet_maintenance_runs set status = 'completed', inspected_counts = coalesce(p_plan->'inspected_counts','{}'::jsonb), action_counts = coalesce(p_plan->'action_counts','{}'::jsonb), carry_forward = coalesce(p_plan->'carry_forward','[]'::jsonb), result_summary = coalesce(p_plan->'result_summary','{}'::jsonb), completed_at = now()
  where id = p_run_id returning * into run_row;
  return run_row;
end $$;


ALTER FUNCTION "public"."apply_quiet_maintenance_cycle"("p_run_id" "uuid", "p_plan" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."canonical_authoritative_research_runs" (
    "id" "uuid" NOT NULL,
    "operation" "text" NOT NULL,
    "project_ref" "text" NOT NULL,
    "authorized_max_attempts" integer NOT NULL,
    "attempted_count" integer DEFAULT 0 NOT NULL,
    "evidence_success_count" integer DEFAULT 0 NOT NULL,
    "failure_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "machine_actor" "text" DEFAULT 'miller_map_automation'::"text" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resumed_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    CONSTRAINT "canonical_authoritative_research__authorized_max_attempts_check" CHECK ((("authorized_max_attempts" >= 1) AND ("authorized_max_attempts" <= 50))),
    CONSTRAINT "canonical_authoritative_research_runs_attempted_count_check" CHECK (("attempted_count" >= 0)),
    CONSTRAINT "canonical_authoritative_research_runs_check" CHECK ((("evidence_success_count" >= 0) AND ("evidence_success_count" <= "authorized_max_attempts"))),
    CONSTRAINT "canonical_authoritative_research_runs_failure_count_check" CHECK (("failure_count" >= 0)),
    CONSTRAINT "canonical_authoritative_research_runs_machine_actor_check" CHECK (("machine_actor" = 'miller_map_automation'::"text")),
    CONSTRAINT "canonical_authoritative_research_runs_operation_check" CHECK (("operation" = 'canonical_authoritative_research_v1'::"text")),
    CONSTRAINT "canonical_authoritative_research_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'stopped'::"text"])))
);


ALTER TABLE "public"."canonical_authoritative_research_runs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."begin_canonical_authoritative_research_run"("p_run_id" "uuid", "p_authorized_max_attempts" integer, "p_actor_id" "uuid") RETURNS "public"."canonical_authoritative_research_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v public.canonical_authoritative_research_runs; v_project_ref text;
begin
 if p_authorized_max_attempts not between 1 and 50 then raise exception 'research cap must be between 1 and 50'; end if;
 select project_ref into v_project_ref from public.miller_project_binding_v1 where binding_key='miller_project_binding_v1';
 if not found then raise exception 'Miller project binding is not configured'; end if;
 select * into v from public.canonical_authoritative_research_runs where id=p_run_id for update;
 if found then
   if v.project_ref<>v_project_ref or v.operation<>'canonical_authoritative_research_v1' or v.authorized_max_attempts<>p_authorized_max_attempts then raise exception 'research run binding mismatch'; end if;
   if v.status<>'running' then raise exception 'completed or stopped run cannot resume'; end if;
   update public.canonical_authoritative_research_runs set resumed_at=now() where id=p_run_id returning * into v; return v;
 end if;
 insert into public.canonical_authoritative_research_runs(id,operation,project_ref,authorized_max_attempts,actor_id) values(p_run_id,'canonical_authoritative_research_v1',v_project_ref,p_authorized_max_attempts,p_actor_id) returning * into v; return v;
end $$;


ALTER FUNCTION "public"."begin_canonical_authoritative_research_run"("p_run_id" "uuid", "p_authorized_max_attempts" integer, "p_actor_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."map_auto_publication_runs" (
    "id" "uuid" NOT NULL,
    "operation" "text" NOT NULL,
    "project_ref" "text" NOT NULL,
    "policy_version" "text" NOT NULL,
    "authorized_max_successes" integer NOT NULL,
    "attempted_count" integer DEFAULT 0 NOT NULL,
    "successful_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "machine_actor" "text" DEFAULT 'miller_map_automation'::"text" NOT NULL,
    "actor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resumed_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    CONSTRAINT "map_auto_publication_runs_attempted_count_check" CHECK (("attempted_count" >= 0)),
    CONSTRAINT "map_auto_publication_runs_authorized_max_successes_check" CHECK ((("authorized_max_successes" >= 1) AND ("authorized_max_successes" <= 23))),
    CONSTRAINT "map_auto_publication_runs_check" CHECK ((("successful_count" >= 0) AND ("successful_count" <= "authorized_max_successes"))),
    CONSTRAINT "map_auto_publication_runs_failed_count_check" CHECK (("failed_count" >= 0)),
    CONSTRAINT "map_auto_publication_runs_operation_check" CHECK (("operation" = 'map_auto_publish_v1_execution'::"text")),
    CONSTRAINT "map_auto_publication_runs_policy_version_check" CHECK (("policy_version" = 'map_auto_publish_v1'::"text")),
    CONSTRAINT "map_auto_publication_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'stopped'::"text"])))
);


ALTER TABLE "public"."map_auto_publication_runs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."begin_map_auto_publication_run"("p_run_id" "uuid", "p_authorized_max_successes" integer, "p_actor_id" "uuid") RETURNS "public"."map_auto_publication_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ declare v public.map_auto_publication_runs; v_project_ref text; begin
 if p_authorized_max_successes not between 1 and 23 then raise exception 'automatic publication cap must be between 1 and 23'; end if;
 select project_ref into v_project_ref from public.miller_project_binding_v1 where binding_key='miller_project_binding_v1';
 if not found then raise exception 'Miller project binding is not configured'; end if;
 select * into v from public.map_auto_publication_runs where id=p_run_id for update;
 if found then if v.project_ref<>v_project_ref or v.policy_version<>'map_auto_publish_v1' or v.authorized_max_successes<>p_authorized_max_successes then raise exception 'publication run binding mismatch'; end if; if v.status<>'running' then raise exception 'publication run is not resumable'; end if; update public.map_auto_publication_runs set resumed_at=now() where id=p_run_id returning * into v; return v; end if;
 insert into public.map_auto_publication_runs(id,operation,project_ref,policy_version,authorized_max_successes,actor_id) values(p_run_id,'map_auto_publish_v1_execution',v_project_ref,'map_auto_publish_v1',p_authorized_max_successes,p_actor_id) returning * into v; return v; end $$;


ALTER FUNCTION "public"."begin_map_auto_publication_run"("p_run_id" "uuid", "p_authorized_max_successes" integer, "p_actor_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planner_task_executions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "text" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "claim_id" "uuid",
    "task_type" "text" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "research_run_id" "uuid",
    "adapter" "text" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "outcome" "text",
    "source_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "evidence_id" "uuid",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "planner_task_executions_adapter_check" CHECK (("adapter" = 'bounded_authoritative_web_research_v1'::"text")),
    CONSTRAINT "planner_task_executions_outcome_check" CHECK (("outcome" = ANY (ARRAY['resolved'::"text", 'reduced'::"text", 'unchanged'::"text", 'human_review'::"text", 'stale_task'::"text", 'failed'::"text"]))),
    CONSTRAINT "planner_task_executions_source_urls_check" CHECK (("jsonb_typeof"("source_urls") = 'array'::"text")),
    CONSTRAINT "planner_task_executions_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'stale_task'::"text", 'human_review'::"text", 'failed'::"text"]))),
    CONSTRAINT "planner_task_executions_task_type_check" CHECK (("task_type" = ANY (ARRAY['resolve_authoritative_address_conflict'::"text", 'verify_programme_at_site'::"text", 'reconfirm_stale_authoritative_evidence'::"text"])))
);


ALTER TABLE "public"."planner_task_executions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."begin_planner_task_execution_v1"("p_task_id" "text", "p_resource_id" "uuid", "p_claim_id" "uuid", "p_task_type" "text", "p_actor_id" "uuid", "p_research_run_id" "uuid") RETURNS "public"."planner_task_executions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v public.planner_task_executions;
begin
  if length(coalesce(p_task_id,'')) not between 1 and 500 or p_task_type not in ('resolve_authoritative_address_conflict','verify_programme_at_site','reconfirm_stale_authoritative_evidence') then raise exception 'invalid planner task binding'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_task_id, 400));
  select * into v from public.planner_task_executions where task_id=p_task_id for update;
  if found then
    if v.resource_id<>p_resource_id or v.claim_id is distinct from p_claim_id or v.task_type<>p_task_type then raise exception 'planner task identity mismatch'; end if;
    return v;
  end if;
  insert into public.planner_task_executions(task_id,resource_id,claim_id,task_type,actor_id,research_run_id,adapter)
    values(p_task_id,p_resource_id,p_claim_id,p_task_type,p_actor_id,p_research_run_id,'bounded_authoritative_web_research_v1') returning * into v;
  return v;
end $$;


ALTER FUNCTION "public"."begin_planner_task_execution_v1"("p_task_id" "text", "p_resource_id" "uuid", "p_claim_id" "uuid", "p_task_type" "text", "p_actor_id" "uuid", "p_research_run_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trusted_master_bootstrap_runs" (
    "id" "uuid" NOT NULL,
    "operation" "text" NOT NULL,
    "project_ref" "text" NOT NULL,
    "policy_version" "text" NOT NULL,
    "authorized_max_successes" integer NOT NULL,
    "attempted_count" integer DEFAULT 0 NOT NULL,
    "successful_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "machine_actor" "text" DEFAULT 'miller_map_automation'::"text" NOT NULL,
    "actor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resumed_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "stopped_at" timestamp with time zone,
    CONSTRAINT "trusted_master_bootstrap_runs_attempted_count_check" CHECK (("attempted_count" >= 0)),
    CONSTRAINT "trusted_master_bootstrap_runs_authorized_max_successes_check" CHECK ((("authorized_max_successes" >= 1) AND ("authorized_max_successes" <= 50))),
    CONSTRAINT "trusted_master_bootstrap_runs_check" CHECK (("successful_count" <= "authorized_max_successes")),
    CONSTRAINT "trusted_master_bootstrap_runs_failed_count_check" CHECK (("failed_count" >= 0)),
    CONSTRAINT "trusted_master_bootstrap_runs_machine_actor_check" CHECK (("machine_actor" = 'miller_map_automation'::"text")),
    CONSTRAINT "trusted_master_bootstrap_runs_operation_check" CHECK (("operation" = 'trusted_master_occupancy_bootstrap_v1'::"text")),
    CONSTRAINT "trusted_master_bootstrap_runs_policy_version_check" CHECK (("policy_version" = 'trusted_master_occupancy_v1'::"text")),
    CONSTRAINT "trusted_master_bootstrap_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'stopped'::"text"]))),
    CONSTRAINT "trusted_master_bootstrap_runs_successful_count_check" CHECK (("successful_count" >= 0))
);


ALTER TABLE "public"."trusted_master_bootstrap_runs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."begin_trusted_master_occupancy_bootstrap_run"("p_run_id" "uuid", "p_authorized_max_successes" integer, "p_actor_id" "uuid") RETURNS "public"."trusted_master_bootstrap_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_run public.trusted_master_bootstrap_runs; v_project_ref text;
begin
  if p_authorized_max_successes not between 1 and 50 then raise exception 'authorized maximum must be between 1 and 50'; end if;
  select project_ref into v_project_ref from public.miller_project_binding_v1 where binding_key='miller_project_binding_v1';
  if not found then raise exception 'Miller project binding is not configured'; end if;
  select * into v_run from public.trusted_master_bootstrap_runs where id=p_run_id for update;
  if found then
    if v_run.operation <> 'trusted_master_occupancy_bootstrap_v1' or v_run.project_ref <> v_project_ref or v_run.policy_version <> 'trusted_master_occupancy_v1' or v_run.authorized_max_successes <> p_authorized_max_successes then raise exception 'run binding does not match existing authorization'; end if;
    if v_run.status <> 'running' then raise exception 'completed or stopped run cannot be restarted'; end if;
    update public.trusted_master_bootstrap_runs set resumed_at=now() where id=p_run_id returning * into v_run;
    return v_run;
  end if;
  insert into public.trusted_master_bootstrap_runs(id,operation,project_ref,policy_version,authorized_max_successes,actor_id)
    values(p_run_id,'trusted_master_occupancy_bootstrap_v1',v_project_ref,'trusted_master_occupancy_v1',p_authorized_max_successes,p_actor_id) returning * into v_run;
  return v_run;
end $$;


ALTER FUNCTION "public"."begin_trusted_master_occupancy_bootstrap_run"("p_run_id" "uuid", "p_authorized_max_successes" integer, "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bind_existing_canonical_authoritative_evidence_v1"("p_run_id" "uuid", "p_resource_id" "uuid", "p_target_claim_id" "uuid", "p_evidence_id" "uuid", "p_actor_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare r public.resource_registry; i public.canonical_authoritative_research_run_items; t public.resource_fact_claims; s public.resource_fact_claims; e public.resource_fact_evidence; b public.canonical_authoritative_evidence_bindings;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_resource_id::text,39));
 select * into r from public.resource_registry where id=p_resource_id for update;
 if not found or r.lifecycle_state<>'active' or r.editorial_status='hidden' then raise exception 'canonical resource is not eligible'; end if;
 select * into i from public.canonical_authoritative_research_run_items where run_id=p_run_id and resource_id=p_resource_id for update;
 if not found or i.outcome<>'reserved' then raise exception 'reserved canonical research item required'; end if;
 select * into t from public.resource_fact_claims where id=p_target_claim_id and resource_id=p_resource_id and field_name='location_occupancy' and status not in ('superseded','rejected','unknown');
 if not found then raise exception 'target occupancy claim is not current for canonical resource'; end if;
 select * into e from public.resource_fact_evidence where id=p_evidence_id;
 if not found then raise exception 'evidence is not bound to canonical resource occupancy'; end if;
 select * into s from public.resource_fact_claims where id=e.claim_id;
 if not found or s.resource_id<>p_resource_id or s.field_name<>'location_occupancy' then raise exception 'evidence is not bound to canonical resource occupancy'; end if;
 if e.stale or e.source_url is null or e.source_authority<85 then raise exception 'existing evidence is not current authoritative evidence'; end if;
 if public.canonical_authoritative_address_key_v1(s.proposed_value#>>'{}')<>public.canonical_authoritative_address_key_v1(t.proposed_value#>>'{}') then raise exception 'existing evidence conflicts with target occupancy address'; end if;
 insert into public.canonical_authoritative_evidence_bindings(resource_id,target_claim_id,evidence_id,source_claim_id,binding_policy,actor_id) values(p_resource_id,t.id,e.id,s.id,'canonical_authoritative_evidence_binding_v1',p_actor_id) on conflict(target_claim_id,evidence_id) do nothing returning * into b;
 update public.canonical_authoritative_research_run_items set outcome='confirmed',reason_code=case when e.claim_id=t.id then 'existing_authoritative_evidence_reused' else 'existing_evidence_rebound' end,claim_id=t.id,evidence_id=e.id,completed_at=now() where run_id=p_run_id and resource_id=p_resource_id;
 update public.canonical_authoritative_research_runs set evidence_success_count=evidence_success_count+1 where id=p_run_id and i.outcome='reserved';
 return jsonb_build_object('outcome',case when e.claim_id=t.id then 'existing_authoritative_evidence_reused' else 'existing_evidence_rebound' end,'claim_id',t.id,'evidence_id',e.id);
end $$;


ALTER FUNCTION "public"."bind_existing_canonical_authoritative_evidence_v1"("p_run_id" "uuid", "p_resource_id" "uuid", "p_target_claim_id" "uuid", "p_evidence_id" "uuid", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."canonical_authoritative_address_key_v1"("p_value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$ select lower(regexp_replace(coalesce(p_value,''),'[^a-z0-9]','','g')) $$;


ALTER FUNCTION "public"."canonical_authoritative_address_key_v1"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."canonical_authoritative_evidence_current_v1"("p_claim_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
 select exists(
   select 1 from public.resource_fact_evidence e
   where (e.claim_id=p_claim_id or exists(select 1 from public.canonical_authoritative_evidence_bindings b where b.target_claim_id=p_claim_id and b.evidence_id=e.id))
     and e.stale is not true and ((e.source_authority>=85 and e.source_url is not null) or (e.source_type='trusted_master_record' and e.source_record_id is not null and e.source_authority=100))
 ) $$;


ALTER FUNCTION "public"."canonical_authoritative_evidence_current_v1"("p_claim_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."canonical_authoritative_source_authority_v1"("p_url" "text", "p_resource_name" "text") RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
declare h text:=lower(coalesce(p_url,'')); n text:=regexp_replace(lower(coalesce(p_resource_name,'')),'[^a-z0-9]','','g');
begin
 if h !~ '^https://' then return 0; end if;
 if h ~ 'https://[^/]*(fraserhealth\.ca|vch\.ca|providencehealthcare\.org|phsa\.ca|bcmhsus\.ca|fnha\.ca|interiorhealth\.ca|islandhealth\.ca|northernhealth\.ca)' then return 95; end if;
 if h ~ 'https://[^/]*(gov\.bc\.ca|canada\.ca|gc\.ca)' then return 90; end if;
 if h ~ 'https://[^/]*(vancouver\.ca|surrey\.ca|burnaby\.ca|newwestcity\.ca|richmond\.ca|delta\.ca|coquitlam\.ca|abbotsford\.ca)' then return 85; end if;
 if length(n)>=5 and h like '%'||left(n,least(length(n),12))||'%' then return 90; end if;
 return 0;
end $$;


ALTER FUNCTION "public"."canonical_authoritative_source_authority_v1"("p_url" "text", "p_resource_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."canonical_profile_fingerprint_v1"("p_phone" "text", "p_website" "text", "p_location_id" "uuid", "p_city" "text", "p_province" "text", "p_street" "text", "p_version" integer) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select encode(extensions.digest(
    'miller-canonical-profile-v1' || E'\\x1f' ||
    case when p_phone is null then '-1:' else octet_length(p_phone)::text || ':' || p_phone end || E'\\x1f' ||
    case when p_website is null then '-1:' else octet_length(p_website)::text || ':' || p_website end || E'\\x1f' ||
    case when p_location_id is null then '-1:' else octet_length(p_location_id::text)::text || ':' || p_location_id::text end || E'\\x1f' ||
    case when p_city is null then '-1:' else octet_length(p_city)::text || ':' || p_city end || E'\\x1f' ||
    case when p_province is null then '-1:' else octet_length(p_province)::text || ':' || p_province end || E'\\x1f' ||
    case when p_street is null then '-1:' else octet_length(p_street)::text || ':' || p_street end || E'\\x1f' ||
    p_version::text,
    'sha256'), 'hex');
$$;


ALTER FUNCTION "public"."canonical_profile_fingerprint_v1"("p_phone" "text", "p_website" "text", "p_location_id" "uuid", "p_city" "text", "p_province" "text", "p_street" "text", "p_version" integer) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."publication_feed_run_items" (
    "run_id" "uuid" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "selection_rank" integer NOT NULL,
    "stage" "text" NOT NULL,
    "outcome" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reason_codes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "lease_token" "uuid",
    "lease_expires_at" timestamp with time zone,
    "evidence_version" "text",
    "qc_version" integer,
    "last_error" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "publication_feed_run_items_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "publication_feed_run_items_outcome_check" CHECK (("outcome" = ANY (ARRAY['pending'::"text", 'ready_to_publish'::"text", 'one_confirmation_away'::"text", 'human_review'::"text", 'machine_blocked'::"text", 'not_map_eligible'::"text", 'already_published'::"text", 'failed'::"text"]))),
    CONSTRAINT "publication_feed_run_items_stage_check" CHECK (("stage" = ANY (ARRAY['selected'::"text", 'evidence'::"text", 'geocoder'::"text", 'machine_qc'::"text", 'routed'::"text", 'blocked'::"text", 'excluded'::"text"])))
);


ALTER TABLE "public"."publication_feed_run_items" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_publication_feed_item"("p_run_id" "uuid", "p_resource_id" "uuid", "p_lease_token" "uuid", "p_lease_seconds" integer DEFAULT 120) RETURNS "public"."publication_feed_run_items"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare claimed public.publication_feed_run_items;
begin
 update public.publication_feed_run_items set lease_token=p_lease_token,lease_expires_at=now()+make_interval(secs=>greatest(30,least(p_lease_seconds,600))),attempts=attempts+1,started_at=coalesce(started_at,now()),updated_at=now()
 where run_id=p_run_id and resource_id=p_resource_id and outcome='pending' and (lease_expires_at is null or lease_expires_at<now() or lease_token=p_lease_token)
 returning * into claimed;
 if not found then raise exception 'publication feed item is already claimed or complete' using errcode='PT409'; end if;
 return claimed;
end $$;


ALTER FUNCTION "public"."claim_publication_feed_item"("p_run_id" "uuid", "p_resource_id" "uuid", "p_lease_token" "uuid", "p_lease_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classify_map_auto_publish_v1"("p_resource_id" "uuid", "p_expected_qc_version" integer, "p_occupancy_claim_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare v_resource public.resource_registry; v_qc public.location_qc_reviews; v_claim public.resource_fact_claims; v_snapshot jsonb; v_evidence_ids jsonb;
begin
 select * into v_resource from public.resource_registry where id=p_resource_id; if not found or v_resource.lifecycle_state<>'active' or v_resource.editorial_status='hidden' then return jsonb_build_object('decision','manual_review','reason_code','resource_ineligible'); end if;
 if exists(select 1 from public.resource_locations where resource_id=p_resource_id and public_map and review_status='approved') then return jsonb_build_object('decision','manual_review','reason_code','existing_human_location'); end if;
 select * into v_qc from public.location_qc_reviews where canonical_resource_id=p_resource_id; if not found or v_qc.version<>p_expected_qc_version or v_qc.origin<>'machine_initial' then return jsonb_build_object('decision','manual_review','reason_code','current_machine_qc_required'); end if;
 v_snapshot:=v_qc.review_snapshot; select * into v_claim from public.resource_fact_claims where id=p_occupancy_claim_id and resource_id=p_resource_id and field_name='location_occupancy'; if not found then return jsonb_build_object('decision','manual_review','reason_code','authoritative_occupancy_claim_required'); end if;
 select coalesce(jsonb_agg(e.id order by e.id),'[]'::jsonb) into v_evidence_ids from public.resource_fact_evidence e where e.claim_id=v_claim.id or exists(select 1 from public.canonical_authoritative_evidence_bindings b where b.target_claim_id=v_claim.id and b.evidence_id=e.id);
 if not public.canonical_authoritative_evidence_current_v1(v_claim.id) then return jsonb_build_object('decision','manual_review','reason_code','authoritative_occupancy_evidence_required'); end if;
 if jsonb_typeof(coalesce(v_snapshot->'sensitivity_flags','null'::jsonb))<>'array' or jsonb_array_length(v_snapshot->'sensitivity_flags')>0 or coalesce(v_snapshot->>'confidential','false')='true' then return jsonb_build_object('decision','manual_review','reason_code','sensitive_location'); end if;
 if jsonb_typeof(coalesce(v_snapshot->'conflicts','null'::jsonb))<>'array' or jsonb_array_length(v_snapshot->'conflicts')>0 then return jsonb_build_object('decision','manual_review','reason_code','address_conflict'); end if;
 if coalesce(v_snapshot->>'branch_ambiguity','false')='true' then return jsonb_build_object('decision','manual_review','reason_code','multiple_branches'); end if; if coalesce(v_snapshot->>'move_or_closure','false')='true' then return jsonb_build_object('decision','manual_review','reason_code','possible_move_or_closure'); end if;
 if coalesce(v_snapshot->>'submitted_address','') !~* '^[[:space:]]*((unit|suite)[[:space:]]+[0-9]+[[:alpha:]]?[[:space:]]*,[[:space:]]*|[0-9]+[[:alpha:]]?[[:space:]]*[-–—][[:space:]]*)?[0-9]+[[:alpha:]]?[[:space:]]+.+' or coalesce(v_snapshot->>'returned_address','')='' then return jsonb_build_object('decision','manual_review','reason_code','incomplete_or_nonphysical_address'); end if;
 if coalesce(v_snapshot->>'municipality_match','false')<>'true' then return jsonb_build_object('decision','manual_review','reason_code','municipality_mismatch'); end if;
 if coalesce(v_snapshot->>'program_occupancy_confidence','')<>'supported' or coalesce(v_snapshot->>'score','')<>'100' or coalesce(v_snapshot->>'location_descriptor','')<>'parcelpoint' or coalesce(v_snapshot->>'precision_points','') !~ '^[0-9]+([.][0-9]+)?$' or (v_snapshot->>'precision_points')::numeric<95 or coalesce(v_snapshot->'coordinates'->>'latitude','') !~ '^-?[0-9]+([.][0-9]+)?$' or coalesce(v_snapshot->'coordinates'->>'longitude','') !~ '^-?[0-9]+([.][0-9]+)?$' or (v_snapshot->'coordinates'->>'latitude')::double precision not between -90 and 90 or (v_snapshot->'coordinates'->>'longitude')::double precision not between -180 and 180 then return jsonb_build_object('decision','manual_review','reason_code','weak_or_invalid_geocode'); end if;
 return jsonb_build_object('decision','auto_publish_eligible','reason_code','auto_publish_exact_trusted_address','policy_version','map_auto_publish_v1','qc_version',v_qc.version,'occupancy_claim_id',v_claim.id,'occupancy_evidence_ids',v_evidence_ids,'review_snapshot',v_snapshot);
end $_$;


ALTER FUNCTION "public"."classify_map_auto_publish_v1"("p_resource_id" "uuid", "p_expected_qc_version" integer, "p_occupancy_claim_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_human_need_observations"("p_now" timestamp with time zone DEFAULT "now"()) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare deleted_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  delete from public.miller_need_observation_buckets where expires_at <= p_now;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end $$;


ALTER FUNCTION "public"."cleanup_expired_human_need_observations"("p_now" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_canonical_authoritative_research_run"("p_run_id" "uuid", "p_actor_id" "uuid") RETURNS "public"."canonical_authoritative_research_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v public.canonical_authoritative_research_runs;
begin select * into v from public.canonical_authoritative_research_runs where id=p_run_id for update; if not found then raise exception 'research run not found'; end if; if v.status='running' then update public.canonical_authoritative_research_runs set status='completed',completed_at=now(),actor_id=coalesce(actor_id,p_actor_id) where id=p_run_id returning * into v; end if; return v; end $$;


ALTER FUNCTION "public"."complete_canonical_authoritative_research_run"("p_run_id" "uuid", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_trusted_master_occupancy_bootstrap_run"("p_run_id" "uuid", "p_actor_id" "uuid") RETURNS "public"."trusted_master_bootstrap_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_run public.trusted_master_bootstrap_runs;
begin
  select * into v_run from public.trusted_master_bootstrap_runs where id=p_run_id for update;
  if not found then raise exception 'bootstrap run not found'; end if;
  if v_run.status <> 'running' then return v_run; end if;
  update public.trusted_master_bootstrap_runs set status='completed',completed_at=now(),actor_id=coalesce(actor_id,p_actor_id) where id=p_run_id returning * into v_run;
  return v_run;
end $$;


ALTER FUNCTION "public"."complete_trusted_master_occupancy_bootstrap_run"("p_run_id" "uuid", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_qc_reviews" (
    "canonical_resource_id" "uuid" NOT NULL,
    "policy_version" "text" NOT NULL,
    "classification_fingerprint" "text" NOT NULL,
    "decision" "text" NOT NULL,
    "decision_note" "text" DEFAULT ''::"text" NOT NULL,
    "review_snapshot" "jsonb" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "reviewed_by" "uuid" NOT NULL,
    "reviewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "origin" "text" DEFAULT 'human_qc'::"text" NOT NULL,
    CONSTRAINT "location_qc_reviews_decision_check" CHECK (("decision" = ANY (ARRAY['pilot_eligible'::"text", 'manual_review'::"text", 'correct_address'::"text", 'exclude_exact_location'::"text", 'policy_problem'::"text", 'defer'::"text"]))),
    CONSTRAINT "location_qc_reviews_origin_check" CHECK (("origin" = ANY (ARRAY['human_qc'::"text", 'machine_initial'::"text", 'evidence_refresh'::"text"]))),
    CONSTRAINT "location_qc_reviews_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."location_qc_reviews" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_location_qc_machine_review"("p_canonical_resource_id" "uuid", "p_policy_version" "text", "p_classification_fingerprint" "text", "p_review_snapshot" "jsonb", "p_reason" "text", "p_actor_id" "uuid") RETURNS "public"."location_qc_reviews"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_next public.location_qc_reviews;
begin
  if not exists (select 1 from public.resource_registry where id = p_canonical_resource_id and lifecycle_state = 'active' and editorial_status <> 'hidden') then raise exception 'canonical resource is not eligible'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_canonical_resource_id::text, 0));
  if exists (select 1 from public.location_qc_reviews where canonical_resource_id = p_canonical_resource_id for update) then raise exception 'initial machine review already exists or QC is already human-reviewed' using errcode = 'PT409'; end if;
  insert into public.location_qc_reviews(canonical_resource_id,policy_version,classification_fingerprint,decision,decision_note,review_snapshot,version,reviewed_by,reviewed_at,updated_at,origin)
  values(p_canonical_resource_id,p_policy_version,p_classification_fingerprint,'manual_review',left('Machine evidence package awaiting human review. '||coalesce(p_reason,''),1000),p_review_snapshot,1,p_actor_id,now(),now(),'machine_initial') returning * into v_next;
  insert into public.location_qc_review_snapshots(canonical_resource_id,qc_version,snapshot,origin,refresh_reason,prior_version,actor_id)
  values(p_canonical_resource_id,1,p_review_snapshot,'machine_initial',left(coalesce(p_reason,''),1000),null,p_actor_id);
  insert into public.location_qc_review_audit(canonical_resource_id,previous_decision,new_decision,previous_version,new_version,policy_version,classification_fingerprint,decision_note,actor_id)
  values(p_canonical_resource_id,null,'manual_review',0,1,p_policy_version,p_classification_fingerprint,left('Machine-origin initial QC: '||coalesce(p_reason,''),1000),p_actor_id);
  return v_next;
end $$;


ALTER FUNCTION "public"."create_location_qc_machine_review"("p_canonical_resource_id" "uuid", "p_policy_version" "text", "p_classification_fingerprint" "text", "p_review_snapshot" "jsonb", "p_reason" "text", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_machine_initial_location_qc_from_evidence"("p_resource_id" "uuid", "p_occupancy_claim_id" "uuid", "p_geocoder_evidence_id" "uuid", "p_actor_id" "uuid") RETURNS "public"."location_qc_reviews"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_resource public.resource_registry; v_claim public.resource_fact_claims; v_existing public.location_qc_reviews; v_geo jsonb:='{}'::jsonb; v_snapshot jsonb; v_fingerprint text; v_sensitive boolean; v_occupancy_supported boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_resource_id::text,2)); select * into v_resource from public.resource_registry where id=p_resource_id for update;
 if not found or v_resource.lifecycle_state<>'active' or v_resource.editorial_status='hidden' then raise exception 'canonical resource is not eligible'; end if;
 select * into v_existing from public.location_qc_reviews where canonical_resource_id=p_resource_id for update; if found then raise exception 'current QC already exists; machine initial QC will not overwrite it' using errcode='PT409'; end if;
 select * into v_claim from public.resource_fact_claims where id=p_occupancy_claim_id and resource_id=p_resource_id and field_name='location_occupancy'; if not found then raise exception 'location occupancy claim is not bound to this resource'; end if;
 if p_geocoder_evidence_id is not null then select coalesce(e.extracted_value,'{}'::jsonb) into v_geo from public.resource_fact_evidence e join public.resource_fact_claims c on c.id=e.claim_id where e.id=p_geocoder_evidence_id and c.resource_id=p_resource_id; if not found then raise exception 'geocoder evidence is not bound to this resource'; end if; end if;
 v_occupancy_supported:=public.canonical_authoritative_evidence_current_v1(v_claim.id);
 v_sensitive:=lower(v_resource.display_name) like any(array['%safe home%','%transition house%','%confidential%','%undisclosed%']) or exists(select 1 from public.resource_locations where resource_id=p_resource_id and location_type in ('confidential','undisclosed'));
 v_snapshot:=jsonb_build_object('submitted_address',case when v_sensitive then null else v_claim.proposed_value#>>'{}' end,'returned_address',case when v_sensitive then null else coalesce(v_geo->>'standardized_address',v_geo->>'returned_address') end,'locality',v_geo->>'locality','municipality_match',coalesce((v_geo->>'municipality_match')::boolean,false),'score',coalesce((v_geo->>'score')::numeric,0),'precision_points',coalesce((v_geo->>'precision_points')::numeric,0),'location_descriptor',coalesce(v_geo->>'location_descriptor','unknown'),'coordinates',coalesce(v_geo->'coordinates',jsonb_build_object('latitude',v_geo->>'latitude','longitude',v_geo->>'longitude')),'provider',v_geo->>'provider','program_occupancy_confidence',case when v_occupancy_supported then 'supported' else 'unverified' end,'sensitivity_flags',case when v_sensitive then jsonb_build_array('confidential_or_protected_service') else '[]'::jsonb end,'conflicts','[]'::jsonb,'branch_ambiguity',false,'move_or_closure',false,'evidence_fresh',v_occupancy_supported,'source_evidence_tier',case when v_occupancy_supported then 'E1' else 'unverified' end,'machine_actor','miller_map_automation');
 v_fingerprint:=encode(extensions.digest(v_snapshot::text||':'||v_claim.id::text||':'||coalesce(p_geocoder_evidence_id::text,''),'sha256'),'hex'); return public.create_location_qc_machine_review(p_resource_id,'machine_initial_evidence_v1',v_fingerprint,v_snapshot,'Server-derived persisted evidence package.',p_actor_id);
end $$;


ALTER FUNCTION "public"."create_machine_initial_location_qc_from_evidence"("p_resource_id" "uuid", "p_occupancy_claim_id" "uuid", "p_geocoder_evidence_id" "uuid", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_occupancy_claim_from_trusted_master_record"("p_resource_id" "uuid", "p_source_record_id" "uuid", "p_actor_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
end $_$;


ALTER FUNCTION "public"."create_occupancy_claim_from_trusted_master_record"("p_resource_id" "uuid", "p_source_record_id" "uuid", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_occupancy_claim_from_trusted_master_run"("p_run_id" "uuid", "p_resource_id" "uuid", "p_source_record_id" "uuid", "p_actor_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_run public.trusted_master_bootstrap_runs; v_item public.trusted_master_bootstrap_run_items; v_result jsonb;
begin
  select * into v_run from public.trusted_master_bootstrap_runs where id=p_run_id for update;
  if not found then raise exception 'bootstrap run not found'; end if;
  if v_run.status <> 'running' then raise exception 'bootstrap run is not resumable'; end if;
  select * into v_item from public.trusted_master_bootstrap_run_items where run_id=p_run_id and resource_id=p_resource_id for update;
  if found and v_item.outcome in ('created','idempotent') then return jsonb_build_object('outcome','idempotent','claim_id',v_item.claim_id,'run_id',p_run_id); end if;
  if v_run.successful_count >= v_run.authorized_max_successes then
    insert into public.trusted_master_bootstrap_run_items(run_id,resource_id,source_record_id,outcome,failure_code)
      values(p_run_id,p_resource_id,p_source_record_id,'refused','authorized_success_cap_reached')
      on conflict (run_id,resource_id) do update set outcome='refused',failure_code='authorized_success_cap_reached',attempted_at=now();
    return jsonb_build_object('outcome','refused','reason_code','authorized_success_cap_reached','run_id',p_run_id);
  end if;
  insert into public.trusted_master_bootstrap_run_items(run_id,resource_id,source_record_id,outcome)
    values(p_run_id,p_resource_id,p_source_record_id,'reserved')
    on conflict (run_id,resource_id) do update set source_record_id=excluded.source_record_id,outcome='reserved',failure_code=null,attempted_at=now();
  update public.trusted_master_bootstrap_runs set attempted_count=attempted_count+1 where id=p_run_id;
  begin
    v_result := public.create_occupancy_claim_from_trusted_master_record(p_resource_id,p_source_record_id,p_actor_id);
    update public.trusted_master_bootstrap_run_items set outcome=case when v_result->>'outcome'='idempotent' then 'idempotent' else 'created' end,claim_id=(v_result->>'claim_id')::uuid,committed_at=now() where run_id=p_run_id and resource_id=p_resource_id;
    if v_result->>'outcome' = 'created' then update public.trusted_master_bootstrap_runs set successful_count=successful_count+1 where id=p_run_id; end if;
    return v_result || jsonb_build_object('run_id',p_run_id);
  exception when others then
    update public.trusted_master_bootstrap_run_items set outcome='failed',failure_code=left(SQLSTATE || ':' || SQLERRM,500) where run_id=p_run_id and resource_id=p_resource_id;
    update public.trusted_master_bootstrap_runs set failed_count=failed_count+1 where id=p_run_id;
    return jsonb_build_object('outcome','failed','reason_code',SQLSTATE,'run_id',p_run_id);
  end;
end $$;


ALTER FUNCTION "public"."create_occupancy_claim_from_trusted_master_run"("p_run_id" "uuid", "p_resource_id" "uuid", "p_source_record_id" "uuid", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dry_run_map_auto_publish_v1"("p_resource_id" "uuid", "p_expected_qc_version" integer, "p_occupancy_claim_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."dry_run_map_auto_publish_v1"("p_resource_id" "uuid", "p_expected_qc_version" integer, "p_occupancy_claim_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_resource_canonical_profile_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare v_location public.resource_locations;
begin
  new.phone := nullif(regexp_replace(coalesce(new.phone, ''), '[^0-9+]', '', 'g'), '');
  if new.phone is not null and left(new.phone, 1) <> '+' then
    raise exception 'canonical phone must be E.164';
  end if;
  new.website := nullif(regexp_replace(lower(btrim(coalesce(new.website, ''))), '/+$', ''), '');

  if new.canonical_location_id is not null then
    select * into v_location from public.resource_locations where id = new.canonical_location_id for key share;
    if not found or v_location.resource_id <> new.resource_id then
      raise exception 'canonical location must belong to resource';
    end if;
    if v_location.location_type in ('confidential', 'undisclosed') or v_location.review_status = 'confidential' then
      raise exception 'confidential location cannot be canonical public location';
    end if;
  end if;

  select public.canonical_profile_fingerprint_v1(new.phone, new.website, new.canonical_location_id,
    v_location.city, v_location.province, v_location.street_address, new.version)
  into new.canonical_fingerprint;
  new.updated_at := now();
  return new;
end $_$;


ALTER FUNCTION "public"."enforce_resource_canonical_profile_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_resource_submission_attachment_quarantine"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status = 'available' and not exists (
    select 1
    from public.resource_submission_attachment_scan_decisions decision
    where decision.attachment_id = new.id
      and decision.decision = 'clean'
      and decision.actor_type = 'scanner_service'
  ) then
    raise exception 'attachment cannot be available without a clean scanner-service decision' using errcode = 'P0001';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_resource_submission_attachment_quarantine"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fail_quiet_maintenance_cycle"("p_run_id" "uuid", "p_failure_code" "text") RETURNS "public"."miller_quiet_maintenance_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare result public.miller_quiet_maintenance_runs;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  update public.miller_quiet_maintenance_runs set status = 'failed', failure_code = left(regexp_replace(coalesce(p_failure_code,'maintenance_failed'),'[^a-z0-9_-]','','g'),100), completed_at = now()
  where id = p_run_id and status = 'running' returning * into result;
  if not found then raise exception 'maintenance_cycle_not_running' using errcode = 'P0001'; end if;
  return result;
end $$;


ALTER FUNCTION "public"."fail_quiet_maintenance_cycle"("p_run_id" "uuid", "p_failure_code" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."canonical_authoritative_research_run_items" (
    "run_id" "uuid" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "outcome" "text" NOT NULL,
    "reason_code" "text" NOT NULL,
    "claim_id" "uuid",
    "evidence_id" "uuid",
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "canonical_authoritative_research_run_items_outcome_check" CHECK (("outcome" = ANY (ARRAY['reserved'::"text", 'confirmed'::"text", 'conflict'::"text", 'insufficient'::"text", 'protected'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."canonical_authoritative_research_run_items" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finish_canonical_authoritative_research_item"("p_run_id" "uuid", "p_resource_id" "uuid", "p_outcome" "text", "p_reason_code" "text", "p_claim_id" "uuid", "p_evidence_id" "uuid", "p_actor_id" "uuid") RETURNS "public"."canonical_authoritative_research_run_items"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v public.canonical_authoritative_research_run_items;
begin
 if p_outcome not in ('confirmed','conflict','insufficient','protected','failed') then raise exception 'invalid research outcome'; end if;
 select * into v from public.canonical_authoritative_research_run_items where run_id=p_run_id and resource_id=p_resource_id for update; if not found or v.outcome<>'reserved' then raise exception 'research item is not reserved'; end if;
 if p_claim_id is not null and not exists(select 1 from public.resource_fact_claims where id=p_claim_id and resource_id=p_resource_id) then raise exception 'research claim is not bound to resource'; end if;
 if p_evidence_id is not null and not exists(select 1 from public.resource_fact_evidence e join public.resource_fact_claims c on c.id=e.claim_id where e.id=p_evidence_id and c.resource_id=p_resource_id and (p_claim_id is null or c.id=p_claim_id or exists(select 1 from public.canonical_authoritative_evidence_bindings b where b.target_claim_id=p_claim_id and b.evidence_id=e.id))) then raise exception 'research evidence is not bound to resource claim'; end if;
 update public.canonical_authoritative_research_run_items set outcome=p_outcome,reason_code=left(p_reason_code,120),claim_id=p_claim_id,evidence_id=p_evidence_id,completed_at=now() where run_id=p_run_id and resource_id=p_resource_id returning * into v;
 update public.canonical_authoritative_research_runs set evidence_success_count=evidence_success_count+case when p_outcome='confirmed' then 1 else 0 end,failure_count=failure_count+case when p_outcome='failed' then 1 else 0 end where id=p_run_id; return v;
end $$;


ALTER FUNCTION "public"."finish_canonical_authoritative_research_item"("p_run_id" "uuid", "p_resource_id" "uuid", "p_outcome" "text", "p_reason_code" "text", "p_claim_id" "uuid", "p_evidence_id" "uuid", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finish_planner_task_execution_v1"("p_task_id" "text", "p_status" "text", "p_outcome" "text", "p_source_urls" "jsonb", "p_evidence_id" "uuid") RETURNS "public"."planner_task_executions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v public.planner_task_executions;
begin
  if p_status not in ('completed','stale_task','human_review','failed') or p_outcome not in ('resolved','reduced','unchanged','human_review','stale_task','failed') or jsonb_typeof(coalesce(p_source_urls,'[]'::jsonb))<>'array' then raise exception 'invalid planner execution result'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_task_id, 400));
  select * into v from public.planner_task_executions where task_id=p_task_id for update;
  if not found then raise exception 'planner execution not found'; end if;
  if v.status<>'running' then return v; end if;
  update public.planner_task_executions set status=p_status,outcome=p_outcome,source_urls=p_source_urls,evidence_id=p_evidence_id,completed_at=now() where id=v.id returning * into v;
  return v;
end $$;


ALTER FUNCTION "public"."finish_planner_task_execution_v1"("p_task_id" "text", "p_status" "text", "p_outcome" "text", "p_source_urls" "jsonb", "p_evidence_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."persist_canonical_authoritative_location_evidence_v1"("p_run_id" "uuid", "p_resource_id" "uuid", "p_source_url" "text", "p_source_reference" "text", "p_source_excerpt" "text", "p_candidate_address" "text", "p_actor_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare r public.resource_registry; i public.canonical_authoritative_research_run_items; c public.resource_fact_claims; e public.resource_fact_evidence; v_authority integer; v_key text; v_number text; v_name_token text; v_claim_fingerprint text; v_evidence_fingerprint text; v_type text; v_existing_key text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_resource_id::text,40));
 select * into r from public.resource_registry where id=p_resource_id for update;
 if not found or r.lifecycle_state<>'active' or r.editorial_status='hidden' then raise exception 'canonical resource is not eligible'; end if;
 if lower(r.display_name) ~ '(safe home|transition house|domestic violence|trafficking|confidential|undisclosed|recovery home|recovery house)' or exists(select 1 from public.resource_locations l where l.resource_id=p_resource_id and l.location_type in ('confidential','undisclosed')) then raise exception 'sensitive or protected resource cannot persist public occupancy evidence'; end if;
 select * into i from public.canonical_authoritative_research_run_items where run_id=p_run_id and resource_id=p_resource_id for update;
 if not found or i.outcome<>'reserved' then raise exception 'reserved canonical research item required'; end if;
 if p_candidate_address !~ '^[[:space:]]*[0-9]+[[:alpha:]]?[[:space:]]+.+|^[[:space:]]*(unit|suite|#)[[:space:]]*[a-z0-9-]+[,: ]+[0-9]+' or p_candidate_address ~* '(p\.?\s*o\.?\s*box|service area|virtual|intake only)' then raise exception 'complete public civic address required'; end if;
 v_authority:=public.canonical_authoritative_source_authority_v1(p_source_url,r.display_name);
 if v_authority<85 then raise exception 'source is not in a permitted authoritative class'; end if;
 v_number:=lower((regexp_match(p_candidate_address,'[0-9]+[A-Za-z]?'))[1]);
 v_name_token:=lower((regexp_match(r.display_name,'[A-Za-z0-9]{4,}'))[1]);
 if v_number is null or v_name_token is null or lower(coalesce(p_source_excerpt,'')) !~ ('(^|[^a-z0-9])'||v_number||'([^a-z0-9]|$)') or lower(coalesce(p_source_excerpt,'')) !~ ('(^|[^a-z0-9])'||v_name_token||'([^a-z0-9]|$)') then raise exception 'exact programme-at-site support is required'; end if;
 v_key:=public.canonical_authoritative_address_key_v1(p_candidate_address);
 if exists(select 1 from public.resource_fact_claims x where x.resource_id=p_resource_id and x.field_name='location_occupancy' and x.status not in ('superseded','rejected','unknown') and public.canonical_authoritative_evidence_current_v1(x.id) and public.canonical_authoritative_address_key_v1(x.proposed_value#>>'{}')<>v_key) then raise exception 'current authoritative occupancy evidence conflicts with candidate address'; end if;
 v_claim_fingerprint:=encode(extensions.digest('canonical_authoritative_location_v1:'||p_resource_id::text||':'||v_key,'sha256'),'hex');
 select * into c from public.resource_fact_claims where claim_fingerprint=v_claim_fingerprint for update;
 if not found then insert into public.resource_fact_claims(resource_id,field_name,proposed_value,risk,recommendation,confidence,reason_codes,engine_version,status,claim_fingerprint,decision_category,research_summary,last_observed_at) values(p_resource_id,'location_occupancy',to_jsonb(p_candidate_address),'medium','human_review','high',array['authoritative_program_at_site','public_civic_address'],'canonical_authoritative_location_v1','observed',v_claim_fingerprint,'location_occupancy','Server-validated authoritative programme-at-site evidence.',now()) returning * into c; end if;
 v_type:=case when p_source_url ~* 'https://[^/]*(fraserhealth|vch|providence|phsa|bcmhsus|fnha|interiorhealth|islandhealth|northernhealth)' then 'health_authority' when p_source_url ~* 'https://[^/]*(gov\.bc\.ca|canada\.ca|gc\.ca)' then 'government' else 'official_provider' end;
 v_evidence_fingerprint:=encode(extensions.digest('canonical_authoritative_location_evidence_v1:'||c.id::text||':'||lower(p_source_url)||':'||v_key,'sha256'),'hex');
 insert into public.resource_fact_evidence(claim_id,source_type,source_record_id,source_url,extracted_value,extraction_method,retrieved_at,source_authority,independent_key,stale,evidence_fingerprint) values(c.id,v_type,nullif(left(p_source_reference,300),''),p_source_url,jsonb_build_object('address',p_candidate_address,'source_excerpt',left(p_source_excerpt,1200),'programme_at_site_verified',true,'source_policy','canonical_authoritative_location_v1'),'server_validated_programme_at_site',now(),v_authority,regexp_replace(p_source_url,'^https://([^/]+).*','\1'),false,v_evidence_fingerprint) on conflict(evidence_fingerprint) where evidence_fingerprint is not null do nothing;
 select * into e from public.resource_fact_evidence where evidence_fingerprint=v_evidence_fingerprint;
 insert into public.resource_fact_change_audit(claim_id,resource_id,field_name,previous_value,new_value,action,reason_codes,actor_type,actor_id) values(c.id,p_resource_id,'location_occupancy',null,c.proposed_value,'observe',array['canonical_authoritative_location_v1','programme_at_site_verified'],'miller_automation',p_actor_id);
 update public.canonical_authoritative_research_run_items set outcome='confirmed',reason_code='authoritative_current_address_confirmed',claim_id=c.id,evidence_id=e.id,completed_at=now() where run_id=p_run_id and resource_id=p_resource_id;
 update public.canonical_authoritative_research_runs set evidence_success_count=evidence_success_count+1 where id=p_run_id;
 return jsonb_build_object('outcome','authoritative_current_address_confirmed','claim_id',c.id,'evidence_id',e.id);
end $_$;


ALTER FUNCTION "public"."persist_canonical_authoritative_location_evidence_v1"("p_run_id" "uuid", "p_resource_id" "uuid", "p_source_url" "text", "p_source_reference" "text", "p_source_excerpt" "text", "p_candidate_address" "text", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."persist_canonical_bc_geocoder_evidence_v1"("p_run_id" "uuid", "p_resource_id" "uuid", "p_occupancy_claim_id" "uuid", "p_geocoder_package" "jsonb", "p_actor_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
end $_$;


ALTER FUNCTION "public"."persist_canonical_bc_geocoder_evidence_v1"("p_run_id" "uuid", "p_resource_id" "uuid", "p_occupancy_claim_id" "uuid", "p_geocoder_package" "jsonb", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_authoritative_location_correction_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin raise exception 'authoritative location corrections are append-only'; end $$;


ALTER FUNCTION "public"."prevent_authoritative_location_correction_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_location_qc_audit_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$ begin raise exception 'location QC audit is append-only'; end $$;


ALTER FUNCTION "public"."prevent_location_qc_audit_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_map_auto_publication_decision_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin raise exception 'map auto publication decisions are append-only'; end $$;


ALTER FUNCTION "public"."prevent_map_auto_publication_decision_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_miller_maintenance_cycle_journal_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'DELETE' then raise exception 'maintenance cycle journal is append-only'; end if;
  if old.status <> 'running' then raise exception 'completed maintenance journal is immutable'; end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_miller_maintenance_cycle_journal_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_miller_maintenance_outcome_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$ begin raise exception 'maintenance outcome evidence is append-only'; end $$;


ALTER FUNCTION "public"."prevent_miller_maintenance_outcome_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_resource_canonical_profile_audit_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$ begin raise exception 'canonical profile audit is append-only'; end $$;


ALTER FUNCTION "public"."prevent_resource_canonical_profile_audit_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_resource_fact_audit_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  raise exception 'resource fact audit is append-only';
end $$;


ALTER FUNCTION "public"."prevent_resource_fact_audit_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_shelter_candidate_reconciliation_audit_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$ begin raise exception 'shelter reconciliation audit is append-only'; end $$;


ALTER FUNCTION "public"."prevent_shelter_candidate_reconciliation_audit_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_map_location_v1"("p_resource_id" "uuid", "p_expected_qc_version" integer, "p_occupancy_claim_id" "uuid", "p_geocoder_evidence_id" "uuid", "p_run_id" "uuid", "p_actor_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_run public.map_auto_publication_runs; v_existing public.map_auto_publication_execution_provenance; v_geo public.resource_fact_evidence; v_result jsonb; v_snapshot jsonb; v_location public.resource_locations; v_new public.resource_locations;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_resource_id::text,4)); select * into v_run from public.map_auto_publication_runs where id=p_run_id for update;
 if not found or v_run.status<>'running' then raise exception 'publication run is not resumable'; end if;
 select * into v_existing from public.map_auto_publication_execution_provenance where run_id=p_run_id and resource_id=p_resource_id for update;
 if found and v_existing.outcome in ('published','idempotent') then return jsonb_build_object('outcome','idempotent','reason_code',v_existing.reason_code,'location_id',v_existing.location_id); end if;
 if v_run.successful_count>=v_run.authorized_max_successes then return jsonb_build_object('outcome','refused','reason_code','authorized_success_cap_reached'); end if;
 select * into v_geo from public.resource_fact_evidence e join public.resource_fact_claims c on c.id=e.claim_id where e.id=p_geocoder_evidence_id and c.id=p_occupancy_claim_id and c.resource_id=p_resource_id and e.source_type='bc_geocoder' and e.stale is not true;
 if not found then return jsonb_build_object('outcome','refused','reason_code','geocoder_evidence_not_bound'); end if;
 if coalesce((v_geo.extracted_value->>'score')::numeric,0)<>100 or lower(coalesce(v_geo.extracted_value->>'location_descriptor',''))<>'parcelpoint' or coalesce((v_geo.extracted_value->>'municipality_match')::boolean,false) is not true or upper(coalesce(v_geo.extracted_value->>'province',''))<>'BC' then return jsonb_build_object('outcome','refused','reason_code','weak_or_invalid_geocode'); end if;
 v_result:=public.classify_map_auto_publish_v1(p_resource_id,p_expected_qc_version,p_occupancy_claim_id);
 if v_result->>'decision'<>'auto_publish_eligible' then insert into public.map_auto_publication_execution_provenance(run_id,resource_id,qc_version,occupancy_claim_id,geocoder_evidence_id,policy_version,outcome,reason_code) values(p_run_id,p_resource_id,p_expected_qc_version,p_occupancy_claim_id,p_geocoder_evidence_id,'map_auto_publish_v1','refused',v_result->>'reason_code') on conflict(run_id,resource_id) do update set outcome='refused',reason_code=excluded.reason_code; return jsonb_build_object('outcome','refused','reason_code',v_result->>'reason_code'); end if;
 v_snapshot:=v_result->'review_snapshot'; if exists(select 1 from public.resource_locations where resource_id=p_resource_id and public_map and review_status='approved') then return jsonb_build_object('outcome','refused','reason_code','existing_human_location'); end if;
 select * into v_location from public.resource_locations where resource_id=p_resource_id and location_type='fixed' and street_address=v_snapshot->>'submitted_address' for update;
 if found then update public.resource_locations set latitude=(v_snapshot->'coordinates'->>'latitude')::double precision,longitude=(v_snapshot->'coordinates'->>'longitude')::double precision,geocode_source='bc_address_geocoder',geocode_status='verified',review_status='approved',public_map=true,reviewed_by=p_actor_id,reviewed_at=now(),location_last_verified=now(),updated_at=now() where id=v_location.id returning * into v_new;
 else insert into public.resource_locations(resource_id,location_label,location_type,original_address_text,street_address,city,province,country,latitude,longitude,geocode_source,geocode_confidence,geocode_status,review_status,public_map,reviewed_by,reviewed_at,location_last_verified) values(p_resource_id,'Automatically published verified location','fixed',v_snapshot->>'submitted_address',v_snapshot->>'submitted_address',v_snapshot->>'locality','BC','Canada',(v_snapshot->'coordinates'->>'latitude')::double precision,(v_snapshot->'coordinates'->>'longitude')::double precision,'bc_address_geocoder',1,'verified','approved',true,p_actor_id,now(),now()) returning * into v_new; end if;
 insert into public.resource_location_audit(location_id,action,previous_values,new_values,actor_id,reason) values(v_new.id,'publication_changed',to_jsonb(v_location),to_jsonb(v_new),p_actor_id,'Automatic map_auto_publish_v1 publication.');
 insert into public.map_auto_publication_execution_provenance(run_id,resource_id,location_id,qc_version,occupancy_claim_id,geocoder_evidence_id,policy_version,outcome,reason_code) values(p_run_id,p_resource_id,v_new.id,p_expected_qc_version,p_occupancy_claim_id,p_geocoder_evidence_id,'map_auto_publish_v1','published','auto_publish_exact_trusted_address') on conflict(run_id,resource_id) do nothing;
 update public.map_auto_publication_runs set attempted_count=attempted_count+1,successful_count=successful_count+1 where id=p_run_id; return jsonb_build_object('outcome','published','reason_code','auto_publish_exact_trusted_address','location_id',v_new.id);
end $$;


ALTER FUNCTION "public"."publish_map_location_v1"("p_resource_id" "uuid", "p_expected_qc_version" integer, "p_occupancy_claim_id" "uuid", "p_geocoder_evidence_id" "uuid", "p_run_id" "uuid", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resource_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "source_alias_id" bigint,
    "location_label" "text",
    "location_type" "text" NOT NULL,
    "original_address_text" "text",
    "street_address" "text",
    "city" "text",
    "province" "text",
    "postal_code" "text",
    "country" "text" DEFAULT 'Canada'::"text" NOT NULL,
    "service_area" "text",
    "latitude" double precision,
    "longitude" double precision,
    "geocode_source" "text",
    "geocode_confidence" double precision,
    "geocode_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "review_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "public_map" boolean DEFAULT false NOT NULL,
    "location_last_verified" timestamp with time zone,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "resource_locations_check" CHECK ((("latitude" IS NULL) = ("longitude" IS NULL))),
    CONSTRAINT "resource_locations_check1" CHECK ((("location_type" = 'fixed'::"text") OR ("latitude" IS NULL))),
    CONSTRAINT "resource_locations_check2" CHECK (((NOT "public_map") OR (("location_type" = 'fixed'::"text") AND ("geocode_status" = 'verified'::"text") AND ("review_status" = 'approved'::"text") AND ("latitude" IS NOT NULL) AND ("longitude" IS NOT NULL)))),
    CONSTRAINT "resource_locations_geocode_confidence_check" CHECK ((("geocode_confidence" >= (0)::double precision) AND ("geocode_confidence" <= (1)::double precision))),
    CONSTRAINT "resource_locations_geocode_status_check" CHECK (("geocode_status" = ANY (ARRAY['pending'::"text", 'matched'::"text", 'verified'::"text", 'rejected'::"text", 'failed'::"text", 'not_required'::"text"]))),
    CONSTRAINT "resource_locations_latitude_check" CHECK ((("latitude" >= ('-90'::integer)::double precision) AND ("latitude" <= (90)::double precision))),
    CONSTRAINT "resource_locations_location_type_check" CHECK (("location_type" = ANY (ARRAY['fixed'::"text", 'service_area'::"text", 'virtual'::"text", 'mobile'::"text", 'confidential'::"text", 'undisclosed'::"text", 'unmapped'::"text"]))),
    CONSTRAINT "resource_locations_longitude_check" CHECK ((("longitude" >= ('-180'::integer)::double precision) AND ("longitude" <= (180)::double precision))),
    CONSTRAINT "resource_locations_review_status_check" CHECK (("review_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'excluded'::"text", 'confidential'::"text"])))
);


ALTER TABLE "public"."resource_locations" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_verified_map_pin"("p_resource_id" "uuid", "p_expected_qc_version" integer, "p_actor_id" "uuid") RETURNS "public"."resource_locations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."publish_verified_map_pin"("p_resource_id" "uuid", "p_expected_qc_version" integer, "p_actor_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trusted_master_bootstrap_reconciliations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operation" "text" NOT NULL,
    "intended_authorized_max" integer NOT NULL,
    "actual_successful_writes" integer NOT NULL,
    "cause" "text" NOT NULL,
    "corrective_policy_version" "text" NOT NULL,
    "no_public_location_consequence" boolean NOT NULL,
    "actor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trusted_master_bootstrap_reconc_corrective_policy_version_check" CHECK (("corrective_policy_version" = 'trusted_master_bootstrap_run_accounting_v1'::"text")),
    CONSTRAINT "trusted_master_bootstrap_reconcil_intended_authorized_max_check" CHECK (("intended_authorized_max" = 50)),
    CONSTRAINT "trusted_master_bootstrap_reconciliations_check" CHECK (("actual_successful_writes" >= "intended_authorized_max")),
    CONSTRAINT "trusted_master_bootstrap_reconciliations_operation_check" CHECK (("operation" = 'trusted_master_occupancy_bootstrap_v1'::"text"))
);


ALTER TABLE "public"."trusted_master_bootstrap_reconciliations" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconcile_trusted_master_bootstrap_cap_failure"("p_actor_id" "uuid") RETURNS "public"."trusted_master_bootstrap_reconciliations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_actual integer; v_result public.trusted_master_bootstrap_reconciliations;
begin
  select count(*) into v_actual from public.resource_fact_claims where engine_version='trusted_master_occupancy_v1';
  if v_actual < 55 then raise exception 'existing over-cap cohort does not match expected reconciliation minimum'; end if;
  insert into public.trusted_master_bootstrap_reconciliations(operation,intended_authorized_max,actual_successful_writes,cause,corrective_policy_version,no_public_location_consequence,actor_id)
  values('trusted_master_occupancy_bootstrap_v1',50,v_actual,'Interrupted and resumed runner used invocation-local limits without durable run accounting.','trusted_master_bootstrap_run_accounting_v1',true,p_actor_id)
  on conflict (operation,corrective_policy_version) do nothing
  returning * into v_result;
  if not found then select * into v_result from public.trusted_master_bootstrap_reconciliations where operation='trusted_master_occupancy_bootstrap_v1' and corrective_policy_version='trusted_master_bootstrap_run_accounting_v1'; end if;
  return v_result;
end $$;


ALTER FUNCTION "public"."reconcile_trusted_master_bootstrap_cap_failure"("p_actor_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_external_security_observations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "observer_id" "uuid" NOT NULL,
    "target_id" "text" NOT NULL,
    "observation_key" "text" NOT NULL,
    "observation_type" "text" NOT NULL,
    "observed_at" timestamp with time zone NOT NULL,
    "status" "text" NOT NULL,
    "evidence_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "schema_version" "text" DEFAULT 'external-security-observation-v1'::"text" NOT NULL,
    CONSTRAINT "miller_external_security_observations_observation_key_check" CHECK (("observation_key" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "miller_external_security_observations_observation_type_check" CHECK (("observation_type" = ANY (ARRAY['availability'::"text", 'http_headers'::"text", 'auth_negative_probe'::"text", 'tls_posture'::"text", 'latency_anomaly'::"text"]))),
    CONSTRAINT "miller_external_security_observations_status_check" CHECK (("status" = ANY (ARRAY['pass'::"text", 'fail'::"text", 'inconclusive'::"text"]))),
    CONSTRAINT "miller_external_security_observations_target_id_check" CHECK (("target_id" ~ '^[a-z0-9][a-z0-9_-]{0,79}$'::"text"))
);


ALTER TABLE "public"."miller_external_security_observations" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_external_security_observation"("p_observer_key" "text", "p_observation_key" "text", "p_observation_type" "text", "p_observed_at" timestamp with time zone, "p_status" "text", "p_evidence_summary" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "public"."miller_external_security_observations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare observer public.miller_security_observers; saved public.miller_external_security_observations;
begin
 if auth.role() <> 'authenticated' then raise exception 'authenticated_observer_required'; end if;
 if p_observer_key !~ '^[a-z0-9][a-z0-9_-]{2,79}$' or p_observation_key !~ '^[a-f0-9]{64}$' or p_observation_type not in ('availability','http_headers','auth_negative_probe','tls_posture','latency_anomaly') or p_status not in ('pass','fail','inconclusive') or p_observed_at is null or jsonb_typeof(coalesce(p_evidence_summary,'{}'::jsonb)) <> 'object' or octet_length(coalesce(p_evidence_summary,'{}'::jsonb)::text)>2048 or exists(select 1 from jsonb_object_keys(coalesce(p_evidence_summary,'{}'::jsonb)) as key where key ~* '(token|secret|authorization|cookie|body|payload)') then raise exception 'invalid_external_security_observation'; end if;
 select * into observer from public.miller_security_observers where observer_key=p_observer_key and auth_user_id=auth.uid() and enabled=true for update;
 if observer.id is null then raise exception 'observer_not_authorized'; end if;
 insert into public.miller_external_security_observations(observer_id,target_id,observation_key,observation_type,observed_at,status,evidence_summary)
 values(observer.id,observer.target_id,p_observation_key,p_observation_type,p_observed_at,p_status,jsonb_build_object('aggregate_only',true,'observer_key',p_observer_key,'summary',coalesce(p_evidence_summary,'{}'::jsonb)))
 on conflict(observer_id,observation_key) do nothing returning * into saved;
 if saved.id is null then select * into saved from public.miller_external_security_observations where observer_id=observer.id and observation_key=p_observation_key; end if;
 return saved;
end $_$;


ALTER FUNCTION "public"."record_external_security_observation"("p_observer_key" "text", "p_observation_key" "text", "p_observation_type" "text", "p_observed_at" timestamp with time zone, "p_status" "text", "p_evidence_summary" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_need_observation_buckets" (
    "bucket_key" "text" NOT NULL,
    "source" "text" NOT NULL,
    "schema_version" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "theme" "text" NOT NULL,
    "geography" "text" NOT NULL,
    "observed_hour" timestamp with time zone NOT NULL,
    "observation_count" integer DEFAULT 1 NOT NULL,
    "first_observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    CONSTRAINT "miller_need_observation_buckets_bucket_key_check" CHECK (("bucket_key" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "miller_need_observation_buckets_check" CHECK (("expires_at" <= ("first_observed_at" + '31 days'::interval))),
    CONSTRAINT "miller_need_observation_buckets_geography_check" CHECK (("geography" = ANY (ARRAY['province'::"text", 'fraser'::"text", 'vancouver_coastal'::"text", 'island'::"text", 'interior'::"text", 'northern'::"text"]))),
    CONSTRAINT "miller_need_observation_buckets_kind_check" CHECK (("kind" = ANY (ARRAY['need'::"text", 'barrier'::"text"]))),
    CONSTRAINT "miller_need_observation_buckets_observation_count_check" CHECK ((("observation_count" >= 1) AND ("observation_count" <= 10000))),
    CONSTRAINT "miller_need_observation_buckets_schema_version_check" CHECK (("schema_version" = 'human-needs-v1'::"text")),
    CONSTRAINT "miller_need_observation_buckets_source_check" CHECK (("source" = 'public_directory_search'::"text")),
    CONSTRAINT "miller_need_observation_buckets_theme_check" CHECK (("theme" = ANY (ARRAY['withdrawal_management'::"text", 'outpatient_treatment'::"text", 'residential_treatment'::"text", 'opioid_agonist_treatment'::"text", 'counselling'::"text", 'harm_reduction'::"text", 'overdose_prevention'::"text", 'youth_services'::"text", 'family_support'::"text", 'housing_support'::"text", 'shelter'::"text", 'peer_support'::"text", 'medical_support'::"text", 'crisis_support'::"text", 'transportation'::"text", 'mobility_accessibility'::"text", 'cost'::"text", 'waitlist'::"text", 'eligibility'::"text", 'age_restriction'::"text", 'referral_requirement'::"text", 'hours_availability'::"text", 'language_access'::"text", 'virtual_access'::"text", 'geographic_distance'::"text", 'immediate_access'::"text"])))
);


ALTER TABLE "public"."miller_need_observation_buckets" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_human_need_observation"("p_bucket_key" "text", "p_kind" "text", "p_theme" "text", "p_geography" "text", "p_observed_hour" timestamp with time zone, "p_expires_at" timestamp with time zone) RETURNS "public"."miller_need_observation_buckets"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare result public.miller_need_observation_buckets;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  insert into public.miller_need_observation_buckets(bucket_key,source,schema_version,kind,theme,geography,observed_hour,expires_at)
  values (p_bucket_key,'public_directory_search','human-needs-v1',p_kind,p_theme,p_geography,p_observed_hour,p_expires_at)
  on conflict(bucket_key) do update set observation_count = public.miller_need_observation_buckets.observation_count + 1, last_observed_at = now()
  returning * into result;
  return result;
end $$;


ALTER FUNCTION "public"."record_human_need_observation"("p_bucket_key" "text", "p_kind" "text", "p_theme" "text", "p_geography" "text", "p_observed_hour" timestamp with time zone, "p_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resource_submission_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "display_filename" "text" NOT NULL,
    "byte_size" bigint NOT NULL,
    "detected_mime_type" "text" NOT NULL,
    "content_sha256" "text",
    "status" "text" DEFAULT 'pending_scan'::"text" NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "resource_submission_attachments_byte_size_check" CHECK (("byte_size" > 0)),
    CONSTRAINT "resource_submission_attachments_check" CHECK (((("status" = 'deleted'::"text") AND ("deleted_at" IS NOT NULL)) OR (("status" <> 'deleted'::"text") AND ("deleted_at" IS NULL)))),
    CONSTRAINT "resource_submission_attachments_content_sha256_check" CHECK ((("content_sha256" IS NULL) OR ("content_sha256" ~ '^[0-9a-f]{64}$'::"text"))),
    CONSTRAINT "resource_submission_attachments_detected_mime_type_check" CHECK (("btrim"("detected_mime_type") <> ''::"text")),
    CONSTRAINT "resource_submission_attachments_display_filename_check" CHECK (("btrim"("display_filename") <> ''::"text")),
    CONSTRAINT "resource_submission_attachments_status_check" CHECK (("status" = ANY (ARRAY['pending_scan'::"text", 'available'::"text", 'rejected'::"text", 'deleted'::"text"]))),
    CONSTRAINT "resource_submission_attachments_storage_path_check" CHECK (("btrim"("storage_path") <> ''::"text"))
);


ALTER TABLE "public"."resource_submission_attachments" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_resource_submission_attachment_scan_decision"("p_attachment_id" "uuid", "p_decision" "text", "p_actor_type" "text", "p_actor_id" "uuid", "p_scan_engine" "text", "p_scan_reference" "text" DEFAULT NULL::"text", "p_decision_note" "text" DEFAULT NULL::"text") RETURNS "public"."resource_submission_attachments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  attachment public.resource_submission_attachments;
begin
  if p_decision not in ('clean', 'malicious', 'failed') then
    raise exception 'invalid scan decision' using errcode = '22023';
  end if;
  if p_actor_type not in ('administrator', 'scanner_service') then
    raise exception 'invalid scan actor type' using errcode = '22023';
  end if;
  if p_actor_type = 'administrator' and p_actor_id is null then
    raise exception 'administrator scan decisions require an actor' using errcode = '22023';
  end if;
  if p_decision = 'clean' and (p_actor_type <> 'scanner_service' or nullif(btrim(coalesce(p_scan_reference, '')), '') is null) then
    raise exception 'clean scan decisions require a scanner-service reference' using errcode = '22023';
  end if;

  select * into attachment
  from public.resource_submission_attachments
  where id = p_attachment_id
  for update;
  if not found then
    raise exception 'attachment not found' using errcode = 'P0002';
  end if;
  if attachment.status = 'deleted' then
    raise exception 'deleted attachments cannot receive scan decisions' using errcode = 'P0001';
  end if;

  insert into public.resource_submission_attachment_scan_decisions(
    attachment_id, decision, actor_type, actor_id, scan_engine, scan_reference, decision_note
  ) values (
    p_attachment_id, p_decision, p_actor_type, p_actor_id,
    nullif(btrim(p_scan_engine), ''), nullif(btrim(coalesce(p_scan_reference, '')), ''), nullif(left(coalesce(p_decision_note, ''), 1000), '')
  );

  update public.resource_submission_attachments
  set status = case p_decision
    when 'clean' then 'available'
    when 'malicious' then 'rejected'
    else 'pending_scan'
  end
  where id = p_attachment_id
  returning * into attachment;

  return attachment;
end;
$$;


ALTER FUNCTION "public"."record_resource_submission_attachment_scan_decision"("p_attachment_id" "uuid", "p_decision" "text", "p_actor_type" "text", "p_actor_id" "uuid", "p_scan_engine" "text", "p_scan_reference" "text", "p_decision_note" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_security_findings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "finding_fingerprint" "text" NOT NULL,
    "finding_type" "text" NOT NULL,
    "subsystem" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "confidence" "text" NOT NULL,
    "lifecycle" "text" DEFAULT 'new'::"text" NOT NULL,
    "description" "text" NOT NULL,
    "defensive_control" "text",
    "defensive_result" "text" NOT NULL,
    "recommended_action" "text" NOT NULL,
    "evidence_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "schema_version" "text" DEFAULT 'security-finding-v1'::"text" NOT NULL,
    "first_observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recurrence_count" integer DEFAULT 1 NOT NULL,
    "acknowledged_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "instrument_id" "text",
    CONSTRAINT "miller_security_findings_confidence_check" CHECK (("confidence" = ANY (ARRAY['verified'::"text", 'observed'::"text", 'inferred'::"text", 'unknown'::"text"]))),
    CONSTRAINT "miller_security_findings_defensive_result_check" CHECK (("defensive_result" = ANY (ARRAY['blocked_as_expected'::"text", 'rejected_by_validation'::"text", 'rate_limited'::"text", 'quarantined'::"text", 'authorization_denied'::"text", 'failed_closed'::"text", 'protection_uncertain'::"text", 'protection_failed'::"text"]))),
    CONSTRAINT "miller_security_findings_description_check" CHECK (("length"("description") <= 700)),
    CONSTRAINT "miller_security_findings_finding_fingerprint_check" CHECK (("finding_fingerprint" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "miller_security_findings_finding_type_check" CHECK (("length"("finding_type") <= 120)),
    CONSTRAINT "miller_security_findings_lifecycle_check" CHECK (("lifecycle" = ANY (ARRAY['new'::"text", 'recurring'::"text", 'acknowledged'::"text", 'mitigated'::"text", 'resolved'::"text", 'false_positive'::"text", 'expected_behavior'::"text"]))),
    CONSTRAINT "miller_security_findings_recommended_action_check" CHECK (("length"("recommended_action") <= 500)),
    CONSTRAINT "miller_security_findings_recurrence_count_check" CHECK (("recurrence_count" > 0)),
    CONSTRAINT "miller_security_findings_severity_check" CHECK (("severity" = ANY (ARRAY['informational'::"text", 'low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "miller_security_findings_subsystem_check" CHECK (("length"("subsystem") <= 120))
);


ALTER TABLE "public"."miller_security_findings" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_security_finding"("p_fingerprint" "text", "p_type" "text", "p_subsystem" "text", "p_severity" "text", "p_confidence" "text", "p_description" "text", "p_control" "text", "p_result" "text", "p_recommendation" "text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "public"."miller_security_findings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare found public.miller_security_findings;
begin
 if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
 if p_fingerprint !~ '^[a-f0-9]{64}$' or p_type is null or p_subsystem is null or p_description is null or p_recommendation is null then raise exception 'invalid_security_finding'; end if;
 select * into found from public.miller_security_findings where finding_fingerprint=p_fingerprint for update;
 if found.id is null then insert into public.miller_security_findings(finding_fingerprint,finding_type,subsystem,severity,confidence,lifecycle,description,defensive_control,defensive_result,recommended_action,evidence_metadata) values(p_fingerprint,p_type,p_subsystem,p_severity,p_confidence,case when p_result in ('authorization_denied','blocked_as_expected','rejected_by_validation','rate_limited','quarantined','failed_closed') then 'expected_behavior' else 'new' end,p_description,p_control,p_result,p_recommendation,p_metadata) returning * into found; insert into public.miller_security_finding_events(finding_id,event_type,provenance) values(found.id,'created',jsonb_build_object('aggregate_only',true));
 else update public.miller_security_findings set last_observed_at=now(),recurrence_count=found.recurrence_count+1,lifecycle=case when found.lifecycle='new' then 'recurring' else found.lifecycle end,updated_at=now() where id=found.id returning * into found; insert into public.miller_security_finding_events(finding_id,event_type,provenance) values(found.id,'recurred',jsonb_build_object('aggregate_only',true)); end if;
 return found;
end $_$;


ALTER FUNCTION "public"."record_security_finding"("p_fingerprint" "text", "p_type" "text", "p_subsystem" "text", "p_severity" "text", "p_confidence" "text", "p_description" "text", "p_control" "text", "p_result" "text", "p_recommendation" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_security_instrument_finding"("p_instrument_id" "text", "p_fingerprint" "text", "p_type" "text", "p_subsystem" "text", "p_severity" "text", "p_confidence" "text", "p_description" "text", "p_control" "text", "p_result" "text", "p_recommendation" "text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "public"."miller_security_findings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare found public.miller_security_findings; was_resolved boolean := false;
begin
 if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
 if p_instrument_id !~ '^[a-z0-9_]{1,80}$' or p_fingerprint !~ '^[a-f0-9]{64}$' or p_type is null or p_subsystem is null or p_description is null or p_recommendation is null then raise exception 'invalid_security_finding'; end if;
 select * into found from public.miller_security_findings where finding_fingerprint=p_fingerprint for update;
 if found.id is null then
  insert into public.miller_security_findings(instrument_id,finding_fingerprint,finding_type,subsystem,severity,confidence,lifecycle,description,defensive_control,defensive_result,recommended_action,evidence_metadata)
  values(p_instrument_id,p_fingerprint,p_type,p_subsystem,p_severity,p_confidence,case when p_result in ('authorization_denied','blocked_as_expected','rejected_by_validation','rate_limited','quarantined','failed_closed') then 'expected_behavior' else 'new' end,p_description,p_control,p_result,p_recommendation,p_metadata)
  returning * into found;
  insert into public.miller_security_finding_events(finding_id,event_type,provenance) values(found.id,'created',jsonb_build_object('aggregate_only',true,'instrument_id',p_instrument_id));
 else
  if found.instrument_id is not null and found.instrument_id <> p_instrument_id then raise exception 'security_finding_instrument_mismatch'; end if;
  was_resolved := found.lifecycle='resolved';
  update public.miller_security_findings set instrument_id=coalesce(instrument_id,p_instrument_id),last_observed_at=now(),recurrence_count=found.recurrence_count+1,lifecycle=case when found.lifecycle='resolved' then 'recurring' when found.lifecycle='new' then 'recurring' else found.lifecycle end,resolved_at=case when found.lifecycle='resolved' then null else resolved_at end,updated_at=now() where id=found.id returning * into found;
  insert into public.miller_security_finding_events(finding_id,event_type,provenance) values(found.id,'recurred',jsonb_build_object('aggregate_only',true,'instrument_id',p_instrument_id,'reappeared',was_resolved));
 end if;
 return found;
end $_$;


ALTER FUNCTION "public"."record_security_instrument_finding"("p_instrument_id" "text", "p_fingerprint" "text", "p_type" "text", "p_subsystem" "text", "p_severity" "text", "p_confidence" "text", "p_description" "text", "p_control" "text", "p_result" "text", "p_recommendation" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_location_qc_evidence"("p_canonical_resource_id" "uuid", "p_policy_version" "text", "p_classification_fingerprint" "text", "p_refreshed_snapshot" "jsonb", "p_reason" "text", "p_expected_version" integer, "p_actor_id" "uuid") RETURNS "public"."location_qc_reviews"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare current_row public.location_qc_reviews; next_row public.location_qc_reviews;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_canonical_resource_id::text,0));
 select * into current_row from public.location_qc_reviews where canonical_resource_id=p_canonical_resource_id for update;
 if not found or current_row.version <> p_expected_version then raise exception 'QC refresh version conflict' using errcode='40001'; end if;
 insert into public.location_qc_review_snapshots(canonical_resource_id,qc_version,snapshot,origin,refresh_reason,prior_version,actor_id) values(p_canonical_resource_id,current_row.version,current_row.review_snapshot,'human_qc','historical snapshot preserved before evidence refresh',null,p_actor_id) on conflict do nothing;
 update public.location_qc_reviews set policy_version=p_policy_version,classification_fingerprint=p_classification_fingerprint,decision='manual_review',decision_note=left('Evidence refreshed; human QC confirmation required. '||coalesce(p_reason,''),1000),review_snapshot=p_refreshed_snapshot,version=current_row.version+1,reviewed_by=p_actor_id,reviewed_at=now(),updated_at=now() where canonical_resource_id=p_canonical_resource_id returning * into next_row;
 insert into public.location_qc_review_snapshots(canonical_resource_id,qc_version,snapshot,origin,refresh_reason,prior_version,actor_id) values(p_canonical_resource_id,next_row.version,p_refreshed_snapshot,'evidence_refresh',left(coalesce(p_reason,''),1000),current_row.version,p_actor_id);
 insert into public.location_qc_review_audit(canonical_resource_id,previous_decision,new_decision,previous_version,new_version,policy_version,classification_fingerprint,decision_note,actor_id) values(p_canonical_resource_id,current_row.decision,'manual_review',current_row.version,next_row.version,p_policy_version,p_classification_fingerprint,left('Evidence refresh: '||coalesce(p_reason,''),1000),p_actor_id);
 return next_row;
end $$;


ALTER FUNCTION "public"."refresh_location_qc_evidence"("p_canonical_resource_id" "uuid", "p_policy_version" "text", "p_classification_fingerprint" "text", "p_refreshed_snapshot" "jsonb", "p_reason" "text", "p_expected_version" integer, "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserve_canonical_authoritative_research_item"("p_run_id" "uuid", "p_resource_id" "uuid", "p_actor_id" "uuid") RETURNS "public"."canonical_authoritative_research_run_items"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_run public.canonical_authoritative_research_runs; v_item public.canonical_authoritative_research_run_items;
begin
 select * into v_run from public.canonical_authoritative_research_runs where id=p_run_id for update;
 if not found or v_run.status<>'running' then raise exception 'research run is not resumable'; end if;
 if not exists(select 1 from public.resource_registry where id=p_resource_id and lifecycle_state='active' and editorial_status<>'hidden') then raise exception 'canonical resource is not research eligible'; end if;
 select * into v_item from public.canonical_authoritative_research_run_items where run_id=p_run_id and resource_id=p_resource_id for update;
 if found then return v_item; end if;
 if v_run.attempted_count>=v_run.authorized_max_attempts then raise exception 'authorized research attempt cap reached'; end if;
 insert into public.canonical_authoritative_research_run_items(run_id,resource_id,outcome,reason_code) values(p_run_id,p_resource_id,'reserved','research_pending') returning * into v_item;
 update public.canonical_authoritative_research_runs set attempted_count=attempted_count+1 where id=p_run_id;
 return v_item;
end $$;


ALTER FUNCTION "public"."reserve_canonical_authoritative_research_item"("p_run_id" "uuid", "p_resource_id" "uuid", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_security_instrument_finding"("p_instrument_id" "text", "p_fingerprint" "text") RETURNS "public"."miller_security_findings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare found public.miller_security_findings;
begin
 if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
 select * into found from public.miller_security_findings where finding_fingerprint=p_fingerprint and instrument_id=p_instrument_id for update;
 if found.id is null then raise exception 'security_finding_not_found'; end if;
 if found.lifecycle not in ('resolved','false_positive') then
  update public.miller_security_findings set lifecycle='resolved',resolved_at=now(),updated_at=now() where id=found.id returning * into found;
  insert into public.miller_security_finding_events(finding_id,event_type,provenance) values(found.id,'resolved',jsonb_build_object('aggregate_only',true,'instrument_id',p_instrument_id));
 end if;
 return found;
end $$;


ALTER FUNCTION "public"."resolve_security_instrument_finding"("p_instrument_id" "text", "p_fingerprint" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_location_qc_review_decision"("p_canonical_resource_id" "uuid", "p_policy_version" "text", "p_classification_fingerprint" "text", "p_decision" "text", "p_decision_note" "text", "p_review_snapshot" "jsonb", "p_expected_version" integer, "p_actor_id" "uuid") RETURNS "public"."location_qc_reviews"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_current public.location_qc_reviews; v_next public.location_qc_reviews;
begin
  if p_decision not in ('pilot_eligible','manual_review','correct_address','exclude_exact_location','policy_problem','defer') then raise exception 'invalid decision'; end if;
  if not exists (
    select 1 from public.resource_registry
    where id = p_canonical_resource_id
      and lifecycle_state = 'active'
      and editorial_status <> 'hidden'
  ) then raise exception 'canonical resource is not eligible'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_canonical_resource_id::text, 0));
  select * into v_current from public.location_qc_reviews where canonical_resource_id = p_canonical_resource_id for update;
  -- PT409 is PostgREST's explicit HTTP-conflict SQLSTATE. Using 40001 here
  -- causes automatic serialization retries for a deterministic stale version.
  if coalesce(v_current.version, 0) <> p_expected_version then raise exception 'review version conflict' using errcode = 'PT409'; end if;
  insert into public.location_qc_reviews (canonical_resource_id,policy_version,classification_fingerprint,decision,decision_note,review_snapshot,version,reviewed_by,reviewed_at,updated_at)
  values (p_canonical_resource_id,p_policy_version,p_classification_fingerprint,p_decision,left(coalesce(p_decision_note,''),1000),p_review_snapshot,p_expected_version+1,p_actor_id,now(),now())
  on conflict (canonical_resource_id) do update set policy_version=excluded.policy_version,classification_fingerprint=excluded.classification_fingerprint,decision=excluded.decision,decision_note=excluded.decision_note,review_snapshot=excluded.review_snapshot,version=excluded.version,reviewed_by=excluded.reviewed_by,reviewed_at=now(),updated_at=now()
  returning * into v_next;
  insert into public.location_qc_review_audit (canonical_resource_id,previous_decision,new_decision,previous_version,new_version,policy_version,classification_fingerprint,decision_note,actor_id)
  values (p_canonical_resource_id,v_current.decision,p_decision,coalesce(v_current.version,0),v_next.version,p_policy_version,p_classification_fingerprint,left(coalesce(p_decision_note,''),1000),p_actor_id);
  return v_next;
end $$;


ALTER FUNCTION "public"."save_location_qc_review_decision"("p_canonical_resource_id" "uuid", "p_policy_version" "text", "p_classification_fingerprint" "text", "p_decision" "text", "p_decision_note" "text", "p_review_snapshot" "jsonb", "p_expected_version" integer, "p_actor_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resource_fact_claims" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "resource_id" "uuid",
    "field_name" "text" NOT NULL,
    "proposed_value" "jsonb",
    "existing_value" "jsonb",
    "risk" "text" NOT NULL,
    "recommendation" "text" NOT NULL,
    "confidence" "text" NOT NULL,
    "reason_codes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "engine_version" "text" NOT NULL,
    "status" "text" DEFAULT 'observed'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "version" integer DEFAULT 0 NOT NULL,
    "claim_fingerprint" "text",
    "decision_category" "text" DEFAULT 'other'::"text" NOT NULL,
    "research_summary" "text",
    "last_observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "resource_fact_claims_confidence_check" CHECK (("confidence" = ANY (ARRAY['high'::"text", 'bounded'::"text", 'unknown'::"text"]))),
    CONSTRAINT "resource_fact_claims_field_name_check" CHECK ((("char_length"("field_name") >= 1) AND ("char_length"("field_name") <= 80))),
    CONSTRAINT "resource_fact_claims_fingerprint_format" CHECK ((("claim_fingerprint" IS NULL) OR ("claim_fingerprint" ~ '^[0-9a-f]{64}$'::"text"))),
    CONSTRAINT "resource_fact_claims_recommendation_check" CHECK (("recommendation" = ANY (ARRAY['auto_accept'::"text", 'accept_with_monitoring'::"text", 'human_review'::"text", 'reject'::"text", 'unknown'::"text"]))),
    CONSTRAINT "resource_fact_claims_risk_check" CHECK (("risk" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "resource_fact_claims_status_check" CHECK (("status" = ANY (ARRAY['observed'::"text", 'needs_review'::"text", 'accepted'::"text", 'rejected'::"text", 'unknown'::"text", 'superseded'::"text"]))),
    CONSTRAINT "resource_fact_claims_version_check" CHECK (("version" >= 0))
);


ALTER TABLE "public"."resource_fact_claims" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_resource_fact_shadow_decision"("p_claim_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_actor_id" "uuid") RETURNS "public"."resource_fact_claims"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_claim public.resource_fact_claims;
  v_status text;
begin
  if p_action not in ('accept','keep_existing','reject','mark_unknown') then
    raise exception 'invalid action';
  end if;

  select * into v_claim
  from public.resource_fact_claims
  where id = p_claim_id
  for update;

  if not found then
    raise exception 'claim not found';
  end if;

  if v_claim.version <> p_expected_version then
    raise exception using
      errcode = '40001',
      message = 'shadow decision version conflict';
  end if;

  v_status := case p_action
    when 'accept' then 'accepted'
    when 'reject' then 'rejected'
    when 'mark_unknown' then 'unknown'
    else 'superseded'
  end;

  insert into public.resource_fact_change_audit (
    claim_id, resource_id, field_name, previous_value, new_value,
    action, reason_codes, actor_type, actor_id
  ) values (
    v_claim.id, v_claim.resource_id, v_claim.field_name,
    v_claim.existing_value, v_claim.proposed_value,
    p_action, v_claim.reason_codes, 'administrator', p_actor_id
  );

  update public.resource_fact_claims
  set status = v_status,
      version = version + 1,
      updated_at = now()
  where id = v_claim.id
  returning * into v_claim;

  return v_claim;
end
$$;


ALTER FUNCTION "public"."save_resource_fact_shadow_decision"("p_claim_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shelter_candidate_reconciliations" (
    "id" bigint NOT NULL,
    "left_candidate_id" bigint NOT NULL,
    "right_candidate_id" bigint NOT NULL,
    "classification_fingerprint" "text" NOT NULL,
    "decision" "text" NOT NULL,
    "decision_note" "text" DEFAULT ''::"text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "reviewed_by" "uuid" NOT NULL,
    "reviewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shelter_candidate_reconciliations_check" CHECK (("left_candidate_id" < "right_candidate_id")),
    CONSTRAINT "shelter_candidate_reconciliations_decision_check" CHECK (("decision" = ANY (ARRAY['same_program_duplicate'::"text", 'different_program'::"text", 'needs_more_research'::"text"]))),
    CONSTRAINT "shelter_candidate_reconciliations_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."shelter_candidate_reconciliations" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_shelter_candidate_reconciliation"("p_left_candidate_id" bigint, "p_right_candidate_id" bigint, "p_classification_fingerprint" "text", "p_decision" "text", "p_decision_note" "text", "p_expected_version" integer, "p_actor_id" "uuid") RETURNS "public"."shelter_candidate_reconciliations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_left bigint := least(p_left_candidate_id,p_right_candidate_id); v_right bigint := greatest(p_left_candidate_id,p_right_candidate_id); v_current public.shelter_candidate_reconciliations; v_next public.shelter_candidate_reconciliations;
begin
  if p_left_candidate_id = p_right_candidate_id or p_decision not in ('same_program_duplicate','different_program','needs_more_research') then raise exception 'invalid shelter reconciliation'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_left::text || ':' || v_right::text,0));
  select * into v_current from public.shelter_candidate_reconciliations where left_candidate_id=v_left and right_candidate_id=v_right for update;
  if found and v_current.version <> p_expected_version then raise exception using errcode='40001', message='shelter reconciliation version conflict'; end if;
  if found then update public.shelter_candidate_reconciliations set classification_fingerprint=p_classification_fingerprint,decision=p_decision,decision_note=left(p_decision_note,1000),version=v_current.version+1,reviewed_by=p_actor_id,reviewed_at=now(),updated_at=now() where id=v_current.id returning * into v_next;
  else insert into public.shelter_candidate_reconciliations(left_candidate_id,right_candidate_id,classification_fingerprint,decision,decision_note,reviewed_by) values(v_left,v_right,p_classification_fingerprint,p_decision,left(p_decision_note,1000),p_actor_id) returning * into v_next; end if;
  insert into public.shelter_candidate_reconciliation_audit(reconciliation_id,previous_decision,new_decision,previous_version,new_version,classification_fingerprint,decision_note,actor_id) values(v_next.id,v_current.decision,v_next.decision,v_current.version,v_next.version,p_classification_fingerprint,left(p_decision_note,1000),p_actor_id);
  return v_next;
end $$;


ALTER FUNCTION "public"."save_shelter_candidate_reconciliation"("p_left_candidate_id" bigint, "p_right_candidate_id" bigint, "p_classification_fingerprint" "text", "p_decision" "text", "p_decision_note" "text", "p_expected_version" integer, "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_quiet_maintenance_cycle"("p_request_key" "text", "p_trigger_type" "text", "p_mode" "text", "p_actor_id" "uuid", "p_as_of" timestamp with time zone) RETURNS "public"."miller_quiet_maintenance_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare result public.miller_quiet_maintenance_runs;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  select * into result from public.miller_quiet_maintenance_runs where request_key = p_request_key;
  if found then return result; end if;
  insert into public.miller_quiet_maintenance_runs(request_key, trigger_type, mode, actor_id, as_of)
  values (p_request_key, p_trigger_type, p_mode, p_actor_id, p_as_of)
  returning * into result;
  return result;
exception when unique_violation then
  select * into result from public.miller_quiet_maintenance_runs where request_key = p_request_key;
  if found then return result; end if;
  raise;
end $$;


ALTER FUNCTION "public"."start_quiet_maintenance_cycle"("p_request_key" "text", "p_trigger_type" "text", "p_mode" "text", "p_actor_id" "uuid", "p_as_of" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."supersede_canonical_authoritative_address_v1"("p_resource_id" "uuid", "p_prior_claim_id" "uuid", "p_current_claim_id" "uuid", "p_evidence_id" "uuid", "p_reason_code" "text", "p_actor_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare r public.resource_registry; oldc public.resource_fact_claims; newc public.resource_fact_claims; e public.resource_fact_evidence; x public.canonical_authoritative_address_corrections;
begin
 if p_reason_code not in ('authoritative_current_address','authoritative_move') then raise exception 'invalid correction reason'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_resource_id::text,41));
 select * into r from public.resource_registry where id=p_resource_id for update; if not found or r.lifecycle_state<>'active' or r.editorial_status='hidden' then raise exception 'canonical resource is not eligible'; end if;
 select * into oldc from public.resource_fact_claims where id=p_prior_claim_id and resource_id=p_resource_id and field_name='location_occupancy' for update;
 select * into newc from public.resource_fact_claims where id=p_current_claim_id and resource_id=p_resource_id and field_name='location_occupancy' and status not in ('rejected','unknown','superseded') for update;
 select * into e from public.resource_fact_evidence where id=p_evidence_id and claim_id=p_current_claim_id;
 if not found or oldc.id=newc.id or not public.canonical_authoritative_evidence_current_v1(newc.id) or public.canonical_authoritative_address_key_v1(oldc.proposed_value#>>'{}')=public.canonical_authoritative_address_key_v1(newc.proposed_value#>>'{}') then raise exception 'valid distinct current authoritative correction evidence required'; end if;
 select * into x from public.canonical_authoritative_address_corrections where resource_id=p_resource_id and prior_claim_id=p_prior_claim_id and current_claim_id=p_current_claim_id; if found then return jsonb_build_object('outcome','idempotent','correction_id',x.id); end if;
 insert into public.canonical_authoritative_address_corrections(resource_id,prior_claim_id,current_claim_id,evidence_id,correction_policy,reason_code,actor_id) values(p_resource_id,oldc.id,newc.id,e.id,'canonical_authoritative_address_correction_v1',p_reason_code,p_actor_id) returning * into x;
 update public.resource_fact_claims set status='superseded',version=version+1,updated_at=now() where id=oldc.id;
 insert into public.resource_fact_change_audit(claim_id,resource_id,field_name,previous_value,new_value,action,reason_codes,actor_type,actor_id) values(oldc.id,p_resource_id,'location_occupancy',oldc.proposed_value,newc.proposed_value,'keep_existing',array['canonical_authoritative_address_correction_v1',p_reason_code,'historical_claim_preserved'],'miller_automation',p_actor_id);
 return jsonb_build_object('outcome','authoritative_address_corrected','correction_id',x.id,'prior_claim_id',oldc.id,'current_claim_id',newc.id);
end $$;


ALTER FUNCTION "public"."supersede_canonical_authoritative_address_v1"("p_resource_id" "uuid", "p_prior_claim_id" "uuid", "p_current_claim_id" "uuid", "p_evidence_id" "uuid", "p_reason_code" "text", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."supersede_highgate_human_qc_with_machine_initial"("p_resource_id" "uuid", "p_correction_id" "uuid", "p_geocoder_evidence_id" "uuid", "p_expected_human_qc_version" integer, "p_actor_id" "uuid") RETURNS "public"."location_qc_reviews"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_reference public.highgate_authoritative_location_reference;
  v_correction public.authoritative_location_corrections;
  v_current public.location_qc_reviews;
  v_geo jsonb;
  v_claim public.resource_fact_claims;
  v_next public.location_qc_reviews;
  v_snapshot jsonb;
  v_fingerprint text;
begin
  select * into v_reference from public.highgate_authoritative_location_reference
   where resource_id=p_resource_id and active and qc_supersession_enabled for share;
  if not found then raise exception 'only the fixed HighGate counselling QC may be superseded'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_resource_id::text,37));
  select * into v_correction from public.authoritative_location_corrections where id=p_correction_id and resource_id=p_resource_id and correction_policy=v_reference.correction_policy; if not found then raise exception 'required authoritative location correction is absent'; end if;
  select * into v_current from public.location_qc_reviews where canonical_resource_id=p_resource_id for update;
  if not found or v_current.version<>p_expected_human_qc_version then raise exception 'QC supersession version conflict' using errcode='40001'; end if;
  if v_current.origin='machine_initial' then return v_current; end if;
  if v_current.origin<>'human_qc' then raise exception 'only a current human QC may use this fixed supersession path'; end if;
  select c.* into v_claim from public.resource_fact_claims c where c.resource_id=p_resource_id and c.field_name='location_occupancy' and c.engine_version=v_reference.correction_policy and c.status not in ('rejected','unknown','superseded') order by c.created_at desc limit 1; if not found then raise exception 'corrected authoritative occupancy claim is absent'; end if;
  select e.extracted_value into v_geo from public.resource_fact_evidence e where e.id=p_geocoder_evidence_id and e.claim_id=v_claim.id and e.source_type='bc_geocoder' and e.stale is not true; if not found then raise exception 'bound current BC geocoder evidence is absent'; end if;
  if coalesce((v_geo->>'score')::numeric,0)<>100 or lower(coalesce(v_geo->>'location_descriptor',''))<>'parcelpoint' or coalesce((v_geo->>'municipality_match')::boolean,false) is not true then raise exception 'BC geocoder package is not exact enough'; end if;
  v_snapshot:=jsonb_build_object('submitted_address',v_reference.corrected_address,'returned_address',coalesce(v_geo->>'standardized_address',v_geo->>'returned_address'),'locality',v_reference.locality,'municipality_match',true,'score',100,'precision_points',coalesce((v_geo->>'precision_points')::numeric,100),'location_descriptor','parcelpoint','coordinates',v_geo->'coordinates','provider','bc_address_geocoder','program_occupancy_confidence','supported','sensitivity_flags','[]'::jsonb,'conflicts','[]'::jsonb,'branch_ambiguity',false,'move_or_closure',false,'evidence_fresh',true,'source_evidence_tier','E1','machine_actor','miller_map_automation','authoritative_location_correction_id',v_correction.id);
  v_fingerprint:=encode(extensions.digest(v_snapshot::text||':'||v_claim.id::text||':'||p_geocoder_evidence_id::text,'sha256'),'hex');
  insert into public.location_qc_review_snapshots(canonical_resource_id,qc_version,snapshot,origin,refresh_reason,prior_version,actor_id) values(p_resource_id,v_current.version,v_current.review_snapshot,'human_qc','Historical human QC preserved before authoritative HighGate location correction.',null,p_actor_id) on conflict do nothing;
  update public.location_qc_reviews set policy_version='machine_initial_evidence_v1',classification_fingerprint=v_fingerprint,decision='manual_review',decision_note='Machine-initial QC derived from authoritative HighGate correction; prior human QC preserved in history.',review_snapshot=v_snapshot,version=v_current.version+1,reviewed_by=p_actor_id,reviewed_at=now(),updated_at=now(),origin='machine_initial' where canonical_resource_id=p_resource_id returning * into v_next;
  insert into public.location_qc_review_snapshots(canonical_resource_id,qc_version,snapshot,origin,refresh_reason,prior_version,actor_id) values(p_resource_id,v_next.version,v_snapshot,'machine_initial','authoritative_location_correction',v_current.version,p_actor_id) on conflict do nothing;
  insert into public.location_qc_review_audit(canonical_resource_id,previous_decision,new_decision,previous_version,new_version,policy_version,classification_fingerprint,decision_note,actor_id) values(p_resource_id,v_current.decision,'manual_review',v_current.version,v_next.version,'machine_initial_evidence_v1',v_fingerprint,'Authoritative HighGate correction superseded current QC without deleting human history.',p_actor_id);
  insert into public.location_qc_supersessions(resource_id,correction_id,prior_qc_version,new_qc_version,reason_code,actor_id) values(p_resource_id,p_correction_id,v_current.version,v_next.version,'authoritative_location_correction',p_actor_id) on conflict(resource_id,correction_id) do nothing;
  return v_next;
end $$;


ALTER FUNCTION "public"."supersede_highgate_human_qc_with_machine_initial"("p_resource_id" "uuid", "p_correction_id" "uuid", "p_geocoder_evidence_id" "uuid", "p_expected_human_qc_version" integer, "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trusted_bulk_import_curated_list"("p_list_id" "uuid", "p_batch_id" "uuid", "p_admin_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_batch public.list_import_batches%rowtype;
  v_created integer := 0;
  v_placements integer := 0;
  v_cleanup integer := 0;
  v_without_website integer := 0;
begin
  select * into v_batch from public.list_import_batches
    where id = p_batch_id and list_id = p_list_id for update;
  if not found then raise exception 'trusted import batch not found'; end if;
  if v_batch.import_source_type <> 'admin_docx' then raise exception 'trusted bulk import is limited to administrator DOCX batches'; end if;

  if v_batch.parsing_status = 'committed' then
    select count(*) into v_created from public.curated_list_items where source_import_batch_id = p_batch_id;
    select count(*) into v_placements from public.curated_list_item_sections p join public.curated_list_items i on i.id = p.item_id where i.source_import_batch_id = p_batch_id;
    return jsonb_build_object('outcome','structured_draft_committed','idempotent',true,'structured_items',v_created,'section_placements',v_placements,'published',false);
  end if;
  if v_batch.parsing_status <> 'parsed' then raise exception 'trusted import batch is not ready'; end if;

  update public.curated_lists set import_trust_level = 'trusted_curator', updated_by = p_admin_id, updated_at = now(), last_reviewed_at = now()
    where id = p_list_id and status = 'draft';
  if not found then raise exception 'trusted import requires a draft list'; end if;

  update public.list_import_batches set import_trust_level = 'trusted_curator', review_method = 'trusted_bulk_import', bulk_reviewed_by = p_admin_id, bulk_reviewed_at = now()
    where id = p_batch_id;
  update public.list_import_items set final_disposition = 'list_only_entry', review_status = 'reviewed', review_method = 'trusted_bulk_import', reviewed_by = p_admin_id, reviewed_at = now(), updated_at = now()
    where batch_id = p_batch_id and final_disposition = 'undecided';
  update public.list_import_items set review_method = 'trusted_bulk_import', reviewed_by = p_admin_id, reviewed_at = now(), updated_at = now()
    where batch_id = p_batch_id and final_disposition = 'list_only_entry';

  insert into public.curated_list_items (
    list_id, item_type, resource_name, description, phone, email, website, contact_notes, curator_note,
    visible, verification_status, source_import_item_id, source_import_batch_id, review_method, reviewed_by,
    reviewed_at, original_document_hash, parser_version
  )
  select p_list_id, 'list_only_entry',
    case when nullif(trim(ii.parsed_name),'') is null or ii.parsed_name = 'Needs manual identification'
      then coalesce(nullif(trim(split_part(ii.raw_source_text, E'\n', 1)),''), 'Entry requiring title review')
      else ii.parsed_name end,
    coalesce(nullif(ii.administrator_corrections->>'description',''), ii.parsed_description, ii.raw_source_text),
    coalesce(nullif(ii.administrator_corrections->>'phone',''), ii.parsed_contact->'phones'->>0, ''),
    coalesce(nullif(ii.administrator_corrections->>'email',''), ii.parsed_contact->'emails'->>0, ''),
    coalesce(nullif(ii.administrator_corrections->>'website',''), ii.parsed_contact->'websites'->>0, ''),
    coalesce(ii.administrator_corrections->>'contact_notes',''),
    case when nullif(trim(ii.parsed_name),'') is null or ii.parsed_name = 'Needs manual identification' then 'Needs title cleanup.' else '' end,
    true, 'imported_from_trusted_source', ii.id, p_batch_id, 'trusted_bulk_import', p_admin_id,
    now(), v_batch.source_sha256, v_batch.parser_version
  from public.list_import_items ii
  where ii.batch_id = p_batch_id and ii.final_disposition = 'list_only_entry'
  order by ii.display_order
  on conflict (source_import_item_id) where source_import_item_id is not null do nothing;
  get diagnostics v_created = row_count;

  insert into public.curated_list_item_sections(item_id, section_id, display_order, visible)
  select ci.id, cs.id, ii.display_order, true
  from public.list_import_items ii
  join public.curated_list_items ci on ci.source_import_item_id = ii.id
  join public.curated_list_sections cs on cs.list_id = p_list_id and cs.title = ii.detected_section
  where ii.batch_id = p_batch_id and ii.final_disposition = 'list_only_entry'
  order by cs.display_order, ii.display_order
  on conflict (item_id, section_id) do nothing;
  get diagnostics v_placements = row_count;

  select count(*) into v_cleanup from public.list_import_items ii
    where ii.batch_id = p_batch_id and (nullif(trim(ii.parsed_name),'') is null or ii.parsed_name = 'Needs manual identification'
      or exists (select 1 from jsonb_array_elements(ii.validation_warnings) w where w->>'code' in ('malformed_email','mislabeled_contact')));
  select count(*) into v_without_website from public.list_import_items ii
    where ii.batch_id = p_batch_id and coalesce(jsonb_array_length(ii.parsed_contact->'websites'),0) = 0;

  update public.list_import_batches set parsing_status = 'committed', committed_at = now() where id = p_batch_id;
  return jsonb_build_object('outcome','structured_draft_committed','idempotent',false,'structured_items',v_created,
    'section_placements',v_placements,'needs_cleanup',v_cleanup,'without_websites',v_without_website,'published',false);
end;
$$;


ALTER FUNCTION "public"."trusted_bulk_import_curated_list"("p_list_id" "uuid", "p_batch_id" "uuid", "p_admin_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_authoritative_location_correction_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_reference public.highgate_authoritative_location_reference;
begin
  select * into v_reference from public.highgate_authoritative_location_reference
   where resource_id = new.resource_id and active;
  if not found
     or new.corrected_address <> v_reference.corrected_address
     or new.correction_policy <> v_reference.correction_policy
     or new.reason_code <> v_reference.reason_code
     or new.authoritative_sources <> v_reference.authoritative_sources then
    raise exception 'authoritative location correction does not match active typed reference' using errcode = '23514';
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."validate_authoritative_location_correction_reference"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_highgate_authoritative_location_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_source jsonb;
begin
  if new.corrected_address = '' or new.legacy_original_address = '' or new.locality = '' then
    raise exception 'HighGate reference text values must be nonempty';
  end if;
  for v_source in select value from jsonb_array_elements(new.authoritative_sources)
  loop
    if jsonb_typeof(v_source) <> 'string' or v_source #>> '{}' !~ '^https://' then
      raise exception 'HighGate authoritative sources must be HTTPS URLs';
    end if;
  end loop;
  return new;
end $$;


ALTER FUNCTION "public"."validate_highgate_authoritative_location_reference"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_miller_project_run_binding_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  v_project_ref text;
begin
  select project_ref
    into v_project_ref
    from public.miller_project_binding_v1
   where binding_key = 'miller_project_binding_v1';

  if not found then
    raise exception 'Miller project binding is not configured' using errcode = '23514';
  end if;

  if new.project_ref is distinct from v_project_ref then
    raise exception 'project_ref does not match Miller project binding' using errcode = '23514';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_miller_project_run_binding_v1"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_resource_reviews" (
    "id" bigint NOT NULL,
    "resource_id" bigint NOT NULL,
    "status" "text" NOT NULL,
    "review_recommendation" "text",
    "review_confidence" double precision,
    "review_reason" "text",
    "review_results" "jsonb",
    "suggested_tags" "jsonb",
    "duplicate_candidates" "jsonb",
    "quality_results" "jsonb",
    "agent_errors" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "model_identifier" "text",
    "schema_version" "text" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "reviewed_by_human_at" timestamp with time zone,
    "human_decision" "text",
    "review_fingerprint" "text",
    CONSTRAINT "ai_resource_reviews_fingerprint_format" CHECK ((("review_fingerprint" IS NULL) OR ("review_fingerprint" ~ '^[0-9a-f]{64}$'::"text"))),
    CONSTRAINT "ai_resource_reviews_human_decision_check" CHECK (("human_decision" = ANY (ARRAY['approved'::"text", 'hidden'::"text", 'left_pending'::"text"]))),
    CONSTRAINT "ai_resource_reviews_review_confidence_check" CHECK ((("review_confidence" >= (0)::double precision) AND ("review_confidence" <= (1)::double precision))),
    CONSTRAINT "ai_resource_reviews_review_recommendation_check" CHECK (("review_recommendation" = ANY (ARRAY['approve'::"text", 'reject'::"text", 'manual_review'::"text"]))),
    CONSTRAINT "ai_resource_reviews_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."ai_resource_reviews" OWNER TO "postgres";


ALTER TABLE "public"."ai_resource_reviews" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."ai_resource_reviews_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."authoritative_location_corrections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "legacy_source_record_id" "uuid" NOT NULL,
    "correction_policy" "text" NOT NULL,
    "corrected_address" "text" NOT NULL,
    "authoritative_sources" "jsonb" NOT NULL,
    "reason_code" "text" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "effective_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "authoritative_location_corrections_correction_policy_check" CHECK (("correction_policy" = 'authoritative_location_correction_v1'::"text")),
    CONSTRAINT "authoritative_location_corrections_reason_code_check" CHECK (("reason_code" = 'legacy_hash_prefixed_unit_misclassified_nonphysical'::"text"))
);


ALTER TABLE "public"."authoritative_location_corrections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."canonical_authoritative_address_corrections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "prior_claim_id" "uuid" NOT NULL,
    "current_claim_id" "uuid" NOT NULL,
    "evidence_id" "uuid" NOT NULL,
    "correction_policy" "text" NOT NULL,
    "reason_code" "text" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "canonical_authoritative_address_correct_correction_policy_check" CHECK (("correction_policy" = 'canonical_authoritative_address_correction_v1'::"text")),
    CONSTRAINT "canonical_authoritative_address_corrections_reason_code_check" CHECK (("reason_code" = ANY (ARRAY['authoritative_current_address'::"text", 'authoritative_move'::"text"])))
);


ALTER TABLE "public"."canonical_authoritative_address_corrections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."canonical_authoritative_evidence_bindings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "target_claim_id" "uuid" NOT NULL,
    "evidence_id" "uuid" NOT NULL,
    "source_claim_id" "uuid" NOT NULL,
    "binding_policy" "text" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "canonical_authoritative_evidence_bindings_binding_policy_check" CHECK (("binding_policy" = 'canonical_authoritative_evidence_binding_v1'::"text"))
);


ALTER TABLE "public"."canonical_authoritative_evidence_bindings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."curated_list_document_revisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "list_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "original_filename" "text" NOT NULL,
    "public_download_filename" "text" NOT NULL,
    "file_size_bytes" bigint NOT NULL,
    "sha256" "text" NOT NULL,
    "page_count" integer NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "replaced_at" timestamp with time zone,
    CONSTRAINT "curated_list_document_revisions_file_size_bytes_check" CHECK (("file_size_bytes" > 0)),
    CONSTRAINT "curated_list_document_revisions_page_count_check" CHECK (("page_count" > 0)),
    CONSTRAINT "curated_list_document_revisions_sha256_check" CHECK (("sha256" ~ '^[0-9a-f]{64}$'::"text"))
);


ALTER TABLE "public"."curated_list_document_revisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."curated_list_item_sections" (
    "item_id" "uuid" NOT NULL,
    "section_id" "uuid" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "visible" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."curated_list_item_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."curated_list_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "list_id" "uuid" NOT NULL,
    "canonical_resource_id" "uuid",
    "item_type" "text" NOT NULL,
    "resource_name" "text" NOT NULL,
    "description" "text",
    "cost_information" "text",
    "eligibility" "text",
    "geographic_restriction" "text",
    "address" "text",
    "phone" "text",
    "email" "text",
    "website" "text",
    "contact_notes" "text",
    "curator_note" "text",
    "visible" boolean DEFAULT true NOT NULL,
    "verification_status" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "last_verified_at" timestamp with time zone,
    "source_import_item_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_import_batch_id" "uuid",
    "review_method" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "original_document_hash" "text",
    "parser_version" "text",
    CONSTRAINT "curated_list_items_check" CHECK ((("item_type" = 'canonical_resource'::"text") = ("canonical_resource_id" IS NOT NULL))),
    CONSTRAINT "curated_list_items_item_type_check" CHECK (("item_type" = ANY (ARRAY['canonical_resource'::"text", 'list_only_entry'::"text"]))),
    CONSTRAINT "curated_list_items_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['unverified'::"text", 'needs_review'::"text", 'verified'::"text", 'expired'::"text", 'imported_from_trusted_source'::"text", 'externally_verified'::"text", 'needs_update'::"text", 'hidden'::"text"])))
);


ALTER TABLE "public"."curated_list_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."curated_list_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "list_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "visible" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."curated_list_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."curated_lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "short_description" "text",
    "introduction" "text",
    "disclaimer" "text",
    "category" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "source_filename" "text",
    "source_storage_path" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "last_reviewed_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "import_trust_level" "text" DEFAULT 'standard_review'::"text" NOT NULL,
    "content_type" "text" DEFAULT 'structured_list'::"text" NOT NULL,
    "pdf_storage_path" "text",
    "pdf_original_filename" "text",
    "public_download_filename" "text",
    "pdf_file_size_bytes" bigint,
    "pdf_sha256" "text",
    "pdf_page_count" integer,
    CONSTRAINT "curated_lists_check" CHECK ((("status" = 'published'::"text") = ("published_at" IS NOT NULL))),
    CONSTRAINT "curated_lists_content_type_check" CHECK (("content_type" = ANY (ARRAY['structured_list'::"text", 'pdf_document'::"text"]))),
    CONSTRAINT "curated_lists_import_trust_level_check" CHECK (("import_trust_level" = ANY (ARRAY['standard_review'::"text", 'trusted_curator'::"text"]))),
    CONSTRAINT "curated_lists_pdf_document_check" CHECK ((("content_type" = 'structured_list'::"text") OR (("pdf_storage_path" IS NOT NULL) AND ("pdf_original_filename" IS NOT NULL) AND ("public_download_filename" IS NOT NULL) AND ("pdf_file_size_bytes" > 0) AND ("pdf_sha256" ~ '^[0-9a-f]{64}$'::"text") AND ("pdf_page_count" > 0)))),
    CONSTRAINT "curated_lists_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text")),
    CONSTRAINT "curated_lists_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'unpublished'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."curated_lists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."geocode_cache" (
    "id" bigint NOT NULL,
    "provider" "text" NOT NULL,
    "normalized_query" "text" NOT NULL,
    "query_hash" "text" NOT NULL,
    "response_summary" "jsonb",
    "validation_status" "text" NOT NULL,
    "error_summary" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "geocode_cache_validation_status_check" CHECK (("validation_status" = ANY (ARRAY['accepted'::"text", 'ambiguous'::"text", 'mismatch'::"text", 'no_result'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."geocode_cache" OWNER TO "postgres";


ALTER TABLE "public"."geocode_cache" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."geocode_cache_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."geocode_runs" (
    "id" bigint NOT NULL,
    "provider" "text" NOT NULL,
    "cache_key" "text" NOT NULL,
    "status" "text" NOT NULL,
    "response_summary" "jsonb",
    "error_summary" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "geocode_runs_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."geocode_runs" OWNER TO "postgres";


ALTER TABLE "public"."geocode_runs" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."geocode_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."highgate_authoritative_location_reference" (
    "resource_id" "uuid" NOT NULL,
    "legacy_original_address" "text" NOT NULL,
    "corrected_address" "text" NOT NULL,
    "locality" "text" NOT NULL,
    "province" "text" NOT NULL,
    "authoritative_sources" "jsonb" NOT NULL,
    "correction_fingerprint_key" "text" NOT NULL,
    "correction_policy" "text" NOT NULL,
    "reason_code" "text" NOT NULL,
    "qc_supersession_enabled" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "highgate_authoritative_locatio_correction_fingerprint_key_check" CHECK (("correction_fingerprint_key" ~ '^[a-z0-9-]+$'::"text")),
    CONSTRAINT "highgate_authoritative_location_ref_authoritative_sources_check" CHECK ((("jsonb_typeof"("authoritative_sources") = 'array'::"text") AND ("jsonb_array_length"("authoritative_sources") > 0))),
    CONSTRAINT "highgate_authoritative_location_referen_correction_policy_check" CHECK (("correction_policy" = 'authoritative_location_correction_v1'::"text")),
    CONSTRAINT "highgate_authoritative_location_reference_province_check" CHECK ((("province" = "upper"("province")) AND ("char_length"("province") = 2))),
    CONSTRAINT "highgate_authoritative_location_reference_reason_code_check" CHECK (("reason_code" = 'legacy_hash_prefixed_unit_misclassified_nonphysical'::"text"))
);


ALTER TABLE "public"."highgate_authoritative_location_reference" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."list_import_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "list_id" "uuid",
    "original_filename" "text" NOT NULL,
    "source_storage_path" "text" NOT NULL,
    "source_sha256" "text" NOT NULL,
    "parser_version" "text" NOT NULL,
    "parsing_status" "text" DEFAULT 'uploaded'::"text" NOT NULL,
    "heading_count" integer DEFAULT 0 NOT NULL,
    "entry_count" integer DEFAULT 0 NOT NULL,
    "parse_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_information" "text",
    "committed_at" timestamp with time zone,
    "uploaded_by" "uuid" NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "import_source_type" "text" DEFAULT 'admin_docx'::"text" NOT NULL,
    "import_trust_level" "text" DEFAULT 'standard_review'::"text" NOT NULL,
    "review_method" "text",
    "bulk_reviewed_by" "uuid",
    "bulk_reviewed_at" timestamp with time zone,
    CONSTRAINT "list_import_batches_import_source_type_check" CHECK (("import_source_type" = ANY (ARRAY['admin_docx'::"text", 'other'::"text"]))),
    CONSTRAINT "list_import_batches_import_trust_level_check" CHECK (("import_trust_level" = ANY (ARRAY['standard_review'::"text", 'trusted_curator'::"text"]))),
    CONSTRAINT "list_import_batches_parsing_status_check" CHECK (("parsing_status" = ANY (ARRAY['uploaded'::"text", 'parsing'::"text", 'parsed'::"text", 'failed'::"text", 'committed'::"text"])))
);


ALTER TABLE "public"."list_import_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."list_import_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "detected_section" "text",
    "source_paragraph_start" integer,
    "raw_source_text" "text" NOT NULL,
    "parsed_name" "text",
    "parsed_description" "text",
    "parsed_contact" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "proposed_matches" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "match_confidence" "text" DEFAULT 'no_match'::"text" NOT NULL,
    "review_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "validation_warnings" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "administrator_corrections" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "final_disposition" "text" DEFAULT 'undecided'::"text" NOT NULL,
    "selected_canonical_resource_id" "uuid",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "review_method" "text",
    CONSTRAINT "list_import_items_final_disposition_check" CHECK (("final_disposition" = ANY (ARRAY['undecided'::"text", 'canonical_resource'::"text", 'list_only_entry'::"text", 'skip'::"text"]))),
    CONSTRAINT "list_import_items_match_confidence_check" CHECK (("match_confidence" = ANY (ARRAY['confident'::"text", 'possible'::"text", 'ambiguous'::"text", 'no_match'::"text"]))),
    CONSTRAINT "list_import_items_review_status_check" CHECK (("review_status" = ANY (ARRAY['pending'::"text", 'reviewed'::"text", 'needs_correction'::"text"])))
);


ALTER TABLE "public"."list_import_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_qc_review_audit" (
    "id" bigint NOT NULL,
    "canonical_resource_id" "uuid" NOT NULL,
    "previous_decision" "text",
    "new_decision" "text" NOT NULL,
    "previous_version" integer NOT NULL,
    "new_version" integer NOT NULL,
    "policy_version" "text" NOT NULL,
    "classification_fingerprint" "text" NOT NULL,
    "decision_note" "text" DEFAULT ''::"text" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."location_qc_review_audit" OWNER TO "postgres";


ALTER TABLE "public"."location_qc_review_audit" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."location_qc_review_audit_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."location_qc_review_snapshots" (
    "id" bigint NOT NULL,
    "canonical_resource_id" "uuid" NOT NULL,
    "qc_version" integer NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "origin" "text" NOT NULL,
    "refresh_reason" "text" DEFAULT ''::"text" NOT NULL,
    "prior_version" integer,
    "actor_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "location_qc_review_snapshots_origin_check" CHECK (("origin" = ANY (ARRAY['human_qc'::"text", 'machine_initial'::"text", 'evidence_refresh'::"text"]))),
    CONSTRAINT "location_qc_review_snapshots_qc_version_check" CHECK (("qc_version" > 0))
);


ALTER TABLE "public"."location_qc_review_snapshots" OWNER TO "postgres";


ALTER TABLE "public"."location_qc_review_snapshots" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."location_qc_review_snapshots_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."location_qc_supersessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "correction_id" "uuid" NOT NULL,
    "prior_qc_version" integer NOT NULL,
    "new_qc_version" integer NOT NULL,
    "reason_code" "text" NOT NULL,
    "machine_actor" "text" DEFAULT 'miller_map_automation'::"text" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "location_qc_supersessions_reason_code_check" CHECK (("reason_code" = 'authoritative_location_correction'::"text"))
);


ALTER TABLE "public"."location_qc_supersessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."map_auto_publication_decisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "qc_version" integer NOT NULL,
    "occupancy_claim_id" "uuid" NOT NULL,
    "policy_version" "text" NOT NULL,
    "decision" "text" NOT NULL,
    "reason_code" "text" NOT NULL,
    "machine_actor" "text" DEFAULT 'miller_map_automation'::"text" NOT NULL,
    "candidate" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "map_auto_publication_decisions_decision_check" CHECK (("decision" = ANY (ARRAY['auto_publish_eligible'::"text", 'manual_review'::"text"]))),
    CONSTRAINT "map_auto_publication_decisions_machine_actor_check" CHECK (("machine_actor" = 'miller_map_automation'::"text")),
    CONSTRAINT "map_auto_publication_decisions_policy_version_check" CHECK (("policy_version" = 'map_auto_publish_v1'::"text")),
    CONSTRAINT "map_auto_publication_decisions_qc_version_check" CHECK (("qc_version" > 0))
);


ALTER TABLE "public"."map_auto_publication_decisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."map_auto_publication_execution_provenance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "qc_version" integer NOT NULL,
    "occupancy_claim_id" "uuid" NOT NULL,
    "geocoder_evidence_id" "uuid" NOT NULL,
    "policy_version" "text" NOT NULL,
    "outcome" "text" NOT NULL,
    "reason_code" "text" NOT NULL,
    "machine_actor" "text" DEFAULT 'miller_map_automation'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "map_auto_publication_execution_provenance_outcome_check" CHECK (("outcome" = ANY (ARRAY['published'::"text", 'idempotent'::"text", 'refused'::"text", 'failed'::"text"]))),
    CONSTRAINT "map_auto_publication_execution_provenance_policy_version_check" CHECK (("policy_version" = 'map_auto_publish_v1'::"text"))
);


ALTER TABLE "public"."map_auto_publication_execution_provenance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_attention_directive_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "directive_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_id" "uuid",
    "provenance" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "miller_attention_directive_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."miller_attention_directive_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_attention_directives" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "directive_key" "text" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "directive_type" "text" NOT NULL,
    "topic_id" "uuid",
    "topic_key" "text" NOT NULL,
    "strength" integer NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "miller_attention_directives_check" CHECK ((("expires_at" > "created_at") AND ("expires_at" <= ("created_at" + '31 days'::interval)))),
    CONSTRAINT "miller_attention_directives_directive_key_check" CHECK (("directive_key" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "miller_attention_directives_directive_type_check" CHECK (("directive_type" = ANY (ARRAY['focus'::"text", 'investigate'::"text", 'keep_watch'::"text", 'de_emphasize'::"text"]))),
    CONSTRAINT "miller_attention_directives_reason_check" CHECK ((("length"("reason") >= 1) AND ("length"("reason") <= 280))),
    CONSTRAINT "miller_attention_directives_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'expired'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "miller_attention_directives_strength_check" CHECK ((("strength" >= 1) AND ("strength" <= 3))),
    CONSTRAINT "miller_attention_directives_topic_key_check" CHECK (("topic_key" ~ '^[a-z0-9:_|-]{3,240}$'::"text"))
);


ALTER TABLE "public"."miller_attention_directives" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_attention_signals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "topic_key" "text" NOT NULL,
    "signal_fingerprint" "text" NOT NULL,
    "underlying_event_key" "text" NOT NULL,
    "signal_type" "text" NOT NULL,
    "signal_family" "text" NOT NULL,
    "source_id" "text" NOT NULL,
    "source_authority" integer NOT NULL,
    "magnitude" numeric(4,3) NOT NULL,
    "novelty" numeric(4,3) NOT NULL,
    "relevance" numeric(4,3) NOT NULL,
    "confidence" numeric(4,3) NOT NULL,
    "observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "effective_at" timestamp with time zone,
    "decay_class" "text" NOT NULL,
    "reflex_eligible" boolean DEFAULT false NOT NULL,
    "reason_codes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "provenance" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "miller_attention_signals_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric))),
    CONSTRAINT "miller_attention_signals_decay_class_check" CHECK (("decay_class" = ANY (ARRAY['fast'::"text", 'medium'::"text", 'slow'::"text"]))),
    CONSTRAINT "miller_attention_signals_magnitude_check" CHECK ((("magnitude" >= (0)::numeric) AND ("magnitude" <= (1)::numeric))),
    CONSTRAINT "miller_attention_signals_novelty_check" CHECK ((("novelty" >= (0)::numeric) AND ("novelty" <= (1)::numeric))),
    CONSTRAINT "miller_attention_signals_relevance_check" CHECK ((("relevance" >= (0)::numeric) AND ("relevance" <= (1)::numeric))),
    CONSTRAINT "miller_attention_signals_signal_family_check" CHECK (("signal_family" = ANY (ARRAY['services'::"text", 'scientific'::"text", 'pharmacology'::"text", 'toxic_drug'::"text", 'policy'::"text", 'growth'::"text", 'cultural'::"text", 'security'::"text"]))),
    CONSTRAINT "miller_attention_signals_signal_fingerprint_check" CHECK (("signal_fingerprint" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "miller_attention_signals_signal_type_check" CHECK (("signal_type" = ANY (ARRAY['service_change'::"text", 'scientific_evidence'::"text", 'drug_safety'::"text", 'toxic_drug_alert'::"text", 'epidemiology_trend'::"text", 'policy_change'::"text", 'coverage_gap'::"text", 'cultural_signal'::"text", 'security_reflex'::"text"]))),
    CONSTRAINT "miller_attention_signals_source_authority_check" CHECK ((("source_authority" >= 0) AND ("source_authority" <= 100))),
    CONSTRAINT "miller_attention_signals_topic_key_check" CHECK (("topic_key" ~ '^[a-z0-9:_|-]{3,240}$'::"text")),
    CONSTRAINT "miller_attention_signals_underlying_event_key_check" CHECK ((("length"("underlying_event_key") >= 3) AND ("length"("underlying_event_key") <= 300)))
);


ALTER TABLE "public"."miller_attention_signals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_attention_topic_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "prior_score" numeric(6,2),
    "next_score" numeric(6,2) NOT NULL,
    "prior_state" "text",
    "next_state" "text" NOT NULL,
    "reason_codes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "provenance" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "miller_attention_topic_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'reinforced'::"text", 'recalculated'::"text", 'decayed'::"text", 'acknowledged'::"text", 'resolved'::"text", 'reactivated'::"text", 'suppressed'::"text"]))),
    CONSTRAINT "miller_attention_topic_events_next_score_check" CHECK ((("next_score" >= (0)::numeric) AND ("next_score" <= (100)::numeric))),
    CONSTRAINT "miller_attention_topic_events_next_state_check" CHECK (("next_state" = ANY (ARRAY['background'::"text", 'watch'::"text", 'focus'::"text", 'urgent_review'::"text"])))
);


ALTER TABLE "public"."miller_attention_topic_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_attention_topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_key" "text" NOT NULL,
    "topic_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "geographic_scope" "text",
    "service_scope" "text",
    "canonical_resource_id" "uuid",
    "state" "text" DEFAULT 'background'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "current_score" numeric(6,2) DEFAULT 0 NOT NULL,
    "first_observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_reinforced_at" timestamp with time zone,
    "last_recalculated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "miller_attention_topics_current_score_check" CHECK ((("current_score" >= (0)::numeric) AND ("current_score" <= (100)::numeric))),
    CONSTRAINT "miller_attention_topics_state_check" CHECK (("state" = ANY (ARRAY['background'::"text", 'watch'::"text", 'focus'::"text", 'urgent_review'::"text"]))),
    CONSTRAINT "miller_attention_topics_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'acknowledged'::"text", 'resolved'::"text", 'suppressed'::"text"]))),
    CONSTRAINT "miller_attention_topics_title_check" CHECK ((("length"("title") >= 1) AND ("length"("title") <= 240))),
    CONSTRAINT "miller_attention_topics_topic_key_check" CHECK (("topic_key" ~ '^[a-z0-9:_|-]{3,240}$'::"text")),
    CONSTRAINT "miller_attention_topics_topic_type_check" CHECK (("topic_type" = ANY (ARRAY['resource'::"text", 'region_category'::"text", 'substance'::"text", 'treatment'::"text", 'policy'::"text", 'service_system'::"text", 'drug_safety'::"text", 'toxic_drug'::"text", 'cultural'::"text"]))),
    CONSTRAINT "miller_attention_topics_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."miller_attention_topics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_automation_controls" (
    "id" boolean DEFAULT true NOT NULL,
    "observe_only" boolean DEFAULT true NOT NULL,
    "low_risk_fact_updates_enabled" boolean DEFAULT false NOT NULL,
    "routine_location_validation_enabled" boolean DEFAULT false NOT NULL,
    "maintenance_updates_enabled" boolean DEFAULT false NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "shadow_enabled" boolean DEFAULT true NOT NULL,
    "automatic_location_publication_enabled" boolean DEFAULT false NOT NULL,
    "automatic_resource_publication_enabled" boolean DEFAULT false NOT NULL,
    CONSTRAINT "miller_automation_controls_id_check" CHECK ("id")
);


ALTER TABLE "public"."miller_automation_controls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_automation_scheduler_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "lease_expires_at" timestamp with time zone NOT NULL,
    "heartbeat_status" "text",
    "due_capabilities" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "started_capabilities" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "failure_code" "text",
    "schema_version" "text" DEFAULT 'automation-scheduler-run-v1'::"text" NOT NULL,
    CONSTRAINT "miller_automation_scheduler_runs_failure_code_check" CHECK (("length"("failure_code") <= 120)),
    CONSTRAINT "miller_automation_scheduler_runs_heartbeat_status_check" CHECK (("heartbeat_status" = ANY (ARRAY['healthy'::"text", 'never_started'::"text", 'overdue'::"text", 'running'::"text", 'degraded'::"text", 'disabled'::"text", 'unknown'::"text"]))),
    CONSTRAINT "miller_automation_scheduler_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'degraded'::"text", 'failed'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."miller_automation_scheduler_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_canonical_field_corrections" (
    "correction_id" "uuid" NOT NULL,
    "request_fingerprint" "text" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "field_name" "text" NOT NULL,
    "outcome" "text" NOT NULL,
    "result" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applied_at" timestamp with time zone,
    "verified_at" timestamp with time zone,
    CONSTRAINT "miller_canonical_field_corrections_field_name_check" CHECK (("field_name" = ANY (ARRAY['city'::"text", 'province'::"text", 'public_street_address'::"text", 'phone'::"text", 'website'::"text"]))),
    CONSTRAINT "miller_canonical_field_corrections_outcome_check" CHECK (("outcome" = ANY (ARRAY['verified_updated'::"text", 'stale_before_write'::"text", 'evidence_gate_failed'::"text", 'write_failed'::"text", 'post_write_mismatch'::"text", 'rejected'::"text"]))),
    CONSTRAINT "miller_canonical_field_corrections_request_fingerprint_check" CHECK (("request_fingerprint" ~ '^[0-9a-f]{64}$'::"text"))
);


ALTER TABLE "public"."miller_canonical_field_corrections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_capability_gaps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gap_fingerprint" "text" NOT NULL,
    "subsystem" "text" NOT NULL,
    "problem_class" "text" NOT NULL,
    "target_key" "text" NOT NULL,
    "worker_candidates" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "reason" "text" NOT NULL,
    "safety_category" "text" NOT NULL,
    "suggested_direction" "text" NOT NULL,
    "evidence_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'candidate'::"text" NOT NULL,
    "observation_count" integer DEFAULT 1 NOT NULL,
    "first_observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "schema_version" "text" DEFAULT 'maintenance-capability-gap-v1'::"text" NOT NULL,
    CONSTRAINT "miller_capability_gaps_gap_fingerprint_check" CHECK (("gap_fingerprint" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "miller_capability_gaps_observation_count_check" CHECK (("observation_count" >= 1)),
    CONSTRAINT "miller_capability_gaps_problem_class_check" CHECK (("length"("problem_class") <= 120)),
    CONSTRAINT "miller_capability_gaps_reason_check" CHECK (("length"("reason") <= 500)),
    CONSTRAINT "miller_capability_gaps_safety_category_check" CHECK (("safety_category" = ANY (ARRAY['low'::"text", 'research_required'::"text", 'human_review'::"text", 'security_review'::"text"]))),
    CONSTRAINT "miller_capability_gaps_status_check" CHECK (("status" = ANY (ARRAY['candidate'::"text", 'prioritized'::"text", 'human_review'::"text", 'addressed'::"text", 'retired'::"text"]))),
    CONSTRAINT "miller_capability_gaps_subsystem_check" CHECK (("length"("subsystem") <= 80)),
    CONSTRAINT "miller_capability_gaps_suggested_direction_check" CHECK (("length"("suggested_direction") <= 300)),
    CONSTRAINT "miller_capability_gaps_target_key_check" CHECK (("length"("target_key") <= 180))
);


ALTER TABLE "public"."miller_capability_gaps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_coverage_hypotheses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hypothesis_key" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "theme" "text" NOT NULL,
    "geography" "text" NOT NULL,
    "strength_band" "text" NOT NULL,
    "coverage_state" "text" NOT NULL,
    "uncertainty_reason" "text" NOT NULL,
    "matching_resource_count" integer NOT NULL,
    "status" "text" NOT NULL,
    "research_question" "text" NOT NULL,
    "reason_codes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "provenance" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "first_observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "miller_coverage_hypotheses_coverage_state_check" CHECK (("coverage_state" = ANY (ARRAY['unknown'::"text", 'limited'::"text", 'represented'::"text"]))),
    CONSTRAINT "miller_coverage_hypotheses_hypothesis_key_check" CHECK (("hypothesis_key" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "miller_coverage_hypotheses_kind_check" CHECK (("kind" = ANY (ARRAY['need'::"text", 'barrier'::"text"]))),
    CONSTRAINT "miller_coverage_hypotheses_matching_resource_count_check" CHECK ((("matching_resource_count" >= 0) AND ("matching_resource_count" <= 10000))),
    CONSTRAINT "miller_coverage_hypotheses_research_question_check" CHECK (("length"("research_question") <= 600)),
    CONSTRAINT "miller_coverage_hypotheses_status_check" CHECK (("status" = ANY (ARRAY['proposed'::"text", 'awaiting_evidence'::"text", 'evidence_available'::"text", 'human_review'::"text", 'resolved'::"text", 'expired'::"text"]))),
    CONSTRAINT "miller_coverage_hypotheses_strength_band_check" CHECK (("strength_band" = ANY (ARRAY['emerging'::"text", 'recurring'::"text", 'elevated'::"text"]))),
    CONSTRAINT "miller_coverage_hypotheses_uncertainty_reason_check" CHECK (("uncertainty_reason" = ANY (ARRAY['directory_coverage_unknown'::"text", 'limited_directory_representation'::"text", 'coverage_present_discoverability_unknown'::"text", 'navigation_or_access_detail_unknown'::"text"])))
);


ALTER TABLE "public"."miller_coverage_hypotheses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_curiosity_investigation_results" (
    "investigation_id" "uuid" NOT NULL,
    "stable_result_id" "text" NOT NULL,
    "result_type" "text" NOT NULL,
    "compact_summary" "text" NOT NULL,
    "provenance" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "miller_curiosity_investigation_results_compact_summary_check" CHECK (("length"("compact_summary") <= 1000))
);


ALTER TABLE "public"."miller_curiosity_investigation_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_curiosity_investigations" (
    "id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "question_id" "text" NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "investigation_type" "text" NOT NULL,
    "tool_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "budget" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "usage" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "outcome" "text" NOT NULL,
    "uncertainty_decreased" boolean DEFAULT false NOT NULL,
    "before_score" numeric(6,2),
    "after_score" numeric(6,2),
    "stop_reason" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "miller_curiosity_investigations_outcome_check" CHECK (("outcome" = ANY (ARRAY['answered'::"text", 'partially_answered'::"text", 'new_signal'::"text", 'no_material_change'::"text", 'insufficient_evidence'::"text", 'conflicting_evidence'::"text", 'human_review'::"text", 'stale_question'::"text", 'failed'::"text"]))),
    CONSTRAINT "miller_curiosity_investigations_summary_check" CHECK ((("length"("summary") >= 1) AND ("length"("summary") <= 1000)))
);


ALTER TABLE "public"."miller_curiosity_investigations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_growth_opportunities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "opportunity_fingerprint" "text" NOT NULL,
    "domain" "text" NOT NULL,
    "gap_type" "text" NOT NULL,
    "target_key" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "state" "text" NOT NULL,
    "priority" integer NOT NULL,
    "first_observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recurrence_count" integer DEFAULT 1 NOT NULL,
    "evidence_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "schema_version" "text" DEFAULT 'growth-opportunity-v1'::"text" NOT NULL,
    CONSTRAINT "miller_growth_opportunities_opportunity_fingerprint_check" CHECK (("opportunity_fingerprint" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "miller_growth_opportunities_priority_check" CHECK ((("priority" >= 0) AND ("priority" <= 100))),
    CONSTRAINT "miller_growth_opportunities_reason_check" CHECK (("length"("reason") <= 500)),
    CONSTRAINT "miller_growth_opportunities_state_check" CHECK (("state" = ANY (ARRAY['candidate'::"text", 'prioritized'::"text", 'deferred'::"text", 'in_progress'::"text", 'improved'::"text", 'unchanged'::"text", 'blocked'::"text", 'retired'::"text"])))
);


ALTER TABLE "public"."miller_growth_opportunities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_insight_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "insight_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_id" "uuid",
    "reason_code" "text" NOT NULL,
    "provenance" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "miller_insight_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'reinforced'::"text", 'materially_changed'::"text", 'acknowledged'::"text", 'watching'::"text", 'resolved'::"text", 'dismissed'::"text", 'superseded'::"text"]))),
    CONSTRAINT "miller_insight_events_reason_code_check" CHECK (("length"("reason_code") <= 100))
);


ALTER TABLE "public"."miller_insight_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_insights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "insight_fingerprint" "text" NOT NULL,
    "material_fingerprint" "text" NOT NULL,
    "insight_type" "text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "topic_id" "uuid",
    "hypothesis_id" "uuid",
    "observation" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "relationship" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "interpretation" "text" NOT NULL,
    "confidence" numeric(4,3) NOT NULL,
    "uncertainty" "text" NOT NULL,
    "alternative_explanation" "text" NOT NULL,
    "provenance" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recurrence_count" integer DEFAULT 1 NOT NULL,
    "acknowledged_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "dismissed_at" timestamp with time zone,
    CONSTRAINT "miller_insights_alternative_explanation_check" CHECK (("length"("alternative_explanation") <= 500)),
    CONSTRAINT "miller_insights_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric))),
    CONSTRAINT "miller_insights_insight_fingerprint_check" CHECK (("insight_fingerprint" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "miller_insights_insight_type_check" CHECK (("insight_type" = ANY (ARRAY['directory_navigation_gap'::"text", 'directory_evidence_gap'::"text", 'coverage_question_resolved'::"text", 'derived_state_inconsistency'::"text", 'source_context_convergence'::"text"]))),
    CONSTRAINT "miller_insights_interpretation_check" CHECK (("length"("interpretation") <= 700)),
    CONSTRAINT "miller_insights_material_fingerprint_check" CHECK (("material_fingerprint" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "miller_insights_recurrence_count_check" CHECK (("recurrence_count" > 0)),
    CONSTRAINT "miller_insights_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'acknowledged'::"text", 'watching'::"text", 'superseded'::"text", 'resolved'::"text", 'dismissed'::"text"]))),
    CONSTRAINT "miller_insights_uncertainty_check" CHECK (("length"("uncertainty") <= 500))
);


ALTER TABLE "public"."miller_insights" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_learning_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lesson_fingerprint" "text" NOT NULL,
    "domain" "text" NOT NULL,
    "lesson_type" "text" NOT NULL,
    "scope" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "statement" "text" NOT NULL,
    "support_count" integer DEFAULT 0 NOT NULL,
    "contradiction_count" integer DEFAULT 0 NOT NULL,
    "status" "text" NOT NULL,
    "first_observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_confirmed_at" timestamp with time zone,
    "evidence_quality" "text" DEFAULT 'verified_outcome'::"text" NOT NULL,
    "schema_version" "text" DEFAULT 'learning-record-v1'::"text" NOT NULL,
    CONSTRAINT "miller_learning_records_lesson_fingerprint_check" CHECK (("lesson_fingerprint" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "miller_learning_records_statement_check" CHECK (("length"("statement") <= 500)),
    CONSTRAINT "miller_learning_records_status_check" CHECK (("status" = ANY (ARRAY['candidate'::"text", 'supported'::"text", 'contradicted'::"text", 'stale'::"text", 'retired'::"text"])))
);


ALTER TABLE "public"."miller_learning_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_maintenance_cycle_items" (
    "cycle_id" "uuid" NOT NULL,
    "task_id" "text" NOT NULL,
    "resource_id" "uuid",
    "outcome" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "miller_maintenance_cycle_items_outcome_check" CHECK (("outcome" = ANY (ARRAY['selected'::"text", 'resolved'::"text", 'reduced'::"text", 'unchanged'::"text", 'human_review'::"text", 'stale_task'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."miller_maintenance_cycle_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_maintenance_cycle_journal" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cycle_id" "uuid" NOT NULL,
    "trigger_type" "text" NOT NULL,
    "execution_mode" "text" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "duration_ms" integer,
    "security_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "orientation_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "considered" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "selected_action" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "refused" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "verification" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "learning_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "reflection" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "failure_code" "text",
    "schema_version" "text" DEFAULT 'maintenance-cycle-journal-v1'::"text" NOT NULL,
    CONSTRAINT "miller_maintenance_cycle_journal_duration_ms_check" CHECK (("duration_ms" >= 0)),
    CONSTRAINT "miller_maintenance_cycle_journal_execution_mode_check" CHECK (("execution_mode" = ANY (ARRAY['dry_run'::"text", 'active'::"text"]))),
    CONSTRAINT "miller_maintenance_cycle_journal_failure_code_check" CHECK (("length"("failure_code") <= 120)),
    CONSTRAINT "miller_maintenance_cycle_journal_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'degraded'::"text", 'failed'::"text", 'already_running'::"text", 'disabled'::"text"]))),
    CONSTRAINT "miller_maintenance_cycle_journal_trigger_type_check" CHECK (("trigger_type" = ANY (ARRAY['manual_admin'::"text", 'scheduled'::"text"])))
);


ALTER TABLE "public"."miller_maintenance_cycle_journal" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_maintenance_cycles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mode" "text" NOT NULL,
    "actor_id" "uuid",
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "tasks_considered" integer DEFAULT 0 NOT NULL,
    "tasks_executed" integer DEFAULT 0 NOT NULL,
    "useful_evidence_gained" integer DEFAULT 0 NOT NULL,
    "external_call_count" integer DEFAULT 0 NOT NULL,
    "knowledge_finding_count" integer DEFAULT 0 NOT NULL,
    "security_finding_count" integer DEFAULT 0 NOT NULL,
    "stop_reason" "text" DEFAULT 'running'::"text" NOT NULL,
    "summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "cycle_key" "text" DEFAULT "encode"("extensions"."digest"(("gen_random_uuid"())::"text", 'sha256'::"text"), 'hex'::"text") NOT NULL,
    "trigger_type" "text" DEFAULT 'manual_admin'::"text" NOT NULL,
    "phase" "text" DEFAULT 'waking'::"text" NOT NULL,
    "completeness" "text" DEFAULT 'partial'::"text" NOT NULL,
    "duration_ms" integer,
    "needs_discovered" integer DEFAULT 0 NOT NULL,
    "growth_opportunities" integer DEFAULT 0 NOT NULL,
    "work_attempted" integer DEFAULT 0 NOT NULL,
    "work_improved" integer DEFAULT 0 NOT NULL,
    "work_unchanged" integer DEFAULT 0 NOT NULL,
    "work_failed" integer DEFAULT 0 NOT NULL,
    "work_deferred" integer DEFAULT 0 NOT NULL,
    "healing_attempted" integer DEFAULT 0 NOT NULL,
    "lessons_created" integer DEFAULT 0 NOT NULL,
    "attention_created" integer DEFAULT 0 NOT NULL,
    "schema_version" "text" DEFAULT 'maintenance-cycle-v1'::"text" NOT NULL,
    CONSTRAINT "miller_maintenance_cycles_completeness_check" CHECK (("completeness" = ANY (ARRAY['complete'::"text", 'partial'::"text", 'failed'::"text"]))),
    CONSTRAINT "miller_maintenance_cycles_cycle_key_check" CHECK (("cycle_key" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "miller_maintenance_cycles_duration_ms_check" CHECK (("duration_ms" >= 0)),
    CONSTRAINT "miller_maintenance_cycles_external_call_count_check" CHECK (("external_call_count" >= 0)),
    CONSTRAINT "miller_maintenance_cycles_knowledge_finding_count_check" CHECK (("knowledge_finding_count" >= 0)),
    CONSTRAINT "miller_maintenance_cycles_mode_check" CHECK (("mode" = ANY (ARRAY['inspect_only'::"text", 'maintenance'::"text", 'observe'::"text", 'maintain'::"text", 'preview_growth'::"text"]))),
    CONSTRAINT "miller_maintenance_cycles_phase_check" CHECK (("phase" = ANY (ARRAY['waking'::"text", 'orienting'::"text", 'working'::"text", 'reflecting'::"text", 'consolidating'::"text", 'idle'::"text"]))),
    CONSTRAINT "miller_maintenance_cycles_security_finding_count_check" CHECK (("security_finding_count" >= 0)),
    CONSTRAINT "miller_maintenance_cycles_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'degraded'::"text", 'security_halt'::"text", 'failed'::"text"]))),
    CONSTRAINT "miller_maintenance_cycles_tasks_considered_check" CHECK (("tasks_considered" >= 0)),
    CONSTRAINT "miller_maintenance_cycles_tasks_executed_check" CHECK (("tasks_executed" >= 0)),
    CONSTRAINT "miller_maintenance_cycles_trigger_type_check" CHECK (("trigger_type" = ANY (ARRAY['manual_admin'::"text", 'manual_preview'::"text", 'scheduled'::"text"]))),
    CONSTRAINT "miller_maintenance_cycles_useful_evidence_gained_check" CHECK (("useful_evidence_gained" >= 0))
);


ALTER TABLE "public"."miller_maintenance_cycles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_maintenance_outcomes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cycle_id" "uuid",
    "need_key" "text" NOT NULL,
    "action_id" "text" NOT NULL,
    "action_version" "text" DEFAULT 'v1'::"text" NOT NULL,
    "domain" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_key" "text" NOT NULL,
    "before_state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "expected_state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "after_state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "verification" "text" NOT NULL,
    "classification" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "evidence_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "schema_version" "text" DEFAULT 'maintenance-outcome-v1'::"text" NOT NULL,
    CONSTRAINT "miller_maintenance_outcomes_action_id_check" CHECK (("length"("action_id") <= 100)),
    CONSTRAINT "miller_maintenance_outcomes_classification_check" CHECK (("classification" = ANY (ARRAY['resolved'::"text", 'improved'::"text", 'unchanged'::"text", 'degraded'::"text", 'failed'::"text", 'inconclusive'::"text", 'not_applicable'::"text"]))),
    CONSTRAINT "miller_maintenance_outcomes_domain_check" CHECK (("domain" = ANY (ARRAY['operations'::"text", 'resource_data'::"text", 'public_health'::"text", 'security'::"text"]))),
    CONSTRAINT "miller_maintenance_outcomes_need_key_check" CHECK (("length"("need_key") <= 180)),
    CONSTRAINT "miller_maintenance_outcomes_target_key_check" CHECK (("length"("target_key") <= 180)),
    CONSTRAINT "miller_maintenance_outcomes_target_type_check" CHECK (("length"("target_type") <= 80)),
    CONSTRAINT "miller_maintenance_outcomes_verification_check" CHECK (("verification" = ANY (ARRAY['passed'::"text", 'failed'::"text", 'inconclusive'::"text"])))
);


ALTER TABLE "public"."miller_maintenance_outcomes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_maintenance_scheduler_config" (
    "singleton" boolean DEFAULT true NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "execution_mode" "text" DEFAULT 'dry_run'::"text" NOT NULL,
    "cadence_hours" integer DEFAULT 24 NOT NULL,
    "display_timezone" "text" DEFAULT 'America/Vancouver'::"text" NOT NULL,
    "last_scheduled_at" timestamp with time zone,
    "next_expected_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "schema_version" "text" DEFAULT 'maintenance-scheduler-v1'::"text" NOT NULL,
    CONSTRAINT "miller_maintenance_scheduler_config_cadence_hours_check" CHECK ((("cadence_hours" >= 24) AND ("cadence_hours" <= 168))),
    CONSTRAINT "miller_maintenance_scheduler_config_display_timezone_check" CHECK ((("length"("display_timezone") >= 1) AND ("length"("display_timezone") <= 80))),
    CONSTRAINT "miller_maintenance_scheduler_config_execution_mode_check" CHECK (("execution_mode" = ANY (ARRAY['dry_run'::"text", 'active'::"text"]))),
    CONSTRAINT "miller_maintenance_scheduler_config_singleton_check" CHECK ("singleton"),
    CONSTRAINT "miller_maintenance_scheduler_config_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."miller_maintenance_scheduler_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_project_binding_v1" (
    "binding_key" "text" NOT NULL,
    "project_ref" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "miller_project_binding_v1_binding_key_check" CHECK (("binding_key" = 'miller_project_binding_v1'::"text")),
    CONSTRAINT "miller_project_binding_v1_project_ref_check" CHECK (("project_ref" ~ '^[a-z0-9]{20}$'::"text"))
);

ALTER TABLE ONLY "public"."miller_project_binding_v1" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_project_binding_v1" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_quiet_maintenance_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "action_key" "text" NOT NULL,
    "action_type" "text" NOT NULL,
    "target_kind" "text" NOT NULL,
    "target_id" "text",
    "reason_codes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "provenance" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "miller_quiet_maintenance_actions_action_key_check" CHECK (("action_key" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "miller_quiet_maintenance_actions_action_type_check" CHECK (("action_type" = ANY (ARRAY['attention_regulated'::"text", 'hypothesis_expired'::"text", 'hypothesis_resolved'::"text", 'expired_aggregate_forgotten'::"text", 'duplicate_suppressed'::"text", 'integrity_finding'::"text"]))),
    CONSTRAINT "miller_quiet_maintenance_actions_provenance_check" CHECK (("jsonb_typeof"("provenance") = 'object'::"text")),
    CONSTRAINT "miller_quiet_maintenance_actions_reason_codes_check" CHECK (("jsonb_typeof"("reason_codes") = 'array'::"text")),
    CONSTRAINT "miller_quiet_maintenance_actions_target_kind_check" CHECK (("target_kind" = ANY (ARRAY['attention_topic'::"text", 'coverage_hypothesis'::"text", 'need_bucket'::"text", 'workspace'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."miller_quiet_maintenance_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_reflection_acknowledgements" (
    "reflection_id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "acknowledged_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."miller_reflection_acknowledgements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_reflections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reflection_key" "text" NOT NULL,
    "category" "text" NOT NULL,
    "topic_id" "uuid",
    "investigation_id" "uuid",
    "signal_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "explanation" "text" NOT NULL,
    "confidence" numeric(4,3) NOT NULL,
    "human_impact" "text" NOT NULL,
    "recommendation" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "miller_reflections_category_check" CHECK (("category" = ANY (ARRAY['new_learning'::"text", 'attention_increased'::"text", 'attention_decreased'::"text", 'attention_reactivated'::"text", 'uncertainty_resolved'::"text", 'uncertainty_reduced'::"text", 'persistent_uncertainty'::"text", 'emerging_theme'::"text", 'human_impact_concern'::"text", 'coverage_gap'::"text", 'sensor_degraded'::"text", 'research_method_observation'::"text", 'human_review_recommended'::"text", 'maintenance_regulation'::"text", 'maintenance_forgetting'::"text", 'maintenance_repair'::"text", 'maintenance_learning'::"text", 'maintenance_uncertainty'::"text"]))),
    CONSTRAINT "miller_reflections_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric))),
    CONSTRAINT "miller_reflections_explanation_check" CHECK (("length"("explanation") <= 1000)),
    CONSTRAINT "miller_reflections_human_impact_check" CHECK (("human_impact" = ANY (ARRAY['low'::"text", 'moderate'::"text", 'high'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."miller_reflections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_resource_quality_detail_v1" (
    "resource_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "quality_state" "text" NOT NULL,
    "completeness_score" integer NOT NULL,
    "lifecycle_state" "text" NOT NULL,
    "editorial_status" "text" NOT NULL,
    "city" "text",
    "province" "text",
    "has_address" boolean NOT NULL,
    "has_coordinates" boolean NOT NULL,
    "location_state" "text" NOT NULL,
    "qc_state" "text" NOT NULL,
    "evidence_freshness" "text" NOT NULL,
    "last_verified_at" timestamp with time zone,
    CONSTRAINT "miller_resource_quality_detail_v1_completeness_score_check" CHECK ((("completeness_score" >= 0) AND ("completeness_score" <= 5))),
    CONSTRAINT "miller_resource_quality_detail_v1_editorial_status_check" CHECK (("editorial_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'hidden'::"text"]))),
    CONSTRAINT "miller_resource_quality_detail_v1_evidence_freshness_check" CHECK (("evidence_freshness" = ANY (ARRAY['unknown'::"text", 'stale'::"text", 'current'::"text"]))),
    CONSTRAINT "miller_resource_quality_detail_v1_lifecycle_state_check" CHECK (("lifecycle_state" = ANY (ARRAY['active'::"text", 'merged'::"text", 'retired'::"text"]))),
    CONSTRAINT "miller_resource_quality_detail_v1_location_state_check" CHECK (("location_state" = ANY (ARRAY['no_location'::"text", 'confidential_or_undisclosed'::"text", 'missing_public_address'::"text", 'missing_coordinates'::"text", 'coordinates_need_qc'::"text", 'public_map_ready'::"text", 'location_present'::"text"]))),
    CONSTRAINT "miller_resource_quality_detail_v1_qc_state_check" CHECK (("qc_state" = ANY (ARRAY['not_applicable'::"text", 'missing_location'::"text", 'needs_geocode'::"text", 'coordinates_pending_qc'::"text", 'verified_public'::"text"]))),
    CONSTRAINT "miller_resource_quality_detail_v1_quality_state_check" CHECK (("quality_state" = ANY (ARRAY['clean'::"text", 'missing'::"text", 'stale'::"text"])))
);

ALTER TABLE ONLY "public"."miller_resource_quality_detail_v1" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_resource_quality_detail_v1" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_resource_quality_reader_authorization_v1" (
    "authorization_key" "text" NOT NULL,
    "reader_id" "uuid" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "miller_resource_quality_reader_authoriz_authorization_key_check" CHECK (("authorization_key" = 'miller_resource_quality_reader_authorization_v1'::"text")),
    CONSTRAINT "miller_resource_quality_reader_authorization_v1_active_check" CHECK ("active")
);

ALTER TABLE ONLY "public"."miller_resource_quality_reader_authorization_v1" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_resource_quality_reader_authorization_v1" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_resource_quality_v1" (
    "resource_id" "uuid" NOT NULL,
    "quality_state" "text" NOT NULL,
    "completeness_score" integer NOT NULL,
    "source_fingerprint" "text" NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    CONSTRAINT "miller_resource_quality_v1_completeness_score_check" CHECK ((("completeness_score" >= 0) AND ("completeness_score" <= 5))),
    CONSTRAINT "miller_resource_quality_v1_quality_state_check" CHECK (("quality_state" = ANY (ARRAY['clean'::"text", 'missing'::"text", 'stale'::"text"]))),
    CONSTRAINT "miller_resource_quality_v1_source_fingerprint_check" CHECK (("source_fingerprint" ~ '^[a-f0-9]{64}$'::"text"))
);

ALTER TABLE ONLY "public"."miller_resource_quality_v1" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_resource_quality_v1" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_security_capabilities" (
    "target_id" "text" NOT NULL,
    "capability_id" "text" NOT NULL,
    "capability_version" "text" NOT NULL,
    "category" "text" NOT NULL,
    "execution_class" "text" NOT NULL,
    "environment_scope" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "mutation_ability" "text" DEFAULT 'none'::"text" NOT NULL,
    "timeout_ms" integer NOT NULL,
    "expected_cost" "text" NOT NULL,
    "status" "text" DEFAULT 'available_not_run'::"text" NOT NULL,
    "last_success_at" timestamp with time zone,
    "last_failure_at" timestamp with time zone,
    "disabled_reason" "text",
    "profile_version" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "miller_security_capabilities_capability_id_check" CHECK (("capability_id" ~ '^[a-z0-9][a-z0-9_]{0,79}$'::"text")),
    CONSTRAINT "miller_security_capabilities_capability_version_check" CHECK ((("length"("capability_version") >= 1) AND ("length"("capability_version") <= 80))),
    CONSTRAINT "miller_security_capabilities_category_check" CHECK ((("length"("category") >= 1) AND ("length"("category") <= 80))),
    CONSTRAINT "miller_security_capabilities_disabled_reason_check" CHECK (("length"("disabled_reason") <= 180)),
    CONSTRAINT "miller_security_capabilities_environment_scope_check" CHECK (("environment_scope" = ANY (ARRAY['local_only'::"text", 'local_owned_target_only'::"text", 'production_safe_passive'::"text", 'local_or_production_passive'::"text"]))),
    CONSTRAINT "miller_security_capabilities_execution_class_check" CHECK (("execution_class" = ANY (ARRAY['passive'::"text", 'active_negative_probe'::"text"]))),
    CONSTRAINT "miller_security_capabilities_expected_cost_check" CHECK (("expected_cost" = ANY (ARRAY['none'::"text", 'low'::"text", 'bounded_external'::"text"]))),
    CONSTRAINT "miller_security_capabilities_mutation_ability_check" CHECK (("mutation_ability" = 'none'::"text")),
    CONSTRAINT "miller_security_capabilities_profile_version_check" CHECK ((("length"("profile_version") >= 1) AND ("length"("profile_version") <= 80))),
    CONSTRAINT "miller_security_capabilities_status_check" CHECK (("status" = ANY (ARRAY['available_not_run'::"text", 'verified'::"text", 'failed'::"text", 'unavailable'::"text", 'disabled'::"text"]))),
    CONSTRAINT "miller_security_capabilities_target_id_check" CHECK (("target_id" ~ '^[a-z0-9][a-z0-9_-]{0,79}$'::"text")),
    CONSTRAINT "miller_security_capabilities_timeout_ms_check" CHECK ((("timeout_ms" >= 1) AND ("timeout_ms" <= 60000)))
);


ALTER TABLE "public"."miller_security_capabilities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_security_deployment_observations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "observation_fingerprint" "text" NOT NULL,
    "target_id" "text" NOT NULL,
    "observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "build_identity" "text",
    "schema_head" "text",
    "schema_contract" "text",
    "profile_version" "text" NOT NULL,
    "alignment_state" "text" NOT NULL,
    "reason_codes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "evidence_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "schema_version" "text" DEFAULT 'security-deployment-observation-v1'::"text" NOT NULL,
    CONSTRAINT "miller_security_deployment_observ_observation_fingerprint_check" CHECK (("observation_fingerprint" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "miller_security_deployment_observations_alignment_state_check" CHECK (("alignment_state" = ANY (ARRAY['aligned'::"text", 'build_unknown'::"text", 'schema_unknown'::"text", 'schema_behind_build'::"text", 'schema_ahead_of_build'::"text", 'migration_gap'::"text", 'compatibility_unknown'::"text"]))),
    CONSTRAINT "miller_security_deployment_observations_build_identity_check" CHECK ((("length"("build_identity") >= 1) AND ("length"("build_identity") <= 120))),
    CONSTRAINT "miller_security_deployment_observations_profile_version_check" CHECK ((("length"("profile_version") >= 1) AND ("length"("profile_version") <= 80))),
    CONSTRAINT "miller_security_deployment_observations_schema_contract_check" CHECK ((("length"("schema_contract") >= 1) AND ("length"("schema_contract") <= 120))),
    CONSTRAINT "miller_security_deployment_observations_schema_head_check" CHECK ((("length"("schema_head") >= 1) AND ("length"("schema_head") <= 80))),
    CONSTRAINT "miller_security_deployment_observations_target_id_check" CHECK (("target_id" ~ '^[a-z0-9][a-z0-9_-]{0,79}$'::"text"))
);


ALTER TABLE "public"."miller_security_deployment_observations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_security_finding_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "finding_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_id" "uuid",
    "provenance" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "miller_security_finding_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'recurred'::"text", 'acknowledged'::"text", 'mitigated'::"text", 'resolved'::"text", 'false_positive'::"text", 'verification_passed'::"text", 'verification_failed'::"text"])))
);


ALTER TABLE "public"."miller_security_finding_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_security_incident_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "incident_id" "uuid" NOT NULL,
    "source_kind" "text" NOT NULL,
    "source_key" "text" NOT NULL,
    "reason_code" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "miller_security_incident_members_reason_code_check" CHECK (("length"("reason_code") <= 120)),
    CONSTRAINT "miller_security_incident_members_source_key_check" CHECK ((("length"("source_key") >= 1) AND ("length"("source_key") <= 200))),
    CONSTRAINT "miller_security_incident_members_source_kind_check" CHECK (("source_kind" = ANY (ARRAY['internal_finding'::"text", 'external_observation'::"text"])))
);


ALTER TABLE "public"."miller_security_incident_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_security_incidents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "correlation_key" "text" NOT NULL,
    "target_id" "text" NOT NULL,
    "category" "text" NOT NULL,
    "state" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "reason_codes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "first_observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recurrence_count" integer DEFAULT 1 NOT NULL,
    "version_context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "schema_version" "text" DEFAULT 'security-incident-v1'::"text" NOT NULL,
    CONSTRAINT "miller_security_incidents_category_check" CHECK (("category" = ANY (ARRAY['auth_boundary'::"text", 'http_posture'::"text", 'availability'::"text", 'dependency'::"text", 'capability'::"text", 'deployment'::"text"]))),
    CONSTRAINT "miller_security_incidents_correlation_key_check" CHECK (("correlation_key" ~ '^[a-z0-9:_-]{8,500}$'::"text")),
    CONSTRAINT "miller_security_incidents_recurrence_count_check" CHECK (("recurrence_count" > 0)),
    CONSTRAINT "miller_security_incidents_severity_check" CHECK (("severity" = ANY (ARRAY['informational'::"text", 'low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "miller_security_incidents_state_check" CHECK (("state" = ANY (ARRAY['active'::"text", 'resolved'::"text", 'needs_review'::"text"]))),
    CONSTRAINT "miller_security_incidents_target_id_check" CHECK (("target_id" ~ '^[a-z0-9][a-z0-9_-]{0,79}$'::"text"))
);


ALTER TABLE "public"."miller_security_incidents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_security_observers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "observer_key" "text" NOT NULL,
    "auth_user_id" "uuid" NOT NULL,
    "target_id" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "observer_version" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "disabled_at" timestamp with time zone,
    CONSTRAINT "miller_security_observers_observer_key_check" CHECK (("observer_key" ~ '^[a-z0-9][a-z0-9_-]{2,79}$'::"text")),
    CONSTRAINT "miller_security_observers_observer_version_check" CHECK ((("length"("observer_version") >= 1) AND ("length"("observer_version") <= 80))),
    CONSTRAINT "miller_security_observers_target_id_check" CHECK (("target_id" ~ '^[a-z0-9][a-z0-9_-]{0,79}$'::"text"))
);


ALTER TABLE "public"."miller_security_observers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_security_pulse_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_key" "text" NOT NULL,
    "trigger_type" "text" NOT NULL,
    "mode" "text" NOT NULL,
    "status" "text" NOT NULL,
    "completeness" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "duration_ms" integer,
    "instruments_attempted" integer DEFAULT 0 NOT NULL,
    "instruments_succeeded" integer DEFAULT 0 NOT NULL,
    "instruments_degraded" integer DEFAULT 0 NOT NULL,
    "instruments_unavailable" integer DEFAULT 0 NOT NULL,
    "findings_observed" integer DEFAULT 0 NOT NULL,
    "findings_new" integer DEFAULT 0 NOT NULL,
    "findings_recurring" integer DEFAULT 0 NOT NULL,
    "findings_reappeared" integer DEFAULT 0 NOT NULL,
    "findings_resolved" integer DEFAULT 0 NOT NULL,
    "findings_preserved" integer DEFAULT 0 NOT NULL,
    "attention_worthy" integer DEFAULT 0 NOT NULL,
    "schema_version" "text" DEFAULT 'security-pulse-v1'::"text" NOT NULL,
    "summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "target_id" "text" DEFAULT 'miller_local'::"text" NOT NULL,
    "profile_version" "text" DEFAULT 'miller-security-profile-v1'::"text" NOT NULL,
    CONSTRAINT "miller_security_pulse_runs_completeness_check" CHECK (("completeness" = ANY (ARRAY['complete'::"text", 'partial'::"text", 'failed'::"text", 'unavailable'::"text", 'timed_out'::"text"]))),
    CONSTRAINT "miller_security_pulse_runs_duration_ms_check" CHECK (("duration_ms" >= 0)),
    CONSTRAINT "miller_security_pulse_runs_mode_check" CHECK (("mode" = ANY (ARRAY['local_manual'::"text", 'preview'::"text"]))),
    CONSTRAINT "miller_security_pulse_runs_profile_version_check" CHECK ((("length"("profile_version") >= 1) AND ("length"("profile_version") <= 80))),
    CONSTRAINT "miller_security_pulse_runs_run_key_check" CHECK (("run_key" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "miller_security_pulse_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'failed'::"text", 'degraded'::"text"]))),
    CONSTRAINT "miller_security_pulse_runs_target_id_check" CHECK (("target_id" ~ '^[a-z0-9][a-z0-9_-]{0,79}$'::"text")),
    CONSTRAINT "miller_security_pulse_runs_trigger_type_check" CHECK (("trigger_type" = ANY (ARRAY['manual_admin'::"text", 'daily_preview'::"text", 'deep_preview'::"text"])))
);


ALTER TABLE "public"."miller_security_pulse_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_security_sensor_outcomes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "target_id" "text" NOT NULL,
    "profile_version" "text" NOT NULL,
    "instrument_id" "text" NOT NULL,
    "instrument_version" "text" NOT NULL,
    "state" "text" NOT NULL,
    "completeness" "text" NOT NULL,
    "finding_count" integer DEFAULT 0 NOT NULL,
    "finished_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "evidence_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "schema_version" "text" DEFAULT 'security-sensor-outcome-v1'::"text" NOT NULL,
    CONSTRAINT "miller_security_sensor_outcomes_completeness_check" CHECK (("completeness" = ANY (ARRAY['complete'::"text", 'partial'::"text", 'unavailable'::"text", 'failed'::"text"]))),
    CONSTRAINT "miller_security_sensor_outcomes_finding_count_check" CHECK (("finding_count" >= 0)),
    CONSTRAINT "miller_security_sensor_outcomes_instrument_id_check" CHECK (("instrument_id" ~ '^[a-z0-9][a-z0-9_]{0,79}$'::"text")),
    CONSTRAINT "miller_security_sensor_outcomes_instrument_version_check" CHECK ((("length"("instrument_version") >= 1) AND ("length"("instrument_version") <= 80))),
    CONSTRAINT "miller_security_sensor_outcomes_profile_version_check" CHECK ((("length"("profile_version") >= 1) AND ("length"("profile_version") <= 80))),
    CONSTRAINT "miller_security_sensor_outcomes_state_check" CHECK (("state" = ANY (ARRAY['verified'::"text", 'failed'::"text", 'unavailable'::"text"]))),
    CONSTRAINT "miller_security_sensor_outcomes_target_id_check" CHECK (("target_id" ~ '^[a-z0-9][a-z0-9_-]{0,79}$'::"text"))
);


ALTER TABLE "public"."miller_security_sensor_outcomes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_sensor_checkpoints" (
    "sensor_id" "text" NOT NULL,
    "mode" "text" NOT NULL,
    "last_success_at" timestamp with time zone,
    "last_fingerprint" "text",
    "request_count" integer DEFAULT 0 NOT NULL,
    "records_inspected" integer DEFAULT 0 NOT NULL,
    "records_accepted" integer DEFAULT 0 NOT NULL,
    "duplicates_ignored" integer DEFAULT 0 NOT NULL,
    "failure_streak" integer DEFAULT 0 NOT NULL,
    "health_state" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "last_error_code" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "miller_sensor_checkpoints_health_state_check" CHECK (("health_state" = ANY (ARRAY['healthy'::"text", 'degraded'::"text", 'unknown'::"text"]))),
    CONSTRAINT "miller_sensor_checkpoints_mode_check" CHECK (("mode" = ANY (ARRAY['live_ready'::"text", 'fixture_validated'::"text", 'disabled'::"text", 'fixture_validated_live_disabled'::"text"])))
);


ALTER TABLE "public"."miller_sensor_checkpoints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_sensor_inspections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sensor_id" "text" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "request_count" integer DEFAULT 0 NOT NULL,
    "bytes_read" integer DEFAULT 0 NOT NULL,
    "records_inspected" integer DEFAULT 0 NOT NULL,
    "records_accepted" integer DEFAULT 0 NOT NULL,
    "duplicates_ignored" integer DEFAULT 0 NOT NULL,
    "signals_created" integer DEFAULT 0 NOT NULL,
    "topics_affected" integer DEFAULT 0 NOT NULL,
    "reflections_created" integer DEFAULT 0 NOT NULL,
    "health_state" "text" NOT NULL,
    "outcome" "text" NOT NULL,
    "stop_reason" "text" NOT NULL,
    "parser_version" "text" NOT NULL,
    "error_code" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "miller_sensor_inspections_bytes_read_check" CHECK ((("bytes_read" >= 0) AND ("bytes_read" <= 524288))),
    CONSTRAINT "miller_sensor_inspections_duplicates_ignored_check" CHECK ((("duplicates_ignored" >= 0) AND ("duplicates_ignored" <= 100))),
    CONSTRAINT "miller_sensor_inspections_health_state_check" CHECK (("health_state" = ANY (ARRAY['healthy'::"text", 'degraded'::"text", 'failed'::"text"]))),
    CONSTRAINT "miller_sensor_inspections_outcome_check" CHECK (("outcome" = ANY (ARRAY['healthy_new_relevant_change'::"text", 'healthy_no_relevant_change'::"text", 'failed'::"text"]))),
    CONSTRAINT "miller_sensor_inspections_records_accepted_check" CHECK ((("records_accepted" >= 0) AND ("records_accepted" <= 100))),
    CONSTRAINT "miller_sensor_inspections_records_inspected_check" CHECK ((("records_inspected" >= 0) AND ("records_inspected" <= 100))),
    CONSTRAINT "miller_sensor_inspections_reflections_created_check" CHECK ((("reflections_created" >= 0) AND ("reflections_created" <= 100))),
    CONSTRAINT "miller_sensor_inspections_request_count_check" CHECK ((("request_count" >= 0) AND ("request_count" <= 1))),
    CONSTRAINT "miller_sensor_inspections_sensor_id_check" CHECK (("sensor_id" = 'health_canada_drug_safety'::"text")),
    CONSTRAINT "miller_sensor_inspections_signals_created_check" CHECK ((("signals_created" >= 0) AND ("signals_created" <= 100))),
    CONSTRAINT "miller_sensor_inspections_stop_reason_check" CHECK ((("length"("stop_reason") >= 1) AND ("length"("stop_reason") <= 120))),
    CONSTRAINT "miller_sensor_inspections_topics_affected_check" CHECK ((("topics_affected" >= 0) AND ("topics_affected" <= 100)))
);


ALTER TABLE "public"."miller_sensor_inspections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_trend_observations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "observation_fingerprint" "text" NOT NULL,
    "source_url" "text" NOT NULL,
    "source_authority" integer NOT NULL,
    "trend_category" "text" NOT NULL,
    "attention" "text" NOT NULL,
    "state" "text" DEFAULT 'new'::"text" NOT NULL,
    "geographic_scope" "text",
    "canonical_resource_id" "uuid",
    "publication_date" "date",
    "retrieved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "summary" "text" NOT NULL,
    "recommended_response" "text" NOT NULL,
    "provenance" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "supersedes_id" "uuid",
    CONSTRAINT "miller_trend_observations_attention_check" CHECK (("attention" = ANY (ARRAY['watch'::"text", 'review'::"text", 'important'::"text"]))),
    CONSTRAINT "miller_trend_observations_observation_fingerprint_check" CHECK (("observation_fingerprint" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "miller_trend_observations_recommended_response_check" CHECK (("recommended_response" = ANY (ARRAY['maintenance'::"text", 'growth'::"text", 'human_review'::"text", 'informational'::"text"]))),
    CONSTRAINT "miller_trend_observations_source_authority_check" CHECK ((("source_authority" >= 0) AND ("source_authority" <= 100))),
    CONSTRAINT "miller_trend_observations_source_url_check" CHECK (("source_url" ~ '^https://'::"text")),
    CONSTRAINT "miller_trend_observations_state_check" CHECK (("state" = ANY (ARRAY['new'::"text", 'acknowledged'::"text", 'incorporated'::"text", 'superseded'::"text", 'not_relevant'::"text"]))),
    CONSTRAINT "miller_trend_observations_summary_check" CHECK ((("length"("summary") >= 1) AND ("length"("summary") <= 1000))),
    CONSTRAINT "miller_trend_observations_trend_category_check" CHECK (("trend_category" = ANY (ARRAY['service_opening'::"text", 'service_closure'::"text", 'service_relocation'::"text", 'service_expansion'::"text", 'service_reduction'::"text", 'eligibility_change'::"text", 'delivery_model_change'::"text", 'policy_change'::"text", 'funding_change'::"text", 'regional_service_gap'::"text", 'emerging_service_model'::"text", 'other_relevant_change'::"text"])))
);


ALTER TABLE "public"."miller_trend_observations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_trend_sensor_run_items" (
    "run_id" "uuid" NOT NULL,
    "source_id" "text" NOT NULL,
    "source_url" "text" NOT NULL,
    "outcome" "text" NOT NULL,
    "reason_code" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "miller_trend_sensor_run_items_outcome_check" CHECK (("outcome" = ANY (ARRAY['observed'::"text", 'unchanged'::"text", 'failed'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."miller_trend_sensor_run_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miller_trend_sensor_runs" (
    "id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "requests_used" integer DEFAULT 0 NOT NULL,
    "new_observations" integer DEFAULT 0 NOT NULL,
    "duplicates_ignored" integer DEFAULT 0 NOT NULL,
    "stop_reason" "text" DEFAULT 'running'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "miller_trend_sensor_runs_duplicates_ignored_check" CHECK (("duplicates_ignored" >= 0)),
    CONSTRAINT "miller_trend_sensor_runs_new_observations_check" CHECK (("new_observations" >= 0)),
    CONSTRAINT "miller_trend_sensor_runs_requests_used_check" CHECK (("requests_used" >= 0)),
    CONSTRAINT "miller_trend_sensor_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'security_halt'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."miller_trend_sensor_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."publication_feed_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "requested_limit" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "publication_feed_runs_requested_limit_check" CHECK ((("requested_limit" >= 1) AND ("requested_limit" <= 100))),
    CONSTRAINT "publication_feed_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."publication_feed_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resource_canonical_profile" (
    "resource_id" "uuid" NOT NULL,
    "canonical_location_id" "uuid",
    "phone" "text",
    "website" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "canonical_fingerprint" "text" NOT NULL,
    "provenance" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "resource_canonical_profile_canonical_fingerprint_check" CHECK (("canonical_fingerprint" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "resource_canonical_profile_phone_check" CHECK ((("phone" IS NULL) OR ("phone" ~ '^\\+[1-9][0-9]{7,14}$'::"text"))),
    CONSTRAINT "resource_canonical_profile_provenance_check" CHECK (("jsonb_typeof"("provenance") = 'array'::"text")),
    CONSTRAINT "resource_canonical_profile_version_check" CHECK (("version" >= 1)),
    CONSTRAINT "resource_canonical_profile_website_check" CHECK ((("website" IS NULL) OR ("website" ~ '^https://[^/?#[:space:]]+[^[:space:]]*$'::"text")))
);


ALTER TABLE "public"."resource_canonical_profile" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resource_canonical_profile_audit" (
    "id" bigint NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "prior_profile" "jsonb",
    "new_profile" "jsonb",
    "supporting_evidence" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "policy_version" "text" NOT NULL,
    "actor_id" "uuid",
    "actor_type" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "correction_id" "uuid",
    "request_fingerprint" "text",
    "field_name" "text",
    "outcome" "text",
    "applied_at" timestamp with time zone,
    "verified_at" timestamp with time zone,
    "requester_id" "text",
    CONSTRAINT "resource_canonical_profile_audit_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['administrator'::"text", 'samwise_trusted_backend'::"text", 'system'::"text"]))),
    CONSTRAINT "resource_canonical_profile_audit_policy_version_check" CHECK (("policy_version" = 'miller-canonical-contact-location-projection-v1'::"text")),
    CONSTRAINT "resource_canonical_profile_audit_reason_check" CHECK ((("char_length"("reason") >= 1) AND ("char_length"("reason") <= 500))),
    CONSTRAINT "resource_canonical_profile_audit_request_fingerprint_check" CHECK ((("request_fingerprint" IS NULL) OR ("request_fingerprint" ~ '^[0-9a-f]{64}$'::"text"))),
    CONSTRAINT "resource_canonical_profile_audit_supporting_evidence_check" CHECK (("jsonb_typeof"("supporting_evidence") = 'array'::"text"))
);


ALTER TABLE "public"."resource_canonical_profile_audit" OWNER TO "postgres";


ALTER TABLE "public"."resource_canonical_profile_audit" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."resource_canonical_profile_audit_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."resource_discovery_candidates" (
    "id" bigint NOT NULL,
    "source_fingerprint" "text" NOT NULL,
    "candidate_type" "text" DEFAULT 'shelter'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "operator" "text",
    "shelter_type" "text",
    "population_served" "text",
    "gender_eligibility" "text",
    "age_eligibility" "text",
    "community" "text",
    "region" "text",
    "health_authority" "text",
    "public_address" "text",
    "location_disclosure_status" "text" NOT NULL,
    "phone" "text",
    "crisis_line" "text",
    "email" "text",
    "website" "text",
    "intake_process" "text",
    "hours_or_dates" "text",
    "accessibility" "text",
    "pets_policy" "text",
    "couples_policy" "text",
    "substance_use_rules" "text",
    "managed_alcohol_program" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "indigenous_specific" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "capacity" "text",
    "source_url" "text" NOT NULL,
    "source_name" "text",
    "retrieved_title" "text",
    "source_excerpt" "text",
    "additional_sources" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "checked_at" timestamp with time zone NOT NULL,
    "evidence_notes" "text",
    "confidence" "text" NOT NULL,
    "review_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "geocoding_status" "text" NOT NULL,
    "possible_matches" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "matched_resource_id" "uuid",
    "imported_tavily_resource_id" bigint,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "resource_discovery_candidates_check" CHECK ((("location_disclosure_status" = 'public'::"text") OR (COALESCE("public_address", ''::"text") = ''::"text"))),
    CONSTRAINT "resource_discovery_candidates_confidence_check" CHECK (("confidence" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "resource_discovery_candidates_geocoding_status_check" CHECK (("geocoding_status" = ANY (ARRAY['not_requested'::"text", 'awaiting_authorized_geocoder'::"text"]))),
    CONSTRAINT "resource_discovery_candidates_indigenous_specific_check" CHECK (("indigenous_specific" = ANY (ARRAY['yes'::"text", 'no'::"text", 'unknown'::"text"]))),
    CONSTRAINT "resource_discovery_candidates_location_disclosure_status_check" CHECK (("location_disclosure_status" = ANY (ARRAY['public'::"text", 'confidential'::"text", 'undisclosed'::"text"]))),
    CONSTRAINT "resource_discovery_candidates_managed_alcohol_program_check" CHECK (("managed_alcohol_program" = ANY (ARRAY['yes'::"text", 'no'::"text", 'unknown'::"text", 'not_stated'::"text"]))),
    CONSTRAINT "resource_discovery_candidates_review_status_check" CHECK (("review_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'excluded'::"text", 'deferred'::"text", 'merged'::"text", 'import_failed'::"text"])))
);


ALTER TABLE "public"."resource_discovery_candidates" OWNER TO "postgres";


ALTER TABLE "public"."resource_discovery_candidates" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."resource_discovery_candidates_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."resource_fact_change_audit" (
    "id" bigint NOT NULL,
    "claim_id" "uuid" NOT NULL,
    "resource_id" "uuid",
    "field_name" "text" NOT NULL,
    "previous_value" "jsonb",
    "new_value" "jsonb",
    "action" "text" NOT NULL,
    "reason_codes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "actor_type" "text" NOT NULL,
    "actor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "resource_fact_change_audit_action_check" CHECK (("action" = ANY (ARRAY['observe'::"text", 'accept'::"text", 'keep_existing'::"text", 'reject'::"text", 'mark_unknown'::"text", 'rollback'::"text"]))),
    CONSTRAINT "resource_fact_change_audit_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['administrator'::"text", 'miller_automation'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."resource_fact_change_audit" OWNER TO "postgres";


ALTER TABLE "public"."resource_fact_change_audit" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."resource_fact_change_audit_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."resource_fact_evidence" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "claim_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_record_id" "text",
    "source_url" "text",
    "extracted_value" "jsonb",
    "extraction_method" "text" NOT NULL,
    "retrieved_at" timestamp with time zone,
    "source_authority" integer NOT NULL,
    "independent_key" "text" NOT NULL,
    "stale" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "evidence_fingerprint" "text",
    CONSTRAINT "resource_fact_evidence_fingerprint_format" CHECK ((("evidence_fingerprint" IS NULL) OR ("evidence_fingerprint" ~ '^[0-9a-f]{64}$'::"text"))),
    CONSTRAINT "resource_fact_evidence_source_authority_check" CHECK ((("source_authority" >= 0) AND ("source_authority" <= 100))),
    CONSTRAINT "resource_fact_evidence_source_url_check" CHECK ((("source_url" IS NULL) OR ("source_url" ~ '^https://'::"text")))
);


ALTER TABLE "public"."resource_fact_evidence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resource_geography" (
    "id" bigint NOT NULL,
    "resource_id" bigint NOT NULL,
    "original_address_text" "text",
    "street_address" "text",
    "city" "text",
    "province" "text" DEFAULT 'BC'::"text" NOT NULL,
    "postal_code" "text",
    "latitude" double precision,
    "longitude" double precision,
    "geocode_source" "text",
    "geocode_confidence" double precision,
    "geographic_region" "text",
    "service_area" "text",
    "virtual_service" boolean DEFAULT false NOT NULL,
    "mobile_service" boolean DEFAULT false NOT NULL,
    "public_map" boolean DEFAULT true NOT NULL,
    "geocode_status" "text" DEFAULT 'needs_review'::"text" NOT NULL,
    "location_last_verified" timestamp with time zone,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "resource_geography_geocode_confidence_check" CHECK ((("geocode_confidence" >= (0)::double precision) AND ("geocode_confidence" <= (1)::double precision))),
    CONSTRAINT "resource_geography_geocode_status_check" CHECK (("geocode_status" = ANY (ARRAY['geocoded'::"text", 'verified'::"text", 'approximate'::"text", 'failed'::"text", 'needs_review'::"text"]))),
    CONSTRAINT "resource_geography_latitude_check" CHECK ((("latitude" >= ('-90'::integer)::double precision) AND ("latitude" <= (90)::double precision))),
    CONSTRAINT "resource_geography_longitude_check" CHECK ((("longitude" >= ('-180'::integer)::double precision) AND ("longitude" <= (180)::double precision)))
);


ALTER TABLE "public"."resource_geography" OWNER TO "postgres";


ALTER TABLE "public"."resource_geography" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."resource_geography_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."resource_location_audit" (
    "id" bigint NOT NULL,
    "location_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "previous_values" "jsonb",
    "new_values" "jsonb",
    "actor_id" "uuid",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "resource_location_audit_action_check" CHECK (("action" = ANY (ARRAY['created'::"text", 'geocoded'::"text", 'corrected'::"text", 'approved'::"text", 'rejected'::"text", 'excluded'::"text", 'marked_confidential'::"text", 'publication_changed'::"text"])))
);


ALTER TABLE "public"."resource_location_audit" OWNER TO "postgres";


ALTER TABLE "public"."resource_location_audit" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."resource_location_audit_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."resource_match_candidates" (
    "id" bigint NOT NULL,
    "left_source_type" "text" NOT NULL,
    "left_source_native_id" "text" NOT NULL,
    "right_source_type" "text" NOT NULL,
    "right_source_native_id" "text" NOT NULL,
    "classification" "text" NOT NULL,
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "decision" "text" DEFAULT 'pending'::"text" NOT NULL,
    "decided_by" "uuid",
    "decided_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "resource_match_candidates_check" CHECK ((("decision" = 'pending'::"text") = ("decided_at" IS NULL))),
    CONSTRAINT "resource_match_candidates_classification_check" CHECK (("classification" = ANY (ARRAY['high_confidence'::"text", 'possible'::"text", 'likely_distinct'::"text", 'insufficient'::"text"]))),
    CONSTRAINT "resource_match_candidates_decision_check" CHECK (("decision" = ANY (ARRAY['pending'::"text", 'same_resource'::"text", 'keep_separate'::"text", 'defer'::"text"])))
);


ALTER TABLE "public"."resource_match_candidates" OWNER TO "postgres";


ALTER TABLE "public"."resource_match_candidates" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."resource_match_candidates_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."resource_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resource_name" "text",
    "note" "text",
    "author" "text",
    "status" "text" DEFAULT 'pending'::"text"
);


ALTER TABLE "public"."resource_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resource_registry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "display_name" "text" NOT NULL,
    "lifecycle_state" "text" DEFAULT 'active'::"text" NOT NULL,
    "editorial_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "merged_into_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "resource_registry_check" CHECK ((("lifecycle_state" = 'merged'::"text") = ("merged_into_id" IS NOT NULL))),
    CONSTRAINT "resource_registry_check1" CHECK ((("merged_into_id" IS NULL) OR ("merged_into_id" <> "id"))),
    CONSTRAINT "resource_registry_editorial_status_check" CHECK (("editorial_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'hidden'::"text"]))),
    CONSTRAINT "resource_registry_lifecycle_state_check" CHECK (("lifecycle_state" = ANY (ARRAY['active'::"text", 'merged'::"text", 'retired'::"text"])))
);


ALTER TABLE "public"."resource_registry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resource_source_aliases" (
    "id" bigint NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_native_id" "text" NOT NULL,
    "source_url" "text",
    "source_fingerprint" "text",
    "provenance" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "resource_source_aliases_source_type_check" CHECK (("source_type" = ANY (ARRAY['curated_bundle'::"text", 'tavily_resource'::"text", 'manual'::"text", 'import'::"text"])))
);


ALTER TABLE "public"."resource_source_aliases" OWNER TO "postgres";


ALTER TABLE "public"."resource_source_aliases" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."resource_source_aliases_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."resource_submission_attachment_scan_decisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "attachment_id" "uuid" NOT NULL,
    "decision" "text" NOT NULL,
    "actor_type" "text" NOT NULL,
    "actor_id" "uuid",
    "scan_engine" "text" NOT NULL,
    "scan_reference" "text",
    "decision_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "resource_submission_attachment_scan_decisions_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['administrator'::"text", 'scanner_service'::"text"]))),
    CONSTRAINT "resource_submission_attachment_scan_decisions_check" CHECK ((("actor_type" <> 'administrator'::"text") OR ("actor_id" IS NOT NULL))),
    CONSTRAINT "resource_submission_attachment_scan_decisions_check1" CHECK ((("decision" <> 'clean'::"text") OR (("actor_type" = 'scanner_service'::"text") AND ("scan_reference" IS NOT NULL) AND ("btrim"("scan_reference") <> ''::"text")))),
    CONSTRAINT "resource_submission_attachment_scan_decisions_decision_check" CHECK (("decision" = ANY (ARRAY['clean'::"text", 'malicious'::"text", 'failed'::"text"]))),
    CONSTRAINT "resource_submission_attachment_scan_decisions_scan_engine_check" CHECK (("btrim"("scan_engine") <> ''::"text"))
);


ALTER TABLE "public"."resource_submission_attachment_scan_decisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resource_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "city" "text",
    "category" "text",
    "description" "text",
    "phone" "text",
    "website" "text",
    "notes" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "note" "text",
    "resource_name" "text"
);


ALTER TABLE "public"."resource_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shelter_candidate_reconciliation_audit" (
    "id" bigint NOT NULL,
    "reconciliation_id" bigint NOT NULL,
    "previous_decision" "text",
    "new_decision" "text" NOT NULL,
    "previous_version" integer,
    "new_version" integer NOT NULL,
    "classification_fingerprint" "text" NOT NULL,
    "decision_note" "text" DEFAULT ''::"text" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shelter_candidate_reconciliation_audit" OWNER TO "postgres";


ALTER TABLE "public"."shelter_candidate_reconciliation_audit" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."shelter_candidate_reconciliation_audit_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."shelter_candidate_reconciliations" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."shelter_candidate_reconciliations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."shelter_candidate_research_claims" (
    "id" bigint NOT NULL,
    "candidate_id" bigint NOT NULL,
    "recommendation" "text" NOT NULL,
    "proposed_value" "jsonb",
    "current_value" "jsonb",
    "confidence" "text" NOT NULL,
    "reason_codes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "research_version" "text" NOT NULL,
    "claim_fingerprint" "text" NOT NULL,
    "research_summary" "text",
    "last_retrieved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shelter_candidate_research_claims_claim_fingerprint_check" CHECK (("claim_fingerprint" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "shelter_candidate_research_claims_confidence_check" CHECK (("confidence" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text", 'unknown'::"text"]))),
    CONSTRAINT "shelter_candidate_research_claims_reason_codes_check" CHECK (("jsonb_typeof"("reason_codes") = 'array'::"text")),
    CONSTRAINT "shelter_candidate_research_claims_recommendation_check" CHECK (("recommendation" = ANY (ARRAY['ready_to_approve'::"text", 'brief_review'::"text", 'possible_duplicate'::"text", 'safety_sensitive_ready'::"text", 'needs_research'::"text", 'reject_obsolete'::"text"])))
);


ALTER TABLE "public"."shelter_candidate_research_claims" OWNER TO "postgres";


ALTER TABLE "public"."shelter_candidate_research_claims" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."shelter_candidate_research_claims_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."shelter_candidate_research_evidence" (
    "id" bigint NOT NULL,
    "claim_id" bigint NOT NULL,
    "source_url" "text" NOT NULL,
    "source_title" "text",
    "source_type" "text" NOT NULL,
    "source_authority" integer NOT NULL,
    "retrieved_at" timestamp with time zone NOT NULL,
    "extraction_method" "text" NOT NULL,
    "extracted_value" "jsonb",
    "evidence_fingerprint" "text" NOT NULL,
    "stale" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shelter_candidate_research_evidence_evidence_fingerprint_check" CHECK (("evidence_fingerprint" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "shelter_candidate_research_evidence_source_authority_check" CHECK ((("source_authority" >= 0) AND ("source_authority" <= 100))),
    CONSTRAINT "shelter_candidate_research_evidence_source_url_check" CHECK (("source_url" ~ '^https://'::"text"))
);


ALTER TABLE "public"."shelter_candidate_research_evidence" OWNER TO "postgres";


ALTER TABLE "public"."shelter_candidate_research_evidence" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."shelter_candidate_research_evidence_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."site_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text",
    "query" "text",
    "city" "text",
    "resource_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "miller_theme" "text",
    "session_id" "text",
    "conversation_turn" integer,
    "inferred_categories" "text"[],
    "result_count" integer,
    "selected_resource" "text",
    "response_time_ms" integer,
    "memory_used" boolean DEFAULT false
);


ALTER TABLE "public"."site_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tavily_resources" (
    "id" bigint NOT NULL,
    "name" "text",
    "organization" "text",
    "description" "text",
    "website" "text",
    "city" "text",
    "category" "text",
    "service_type" "text",
    "source" "text",
    "approved" boolean DEFAULT false,
    "original_query" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "quality_score" integer DEFAULT 40,
    "hidden" boolean DEFAULT false
);


ALTER TABLE "public"."tavily_resources" OWNER TO "postgres";


ALTER TABLE "public"."tavily_resources" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."tavily_resources_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."trusted_master_bootstrap_run_items" (
    "run_id" "uuid" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "source_record_id" "uuid" NOT NULL,
    "claim_id" "uuid",
    "outcome" "text" NOT NULL,
    "failure_code" "text",
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "committed_at" timestamp with time zone,
    CONSTRAINT "trusted_master_bootstrap_run_items_outcome_check" CHECK (("outcome" = ANY (ARRAY['reserved'::"text", 'created'::"text", 'idempotent'::"text", 'failed'::"text", 'refused'::"text"])))
);


ALTER TABLE "public"."trusted_master_bootstrap_run_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trusted_master_resource_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_native_id" "text" NOT NULL,
    "source_class" "text" NOT NULL,
    "source_version" "text" NOT NULL,
    "source_record_hash" "text" NOT NULL,
    "original_address" "text" NOT NULL,
    "normalized_address" "text" NOT NULL,
    "municipality" "text" NOT NULL,
    "province" "text" DEFAULT 'BC'::"text" NOT NULL,
    "public_service_location" boolean DEFAULT true NOT NULL,
    "physical_address" boolean NOT NULL,
    "source_url" "text",
    "source_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trusted_master_resource_records_province_check" CHECK (("upper"("province") = 'BC'::"text")),
    CONSTRAINT "trusted_master_resource_records_source_class_check" CHECK (("source_class" = 'trusted_curated_master_v1'::"text")),
    CONSTRAINT "trusted_master_resource_records_source_record_hash_check" CHECK (("source_record_hash" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "trusted_master_resource_records_source_type_check" CHECK (("source_type" = 'curated_bundle'::"text")),
    CONSTRAINT "trusted_master_resource_records_source_url_check" CHECK ((("source_url" IS NULL) OR ("source_url" ~ '^https://'::"text")))
);


ALTER TABLE "public"."trusted_master_resource_records" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_resource_reviews"
    ADD CONSTRAINT "ai_resource_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."authoritative_location_corrections"
    ADD CONSTRAINT "authoritative_location_correc_resource_id_correction_policy_key" UNIQUE ("resource_id", "correction_policy");



ALTER TABLE ONLY "public"."authoritative_location_corrections"
    ADD CONSTRAINT "authoritative_location_corrections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."canonical_authoritative_address_corrections"
    ADD CONSTRAINT "canonical_authoritative_addre_resource_id_prior_claim_id_cu_key" UNIQUE ("resource_id", "prior_claim_id", "current_claim_id");



ALTER TABLE ONLY "public"."canonical_authoritative_address_corrections"
    ADD CONSTRAINT "canonical_authoritative_address_corrections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."canonical_authoritative_evidence_bindings"
    ADD CONSTRAINT "canonical_authoritative_evidenc_target_claim_id_evidence_id_key" UNIQUE ("target_claim_id", "evidence_id");



ALTER TABLE ONLY "public"."canonical_authoritative_evidence_bindings"
    ADD CONSTRAINT "canonical_authoritative_evidence_bindings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."canonical_authoritative_research_run_items"
    ADD CONSTRAINT "canonical_authoritative_research_run_items_pkey" PRIMARY KEY ("run_id", "resource_id");



ALTER TABLE ONLY "public"."canonical_authoritative_research_runs"
    ADD CONSTRAINT "canonical_authoritative_research_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."curated_list_document_revisions"
    ADD CONSTRAINT "curated_list_document_revisions_list_id_sha256_key" UNIQUE ("list_id", "sha256");



ALTER TABLE ONLY "public"."curated_list_document_revisions"
    ADD CONSTRAINT "curated_list_document_revisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."curated_list_document_revisions"
    ADD CONSTRAINT "curated_list_document_revisions_storage_path_key" UNIQUE ("storage_path");



ALTER TABLE ONLY "public"."curated_list_item_sections"
    ADD CONSTRAINT "curated_list_item_sections_pkey" PRIMARY KEY ("item_id", "section_id");



ALTER TABLE ONLY "public"."curated_list_items"
    ADD CONSTRAINT "curated_list_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."curated_list_sections"
    ADD CONSTRAINT "curated_list_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."curated_lists"
    ADD CONSTRAINT "curated_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."curated_lists"
    ADD CONSTRAINT "curated_lists_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."geocode_cache"
    ADD CONSTRAINT "geocode_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."geocode_cache"
    ADD CONSTRAINT "geocode_cache_provider_query_hash_key" UNIQUE ("provider", "query_hash");



ALTER TABLE ONLY "public"."geocode_runs"
    ADD CONSTRAINT "geocode_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."highgate_authoritative_location_reference"
    ADD CONSTRAINT "highgate_authoritative_location_reference_pkey" PRIMARY KEY ("resource_id");



ALTER TABLE ONLY "public"."list_import_batches"
    ADD CONSTRAINT "list_import_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."list_import_batches"
    ADD CONSTRAINT "list_import_batches_source_sha256_parser_version_key" UNIQUE ("source_sha256", "parser_version");



ALTER TABLE ONLY "public"."list_import_items"
    ADD CONSTRAINT "list_import_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_qc_review_audit"
    ADD CONSTRAINT "location_qc_review_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_qc_review_snapshots"
    ADD CONSTRAINT "location_qc_review_snapshots_canonical_resource_id_qc_versi_key" UNIQUE ("canonical_resource_id", "qc_version");



ALTER TABLE ONLY "public"."location_qc_review_snapshots"
    ADD CONSTRAINT "location_qc_review_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_qc_reviews"
    ADD CONSTRAINT "location_qc_reviews_pkey" PRIMARY KEY ("canonical_resource_id");



ALTER TABLE ONLY "public"."location_qc_supersessions"
    ADD CONSTRAINT "location_qc_supersessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_qc_supersessions"
    ADD CONSTRAINT "location_qc_supersessions_resource_id_correction_id_key" UNIQUE ("resource_id", "correction_id");



ALTER TABLE ONLY "public"."map_auto_publication_decisions"
    ADD CONSTRAINT "map_auto_publication_decision_resource_id_qc_version_occupa_key" UNIQUE ("resource_id", "qc_version", "occupancy_claim_id", "policy_version");



ALTER TABLE ONLY "public"."map_auto_publication_decisions"
    ADD CONSTRAINT "map_auto_publication_decisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."map_auto_publication_execution_provenance"
    ADD CONSTRAINT "map_auto_publication_execution_provenanc_run_id_resource_id_key" UNIQUE ("run_id", "resource_id");



ALTER TABLE ONLY "public"."map_auto_publication_execution_provenance"
    ADD CONSTRAINT "map_auto_publication_execution_provenance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."map_auto_publication_runs"
    ADD CONSTRAINT "map_auto_publication_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_attention_directive_events"
    ADD CONSTRAINT "miller_attention_directive_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_attention_directives"
    ADD CONSTRAINT "miller_attention_directives_directive_key_key" UNIQUE ("directive_key");



ALTER TABLE ONLY "public"."miller_attention_directives"
    ADD CONSTRAINT "miller_attention_directives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_attention_signals"
    ADD CONSTRAINT "miller_attention_signals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_attention_signals"
    ADD CONSTRAINT "miller_attention_signals_signal_fingerprint_key" UNIQUE ("signal_fingerprint");



ALTER TABLE ONLY "public"."miller_attention_topic_events"
    ADD CONSTRAINT "miller_attention_topic_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_attention_topics"
    ADD CONSTRAINT "miller_attention_topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_attention_topics"
    ADD CONSTRAINT "miller_attention_topics_topic_key_key" UNIQUE ("topic_key");



ALTER TABLE ONLY "public"."miller_automation_controls"
    ADD CONSTRAINT "miller_automation_controls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_automation_scheduler_runs"
    ADD CONSTRAINT "miller_automation_scheduler_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_canonical_field_corrections"
    ADD CONSTRAINT "miller_canonical_field_corrections_pkey" PRIMARY KEY ("correction_id");



ALTER TABLE ONLY "public"."miller_capability_gaps"
    ADD CONSTRAINT "miller_capability_gaps_gap_fingerprint_key" UNIQUE ("gap_fingerprint");



ALTER TABLE ONLY "public"."miller_capability_gaps"
    ADD CONSTRAINT "miller_capability_gaps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_coverage_hypotheses"
    ADD CONSTRAINT "miller_coverage_hypotheses_hypothesis_key_key" UNIQUE ("hypothesis_key");



ALTER TABLE ONLY "public"."miller_coverage_hypotheses"
    ADD CONSTRAINT "miller_coverage_hypotheses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_curiosity_investigation_results"
    ADD CONSTRAINT "miller_curiosity_investigation_results_pkey" PRIMARY KEY ("investigation_id", "stable_result_id");



ALTER TABLE ONLY "public"."miller_curiosity_investigations"
    ADD CONSTRAINT "miller_curiosity_investigations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_external_security_observations"
    ADD CONSTRAINT "miller_external_security_observ_observer_id_observation_key_key" UNIQUE ("observer_id", "observation_key");



ALTER TABLE ONLY "public"."miller_external_security_observations"
    ADD CONSTRAINT "miller_external_security_observations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_growth_opportunities"
    ADD CONSTRAINT "miller_growth_opportunities_opportunity_fingerprint_key" UNIQUE ("opportunity_fingerprint");



ALTER TABLE ONLY "public"."miller_growth_opportunities"
    ADD CONSTRAINT "miller_growth_opportunities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_insight_events"
    ADD CONSTRAINT "miller_insight_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_insights"
    ADD CONSTRAINT "miller_insights_insight_fingerprint_key" UNIQUE ("insight_fingerprint");



ALTER TABLE ONLY "public"."miller_insights"
    ADD CONSTRAINT "miller_insights_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_learning_records"
    ADD CONSTRAINT "miller_learning_records_lesson_fingerprint_key" UNIQUE ("lesson_fingerprint");



ALTER TABLE ONLY "public"."miller_learning_records"
    ADD CONSTRAINT "miller_learning_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_maintenance_cycle_items"
    ADD CONSTRAINT "miller_maintenance_cycle_items_pkey" PRIMARY KEY ("cycle_id", "task_id");



ALTER TABLE ONLY "public"."miller_maintenance_cycle_journal"
    ADD CONSTRAINT "miller_maintenance_cycle_journal_cycle_id_key" UNIQUE ("cycle_id");



ALTER TABLE ONLY "public"."miller_maintenance_cycle_journal"
    ADD CONSTRAINT "miller_maintenance_cycle_journal_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_maintenance_cycles"
    ADD CONSTRAINT "miller_maintenance_cycles_cycle_key_key" UNIQUE ("cycle_key");



ALTER TABLE ONLY "public"."miller_maintenance_cycles"
    ADD CONSTRAINT "miller_maintenance_cycles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_maintenance_outcomes"
    ADD CONSTRAINT "miller_maintenance_outcomes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_maintenance_scheduler_config"
    ADD CONSTRAINT "miller_maintenance_scheduler_config_pkey" PRIMARY KEY ("singleton");



ALTER TABLE ONLY "public"."miller_need_observation_buckets"
    ADD CONSTRAINT "miller_need_observation_buckets_pkey" PRIMARY KEY ("bucket_key");



ALTER TABLE ONLY "public"."miller_project_binding_v1"
    ADD CONSTRAINT "miller_project_binding_v1_pkey" PRIMARY KEY ("binding_key");



ALTER TABLE ONLY "public"."miller_project_binding_v1"
    ADD CONSTRAINT "miller_project_binding_v1_project_ref_key" UNIQUE ("project_ref");



ALTER TABLE ONLY "public"."miller_quiet_maintenance_actions"
    ADD CONSTRAINT "miller_quiet_maintenance_actions_action_key_key" UNIQUE ("action_key");



ALTER TABLE ONLY "public"."miller_quiet_maintenance_actions"
    ADD CONSTRAINT "miller_quiet_maintenance_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_quiet_maintenance_runs"
    ADD CONSTRAINT "miller_quiet_maintenance_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_quiet_maintenance_runs"
    ADD CONSTRAINT "miller_quiet_maintenance_runs_request_key_key" UNIQUE ("request_key");



ALTER TABLE ONLY "public"."miller_reflection_acknowledgements"
    ADD CONSTRAINT "miller_reflection_acknowledgements_pkey" PRIMARY KEY ("reflection_id", "actor_id");



ALTER TABLE ONLY "public"."miller_reflections"
    ADD CONSTRAINT "miller_reflections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_reflections"
    ADD CONSTRAINT "miller_reflections_reflection_key_key" UNIQUE ("reflection_key");



ALTER TABLE ONLY "public"."miller_resource_quality_detail_v1"
    ADD CONSTRAINT "miller_resource_quality_detail_v1_pkey" PRIMARY KEY ("resource_id");



ALTER TABLE ONLY "public"."miller_resource_quality_reader_authorization_v1"
    ADD CONSTRAINT "miller_resource_quality_reader_authorization_v1_pkey" PRIMARY KEY ("authorization_key");



ALTER TABLE ONLY "public"."miller_resource_quality_reader_authorization_v1"
    ADD CONSTRAINT "miller_resource_quality_reader_authorization_v1_reader_id_key" UNIQUE ("reader_id");



ALTER TABLE ONLY "public"."miller_resource_quality_v1"
    ADD CONSTRAINT "miller_resource_quality_v1_pkey" PRIMARY KEY ("resource_id");



ALTER TABLE ONLY "public"."miller_security_capabilities"
    ADD CONSTRAINT "miller_security_capabilities_pkey" PRIMARY KEY ("target_id", "capability_id");



ALTER TABLE ONLY "public"."miller_security_deployment_observations"
    ADD CONSTRAINT "miller_security_deployment_observat_observation_fingerprint_key" UNIQUE ("observation_fingerprint");



ALTER TABLE ONLY "public"."miller_security_deployment_observations"
    ADD CONSTRAINT "miller_security_deployment_observations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_security_finding_events"
    ADD CONSTRAINT "miller_security_finding_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_security_findings"
    ADD CONSTRAINT "miller_security_findings_finding_fingerprint_key" UNIQUE ("finding_fingerprint");



ALTER TABLE ONLY "public"."miller_security_findings"
    ADD CONSTRAINT "miller_security_findings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_security_incident_members"
    ADD CONSTRAINT "miller_security_incident_memb_incident_id_source_kind_sourc_key" UNIQUE ("incident_id", "source_kind", "source_key");



ALTER TABLE ONLY "public"."miller_security_incident_members"
    ADD CONSTRAINT "miller_security_incident_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_security_incidents"
    ADD CONSTRAINT "miller_security_incidents_correlation_key_key" UNIQUE ("correlation_key");



ALTER TABLE ONLY "public"."miller_security_incidents"
    ADD CONSTRAINT "miller_security_incidents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_security_observers"
    ADD CONSTRAINT "miller_security_observers_auth_user_id_key" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "public"."miller_security_observers"
    ADD CONSTRAINT "miller_security_observers_observer_key_key" UNIQUE ("observer_key");



ALTER TABLE ONLY "public"."miller_security_observers"
    ADD CONSTRAINT "miller_security_observers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_security_pulse_runs"
    ADD CONSTRAINT "miller_security_pulse_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_security_pulse_runs"
    ADD CONSTRAINT "miller_security_pulse_runs_run_key_key" UNIQUE ("run_key");



ALTER TABLE ONLY "public"."miller_security_sensor_outcomes"
    ADD CONSTRAINT "miller_security_sensor_outcomes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_security_sensor_outcomes"
    ADD CONSTRAINT "miller_security_sensor_outcomes_run_id_instrument_id_key" UNIQUE ("run_id", "instrument_id");



ALTER TABLE ONLY "public"."miller_sensor_checkpoints"
    ADD CONSTRAINT "miller_sensor_checkpoints_pkey" PRIMARY KEY ("sensor_id");



ALTER TABLE ONLY "public"."miller_sensor_inspections"
    ADD CONSTRAINT "miller_sensor_inspections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_trend_observations"
    ADD CONSTRAINT "miller_trend_observations_observation_fingerprint_key" UNIQUE ("observation_fingerprint");



ALTER TABLE ONLY "public"."miller_trend_observations"
    ADD CONSTRAINT "miller_trend_observations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miller_trend_sensor_run_items"
    ADD CONSTRAINT "miller_trend_sensor_run_items_pkey" PRIMARY KEY ("run_id", "source_id");



ALTER TABLE ONLY "public"."miller_trend_sensor_runs"
    ADD CONSTRAINT "miller_trend_sensor_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planner_task_executions"
    ADD CONSTRAINT "planner_task_executions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planner_task_executions"
    ADD CONSTRAINT "planner_task_executions_task_id_key" UNIQUE ("task_id");



ALTER TABLE ONLY "public"."publication_feed_run_items"
    ADD CONSTRAINT "publication_feed_run_items_pkey" PRIMARY KEY ("run_id", "resource_id");



ALTER TABLE ONLY "public"."publication_feed_runs"
    ADD CONSTRAINT "publication_feed_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_canonical_profile_audit"
    ADD CONSTRAINT "resource_canonical_profile_audit_correction_id_key" UNIQUE ("correction_id");



ALTER TABLE ONLY "public"."resource_canonical_profile_audit"
    ADD CONSTRAINT "resource_canonical_profile_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_canonical_profile"
    ADD CONSTRAINT "resource_canonical_profile_pkey" PRIMARY KEY ("resource_id");



ALTER TABLE ONLY "public"."resource_discovery_candidates"
    ADD CONSTRAINT "resource_discovery_candidates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_discovery_candidates"
    ADD CONSTRAINT "resource_discovery_candidates_source_fingerprint_key" UNIQUE ("source_fingerprint");



ALTER TABLE ONLY "public"."resource_fact_change_audit"
    ADD CONSTRAINT "resource_fact_change_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_fact_claims"
    ADD CONSTRAINT "resource_fact_claims_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_fact_evidence"
    ADD CONSTRAINT "resource_fact_evidence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_geography"
    ADD CONSTRAINT "resource_geography_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_geography"
    ADD CONSTRAINT "resource_geography_resource_id_key" UNIQUE ("resource_id");



ALTER TABLE ONLY "public"."resource_location_audit"
    ADD CONSTRAINT "resource_location_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_locations"
    ADD CONSTRAINT "resource_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_match_candidates"
    ADD CONSTRAINT "resource_match_candidates_left_source_type_left_source_nati_key" UNIQUE ("left_source_type", "left_source_native_id", "right_source_type", "right_source_native_id");



ALTER TABLE ONLY "public"."resource_match_candidates"
    ADD CONSTRAINT "resource_match_candidates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_notes"
    ADD CONSTRAINT "resource_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_registry"
    ADD CONSTRAINT "resource_registry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_source_aliases"
    ADD CONSTRAINT "resource_source_aliases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_source_aliases"
    ADD CONSTRAINT "resource_source_aliases_source_type_source_native_id_key" UNIQUE ("source_type", "source_native_id");



ALTER TABLE ONLY "public"."resource_submission_attachment_scan_decisions"
    ADD CONSTRAINT "resource_submission_attachment_scan_decisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_submission_attachments"
    ADD CONSTRAINT "resource_submission_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_submission_attachments"
    ADD CONSTRAINT "resource_submission_attachments_storage_path_key" UNIQUE ("storage_path");



ALTER TABLE ONLY "public"."resource_submissions"
    ADD CONSTRAINT "resource_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shelter_candidate_reconciliations"
    ADD CONSTRAINT "shelter_candidate_reconciliat_left_candidate_id_right_candi_key" UNIQUE ("left_candidate_id", "right_candidate_id");



ALTER TABLE ONLY "public"."shelter_candidate_reconciliation_audit"
    ADD CONSTRAINT "shelter_candidate_reconciliation_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shelter_candidate_reconciliations"
    ADD CONSTRAINT "shelter_candidate_reconciliations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shelter_candidate_research_claims"
    ADD CONSTRAINT "shelter_candidate_research_claims_claim_fingerprint_key" UNIQUE ("claim_fingerprint");



ALTER TABLE ONLY "public"."shelter_candidate_research_claims"
    ADD CONSTRAINT "shelter_candidate_research_claims_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shelter_candidate_research_evidence"
    ADD CONSTRAINT "shelter_candidate_research_evidence_evidence_fingerprint_key" UNIQUE ("evidence_fingerprint");



ALTER TABLE ONLY "public"."shelter_candidate_research_evidence"
    ADD CONSTRAINT "shelter_candidate_research_evidence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_events"
    ADD CONSTRAINT "site_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tavily_resources"
    ADD CONSTRAINT "tavily_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trusted_master_bootstrap_reconciliations"
    ADD CONSTRAINT "trusted_master_bootstrap_reco_operation_corrective_policy_v_key" UNIQUE ("operation", "corrective_policy_version");



ALTER TABLE ONLY "public"."trusted_master_bootstrap_reconciliations"
    ADD CONSTRAINT "trusted_master_bootstrap_reconciliations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trusted_master_bootstrap_run_items"
    ADD CONSTRAINT "trusted_master_bootstrap_run_items_pkey" PRIMARY KEY ("run_id", "resource_id");



ALTER TABLE ONLY "public"."trusted_master_bootstrap_runs"
    ADD CONSTRAINT "trusted_master_bootstrap_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trusted_master_resource_records"
    ADD CONSTRAINT "trusted_master_resource_recor_source_type_source_native_id__key" UNIQUE ("source_type", "source_native_id", "source_record_hash");



ALTER TABLE ONLY "public"."trusted_master_resource_records"
    ADD CONSTRAINT "trusted_master_resource_records_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "ai_resource_reviews_one_running_idx" ON "public"."ai_resource_reviews" USING "btree" ("resource_id") WHERE ("status" = ANY (ARRAY['queued'::"text", 'running'::"text"]));



CREATE INDEX "ai_resource_reviews_resource_created_idx" ON "public"."ai_resource_reviews" USING "btree" ("resource_id", "created_at" DESC);



CREATE INDEX "ai_resource_reviews_reuse_lookup_idx" ON "public"."ai_resource_reviews" USING "btree" ("resource_id", "review_fingerprint", "model_identifier", "schema_version", "created_at" DESC) WHERE ("status" = 'completed'::"text");



CREATE INDEX "curated_list_document_revisions_list_idx" ON "public"."curated_list_document_revisions" USING "btree" ("list_id", "uploaded_at" DESC);



CREATE INDEX "curated_list_items_list_idx" ON "public"."curated_list_items" USING "btree" ("list_id");



CREATE UNIQUE INDEX "curated_list_items_source_import_unique" ON "public"."curated_list_items" USING "btree" ("source_import_item_id") WHERE ("source_import_item_id" IS NOT NULL);



CREATE INDEX "curated_list_sections_order_idx" ON "public"."curated_list_sections" USING "btree" ("list_id", "display_order");



CREATE UNIQUE INDEX "curated_lists_pdf_sha256_unique" ON "public"."curated_lists" USING "btree" ("pdf_sha256") WHERE (("content_type" = 'pdf_document'::"text") AND ("pdf_sha256" IS NOT NULL));



CREATE INDEX "curated_lists_public_idx" ON "public"."curated_lists" USING "btree" ("status", "display_order");



CREATE UNIQUE INDEX "geocode_runs_success_cache_idx" ON "public"."geocode_runs" USING "btree" ("cache_key") WHERE ("status" = 'success'::"text");



CREATE UNIQUE INDEX "highgate_authoritative_location_reference_one_active_qc" ON "public"."highgate_authoritative_location_reference" USING "btree" ("qc_supersession_enabled") WHERE ("active" AND "qc_supersession_enabled");



CREATE INDEX "list_import_items_review_idx" ON "public"."list_import_items" USING "btree" ("batch_id", "review_status", "display_order");



CREATE INDEX "location_qc_review_audit_resource_idx" ON "public"."location_qc_review_audit" USING "btree" ("canonical_resource_id", "created_at" DESC);



CREATE INDEX "map_auto_publication_decisions_resource_created_idx" ON "public"."map_auto_publication_decisions" USING "btree" ("resource_id", "created_at" DESC);



CREATE INDEX "miller_attention_directives_active_idx" ON "public"."miller_attention_directives" USING "btree" ("status", "expires_at", "topic_key");



CREATE INDEX "miller_attention_signals_topic_observed_idx" ON "public"."miller_attention_signals" USING "btree" ("topic_id", "observed_at" DESC);



CREATE INDEX "miller_attention_topics_state_score_idx" ON "public"."miller_attention_topics" USING "btree" ("state", "current_score" DESC);



CREATE UNIQUE INDEX "miller_automation_scheduler_one_live_idx" ON "public"."miller_automation_scheduler_runs" USING "btree" ((1)) WHERE ("status" = 'running'::"text");



CREATE INDEX "miller_automation_scheduler_recent_idx" ON "public"."miller_automation_scheduler_runs" USING "btree" ("started_at" DESC);



CREATE INDEX "miller_capability_gaps_status_observed_idx" ON "public"."miller_capability_gaps" USING "btree" ("status", "last_observed_at" DESC);



CREATE INDEX "miller_coverage_hypotheses_active_idx" ON "public"."miller_coverage_hypotheses" USING "btree" ("status", "expires_at", "updated_at" DESC);



CREATE INDEX "miller_external_security_observations_target_recent_idx" ON "public"."miller_external_security_observations" USING "btree" ("target_id", "observed_at" DESC);



CREATE INDEX "miller_growth_opportunities_state_priority_idx" ON "public"."miller_growth_opportunities" USING "btree" ("state", "priority" DESC, "last_observed_at" DESC);



CREATE INDEX "miller_insights_active_idx" ON "public"."miller_insights" USING "btree" ("status", "last_seen_at" DESC);



CREATE INDEX "miller_maintenance_cycle_journal_recent_idx" ON "public"."miller_maintenance_cycle_journal" USING "btree" ("started_at" DESC);



CREATE INDEX "miller_maintenance_cycles_recent_idx" ON "public"."miller_maintenance_cycles" USING "btree" ("started_at" DESC);



CREATE UNIQUE INDEX "miller_maintenance_cycles_single_active_idx" ON "public"."miller_maintenance_cycles" USING "btree" ((1)) WHERE ("status" = 'running'::"text");



CREATE INDEX "miller_maintenance_outcomes_cycle_idx" ON "public"."miller_maintenance_outcomes" USING "btree" ("cycle_id", "completed_at" DESC);



CREATE INDEX "miller_need_observation_buckets_active_idx" ON "public"."miller_need_observation_buckets" USING "btree" ("expires_at", "observation_count" DESC);



CREATE INDEX "miller_quiet_maintenance_actions_run_idx" ON "public"."miller_quiet_maintenance_actions" USING "btree" ("run_id", "created_at");



CREATE UNIQUE INDEX "miller_quiet_maintenance_one_running_idx" ON "public"."miller_quiet_maintenance_runs" USING "btree" ("status") WHERE ("status" = 'running'::"text");



CREATE INDEX "miller_security_deployment_observations_recent_idx" ON "public"."miller_security_deployment_observations" USING "btree" ("target_id", "observed_at" DESC);



CREATE INDEX "miller_security_findings_active_idx" ON "public"."miller_security_findings" USING "btree" ("lifecycle", "severity", "last_observed_at" DESC);



CREATE INDEX "miller_security_findings_instrument_lifecycle_idx" ON "public"."miller_security_findings" USING "btree" ("instrument_id", "lifecycle", "last_observed_at" DESC);



CREATE INDEX "miller_security_incidents_active_idx" ON "public"."miller_security_incidents" USING "btree" ("target_id", "state", "severity", "last_observed_at" DESC);



CREATE INDEX "miller_security_pulse_runs_recent_idx" ON "public"."miller_security_pulse_runs" USING "btree" ("started_at" DESC);



CREATE UNIQUE INDEX "miller_security_pulse_runs_single_active_idx" ON "public"."miller_security_pulse_runs" USING "btree" ((1)) WHERE ("status" = 'running'::"text");



CREATE INDEX "miller_security_pulse_runs_target_recent_idx" ON "public"."miller_security_pulse_runs" USING "btree" ("target_id", "started_at" DESC);



CREATE INDEX "miller_security_sensor_outcomes_target_recent_idx" ON "public"."miller_security_sensor_outcomes" USING "btree" ("target_id", "instrument_id", "finished_at" DESC);



CREATE INDEX "miller_sensor_inspections_sensor_started_idx" ON "public"."miller_sensor_inspections" USING "btree" ("sensor_id", "started_at" DESC);



CREATE INDEX "resource_canonical_profile_audit_resource_idx" ON "public"."resource_canonical_profile_audit" USING "btree" ("resource_id", "created_at" DESC);



CREATE INDEX "resource_discovery_filters_idx" ON "public"."resource_discovery_candidates" USING "btree" ("region", "community", "shelter_type", "confidence");



CREATE INDEX "resource_discovery_review_idx" ON "public"."resource_discovery_candidates" USING "btree" ("review_status", "created_at" DESC);



CREATE INDEX "resource_fact_change_audit_resource_idx" ON "public"."resource_fact_change_audit" USING "btree" ("resource_id", "field_name", "created_at" DESC);



CREATE UNIQUE INDEX "resource_fact_claims_fingerprint_unique" ON "public"."resource_fact_claims" USING "btree" ("claim_fingerprint") WHERE ("claim_fingerprint" IS NOT NULL);



CREATE INDEX "resource_fact_claims_queue_idx" ON "public"."resource_fact_claims" USING "btree" ("status", "decision_category", "last_observed_at" DESC);



CREATE INDEX "resource_fact_claims_resource_idx" ON "public"."resource_fact_claims" USING "btree" ("resource_id", "field_name", "created_at" DESC);



CREATE INDEX "resource_fact_claims_review_idx" ON "public"."resource_fact_claims" USING "btree" ("status", "risk", "created_at" DESC);



CREATE INDEX "resource_fact_evidence_claim_idx" ON "public"."resource_fact_evidence" USING "btree" ("claim_id");



CREATE UNIQUE INDEX "resource_fact_evidence_fingerprint_unique" ON "public"."resource_fact_evidence" USING "btree" ("evidence_fingerprint") WHERE ("evidence_fingerprint" IS NOT NULL);



CREATE INDEX "resource_geography_city_idx" ON "public"."resource_geography" USING "btree" ("lower"("city"));



CREATE INDEX "resource_geography_public_coordinates_idx" ON "public"."resource_geography" USING "btree" ("public_map", "latitude", "longitude") WHERE (("latitude" IS NOT NULL) AND ("longitude" IS NOT NULL));



CREATE INDEX "resource_location_audit_location_idx" ON "public"."resource_location_audit" USING "btree" ("location_id", "created_at" DESC);



CREATE INDEX "resource_locations_city_idx" ON "public"."resource_locations" USING "btree" ("lower"("city"));



CREATE INDEX "resource_locations_public_coordinates_idx" ON "public"."resource_locations" USING "btree" ("latitude", "longitude") WHERE ("public_map" AND ("location_type" = 'fixed'::"text") AND ("geocode_status" = 'verified'::"text") AND ("review_status" = 'approved'::"text"));



CREATE INDEX "resource_locations_resource_idx" ON "public"."resource_locations" USING "btree" ("resource_id");



CREATE UNIQUE INDEX "resource_source_alias_fingerprint_idx" ON "public"."resource_source_aliases" USING "btree" ("source_type", "source_fingerprint") WHERE ("source_fingerprint" IS NOT NULL);



CREATE INDEX "resource_source_alias_resource_idx" ON "public"."resource_source_aliases" USING "btree" ("resource_id");



CREATE INDEX "resource_submission_attachment_scan_decisions_attachment_create" ON "public"."resource_submission_attachment_scan_decisions" USING "btree" ("attachment_id", "created_at" DESC);



CREATE INDEX "resource_submission_attachments_status_created_idx" ON "public"."resource_submission_attachments" USING "btree" ("status", "created_at");



CREATE INDEX "resource_submission_attachments_submission_idx" ON "public"."resource_submission_attachments" USING "btree" ("submission_id");



CREATE INDEX "shelter_candidate_reconciliation_pair_idx" ON "public"."shelter_candidate_reconciliations" USING "btree" ("left_candidate_id", "right_candidate_id");



CREATE INDEX "shelter_candidate_research_claims_queue_idx" ON "public"."shelter_candidate_research_claims" USING "btree" ("candidate_id", "recommendation", "last_retrieved_at" DESC);



CREATE INDEX "shelter_candidate_research_evidence_claim_idx" ON "public"."shelter_candidate_research_evidence" USING "btree" ("claim_id", "retrieved_at" DESC);



CREATE UNIQUE INDEX "tavily_resources_unique_website" ON "public"."tavily_resources" USING "btree" ("website") WHERE (("website" IS NOT NULL) AND ("btrim"("website") <> ''::"text"));



CREATE INDEX "trusted_master_bootstrap_run_items_claim_idx" ON "public"."trusted_master_bootstrap_run_items" USING "btree" ("claim_id");



CREATE INDEX "trusted_master_resource_records_active_idx" ON "public"."trusted_master_resource_records" USING "btree" ("resource_id", "active", "recorded_at" DESC);



CREATE OR REPLACE TRIGGER "authoritative_location_corrections_append_only" BEFORE DELETE OR UPDATE ON "public"."authoritative_location_corrections" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_authoritative_location_correction_mutation"();



CREATE OR REPLACE TRIGGER "authoritative_location_corrections_reference_validate" BEFORE INSERT OR UPDATE ON "public"."authoritative_location_corrections" FOR EACH ROW EXECUTE FUNCTION "public"."validate_authoritative_location_correction_reference"();



CREATE OR REPLACE TRIGGER "canonical_authoritative_address_corrections_append_only" BEFORE DELETE OR UPDATE ON "public"."canonical_authoritative_address_corrections" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "canonical_authoritative_evidence_bindings_append_only" BEFORE DELETE OR UPDATE ON "public"."canonical_authoritative_evidence_bindings" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "canonical_authoritative_research_runs_project_binding_v1" BEFORE INSERT OR UPDATE OF "project_ref" ON "public"."canonical_authoritative_research_runs" FOR EACH ROW EXECUTE FUNCTION "public"."validate_miller_project_run_binding_v1"();



CREATE OR REPLACE TRIGGER "highgate_authoritative_location_reference_validate" BEFORE INSERT OR UPDATE ON "public"."highgate_authoritative_location_reference" FOR EACH ROW EXECUTE FUNCTION "public"."validate_highgate_authoritative_location_reference"();



CREATE OR REPLACE TRIGGER "location_qc_audit_append_only" BEFORE DELETE OR UPDATE ON "public"."location_qc_review_audit" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_location_qc_audit_mutation"();



CREATE OR REPLACE TRIGGER "location_qc_supersessions_append_only" BEFORE DELETE OR UPDATE ON "public"."location_qc_supersessions" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_authoritative_location_correction_mutation"();



CREATE OR REPLACE TRIGGER "map_auto_publication_decisions_append_only" BEFORE DELETE OR UPDATE ON "public"."map_auto_publication_decisions" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_map_auto_publication_decision_mutation"();



CREATE OR REPLACE TRIGGER "map_auto_publication_runs_project_binding_v1" BEFORE INSERT OR UPDATE OF "project_ref" ON "public"."map_auto_publication_runs" FOR EACH ROW EXECUTE FUNCTION "public"."validate_miller_project_run_binding_v1"();



CREATE OR REPLACE TRIGGER "miller_attention_directive_events_no_change" BEFORE DELETE OR UPDATE ON "public"."miller_attention_directive_events" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_attention_signals_no_change" BEFORE DELETE OR UPDATE ON "public"."miller_attention_signals" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_attention_topic_events_no_change" BEFORE DELETE OR UPDATE ON "public"."miller_attention_topic_events" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_curiosity_investigation_results_no_change" BEFORE DELETE OR UPDATE ON "public"."miller_curiosity_investigation_results" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_curiosity_investigations_no_delete" BEFORE DELETE ON "public"."miller_curiosity_investigations" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_external_security_observations_no_change" BEFORE DELETE OR UPDATE ON "public"."miller_external_security_observations" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_insight_events_no_change" BEFORE DELETE OR UPDATE ON "public"."miller_insight_events" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_insights_no_delete" BEFORE DELETE ON "public"."miller_insights" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_maintenance_cycle_items_no_change" BEFORE DELETE OR UPDATE ON "public"."miller_maintenance_cycle_items" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_maintenance_cycle_journal_append_only" BEFORE DELETE OR UPDATE ON "public"."miller_maintenance_cycle_journal" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_miller_maintenance_cycle_journal_mutation"();



CREATE OR REPLACE TRIGGER "miller_maintenance_cycles_no_delete" BEFORE DELETE ON "public"."miller_maintenance_cycles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_maintenance_outcomes_append_only" BEFORE DELETE OR UPDATE ON "public"."miller_maintenance_outcomes" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_miller_maintenance_outcome_mutation"();



CREATE OR REPLACE TRIGGER "miller_quiet_maintenance_actions_no_change" BEFORE DELETE OR UPDATE ON "public"."miller_quiet_maintenance_actions" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_quiet_maintenance_runs_no_delete" BEFORE DELETE ON "public"."miller_quiet_maintenance_runs" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_reflections_no_change" BEFORE DELETE OR UPDATE ON "public"."miller_reflections" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_security_deployment_observations_no_change" BEFORE DELETE OR UPDATE ON "public"."miller_security_deployment_observations" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_security_finding_events_no_change" BEFORE DELETE OR UPDATE ON "public"."miller_security_finding_events" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_security_incident_members_no_change" BEFORE DELETE OR UPDATE ON "public"."miller_security_incident_members" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_security_sensor_outcomes_no_change" BEFORE DELETE OR UPDATE ON "public"."miller_security_sensor_outcomes" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_sensor_inspections_no_change" BEFORE DELETE OR UPDATE ON "public"."miller_sensor_inspections" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_trend_observations_no_delete" BEFORE DELETE ON "public"."miller_trend_observations" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_trend_sensor_run_items_no_change" BEFORE DELETE OR UPDATE ON "public"."miller_trend_sensor_run_items" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "miller_trend_sensor_runs_no_delete" BEFORE DELETE ON "public"."miller_trend_sensor_runs" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "planner_task_executions_append_only" BEFORE DELETE ON "public"."planner_task_executions" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "resource_canonical_profile_audit_append_only" BEFORE DELETE OR UPDATE ON "public"."resource_canonical_profile_audit" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_canonical_profile_audit_mutation"();



CREATE OR REPLACE TRIGGER "resource_canonical_profile_enforce" BEFORE INSERT OR UPDATE ON "public"."resource_canonical_profile" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_resource_canonical_profile_v1"();



CREATE OR REPLACE TRIGGER "resource_fact_audit_append_only" BEFORE DELETE OR UPDATE ON "public"."resource_fact_change_audit" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "resource_fact_evidence_append_only" BEFORE DELETE OR UPDATE ON "public"."resource_fact_evidence" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_resource_fact_audit_mutation"();



CREATE OR REPLACE TRIGGER "resource_submission_attachment_quarantine_guard" BEFORE INSERT OR UPDATE OF "status" ON "public"."resource_submission_attachments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_resource_submission_attachment_quarantine"();



CREATE OR REPLACE TRIGGER "shelter_candidate_reconciliation_audit_append_only" BEFORE DELETE OR UPDATE ON "public"."shelter_candidate_reconciliation_audit" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_shelter_candidate_reconciliation_audit_mutation"();



CREATE OR REPLACE TRIGGER "trusted_master_bootstrap_runs_project_binding_v1" BEFORE INSERT OR UPDATE OF "project_ref" ON "public"."trusted_master_bootstrap_runs" FOR EACH ROW EXECUTE FUNCTION "public"."validate_miller_project_run_binding_v1"();



ALTER TABLE ONLY "public"."ai_resource_reviews"
    ADD CONSTRAINT "ai_resource_reviews_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."tavily_resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."authoritative_location_corrections"
    ADD CONSTRAINT "authoritative_location_corrections_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."authoritative_location_corrections"
    ADD CONSTRAINT "authoritative_location_corrections_legacy_source_record_id_fkey" FOREIGN KEY ("legacy_source_record_id") REFERENCES "public"."trusted_master_resource_records"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."authoritative_location_corrections"
    ADD CONSTRAINT "authoritative_location_corrections_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."canonical_authoritative_address_corrections"
    ADD CONSTRAINT "canonical_authoritative_address_correctio_current_claim_id_fkey" FOREIGN KEY ("current_claim_id") REFERENCES "public"."resource_fact_claims"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."canonical_authoritative_address_corrections"
    ADD CONSTRAINT "canonical_authoritative_address_corrections_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."canonical_authoritative_address_corrections"
    ADD CONSTRAINT "canonical_authoritative_address_corrections_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "public"."resource_fact_evidence"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."canonical_authoritative_address_corrections"
    ADD CONSTRAINT "canonical_authoritative_address_corrections_prior_claim_id_fkey" FOREIGN KEY ("prior_claim_id") REFERENCES "public"."resource_fact_claims"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."canonical_authoritative_address_corrections"
    ADD CONSTRAINT "canonical_authoritative_address_corrections_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."canonical_authoritative_evidence_bindings"
    ADD CONSTRAINT "canonical_authoritative_evidence_bindings_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."canonical_authoritative_evidence_bindings"
    ADD CONSTRAINT "canonical_authoritative_evidence_bindings_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "public"."resource_fact_evidence"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."canonical_authoritative_evidence_bindings"
    ADD CONSTRAINT "canonical_authoritative_evidence_bindings_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."canonical_authoritative_evidence_bindings"
    ADD CONSTRAINT "canonical_authoritative_evidence_bindings_source_claim_id_fkey" FOREIGN KEY ("source_claim_id") REFERENCES "public"."resource_fact_claims"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."canonical_authoritative_evidence_bindings"
    ADD CONSTRAINT "canonical_authoritative_evidence_bindings_target_claim_id_fkey" FOREIGN KEY ("target_claim_id") REFERENCES "public"."resource_fact_claims"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."canonical_authoritative_research_run_items"
    ADD CONSTRAINT "canonical_authoritative_research_run_items_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "public"."resource_fact_claims"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."canonical_authoritative_research_run_items"
    ADD CONSTRAINT "canonical_authoritative_research_run_items_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "public"."resource_fact_evidence"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."canonical_authoritative_research_run_items"
    ADD CONSTRAINT "canonical_authoritative_research_run_items_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."canonical_authoritative_research_run_items"
    ADD CONSTRAINT "canonical_authoritative_research_run_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."canonical_authoritative_research_runs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."canonical_authoritative_research_runs"
    ADD CONSTRAINT "canonical_authoritative_research_runs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."curated_list_document_revisions"
    ADD CONSTRAINT "curated_list_document_revisions_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."curated_lists"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."curated_list_document_revisions"
    ADD CONSTRAINT "curated_list_document_revisions_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."curated_list_item_sections"
    ADD CONSTRAINT "curated_list_item_sections_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."curated_list_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."curated_list_item_sections"
    ADD CONSTRAINT "curated_list_item_sections_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "public"."curated_list_sections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."curated_list_items"
    ADD CONSTRAINT "curated_list_items_canonical_resource_id_fkey" FOREIGN KEY ("canonical_resource_id") REFERENCES "public"."resource_registry"("id");



ALTER TABLE ONLY "public"."curated_list_items"
    ADD CONSTRAINT "curated_list_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."curated_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."curated_list_items"
    ADD CONSTRAINT "curated_list_items_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."curated_list_items"
    ADD CONSTRAINT "curated_list_items_source_import_batch_id_fkey" FOREIGN KEY ("source_import_batch_id") REFERENCES "public"."list_import_batches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."curated_list_items"
    ADD CONSTRAINT "curated_list_items_source_import_item_id_fkey" FOREIGN KEY ("source_import_item_id") REFERENCES "public"."list_import_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."curated_list_sections"
    ADD CONSTRAINT "curated_list_sections_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."curated_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."curated_lists"
    ADD CONSTRAINT "curated_lists_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."curated_lists"
    ADD CONSTRAINT "curated_lists_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."highgate_authoritative_location_reference"
    ADD CONSTRAINT "highgate_authoritative_location_reference_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."list_import_batches"
    ADD CONSTRAINT "list_import_batches_bulk_reviewed_by_fkey" FOREIGN KEY ("bulk_reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."list_import_batches"
    ADD CONSTRAINT "list_import_batches_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."curated_lists"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."list_import_batches"
    ADD CONSTRAINT "list_import_batches_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."list_import_items"
    ADD CONSTRAINT "list_import_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."list_import_batches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."list_import_items"
    ADD CONSTRAINT "list_import_items_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."list_import_items"
    ADD CONSTRAINT "list_import_items_selected_canonical_resource_id_fkey" FOREIGN KEY ("selected_canonical_resource_id") REFERENCES "public"."resource_registry"("id");



ALTER TABLE ONLY "public"."location_qc_review_audit"
    ADD CONSTRAINT "location_qc_review_audit_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."location_qc_review_audit"
    ADD CONSTRAINT "location_qc_review_audit_canonical_resource_id_fkey" FOREIGN KEY ("canonical_resource_id") REFERENCES "public"."resource_registry"("id");



ALTER TABLE ONLY "public"."location_qc_review_snapshots"
    ADD CONSTRAINT "location_qc_review_snapshots_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."location_qc_review_snapshots"
    ADD CONSTRAINT "location_qc_review_snapshots_canonical_resource_id_fkey" FOREIGN KEY ("canonical_resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_qc_reviews"
    ADD CONSTRAINT "location_qc_reviews_canonical_resource_id_fkey" FOREIGN KEY ("canonical_resource_id") REFERENCES "public"."resource_registry"("id");



ALTER TABLE ONLY "public"."location_qc_reviews"
    ADD CONSTRAINT "location_qc_reviews_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."location_qc_supersessions"
    ADD CONSTRAINT "location_qc_supersessions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."location_qc_supersessions"
    ADD CONSTRAINT "location_qc_supersessions_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "public"."authoritative_location_corrections"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."location_qc_supersessions"
    ADD CONSTRAINT "location_qc_supersessions_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."map_auto_publication_decisions"
    ADD CONSTRAINT "map_auto_publication_decisions_occupancy_claim_id_fkey" FOREIGN KEY ("occupancy_claim_id") REFERENCES "public"."resource_fact_claims"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."map_auto_publication_decisions"
    ADD CONSTRAINT "map_auto_publication_decisions_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."map_auto_publication_execution_provenance"
    ADD CONSTRAINT "map_auto_publication_execution_proven_geocoder_evidence_id_fkey" FOREIGN KEY ("geocoder_evidence_id") REFERENCES "public"."resource_fact_evidence"("id");



ALTER TABLE ONLY "public"."map_auto_publication_execution_provenance"
    ADD CONSTRAINT "map_auto_publication_execution_provenan_occupancy_claim_id_fkey" FOREIGN KEY ("occupancy_claim_id") REFERENCES "public"."resource_fact_claims"("id");



ALTER TABLE ONLY "public"."map_auto_publication_execution_provenance"
    ADD CONSTRAINT "map_auto_publication_execution_provenance_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."resource_locations"("id");



ALTER TABLE ONLY "public"."map_auto_publication_execution_provenance"
    ADD CONSTRAINT "map_auto_publication_execution_provenance_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id");



ALTER TABLE ONLY "public"."map_auto_publication_execution_provenance"
    ADD CONSTRAINT "map_auto_publication_execution_provenance_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."map_auto_publication_runs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."map_auto_publication_runs"
    ADD CONSTRAINT "map_auto_publication_runs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."miller_attention_directive_events"
    ADD CONSTRAINT "miller_attention_directive_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_attention_directive_events"
    ADD CONSTRAINT "miller_attention_directive_events_directive_id_fkey" FOREIGN KEY ("directive_id") REFERENCES "public"."miller_attention_directives"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_attention_directives"
    ADD CONSTRAINT "miller_attention_directives_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_attention_directives"
    ADD CONSTRAINT "miller_attention_directives_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."miller_attention_topics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_attention_signals"
    ADD CONSTRAINT "miller_attention_signals_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."miller_attention_topics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_attention_topic_events"
    ADD CONSTRAINT "miller_attention_topic_events_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."miller_attention_topics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_attention_topics"
    ADD CONSTRAINT "miller_attention_topics_canonical_resource_id_fkey" FOREIGN KEY ("canonical_resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_canonical_field_corrections"
    ADD CONSTRAINT "miller_canonical_field_corrections_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_curiosity_investigation_results"
    ADD CONSTRAINT "miller_curiosity_investigation_results_investigation_id_fkey" FOREIGN KEY ("investigation_id") REFERENCES "public"."miller_curiosity_investigations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_curiosity_investigations"
    ADD CONSTRAINT "miller_curiosity_investigations_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."miller_curiosity_investigations"
    ADD CONSTRAINT "miller_curiosity_investigations_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."miller_attention_topics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_external_security_observations"
    ADD CONSTRAINT "miller_external_security_observations_observer_id_fkey" FOREIGN KEY ("observer_id") REFERENCES "public"."miller_security_observers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_insight_events"
    ADD CONSTRAINT "miller_insight_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_insight_events"
    ADD CONSTRAINT "miller_insight_events_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "public"."miller_insights"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_insights"
    ADD CONSTRAINT "miller_insights_hypothesis_id_fkey" FOREIGN KEY ("hypothesis_id") REFERENCES "public"."miller_coverage_hypotheses"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_insights"
    ADD CONSTRAINT "miller_insights_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."miller_attention_topics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_maintenance_cycle_items"
    ADD CONSTRAINT "miller_maintenance_cycle_items_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."miller_maintenance_cycles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_maintenance_cycle_items"
    ADD CONSTRAINT "miller_maintenance_cycle_items_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_maintenance_cycle_journal"
    ADD CONSTRAINT "miller_maintenance_cycle_journal_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."miller_maintenance_cycles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_maintenance_cycles"
    ADD CONSTRAINT "miller_maintenance_cycles_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."miller_maintenance_outcomes"
    ADD CONSTRAINT "miller_maintenance_outcomes_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."miller_maintenance_cycles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_quiet_maintenance_actions"
    ADD CONSTRAINT "miller_quiet_maintenance_actions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."miller_quiet_maintenance_runs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_quiet_maintenance_runs"
    ADD CONSTRAINT "miller_quiet_maintenance_runs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_reflection_acknowledgements"
    ADD CONSTRAINT "miller_reflection_acknowledgements_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."miller_reflection_acknowledgements"
    ADD CONSTRAINT "miller_reflection_acknowledgements_reflection_id_fkey" FOREIGN KEY ("reflection_id") REFERENCES "public"."miller_reflections"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_reflections"
    ADD CONSTRAINT "miller_reflections_investigation_id_fkey" FOREIGN KEY ("investigation_id") REFERENCES "public"."miller_curiosity_investigations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_reflections"
    ADD CONSTRAINT "miller_reflections_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."miller_attention_topics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_resource_quality_reader_authorization_v1"
    ADD CONSTRAINT "miller_resource_quality_reader_authorization_v1_reader_id_fkey" FOREIGN KEY ("reader_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_security_finding_events"
    ADD CONSTRAINT "miller_security_finding_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_security_finding_events"
    ADD CONSTRAINT "miller_security_finding_events_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "public"."miller_security_findings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_security_incident_members"
    ADD CONSTRAINT "miller_security_incident_members_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "public"."miller_security_incidents"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_security_observers"
    ADD CONSTRAINT "miller_security_observers_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_security_sensor_outcomes"
    ADD CONSTRAINT "miller_security_sensor_outcomes_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."miller_security_pulse_runs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_sensor_inspections"
    ADD CONSTRAINT "miller_sensor_inspections_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."miller_trend_observations"
    ADD CONSTRAINT "miller_trend_observations_canonical_resource_id_fkey" FOREIGN KEY ("canonical_resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_trend_observations"
    ADD CONSTRAINT "miller_trend_observations_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "public"."miller_trend_observations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_trend_sensor_run_items"
    ADD CONSTRAINT "miller_trend_sensor_run_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."miller_trend_sensor_runs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."miller_trend_sensor_runs"
    ADD CONSTRAINT "miller_trend_sensor_runs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."planner_task_executions"
    ADD CONSTRAINT "planner_task_executions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."planner_task_executions"
    ADD CONSTRAINT "planner_task_executions_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "public"."resource_fact_claims"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."planner_task_executions"
    ADD CONSTRAINT "planner_task_executions_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "public"."resource_fact_evidence"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."planner_task_executions"
    ADD CONSTRAINT "planner_task_executions_research_run_id_fkey" FOREIGN KEY ("research_run_id") REFERENCES "public"."canonical_authoritative_research_runs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."planner_task_executions"
    ADD CONSTRAINT "planner_task_executions_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."publication_feed_run_items"
    ADD CONSTRAINT "publication_feed_run_items_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."publication_feed_run_items"
    ADD CONSTRAINT "publication_feed_run_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."publication_feed_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resource_canonical_profile_audit"
    ADD CONSTRAINT "resource_canonical_profile_audit_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."resource_canonical_profile_audit"
    ADD CONSTRAINT "resource_canonical_profile_audit_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."resource_canonical_profile"
    ADD CONSTRAINT "resource_canonical_profile_canonical_location_id_fkey" FOREIGN KEY ("canonical_location_id") REFERENCES "public"."resource_locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."resource_canonical_profile"
    ADD CONSTRAINT "resource_canonical_profile_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."resource_discovery_candidates"
    ADD CONSTRAINT "resource_discovery_candidates_imported_tavily_resource_id_fkey" FOREIGN KEY ("imported_tavily_resource_id") REFERENCES "public"."tavily_resources"("id");



ALTER TABLE ONLY "public"."resource_discovery_candidates"
    ADD CONSTRAINT "resource_discovery_candidates_matched_resource_id_fkey" FOREIGN KEY ("matched_resource_id") REFERENCES "public"."resource_registry"("id");



ALTER TABLE ONLY "public"."resource_discovery_candidates"
    ADD CONSTRAINT "resource_discovery_candidates_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."resource_fact_change_audit"
    ADD CONSTRAINT "resource_fact_change_audit_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "public"."resource_fact_claims"("id");



ALTER TABLE ONLY "public"."resource_fact_change_audit"
    ADD CONSTRAINT "resource_fact_change_audit_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id");



ALTER TABLE ONLY "public"."resource_fact_claims"
    ADD CONSTRAINT "resource_fact_claims_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resource_fact_evidence"
    ADD CONSTRAINT "resource_fact_evidence_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "public"."resource_fact_claims"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resource_geography"
    ADD CONSTRAINT "resource_geography_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."tavily_resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resource_geography"
    ADD CONSTRAINT "resource_geography_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."resource_location_audit"
    ADD CONSTRAINT "resource_location_audit_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."resource_location_audit"
    ADD CONSTRAINT "resource_location_audit_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."resource_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resource_locations"
    ADD CONSTRAINT "resource_locations_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resource_locations"
    ADD CONSTRAINT "resource_locations_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."resource_locations"
    ADD CONSTRAINT "resource_locations_source_alias_id_fkey" FOREIGN KEY ("source_alias_id") REFERENCES "public"."resource_source_aliases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."resource_match_candidates"
    ADD CONSTRAINT "resource_match_candidates_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."resource_registry"
    ADD CONSTRAINT "resource_registry_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "public"."resource_registry"("id");



ALTER TABLE ONLY "public"."resource_source_aliases"
    ADD CONSTRAINT "resource_source_aliases_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resource_submission_attachment_scan_decisions"
    ADD CONSTRAINT "resource_submission_attachment_scan_decision_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "public"."resource_submission_attachments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resource_submission_attachments"
    ADD CONSTRAINT "resource_submission_attachments_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."resource_submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shelter_candidate_reconciliation_audit"
    ADD CONSTRAINT "shelter_candidate_reconciliation_audit_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."shelter_candidate_reconciliation_audit"
    ADD CONSTRAINT "shelter_candidate_reconciliation_audit_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "public"."shelter_candidate_reconciliations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shelter_candidate_reconciliations"
    ADD CONSTRAINT "shelter_candidate_reconciliations_left_candidate_id_fkey" FOREIGN KEY ("left_candidate_id") REFERENCES "public"."resource_discovery_candidates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shelter_candidate_reconciliations"
    ADD CONSTRAINT "shelter_candidate_reconciliations_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."shelter_candidate_reconciliations"
    ADD CONSTRAINT "shelter_candidate_reconciliations_right_candidate_id_fkey" FOREIGN KEY ("right_candidate_id") REFERENCES "public"."resource_discovery_candidates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shelter_candidate_research_claims"
    ADD CONSTRAINT "shelter_candidate_research_claims_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "public"."resource_discovery_candidates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shelter_candidate_research_evidence"
    ADD CONSTRAINT "shelter_candidate_research_evidence_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "public"."shelter_candidate_research_claims"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trusted_master_bootstrap_reconciliations"
    ADD CONSTRAINT "trusted_master_bootstrap_reconciliations_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."trusted_master_bootstrap_run_items"
    ADD CONSTRAINT "trusted_master_bootstrap_run_items_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "public"."resource_fact_claims"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."trusted_master_bootstrap_run_items"
    ADD CONSTRAINT "trusted_master_bootstrap_run_items_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."trusted_master_bootstrap_run_items"
    ADD CONSTRAINT "trusted_master_bootstrap_run_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."trusted_master_bootstrap_runs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."trusted_master_bootstrap_run_items"
    ADD CONSTRAINT "trusted_master_bootstrap_run_items_source_record_id_fkey" FOREIGN KEY ("source_record_id") REFERENCES "public"."trusted_master_resource_records"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."trusted_master_bootstrap_runs"
    ADD CONSTRAINT "trusted_master_bootstrap_runs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."trusted_master_resource_records"
    ADD CONSTRAINT "trusted_master_resource_records_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE CASCADE;



CREATE POLICY "Public can read approved tavily resources" ON "public"."tavily_resources" FOR SELECT TO "authenticated", "anon" USING ((("approved" IS TRUE) AND (COALESCE("hidden", false) IS FALSE)));



CREATE POLICY "Public reads published curated lists" ON "public"."curated_lists" FOR SELECT TO "authenticated", "anon" USING (("status" = 'published'::"text"));



CREATE POLICY "Public reads visible published list sections" ON "public"."curated_list_sections" FOR SELECT TO "authenticated", "anon" USING (("visible" AND (EXISTS ( SELECT 1
   FROM "public"."curated_lists" "l"
  WHERE (("l"."id" = "curated_list_sections"."list_id") AND ("l"."status" = 'published'::"text"))))));



CREATE POLICY "Public reads visible published placements" ON "public"."curated_list_item_sections" FOR SELECT TO "authenticated", "anon" USING (("visible" AND (EXISTS ( SELECT 1
   FROM ("public"."curated_list_items" "i"
     JOIN "public"."curated_lists" "l" ON (("l"."id" = "i"."list_id")))
  WHERE (("i"."id" = "curated_list_item_sections"."item_id") AND "i"."visible" AND ("i"."verification_status" = ANY (ARRAY['verified'::"text", 'externally_verified'::"text", 'imported_from_trusted_source'::"text"])) AND ("l"."status" = 'published'::"text"))))));



CREATE POLICY "Public reads visible reviewed list items" ON "public"."curated_list_items" FOR SELECT TO "authenticated", "anon" USING (("visible" AND ("verification_status" = ANY (ARRAY['verified'::"text", 'externally_verified'::"text", 'imported_from_trusted_source'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."curated_lists" "l"
  WHERE (("l"."id" = "curated_list_items"."list_id") AND ("l"."status" = 'published'::"text"))))));



ALTER TABLE "public"."ai_resource_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "allow public insert" ON "public"."resource_notes" FOR INSERT WITH CHECK (true);



ALTER TABLE "public"."authoritative_location_corrections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."canonical_authoritative_address_corrections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."canonical_authoritative_evidence_bindings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."canonical_authoritative_research_run_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."canonical_authoritative_research_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."curated_list_document_revisions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."curated_list_item_sections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."curated_list_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."curated_list_sections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."curated_lists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."geocode_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."geocode_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."highgate_authoritative_location_reference" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."list_import_batches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."list_import_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."location_qc_review_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."location_qc_review_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."location_qc_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."location_qc_supersessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."map_auto_publication_decisions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."map_auto_publication_execution_provenance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."map_auto_publication_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_attention_directive_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_attention_directives" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_attention_signals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_attention_topic_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_attention_topics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_automation_controls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_automation_scheduler_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_canonical_field_corrections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_capability_gaps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_coverage_hypotheses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_curiosity_investigation_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_curiosity_investigations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_external_security_observations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_growth_opportunities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_insight_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_insights" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_learning_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_maintenance_cycle_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_maintenance_cycle_journal" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_maintenance_cycles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_maintenance_outcomes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_maintenance_scheduler_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_need_observation_buckets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_project_binding_v1" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_quiet_maintenance_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_quiet_maintenance_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_reflection_acknowledgements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_reflections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "miller_resource_quality_detail_reader_select" ON "public"."miller_resource_quality_detail_v1" FOR SELECT TO "authenticated" USING (( SELECT "miller_internal"."is_miller_resource_quality_reader_v1"() AS "is_miller_resource_quality_reader_v1"));



ALTER TABLE "public"."miller_resource_quality_detail_v1" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_resource_quality_reader_authorization_v1" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "miller_resource_quality_reader_select" ON "public"."miller_resource_quality_v1" FOR SELECT TO "authenticated" USING (( SELECT "miller_internal"."is_miller_resource_quality_reader_v1"() AS "is_miller_resource_quality_reader_v1"));



ALTER TABLE "public"."miller_resource_quality_v1" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_security_capabilities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_security_deployment_observations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_security_finding_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_security_findings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_security_incident_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_security_incidents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_security_observers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_security_pulse_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_security_sensor_outcomes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_sensor_checkpoints" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_sensor_inspections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_trend_observations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_trend_sensor_run_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miller_trend_sensor_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."planner_task_executions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."publication_feed_run_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."publication_feed_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_canonical_profile" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_canonical_profile_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_discovery_candidates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_fact_change_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_fact_claims" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_fact_evidence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_geography" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_location_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_match_candidates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_registry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_source_aliases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_submission_attachment_scan_decisions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_submission_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shelter_candidate_reconciliation_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shelter_candidate_reconciliations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shelter_candidate_research_claims" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shelter_candidate_research_evidence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tavily_resources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trusted_master_bootstrap_reconciliations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trusted_master_bootstrap_run_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trusted_master_bootstrap_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trusted_master_resource_records" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "miller_internal" TO "authenticated";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "miller_internal"."is_miller_resource_quality_reader_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "miller_internal"."is_miller_resource_quality_reader_v1"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."apply_highgate_authoritative_location_correction"("p_resource_id" "uuid", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_highgate_authoritative_location_correction"("p_resource_id" "uuid", "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_miller_canonical_field_correction_v1"("p_request" "jsonb", "p_preview" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_miller_canonical_field_correction_v1"("p_request" "jsonb", "p_preview" boolean) TO "service_role";



GRANT ALL ON TABLE "public"."miller_quiet_maintenance_runs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_quiet_maintenance_cycle"("p_run_id" "uuid", "p_plan" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_quiet_maintenance_cycle"("p_run_id" "uuid", "p_plan" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."canonical_authoritative_research_runs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."begin_canonical_authoritative_research_run"("p_run_id" "uuid", "p_authorized_max_attempts" integer, "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."begin_canonical_authoritative_research_run"("p_run_id" "uuid", "p_authorized_max_attempts" integer, "p_actor_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."map_auto_publication_runs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."begin_map_auto_publication_run"("p_run_id" "uuid", "p_authorized_max_successes" integer, "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."begin_map_auto_publication_run"("p_run_id" "uuid", "p_authorized_max_successes" integer, "p_actor_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."planner_task_executions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."begin_planner_task_execution_v1"("p_task_id" "text", "p_resource_id" "uuid", "p_claim_id" "uuid", "p_task_type" "text", "p_actor_id" "uuid", "p_research_run_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."begin_planner_task_execution_v1"("p_task_id" "text", "p_resource_id" "uuid", "p_claim_id" "uuid", "p_task_type" "text", "p_actor_id" "uuid", "p_research_run_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."trusted_master_bootstrap_runs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."begin_trusted_master_occupancy_bootstrap_run"("p_run_id" "uuid", "p_authorized_max_successes" integer, "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."begin_trusted_master_occupancy_bootstrap_run"("p_run_id" "uuid", "p_authorized_max_successes" integer, "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."bind_existing_canonical_authoritative_evidence_v1"("p_run_id" "uuid", "p_resource_id" "uuid", "p_target_claim_id" "uuid", "p_evidence_id" "uuid", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bind_existing_canonical_authoritative_evidence_v1"("p_run_id" "uuid", "p_resource_id" "uuid", "p_target_claim_id" "uuid", "p_evidence_id" "uuid", "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."canonical_authoritative_address_key_v1"("p_value" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."canonical_authoritative_address_key_v1"("p_value" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."canonical_authoritative_evidence_current_v1"("p_claim_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."canonical_authoritative_evidence_current_v1"("p_claim_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."canonical_authoritative_source_authority_v1"("p_url" "text", "p_resource_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."canonical_authoritative_source_authority_v1"("p_url" "text", "p_resource_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."canonical_profile_fingerprint_v1"("p_phone" "text", "p_website" "text", "p_location_id" "uuid", "p_city" "text", "p_province" "text", "p_street" "text", "p_version" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."canonical_profile_fingerprint_v1"("p_phone" "text", "p_website" "text", "p_location_id" "uuid", "p_city" "text", "p_province" "text", "p_street" "text", "p_version" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."canonical_profile_fingerprint_v1"("p_phone" "text", "p_website" "text", "p_location_id" "uuid", "p_city" "text", "p_province" "text", "p_street" "text", "p_version" integer) TO "service_role";



GRANT ALL ON TABLE "public"."publication_feed_run_items" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_publication_feed_item"("p_run_id" "uuid", "p_resource_id" "uuid", "p_lease_token" "uuid", "p_lease_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_publication_feed_item"("p_run_id" "uuid", "p_resource_id" "uuid", "p_lease_token" "uuid", "p_lease_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."classify_map_auto_publish_v1"("p_resource_id" "uuid", "p_expected_qc_version" integer, "p_occupancy_claim_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."classify_map_auto_publish_v1"("p_resource_id" "uuid", "p_expected_qc_version" integer, "p_occupancy_claim_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_expired_human_need_observations"("p_now" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_expired_human_need_observations"("p_now" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_canonical_authoritative_research_run"("p_run_id" "uuid", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_canonical_authoritative_research_run"("p_run_id" "uuid", "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_trusted_master_occupancy_bootstrap_run"("p_run_id" "uuid", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_trusted_master_occupancy_bootstrap_run"("p_run_id" "uuid", "p_actor_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."location_qc_reviews" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_location_qc_machine_review"("p_canonical_resource_id" "uuid", "p_policy_version" "text", "p_classification_fingerprint" "text", "p_review_snapshot" "jsonb", "p_reason" "text", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_location_qc_machine_review"("p_canonical_resource_id" "uuid", "p_policy_version" "text", "p_classification_fingerprint" "text", "p_review_snapshot" "jsonb", "p_reason" "text", "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_machine_initial_location_qc_from_evidence"("p_resource_id" "uuid", "p_occupancy_claim_id" "uuid", "p_geocoder_evidence_id" "uuid", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_machine_initial_location_qc_from_evidence"("p_resource_id" "uuid", "p_occupancy_claim_id" "uuid", "p_geocoder_evidence_id" "uuid", "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_occupancy_claim_from_trusted_master_record"("p_resource_id" "uuid", "p_source_record_id" "uuid", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_occupancy_claim_from_trusted_master_record"("p_resource_id" "uuid", "p_source_record_id" "uuid", "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_occupancy_claim_from_trusted_master_run"("p_run_id" "uuid", "p_resource_id" "uuid", "p_source_record_id" "uuid", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_occupancy_claim_from_trusted_master_run"("p_run_id" "uuid", "p_resource_id" "uuid", "p_source_record_id" "uuid", "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."dry_run_map_auto_publish_v1"("p_resource_id" "uuid", "p_expected_qc_version" integer, "p_occupancy_claim_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dry_run_map_auto_publish_v1"("p_resource_id" "uuid", "p_expected_qc_version" integer, "p_occupancy_claim_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_resource_canonical_profile_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_resource_canonical_profile_v1"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_resource_submission_attachment_quarantine"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_resource_submission_attachment_quarantine"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_resource_submission_attachment_quarantine"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fail_quiet_maintenance_cycle"("p_run_id" "uuid", "p_failure_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fail_quiet_maintenance_cycle"("p_run_id" "uuid", "p_failure_code" "text") TO "service_role";



GRANT ALL ON TABLE "public"."canonical_authoritative_research_run_items" TO "service_role";



REVOKE ALL ON FUNCTION "public"."finish_canonical_authoritative_research_item"("p_run_id" "uuid", "p_resource_id" "uuid", "p_outcome" "text", "p_reason_code" "text", "p_claim_id" "uuid", "p_evidence_id" "uuid", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finish_canonical_authoritative_research_item"("p_run_id" "uuid", "p_resource_id" "uuid", "p_outcome" "text", "p_reason_code" "text", "p_claim_id" "uuid", "p_evidence_id" "uuid", "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finish_planner_task_execution_v1"("p_task_id" "text", "p_status" "text", "p_outcome" "text", "p_source_urls" "jsonb", "p_evidence_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finish_planner_task_execution_v1"("p_task_id" "text", "p_status" "text", "p_outcome" "text", "p_source_urls" "jsonb", "p_evidence_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."persist_canonical_authoritative_location_evidence_v1"("p_run_id" "uuid", "p_resource_id" "uuid", "p_source_url" "text", "p_source_reference" "text", "p_source_excerpt" "text", "p_candidate_address" "text", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."persist_canonical_authoritative_location_evidence_v1"("p_run_id" "uuid", "p_resource_id" "uuid", "p_source_url" "text", "p_source_reference" "text", "p_source_excerpt" "text", "p_candidate_address" "text", "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."persist_canonical_bc_geocoder_evidence_v1"("p_run_id" "uuid", "p_resource_id" "uuid", "p_occupancy_claim_id" "uuid", "p_geocoder_package" "jsonb", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."persist_canonical_bc_geocoder_evidence_v1"("p_run_id" "uuid", "p_resource_id" "uuid", "p_occupancy_claim_id" "uuid", "p_geocoder_package" "jsonb", "p_actor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_authoritative_location_correction_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_authoritative_location_correction_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_authoritative_location_correction_mutation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_location_qc_audit_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_location_qc_audit_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_location_qc_audit_mutation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_map_auto_publication_decision_mutation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_map_auto_publication_decision_mutation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_miller_maintenance_cycle_journal_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_miller_maintenance_cycle_journal_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_miller_maintenance_cycle_journal_mutation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_miller_maintenance_outcome_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_miller_maintenance_outcome_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_miller_maintenance_outcome_mutation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_resource_canonical_profile_audit_mutation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_resource_canonical_profile_audit_mutation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_resource_fact_audit_mutation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_resource_fact_audit_mutation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_shelter_candidate_reconciliation_audit_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_shelter_candidate_reconciliation_audit_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_shelter_candidate_reconciliation_audit_mutation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."publish_map_location_v1"("p_resource_id" "uuid", "p_expected_qc_version" integer, "p_occupancy_claim_id" "uuid", "p_geocoder_evidence_id" "uuid", "p_run_id" "uuid", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."publish_map_location_v1"("p_resource_id" "uuid", "p_expected_qc_version" integer, "p_occupancy_claim_id" "uuid", "p_geocoder_evidence_id" "uuid", "p_run_id" "uuid", "p_actor_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."resource_locations" TO "service_role";



REVOKE ALL ON FUNCTION "public"."publish_verified_map_pin"("p_resource_id" "uuid", "p_expected_qc_version" integer, "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."publish_verified_map_pin"("p_resource_id" "uuid", "p_expected_qc_version" integer, "p_actor_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."trusted_master_bootstrap_reconciliations" TO "service_role";



REVOKE ALL ON FUNCTION "public"."reconcile_trusted_master_bootstrap_cap_failure"("p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_trusted_master_bootstrap_cap_failure"("p_actor_id" "uuid") TO "service_role";



GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."miller_external_security_observations" TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_external_security_observation"("p_observer_key" "text", "p_observation_key" "text", "p_observation_type" "text", "p_observed_at" timestamp with time zone, "p_status" "text", "p_evidence_summary" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_external_security_observation"("p_observer_key" "text", "p_observation_key" "text", "p_observation_type" "text", "p_observed_at" timestamp with time zone, "p_status" "text", "p_evidence_summary" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_external_security_observation"("p_observer_key" "text", "p_observation_key" "text", "p_observation_type" "text", "p_observed_at" timestamp with time zone, "p_status" "text", "p_evidence_summary" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."miller_need_observation_buckets" TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_human_need_observation"("p_bucket_key" "text", "p_kind" "text", "p_theme" "text", "p_geography" "text", "p_observed_hour" timestamp with time zone, "p_expires_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_human_need_observation"("p_bucket_key" "text", "p_kind" "text", "p_theme" "text", "p_geography" "text", "p_observed_hour" timestamp with time zone, "p_expires_at" timestamp with time zone) TO "service_role";



GRANT ALL ON TABLE "public"."resource_submission_attachments" TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_resource_submission_attachment_scan_decision"("p_attachment_id" "uuid", "p_decision" "text", "p_actor_type" "text", "p_actor_id" "uuid", "p_scan_engine" "text", "p_scan_reference" "text", "p_decision_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_resource_submission_attachment_scan_decision"("p_attachment_id" "uuid", "p_decision" "text", "p_actor_type" "text", "p_actor_id" "uuid", "p_scan_engine" "text", "p_scan_reference" "text", "p_decision_note" "text") TO "service_role";



GRANT ALL ON TABLE "public"."miller_security_findings" TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_security_finding"("p_fingerprint" "text", "p_type" "text", "p_subsystem" "text", "p_severity" "text", "p_confidence" "text", "p_description" "text", "p_control" "text", "p_result" "text", "p_recommendation" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_security_finding"("p_fingerprint" "text", "p_type" "text", "p_subsystem" "text", "p_severity" "text", "p_confidence" "text", "p_description" "text", "p_control" "text", "p_result" "text", "p_recommendation" "text", "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_security_instrument_finding"("p_instrument_id" "text", "p_fingerprint" "text", "p_type" "text", "p_subsystem" "text", "p_severity" "text", "p_confidence" "text", "p_description" "text", "p_control" "text", "p_result" "text", "p_recommendation" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_security_instrument_finding"("p_instrument_id" "text", "p_fingerprint" "text", "p_type" "text", "p_subsystem" "text", "p_severity" "text", "p_confidence" "text", "p_description" "text", "p_control" "text", "p_result" "text", "p_recommendation" "text", "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_location_qc_evidence"("p_canonical_resource_id" "uuid", "p_policy_version" "text", "p_classification_fingerprint" "text", "p_refreshed_snapshot" "jsonb", "p_reason" "text", "p_expected_version" integer, "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_location_qc_evidence"("p_canonical_resource_id" "uuid", "p_policy_version" "text", "p_classification_fingerprint" "text", "p_refreshed_snapshot" "jsonb", "p_reason" "text", "p_expected_version" integer, "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reserve_canonical_authoritative_research_item"("p_run_id" "uuid", "p_resource_id" "uuid", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserve_canonical_authoritative_research_item"("p_run_id" "uuid", "p_resource_id" "uuid", "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_security_instrument_finding"("p_instrument_id" "text", "p_fingerprint" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_security_instrument_finding"("p_instrument_id" "text", "p_fingerprint" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_location_qc_review_decision"("p_canonical_resource_id" "uuid", "p_policy_version" "text", "p_classification_fingerprint" "text", "p_decision" "text", "p_decision_note" "text", "p_review_snapshot" "jsonb", "p_expected_version" integer, "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_location_qc_review_decision"("p_canonical_resource_id" "uuid", "p_policy_version" "text", "p_classification_fingerprint" "text", "p_decision" "text", "p_decision_note" "text", "p_review_snapshot" "jsonb", "p_expected_version" integer, "p_actor_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."resource_fact_claims" TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_resource_fact_shadow_decision"("p_claim_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_resource_fact_shadow_decision"("p_claim_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_actor_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."shelter_candidate_reconciliations" TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_shelter_candidate_reconciliation"("p_left_candidate_id" bigint, "p_right_candidate_id" bigint, "p_classification_fingerprint" "text", "p_decision" "text", "p_decision_note" "text", "p_expected_version" integer, "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_shelter_candidate_reconciliation"("p_left_candidate_id" bigint, "p_right_candidate_id" bigint, "p_classification_fingerprint" "text", "p_decision" "text", "p_decision_note" "text", "p_expected_version" integer, "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."start_quiet_maintenance_cycle"("p_request_key" "text", "p_trigger_type" "text", "p_mode" "text", "p_actor_id" "uuid", "p_as_of" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_quiet_maintenance_cycle"("p_request_key" "text", "p_trigger_type" "text", "p_mode" "text", "p_actor_id" "uuid", "p_as_of" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."supersede_canonical_authoritative_address_v1"("p_resource_id" "uuid", "p_prior_claim_id" "uuid", "p_current_claim_id" "uuid", "p_evidence_id" "uuid", "p_reason_code" "text", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."supersede_canonical_authoritative_address_v1"("p_resource_id" "uuid", "p_prior_claim_id" "uuid", "p_current_claim_id" "uuid", "p_evidence_id" "uuid", "p_reason_code" "text", "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."supersede_highgate_human_qc_with_machine_initial"("p_resource_id" "uuid", "p_correction_id" "uuid", "p_geocoder_evidence_id" "uuid", "p_expected_human_qc_version" integer, "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."supersede_highgate_human_qc_with_machine_initial"("p_resource_id" "uuid", "p_correction_id" "uuid", "p_geocoder_evidence_id" "uuid", "p_expected_human_qc_version" integer, "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."trusted_bulk_import_curated_list"("p_list_id" "uuid", "p_batch_id" "uuid", "p_admin_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trusted_bulk_import_curated_list"("p_list_id" "uuid", "p_batch_id" "uuid", "p_admin_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_authoritative_location_correction_reference"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_authoritative_location_correction_reference"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_highgate_authoritative_location_reference"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_highgate_authoritative_location_reference"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_miller_project_run_binding_v1"() FROM PUBLIC;



GRANT ALL ON TABLE "public"."ai_resource_reviews" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ai_resource_reviews_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ai_resource_reviews_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ai_resource_reviews_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."authoritative_location_corrections" TO "service_role";



GRANT ALL ON TABLE "public"."canonical_authoritative_address_corrections" TO "service_role";



GRANT ALL ON TABLE "public"."canonical_authoritative_evidence_bindings" TO "service_role";



GRANT ALL ON TABLE "public"."curated_list_document_revisions" TO "service_role";



GRANT ALL ON TABLE "public"."curated_list_item_sections" TO "service_role";
GRANT SELECT ON TABLE "public"."curated_list_item_sections" TO "anon";
GRANT SELECT ON TABLE "public"."curated_list_item_sections" TO "authenticated";



GRANT ALL ON TABLE "public"."curated_list_items" TO "service_role";
GRANT SELECT ON TABLE "public"."curated_list_items" TO "anon";
GRANT SELECT ON TABLE "public"."curated_list_items" TO "authenticated";



GRANT ALL ON TABLE "public"."curated_list_sections" TO "service_role";
GRANT SELECT ON TABLE "public"."curated_list_sections" TO "anon";
GRANT SELECT ON TABLE "public"."curated_list_sections" TO "authenticated";



GRANT ALL ON TABLE "public"."curated_lists" TO "service_role";
GRANT SELECT ON TABLE "public"."curated_lists" TO "anon";
GRANT SELECT ON TABLE "public"."curated_lists" TO "authenticated";



GRANT ALL ON TABLE "public"."geocode_cache" TO "service_role";



GRANT ALL ON SEQUENCE "public"."geocode_cache_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."geocode_cache_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."geocode_cache_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."geocode_runs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."geocode_runs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."geocode_runs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."geocode_runs_id_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."highgate_authoritative_location_reference" TO "service_role";



GRANT ALL ON TABLE "public"."list_import_batches" TO "service_role";



GRANT ALL ON TABLE "public"."list_import_items" TO "service_role";



GRANT ALL ON TABLE "public"."location_qc_review_audit" TO "service_role";



GRANT ALL ON SEQUENCE "public"."location_qc_review_audit_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."location_qc_review_audit_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."location_qc_review_audit_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."location_qc_review_snapshots" TO "service_role";



GRANT ALL ON SEQUENCE "public"."location_qc_review_snapshots_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."location_qc_review_snapshots_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."location_qc_review_snapshots_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."location_qc_supersessions" TO "service_role";



GRANT ALL ON TABLE "public"."map_auto_publication_decisions" TO "service_role";



GRANT ALL ON TABLE "public"."map_auto_publication_execution_provenance" TO "service_role";



GRANT ALL ON TABLE "public"."miller_attention_directive_events" TO "service_role";



GRANT ALL ON TABLE "public"."miller_attention_directives" TO "service_role";



GRANT ALL ON TABLE "public"."miller_attention_signals" TO "service_role";



GRANT ALL ON TABLE "public"."miller_attention_topic_events" TO "service_role";



GRANT ALL ON TABLE "public"."miller_attention_topics" TO "service_role";



GRANT ALL ON TABLE "public"."miller_automation_controls" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."miller_automation_scheduler_runs" TO "service_role";



GRANT ALL ON TABLE "public"."miller_canonical_field_corrections" TO "service_role";



GRANT ALL ON TABLE "public"."miller_capability_gaps" TO "service_role";



GRANT ALL ON TABLE "public"."miller_coverage_hypotheses" TO "service_role";



GRANT ALL ON TABLE "public"."miller_curiosity_investigation_results" TO "service_role";



GRANT ALL ON TABLE "public"."miller_curiosity_investigations" TO "service_role";



GRANT ALL ON TABLE "public"."miller_growth_opportunities" TO "service_role";



GRANT ALL ON TABLE "public"."miller_insight_events" TO "service_role";



GRANT ALL ON TABLE "public"."miller_insights" TO "service_role";



GRANT ALL ON TABLE "public"."miller_learning_records" TO "service_role";



GRANT ALL ON TABLE "public"."miller_maintenance_cycle_items" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."miller_maintenance_cycle_journal" TO "service_role";



GRANT ALL ON TABLE "public"."miller_maintenance_cycles" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."miller_maintenance_outcomes" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."miller_maintenance_scheduler_config" TO "service_role";



GRANT ALL ON TABLE "public"."miller_quiet_maintenance_actions" TO "service_role";



GRANT ALL ON TABLE "public"."miller_reflection_acknowledgements" TO "service_role";



GRANT ALL ON TABLE "public"."miller_reflections" TO "service_role";



GRANT ALL ON TABLE "public"."miller_resource_quality_detail_v1" TO "service_role";
GRANT SELECT ON TABLE "public"."miller_resource_quality_detail_v1" TO "authenticated";



GRANT ALL ON TABLE "public"."miller_resource_quality_v1" TO "service_role";
GRANT SELECT ON TABLE "public"."miller_resource_quality_v1" TO "authenticated";



GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."miller_security_capabilities" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."miller_security_deployment_observations" TO "service_role";



GRANT ALL ON TABLE "public"."miller_security_finding_events" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."miller_security_incident_members" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."miller_security_incidents" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."miller_security_observers" TO "service_role";



GRANT ALL ON TABLE "public"."miller_security_pulse_runs" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."miller_security_sensor_outcomes" TO "service_role";



GRANT ALL ON TABLE "public"."miller_sensor_checkpoints" TO "service_role";



GRANT ALL ON TABLE "public"."miller_sensor_inspections" TO "service_role";



GRANT ALL ON TABLE "public"."miller_trend_observations" TO "service_role";



GRANT ALL ON TABLE "public"."miller_trend_sensor_run_items" TO "service_role";



GRANT ALL ON TABLE "public"."miller_trend_sensor_runs" TO "service_role";



GRANT ALL ON TABLE "public"."publication_feed_runs" TO "service_role";



GRANT ALL ON TABLE "public"."resource_canonical_profile" TO "service_role";



GRANT ALL ON TABLE "public"."resource_canonical_profile_audit" TO "service_role";



GRANT ALL ON SEQUENCE "public"."resource_canonical_profile_audit_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."resource_canonical_profile_audit_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."resource_canonical_profile_audit_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."resource_discovery_candidates" TO "service_role";



GRANT ALL ON SEQUENCE "public"."resource_discovery_candidates_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."resource_discovery_candidates_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."resource_discovery_candidates_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."resource_fact_change_audit" TO "service_role";



GRANT ALL ON SEQUENCE "public"."resource_fact_change_audit_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."resource_fact_change_audit_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."resource_fact_change_audit_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."resource_fact_evidence" TO "service_role";



GRANT ALL ON TABLE "public"."resource_geography" TO "service_role";



GRANT ALL ON SEQUENCE "public"."resource_geography_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."resource_geography_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."resource_geography_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."resource_location_audit" TO "service_role";



GRANT ALL ON SEQUENCE "public"."resource_location_audit_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."resource_location_audit_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."resource_location_audit_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."resource_match_candidates" TO "service_role";



GRANT ALL ON SEQUENCE "public"."resource_match_candidates_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."resource_match_candidates_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."resource_match_candidates_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."resource_notes" TO "anon";
GRANT ALL ON TABLE "public"."resource_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."resource_notes" TO "service_role";



GRANT ALL ON TABLE "public"."resource_registry" TO "service_role";



GRANT ALL ON TABLE "public"."resource_source_aliases" TO "service_role";



GRANT ALL ON SEQUENCE "public"."resource_source_aliases_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."resource_source_aliases_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."resource_source_aliases_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."resource_submission_attachment_scan_decisions" TO "service_role";



GRANT ALL ON TABLE "public"."resource_submissions" TO "anon";
GRANT ALL ON TABLE "public"."resource_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."resource_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."shelter_candidate_reconciliation_audit" TO "service_role";



GRANT ALL ON SEQUENCE "public"."shelter_candidate_reconciliation_audit_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."shelter_candidate_reconciliation_audit_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."shelter_candidate_reconciliation_audit_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."shelter_candidate_reconciliations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."shelter_candidate_reconciliations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."shelter_candidate_reconciliations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."shelter_candidate_research_claims" TO "service_role";



GRANT ALL ON SEQUENCE "public"."shelter_candidate_research_claims_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."shelter_candidate_research_claims_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."shelter_candidate_research_claims_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."shelter_candidate_research_evidence" TO "service_role";



GRANT ALL ON SEQUENCE "public"."shelter_candidate_research_evidence_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."shelter_candidate_research_evidence_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."shelter_candidate_research_evidence_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."site_events" TO "anon";
GRANT ALL ON TABLE "public"."site_events" TO "authenticated";
GRANT ALL ON TABLE "public"."site_events" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tavily_resources" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tavily_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."tavily_resources" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tavily_resources_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tavily_resources_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tavily_resources_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."trusted_master_bootstrap_run_items" TO "service_role";



GRANT ALL ON TABLE "public"."trusted_master_resource_records" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







