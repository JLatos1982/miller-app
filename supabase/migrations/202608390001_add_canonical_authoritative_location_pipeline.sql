begin;

-- Evidence rows are immutable.  A binding is the narrow, auditable way to
-- reuse a same-resource authoritative source without copying or reparenting it.
create table public.canonical_authoritative_evidence_bindings (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resource_registry(id) on delete restrict,
  target_claim_id uuid not null references public.resource_fact_claims(id) on delete restrict,
  evidence_id uuid not null references public.resource_fact_evidence(id) on delete restrict,
  source_claim_id uuid not null references public.resource_fact_claims(id) on delete restrict,
  binding_policy text not null check (binding_policy='canonical_authoritative_evidence_binding_v1'),
  actor_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(target_claim_id,evidence_id)
);
create table public.canonical_authoritative_address_corrections (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resource_registry(id) on delete restrict,
  prior_claim_id uuid not null references public.resource_fact_claims(id) on delete restrict,
  current_claim_id uuid not null references public.resource_fact_claims(id) on delete restrict,
  evidence_id uuid not null references public.resource_fact_evidence(id) on delete restrict,
  correction_policy text not null check (correction_policy='canonical_authoritative_address_correction_v1'),
  reason_code text not null check (reason_code in ('authoritative_current_address','authoritative_move')),
  actor_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(resource_id,prior_claim_id,current_claim_id)
);
alter table public.canonical_authoritative_evidence_bindings enable row level security;
alter table public.canonical_authoritative_address_corrections enable row level security;
revoke all on public.canonical_authoritative_evidence_bindings,public.canonical_authoritative_address_corrections from public,anon,authenticated;
grant select on public.canonical_authoritative_evidence_bindings,public.canonical_authoritative_address_corrections to service_role;
create trigger canonical_authoritative_evidence_bindings_append_only before update or delete on public.canonical_authoritative_evidence_bindings for each row execute function public.prevent_resource_fact_audit_mutation();
create trigger canonical_authoritative_address_corrections_append_only before update or delete on public.canonical_authoritative_address_corrections for each row execute function public.prevent_resource_fact_audit_mutation();

create or replace function public.canonical_authoritative_source_authority_v1(p_url text,p_resource_name text)
returns integer language plpgsql immutable set search_path=public as $$
declare h text:=lower(coalesce(p_url,'')); n text:=regexp_replace(lower(coalesce(p_resource_name,'')),'[^a-z0-9]','','g');
begin
 if h !~ '^https://' then return 0; end if;
 if h ~ 'https://[^/]*(fraserhealth\.ca|vch\.ca|providencehealthcare\.org|phsa\.ca|bcmhsus\.ca|fnha\.ca|interiorhealth\.ca|islandhealth\.ca|northernhealth\.ca)' then return 95; end if;
 if h ~ 'https://[^/]*(gov\.bc\.ca|canada\.ca|gc\.ca)' then return 90; end if;
 if h ~ 'https://[^/]*(vancouver\.ca|surrey\.ca|burnaby\.ca|newwestcity\.ca|richmond\.ca|delta\.ca|coquitlam\.ca|abbotsford\.ca)' then return 85; end if;
 if length(n)>=5 and h like '%'||left(n,least(length(n),12))||'%' then return 90; end if;
 return 0;
end $$;

create or replace function public.canonical_authoritative_address_key_v1(p_value text)
returns text language sql immutable set search_path=public as $$ select lower(regexp_replace(coalesce(p_value,''),'[^a-z0-9]','','g')) $$;

