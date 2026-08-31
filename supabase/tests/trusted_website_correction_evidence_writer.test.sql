begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.resource_registry(id,display_name,lifecycle_state,editorial_status) values
  ('00000000-0000-0000-0000-000000007101','First Party Website','active','approved'),
  ('00000000-0000-0000-0000-000000007102','Conflicting Website','active','approved'),
  ('00000000-0000-0000-0000-000000007103','Hidden Website','active','hidden');

select ok(not has_function_privilege('anon','public.persist_miller_trusted_website_correction_evidence_v1(jsonb,boolean)','execute'),'anon cannot write trusted website evidence');
select ok(not has_function_privilege('authenticated','public.persist_miller_trusted_website_correction_evidence_v1(jsonb,boolean)','execute'),'authenticated cannot write trusted website evidence');
select ok(has_function_privilege('service_role','public.persist_miller_trusted_website_correction_evidence_v1(jsonb,boolean)','execute'),'service role alone can invoke fixed writer');
select set_config('role','service_role',true);

select is(
  public.persist_miller_trusted_website_correction_evidence_v1(jsonb_build_object(
    'resource_id','00000000-0000-0000-0000-000000007101','proposed_website','https://first-party.example',
    'source_url','https://first-party.example/contact','source_retrieved_at',now(),
    'source_content_sha256',repeat('a',64),'validation_version','miller-trusted-website-correction-evidence-v1'
  ),true)->>'outcome','preview','valid website evidence has a non-mutating preview'
);
select is((select count(*)::integer from public.resource_fact_evidence where claim_id in (select id from public.resource_fact_claims where resource_id='00000000-0000-0000-0000-000000007101')),0,'preview creates no evidence');
select is(
  public.persist_miller_trusted_website_correction_evidence_v1(jsonb_build_object(
    'resource_id','00000000-0000-0000-0000-000000007101','proposed_website','https://first-party.example',
    'source_url','https://first-party.example/contact','source_retrieved_at',now(),
    'source_content_sha256',repeat('a',64),'validation_version','miller-trusted-website-correction-evidence-v1'
  ),false)->>'outcome','evidence_persisted','valid website evidence persists through fixed writer'
);
select is((select extracted_value->>'field' from public.resource_fact_evidence where evidence_fingerprint=(select evidence_fingerprint from public.resource_fact_evidence order by created_at desc limit 1)),'website','field marker is server-generated');
select is((select extracted_value->>'value' from public.resource_fact_evidence where evidence_fingerprint=(select evidence_fingerprint from public.resource_fact_evidence order by created_at desc limit 1)),'https://first-party.example','value marker is exact canonical website');
select ok((select extracted_value @> jsonb_build_object('authoritative',true,'no_conflict',true,'confidence','high','privacy_safe',true) from public.resource_fact_evidence order by created_at desc limit 1),'all trust markers are database-generated');
select is(
  public.persist_miller_trusted_website_correction_evidence_v1(jsonb_build_object(
    'resource_id','00000000-0000-0000-0000-000000007101','proposed_website','https://first-party.example',
    'source_url','https://first-party.example/contact','source_retrieved_at',now(),
    'source_content_sha256',repeat('a',64),'validation_version','miller-trusted-website-correction-evidence-v1'
  ),false)->>'outcome','evidence_already_persisted','same validated evidence is idempotent'
);

insert into public.resource_fact_claims(id,resource_id,field_name,proposed_value,risk,recommendation,confidence,reason_codes,engine_version,status,claim_fingerprint,decision_category)
values('00000000-0000-0000-0000-000000007121','00000000-0000-0000-0000-000000007102','website','"https://other.example"','low','auto_accept','high',array['fixture'],'fixture','accepted',repeat('b',64),'website');
insert into public.resource_fact_evidence(claim_id,source_type,source_url,extracted_value,extraction_method,retrieved_at,source_authority,independent_key,stale,evidence_fingerprint)
values('00000000-0000-0000-0000-000000007121','first_party','https://other.example',jsonb_build_object('field','website','value','https://other.example','authoritative',true,'no_conflict',true,'confidence','high','privacy_safe',true),'fixture',now(),95,'other.example',false,repeat('c',64));
select throws_ok($$select public.persist_miller_trusted_website_correction_evidence_v1(jsonb_build_object('resource_id','00000000-0000-0000-0000-000000007102','proposed_website','https://conflicting.example','source_url','https://conflicting.example','source_retrieved_at',now(),'source_content_sha256',repeat('d',64),'validation_version','miller-trusted-website-correction-evidence-v1'),true)$$,null,'rejected: conflicting current authoritative website evidence','conflicting current authoritative evidence fails closed');
select throws_ok($$select public.persist_miller_trusted_website_correction_evidence_v1(jsonb_build_object('resource_id','00000000-0000-0000-0000-000000007101','proposed_website','https://first-party.example','source_url','https://first-party.example','source_retrieved_at',now(),'source_content_sha256',repeat('e',64),'validation_version','miller-trusted-website-correction-evidence-v1','authoritative',true),true)$$,null,'rejected: invalid trusted website evidence request','caller cannot supply a trust marker');
select throws_ok($$select public.persist_miller_trusted_website_correction_evidence_v1(jsonb_build_object('resource_id','00000000-0000-0000-0000-000000007103','proposed_website','https://hidden.example','source_url','https://hidden.example','source_retrieved_at',now(),'source_content_sha256',repeat('f',64),'validation_version','miller-trusted-website-correction-evidence-v1'),true)$$,null,'rejected: resource is ineligible','hidden resource is rejected');

select * from finish();
rollback;
