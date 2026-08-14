begin;

alter table public.curated_lists
  add column if not exists content_type text not null default 'structured_list',
  add column if not exists pdf_storage_path text,
  add column if not exists pdf_original_filename text,
  add column if not exists public_download_filename text,
  add column if not exists pdf_file_size_bytes bigint,
  add column if not exists pdf_sha256 text,
  add column if not exists pdf_page_count integer;

update public.curated_lists set content_type = 'structured_list' where content_type is null;

alter table public.curated_lists drop constraint if exists curated_lists_content_type_check;
alter table public.curated_lists add constraint curated_lists_content_type_check
  check (content_type in ('structured_list','pdf_document'));

alter table public.curated_lists drop constraint if exists curated_lists_status_check;
alter table public.curated_lists add constraint curated_lists_status_check
  check (status in ('draft','published','unpublished','archived'));

alter table public.curated_lists drop constraint if exists curated_lists_pdf_document_check;
alter table public.curated_lists add constraint curated_lists_pdf_document_check check (
  content_type = 'structured_list' or (
    pdf_storage_path is not null and pdf_original_filename is not null and public_download_filename is not null
    and pdf_file_size_bytes > 0 and pdf_sha256 ~ '^[0-9a-f]{64}$' and pdf_page_count > 0
  )
);

create unique index if not exists curated_lists_pdf_sha256_unique
  on public.curated_lists(pdf_sha256) where content_type = 'pdf_document' and pdf_sha256 is not null;

create table if not exists public.curated_list_document_revisions (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.curated_lists(id) on delete restrict,
  storage_path text not null unique,
  original_filename text not null,
  public_download_filename text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  page_count integer not null check (page_count > 0),
  uploaded_by uuid not null references auth.users(id),
  uploaded_at timestamptz not null default now(),
  replaced_at timestamptz,
  unique (list_id, sha256)
);

create index if not exists curated_list_document_revisions_list_idx
  on public.curated_list_document_revisions(list_id, uploaded_at desc);

alter table public.curated_list_document_revisions enable row level security;
revoke all on public.curated_list_document_revisions from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('curated-list-documents', 'curated-list-documents', false, 12582912, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Intentionally no storage.objects policies: only the service-role API can read or write.
-- Public delivery rechecks curated_lists.status = 'published' on every request.

commit;
