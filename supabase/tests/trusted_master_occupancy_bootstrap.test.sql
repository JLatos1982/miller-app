begin;
create extension if not exists pgtap with schema extensions;
select plan(17);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('00000000-0000-0000-0000-000000003901','00000000-0000-0000-0000-000000000000','authenticated','authenticated','trusted-master@example.invalid','','{}','{}',now(),now());
insert into public.resource_registry(id,display_name,lifecycle_state,editorial_status) values
('00000000-0000-0000-0000-000000003911','Trusted public service','active','approved'),
('00000000-0000-0000-0000-000000003912','Confidential safe home','active','approved'),
('00000000-0000-0000-0000-000000003913','Other service','active','approved');
insert into public.resource_source_aliases(resource_id,source_type,source_native_id) values
('00000000-0000-0000-0000-000000003911','curated_bundle','curated:trusted-one'),
('00000000-0000-0000-0000-000000003912','curated_bundle','curated:trusted-two'),
('00000000-0000-0000-0000-000000003913','curated_bundle','curated:trusted-three');
insert into public.trusted_master_resource_records(id,resource_id,source_type,source_native_id,source_class,source_version,source_record_hash,original_address,normalized_address,municipality,province,public_service_location,physical_address,source_payload) values
('00000000-0000-0000-0000-000000003921','00000000-0000-0000-0000-000000003911','curated_bundle','curated:trusted-one','trusted_curated_master_v1','test',repeat('a',64),'100 Main Street','100 Main Street, Surrey, BC','Surrey','BC',true,true,'{}'),
('00000000-0000-0000-0000-000000003922','00000000-0000-0000-0000-000000003912','curated_bundle','curated:trusted-two','trusted_curated_master_v1','test',repeat('b',64),'200 Secret Road','200 Secret Road, Surrey, BC','Surrey','BC',true,true,'{}'),
('00000000-0000-0000-0000-000000003923','00000000-0000-0000-0000-000000003913','curated_bundle','curated:trusted-three','trusted_curated_master_v1','test',repeat('c',64),'P.O. Box 20','P.O. Box 20, Surrey, BC','Surrey','BC',true,false,'{}');
select ok(has_function_privilege('service_role','public.create_occupancy_claim_from_trusted_master_record(uuid,uuid,uuid)','execute'),'service role can bootstrap trusted master occupancy');
select ok(not has_function_privilege('anon','public.create_occupancy_claim_from_trusted_master_record(uuid,uuid,uuid)','execute'),'anonymous cannot bootstrap');
select ok(not has_function_privilege('authenticated','public.create_occupancy_claim_from_trusted_master_record(uuid,uuid,uuid)','execute'),'ordinary users cannot bootstrap');
select is(public.create_occupancy_claim_from_trusted_master_record('00000000-0000-0000-0000-000000003911','00000000-0000-0000-0000-000000003921','00000000-0000-0000-0000-000000003901')->>'outcome','created','trusted record creates an occupancy claim');
select is((select proposed_value #>> '{}' from public.resource_fact_claims where resource_id='00000000-0000-0000-0000-000000003911'),'100 Main Street, Surrey, BC','claim derives its address from the stored trusted record');
select is((select source_type from public.resource_fact_evidence e join public.resource_fact_claims c on c.id=e.claim_id where c.resource_id='00000000-0000-0000-0000-000000003911'),'trusted_master_record','evidence provenance identifies the trusted master record');
select is((select extracted_value->>'source_class' from public.resource_fact_evidence e join public.resource_fact_claims c on c.id=e.claim_id where c.resource_id='00000000-0000-0000-0000-000000003911'),'trusted_curated_master_v1','evidence retains source classification');
select is(public.create_occupancy_claim_from_trusted_master_record('00000000-0000-0000-0000-000000003911','00000000-0000-0000-0000-000000003921','00000000-0000-0000-0000-000000003901')->>'outcome','idempotent','same record rerun is idempotent');
select is((select count(*)::integer from public.resource_fact_claims where resource_id='00000000-0000-0000-0000-000000003911'),1,'idempotent retry creates one claim');
insert into public.resource_fact_evidence(claim_id,source_type,source_url,extracted_value,extraction_method,retrieved_at,source_authority,independent_key,stale,evidence_fingerprint)
select id,'bc_geocoder','https://geocoder.api.gov.bc.ca','{"standardized_address":"100 Main Street, Surrey, BC","locality":"Surrey","municipality_match":true,"province":"BC","score":100,"precision_points":100,"location_descriptor":"parcelpoint","coordinates":{"latitude":49.1,"longitude":-122.8}}','test',now(),100,'test-geocoder',false,repeat('d',64)
from public.resource_fact_claims where resource_id='00000000-0000-0000-0000-000000003911';
select is((public.create_machine_initial_location_qc_from_evidence('00000000-0000-0000-0000-000000003911',(select id from public.resource_fact_claims where resource_id='00000000-0000-0000-0000-000000003911'),(select id from public.resource_fact_evidence where source_type='bc_geocoder'),'00000000-0000-0000-0000-000000003901')).origin,'machine_initial','trusted occupancy evidence feeds machine initial QC');
select is(public.classify_map_auto_publish_v1('00000000-0000-0000-0000-000000003911',1,(select id from public.resource_fact_claims where resource_id='00000000-0000-0000-0000-000000003911'))->>'decision','auto_publish_eligible','trusted occupancy evidence feeds the dry-run classifier');
select throws_ok($$select public.create_occupancy_claim_from_trusted_master_record('00000000-0000-0000-0000-000000003911','00000000-0000-0000-0000-000000003922','00000000-0000-0000-0000-000000003901')$$,null,'trusted master source record is not eligible for occupancy bootstrap','caller cannot forge a source record for another resource');
select throws_ok($$select public.create_occupancy_claim_from_trusted_master_record('00000000-0000-0000-0000-000000003912','00000000-0000-0000-0000-000000003922','00000000-0000-0000-0000-000000003901')$$,null,'sensitive or protected resource cannot bootstrap a public occupancy claim','sensitive resource is excluded');
select throws_ok($$select public.create_occupancy_claim_from_trusted_master_record('00000000-0000-0000-0000-000000003913','00000000-0000-0000-0000-000000003923','00000000-0000-0000-0000-000000003901')$$,null,'trusted master source record is not eligible for occupancy bootstrap','nonphysical address is excluded');
select is((select count(*)::integer from public.resource_locations),0,'bootstrap creates no locations');
select is((select count(*)::integer from public.resource_locations where public_map),0,'bootstrap never changes public map');
select is((select count(*)::integer from public.resource_fact_change_audit where resource_id='00000000-0000-0000-0000-000000003911'),1,'append-only bootstrap audit is retained');
select * from finish();
rollback;
