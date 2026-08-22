begin;

select plan(15);

select has_table('public', 'resource_submission_attachment_scan_decisions', 'private attachment scan-decision table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.resource_submission_attachment_scan_decisions'::regclass),
  'scan-decision table has RLS enabled'
);
select ok(not has_table_privilege('anon', 'public.resource_submission_attachment_scan_decisions', 'select,insert,update,delete'), 'anonymous users cannot access scan decisions');
select ok(not has_table_privilege('authenticated', 'public.resource_submission_attachment_scan_decisions', 'select,insert,update,delete'), 'ordinary authenticated users cannot access scan decisions');
select ok(has_table_privilege('service_role', 'public.resource_submission_attachment_scan_decisions', 'select,insert,update,delete'), 'service role can persist scan decisions');
select ok(has_function_privilege('service_role', 'public.record_resource_submission_attachment_scan_decision(uuid,text,text,uuid,text,text,text)', 'execute'), 'service role can record scan decisions');
select ok(not has_function_privilege('anon', 'public.record_resource_submission_attachment_scan_decision(uuid,text,text,uuid,text,text,text)', 'execute'), 'anonymous users cannot record scan decisions');
select ok(not has_function_privilege('authenticated', 'public.record_resource_submission_attachment_scan_decision(uuid,text,text,uuid,text,text,text)', 'execute'), 'ordinary authenticated users cannot record scan decisions');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','attachment-reviewer@example.invalid','','{}','{}',now(),now());
insert into public.resource_submissions(id, resource_name, note)
values ('20000000-0000-0000-0000-000000000002', 'Quarantine test resource', 'A sufficiently detailed test note.');
insert into public.resource_submission_attachments(id, submission_id, storage_path, display_filename, byte_size, detected_mime_type)
values
  ('20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002/pending.pdf', 'pending.pdf', 10, 'application/pdf'),
  ('20000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002/malicious.pdf', 'malicious.pdf', 10, 'application/pdf'),
  ('20000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002/clean.pdf', 'clean.pdf', 10, 'application/pdf');

select throws_ok(
  $$update public.resource_submission_attachments set status = 'available' where id = '20000000-0000-0000-0000-000000000003'$$,
  'P0001', 'attachment cannot be available without a clean scanner-service decision', 'available status is blocked before a scanner decision'
);
select throws_ok(
  $$select public.record_resource_submission_attachment_scan_decision('20000000-0000-0000-0000-000000000003', 'clean', 'administrator', '20000000-0000-0000-0000-000000000001', 'manual review', null, null)$$,
  '22023', 'clean scan decisions require a scanner-service reference', 'administrator cannot manually clear quarantine'
);
select is(
  (public.record_resource_submission_attachment_scan_decision('20000000-0000-0000-0000-000000000004', 'malicious', 'administrator', '20000000-0000-0000-0000-000000000001', 'manual quarantine', null, 'Rejected during quarantine')).status,
  'rejected', 'malicious decision rejects the attachment'
);
select is(
  (public.record_resource_submission_attachment_scan_decision('20000000-0000-0000-0000-000000000003', 'failed', 'administrator', '20000000-0000-0000-0000-000000000001', 'manual quarantine', null, 'Scanner unavailable')).status,
  'pending_scan', 'failed decision leaves the attachment quarantined'
);
select is(
  (public.record_resource_submission_attachment_scan_decision('20000000-0000-0000-0000-000000000005', 'clean', 'scanner_service', null, 'future scanner', 'scan-123', 'Clean result')).status,
  'available', 'only a referenced scanner-service clean decision can clear quarantine'
);
select is((select count(*)::integer from public.resource_submission_attachment_scan_decisions), 3, 'every transition has append-only scan provenance');
select is((select status from public.resource_submission_attachments where id = '20000000-0000-0000-0000-000000000005'), 'available', 'clean attachment status follows its decision');

select * from finish();
rollback;