create or replace function public.canonical_authoritative_evidence_current_v1(p_claim_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(
   select 1 from public.resource_fact_evidence e
   where (e.claim_id=p_claim_id or exists(select 1 from public.canonical_authoritative_evidence_bindings b where b.target_claim_id=p_claim_id and b.evidence_id=e.id))
     and e.stale is not true and ((e.source_authority>=85 and e.source_url is not null) or (e.source_type='trusted_master_record' and e.source_record_id is not null and e.source_authority=100))
 ) $$;

create or replace function public.bind_existing_canonical_authoritative_evidence_v1(
 p_run_id uuid,p_resource_id uuid,p_target_claim_id uuid,p_evidence_id uuid,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
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

create or replace function public.persist_canonical_authoritative_location_evidence_v1(
 p_run_id uuid,p_resource_id uuid,p_source_url text,p_source_reference text,p_source_excerpt text,p_candidate_address text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
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
end $$;

create or replace function public.supersede_canonical_authoritative_address_v1(p_resource_id uuid,p_prior_claim_id uuid,p_current_claim_id uuid,p_evidence_id uuid,p_reason_code text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
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

create or replace function public.persist_canonical_bc_geocoder_evidence_v1(p_run_id uuid,p_resource_id uuid,p_occupancy_claim_id uuid,p_geocoder_package jsonb,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.resource_fact_claims; e public.resource_fact_evidence; i public.canonical_authoritative_research_run_items; k text; f text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_resource_id::text,42));
 select * into i from public.canonical_authoritative_research_run_items where run_id=p_run_id and resource_id=p_resource_id for update;
 if not found or i.outcome not in ('reserved','confirmed') then raise exception 'reserved or confirmed canonical research item required'; end if;
 select * into c from public.resource_fact_claims where id=p_occupancy_claim_id and resource_id=p_resource_id and field_name='location_occupancy' and status not in ('superseded','rejected','unknown') for update;
 if not found or not public.canonical_authoritative_evidence_current_v1(p_occupancy_claim_id) then raise exception 'current authoritative occupancy claim required'; end if;
 if coalesce(p_geocoder_package->>'provider','')<>'bc_address_geocoder' or coalesce((p_geocoder_package->>'score')::numeric,0)<>100 or lower(coalesce(p_geocoder_package->>'location_descriptor',''))<>'parcelpoint' or coalesce((p_geocoder_package->>'municipality_match')::boolean,false) is not true or upper(coalesce(p_geocoder_package->>'province',''))<>'BC' or coalesce((p_geocoder_package->>'precision_points')::numeric,0)<95 or coalesce(p_geocoder_package->'coordinates'->>'latitude','') !~ '^-?[0-9]+([.][0-9]+)?$' or coalesce(p_geocoder_package->'coordinates'->>'longitude','') !~ '^-?[0-9]+([.][0-9]+)?$' or (p_geocoder_package->'coordinates'->>'latitude')::double precision not between 48 and 60 or (p_geocoder_package->'coordinates'->>'longitude')::double precision not between -140 and -114 or public.canonical_authoritative_address_key_v1(coalesce(p_geocoder_package->>'standardized_address',p_geocoder_package->>'returned_address'))<>public.canonical_authoritative_address_key_v1(c.proposed_value#>>'{}') then raise exception 'exact matching BC geocoder package required'; end if;
 k:=public.canonical_authoritative_address_key_v1(c.proposed_value#>>'{}'); f:=encode(extensions.digest('canonical_bc_geocoder_v1:'||c.id::text||':'||k||':'||coalesce(p_geocoder_package->>'site_id',''),'sha256'),'hex');
 insert into public.resource_fact_evidence(claim_id,source_type,source_record_id,source_url,extracted_value,extraction_method,retrieved_at,source_authority,independent_key,stale,evidence_fingerprint) values(c.id,'bc_geocoder',null,'https://geocoder.api.gov.bc.ca',p_geocoder_package,'server_validated_exact_bc_geocoder',now(),85,'bc_address_geocoder',false,f) on conflict(evidence_fingerprint) where evidence_fingerprint is not null do nothing;
 select * into e from public.resource_fact_evidence where evidence_fingerprint=f; return jsonb_build_object('outcome','exact_bc_geocoder_persisted','evidence_id',e.id);
end $$;

-- Do not permit a run item to claim another resource's fact/evidence IDs.
create or replace function public.finish_canonical_authoritative_research_item(p_run_id uuid,p_resource_id uuid,p_outcome text,p_reason_code text,p_claim_id uuid,p_evidence_id uuid,p_actor_id uuid)
returns public.canonical_authoritative_research_run_items language plpgsql security definer set search_path=public as $$
declare v public.canonical_authoritative_research_run_items;
begin
 if p_outcome not in ('confirmed','conflict','insufficient','protected','failed') then raise exception 'invalid research outcome'; end if;
 select * into v from public.canonical_authoritative_research_run_items where run_id=p_run_id and resource_id=p_resource_id for update; if not found or v.outcome<>'reserved' then raise exception 'research item is not reserved'; end if;
 if p_claim_id is not null and not exists(select 1 from public.resource_fact_claims where id=p_claim_id and resource_id=p_resource_id) then raise exception 'research claim is not bound to resource'; end if;
 if p_evidence_id is not null and not exists(select 1 from public.resource_fact_evidence e join public.resource_fact_claims c on c.id=e.claim_id where e.id=p_evidence_id and c.resource_id=p_resource_id and (p_claim_id is null or c.id=p_claim_id or exists(select 1 from public.canonical_authoritative_evidence_bindings b where b.target_claim_id=p_claim_id and b.evidence_id=e.id))) then raise exception 'research evidence is not bound to resource claim'; end if;
 update public.canonical_authoritative_research_run_items set outcome=p_outcome,reason_code=left(p_reason_code,120),claim_id=p_claim_id,evidence_id=p_evidence_id,completed_at=now() where run_id=p_run_id and resource_id=p_resource_id returning * into v;
 update public.canonical_authoritative_research_runs set evidence_success_count=evidence_success_count+case when p_outcome='confirmed' then 1 else 0 end,failure_count=failure_count+case when p_outcome='failed' then 1 else 0 end where id=p_run_id; return v;
end $$;

-- The existing machine-QC primitive remains the only QC writer.  This
-- replacement only lets its authoritative-evidence check see an approved,
-- append-only binding as well as directly linked evidence.
create or replace function public.create_machine_initial_location_qc_from_evidence(
  p_resource_id uuid, p_occupancy_claim_id uuid, p_geocoder_evidence_id uuid, p_actor_id uuid
) returns public.location_qc_reviews language plpgsql security definer set search_path=public as $$
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

create or replace function public.classify_map_auto_publish_v1(p_resource_id uuid,p_expected_qc_version integer,p_occupancy_claim_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
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
end $$;

revoke all on function public.canonical_authoritative_source_authority_v1(text,text),public.canonical_authoritative_address_key_v1(text),public.canonical_authoritative_evidence_current_v1(uuid),public.bind_existing_canonical_authoritative_evidence_v1(uuid,uuid,uuid,uuid,uuid),public.persist_canonical_authoritative_location_evidence_v1(uuid,uuid,text,text,text,text,uuid),public.supersede_canonical_authoritative_address_v1(uuid,uuid,uuid,uuid,text,uuid),public.persist_canonical_bc_geocoder_evidence_v1(uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.bind_existing_canonical_authoritative_evidence_v1(uuid,uuid,uuid,uuid,uuid),public.persist_canonical_authoritative_location_evidence_v1(uuid,uuid,text,text,text,text,uuid),public.supersede_canonical_authoritative_address_v1(uuid,uuid,uuid,uuid,text,uuid),public.persist_canonical_bc_geocoder_evidence_v1(uuid,uuid,uuid,jsonb,uuid) to service_role;
commit;
