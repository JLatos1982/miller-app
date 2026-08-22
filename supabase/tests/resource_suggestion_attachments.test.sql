begin;

select plan(22);

select has_table('public', 'resource_submission_attachments', 'attachment metadata table exists');
select col_not_null('public', 'resource_submission_attachments', 'submission_id', 'submission is required');
select col_not_null('public', 'resource_submission_attachments', 'storage_path', 'storage path is required');
select col_not_null('public', 'resource_submission_attachments', 'display_filename', 'display filename is required');
select col_not_null('public', 'resource_submission_attachments', 'byte_size', 'byte size is required');
select col_not_null('public', 'resource_submission_attachments', 'detected_mime_type', 'detected MIME type is required');
select ok(
  exists (
    select 1 from pg_constraint c
    join pg_class child on child.oid = c.conrelid
    join pg_namespace child_schema on child_schema.oid = child.relnamespace
    join pg_class parent on parent.oid = c.confrelid
    join pg_namespace parent_schema on parent_schema.oid = parent.relnamespace
    where c.contype = 'f'
      and child_schema.nspname = 'public'
      and child.relname = 'resource_submission_attachments'
      and parent_schema.nspname = 'public'
      and parent.relname = 'resource_submissions'
      and c.confdeltype = 'c'
  ),
  'attachment submission FK cascades metadata removal when a submission is deleted'
);

insert into public.resource_submissions(id, resource_name, note)
values ('10000000-0000-0000-0000-000000000001', 'Attachment test resource', 'A sufficiently detailed test note.');

insert into public.resource_submission_attachments(
  submission_id, storage_path, display_filename, byte_size, detected_mime_type, content_sha256
) values
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001/first.pdf', 'first.pdf', 12, 'application/pdf', repeat('a', 64)),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001/second.pdf', 'second.pdf', 24, 'application/pdf', repeat('b', 64));

select is(
  (select count(*)::integer from public.resource_submission_attachments where submission_id = '10000000-0000-0000-0000-000000000001'),
  2,
  'a submission can have multiple attachments'
);
select throws_ok(
  $$insert into public.resource_submission_attachments(submission_id, storage_path, display_filename, byte_size, detected_mime_type) values (null, 'invalid/null-submission', 'invalid.pdf', 1, 'application/pdf')$$,
  '23502', null, 'null required submission is rejected'
);
select throws_ok(
  $$insert into public.resource_submission_attachments(submission_id, storage_path, display_filename, byte_size, detected_mime_type) values ('10000000-0000-0000-0000-000000000001', '', 'invalid.pdf', 1, 'application/pdf')$$,
  '23514', null, 'empty storage path is rejected'
);
select throws_ok(
  $$insert into public.resource_submission_attachments(submission_id, storage_path, display_filename, byte_size, detected_mime_type) values ('10000000-0000-0000-0000-000000000001', 'invalid/path', '', 1, 'application/pdf')$$,
  '23514', null, 'empty display filename is rejected'
);
select throws_ok(
  $$insert into public.resource_submission_attachments(submission_id, storage_path, display_filename, byte_size, detected_mime_type) values ('10000000-0000-0000-0000-000000000001', 'invalid/size', 'invalid.pdf', 0, 'application/pdf')$$,
  '23514', null, 'non-positive byte size is rejected'
);
select throws_ok(
  $$insert into public.resource_submission_attachments(submission_id, storage_path, display_filename, byte_size, detected_mime_type, status) values ('10000000-0000-0000-0000-000000000001', 'invalid/status', 'invalid.pdf', 1, 'application/pdf', 'unknown')$$,
  '23514', null, 'unsupported attachment status is rejected'
);
select throws_ok(
  $$insert into public.resource_submission_attachments(submission_id, storage_path, display_filename, byte_size, detected_mime_type, status) values ('10000000-0000-0000-0000-000000000001', 'invalid/deleted', 'invalid.pdf', 1, 'application/pdf', 'deleted')$$,
  '23514', null, 'deleted status requires a deletion timestamp'
);
select throws_ok(
  $$insert into public.resource_submission_attachments(submission_id, storage_path, display_filename, byte_size, detected_mime_type, content_sha256) values ('10000000-0000-0000-0000-000000000001', 'invalid/hash', 'invalid.pdf', 1, 'application/pdf', 'not-a-sha256')$$,
  '23514', null, 'malformed content hash is rejected'
);

select ok(not has_table_privilege('anon', 'public.resource_submission_attachments', 'select,insert,update,delete'), 'anonymous users have no attachment table privileges');
select ok(not has_table_privilege('authenticated', 'public.resource_submission_attachments', 'select,insert,update,delete'), 'ordinary authenticated users have no attachment table privileges');
select ok(has_table_privilege('service_role', 'public.resource_submission_attachments', 'select,insert,update,delete'), 'service role can manage attachment metadata');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.resource_submission_attachments'::regclass),
  'attachment metadata has row level security enabled'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'resource_submission_attachments'),
  0,
  'attachment metadata has no browser-accessible RLS policies'
);
select is(
  (select count(*)::integer from storage.buckets where id = 'resource-suggestion-attachments' and public is false),
  1,
  'attachment storage bucket exists and is private'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ilike '%resource-suggestion-attachments%'
        or coalesce(with_check, '') ilike '%resource-suggestion-attachments%'
      )
  ),
  0,
  'no storage object policy grants direct access to the attachment bucket'
);

select * from finish();
rollback;
