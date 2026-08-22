begin;

-- Attachment metadata is deliberately private. Future public submissions will
-- continue to pass through the Express service-role API rather than writing to
-- Supabase Storage or this table directly from a browser.
create table public.resource_submission_attachments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.resource_submissions(id) on delete cascade,
  storage_path text not null unique check (btrim(storage_path) <> ''),
  display_filename text not null check (btrim(display_filename) <> ''),
  byte_size bigint not null check (byte_size > 0),
  detected_mime_type text not null check (btrim(detected_mime_type) <> ''),
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending_scan'
    check (status in ('pending_scan', 'available', 'rejected', 'deleted')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (status = 'deleted' and deleted_at is not null)
    or (status <> 'deleted' and deleted_at is null)
  )
);

create index resource_submission_attachments_submission_idx
  on public.resource_submission_attachments(submission_id);

-- This is the only queue-oriented access pattern planned for the first admin
-- review stage; it avoids adding indexes for future features prematurely.
create index resource_submission_attachments_status_created_idx
  on public.resource_submission_attachments(status, created_at);

alter table public.resource_submission_attachments enable row level security;
revoke all on public.resource_submission_attachments from public, anon, authenticated;
grant all on public.resource_submission_attachments to service_role;

insert into storage.buckets (id, name, public)
values ('resource-suggestion-attachments', 'resource-suggestion-attachments', false)
on conflict (id) do update set public = false;

-- Intentionally no storage.objects policy is created for this bucket. Direct
-- browser upload, list, download, update, and deletion all remain unavailable.

commit;
