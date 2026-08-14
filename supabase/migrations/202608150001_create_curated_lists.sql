begin;

create extension if not exists pgcrypto;

create table if not exists public.curated_lists (
  id uuid primary key default gen_random_uuid(), slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null, short_description text, introduction text, disclaimer text, category text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  source_filename text, source_storage_path text, display_order integer not null default 0,
  last_reviewed_at timestamptz, published_at timestamptz, created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((status = 'published') = (published_at is not null))
);

create table if not exists public.curated_list_sections (
  id uuid primary key default gen_random_uuid(), list_id uuid not null references public.curated_lists(id) on delete cascade,
  title text not null, description text, display_order integer not null default 0, visible boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.list_import_batches (
  id uuid primary key default gen_random_uuid(), list_id uuid references public.curated_lists(id) on delete set null,
  original_filename text not null, source_storage_path text not null, source_sha256 text not null, parser_version text not null,
  parsing_status text not null default 'uploaded' check (parsing_status in ('uploaded','parsing','parsed','failed','committed')),
  heading_count integer not null default 0, entry_count integer not null default 0, parse_summary jsonb not null default '{}'::jsonb,
  error_information text, committed_at timestamptz, uploaded_by uuid not null references auth.users(id), uploaded_at timestamptz not null default now(),
  unique (source_sha256, parser_version)
);

create table if not exists public.list_import_items (
  id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.list_import_batches(id) on delete cascade,
  detected_section text, source_paragraph_start integer, raw_source_text text not null, parsed_name text, parsed_description text,
  parsed_contact jsonb not null default '{}'::jsonb, proposed_matches jsonb not null default '[]'::jsonb,
  match_confidence text not null default 'no_match' check (match_confidence in ('confident','possible','ambiguous','no_match')),
  review_status text not null default 'pending' check (review_status in ('pending','reviewed','needs_correction')),
  validation_warnings jsonb not null default '[]'::jsonb, administrator_corrections jsonb not null default '{}'::jsonb,
  final_disposition text not null default 'undecided' check (final_disposition in ('undecided','canonical_resource','list_only_entry','skip')),
  selected_canonical_resource_id uuid references public.resource_registry(id), reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  display_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.curated_list_items (
  id uuid primary key default gen_random_uuid(), list_id uuid not null references public.curated_lists(id) on delete cascade,
  canonical_resource_id uuid references public.resource_registry(id), item_type text not null check (item_type in ('canonical_resource','list_only_entry')),
  resource_name text not null, description text, cost_information text, eligibility text, geographic_restriction text,
  address text, phone text, email text, website text, contact_notes text, curator_note text,
  visible boolean not null default true, verification_status text not null default 'unverified' check (verification_status in ('unverified','needs_review','verified','expired')),
  last_verified_at timestamptz, source_import_item_id uuid references public.list_import_items(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((item_type = 'canonical_resource') = (canonical_resource_id is not null))
);

create table if not exists public.curated_list_item_sections (
  item_id uuid not null references public.curated_list_items(id) on delete cascade,
  section_id uuid not null references public.curated_list_sections(id) on delete cascade,
  display_order integer not null default 0, visible boolean not null default true,
  primary key (item_id, section_id)
);

create index if not exists curated_lists_public_idx on public.curated_lists(status, display_order);
create index if not exists curated_list_sections_order_idx on public.curated_list_sections(list_id, display_order);
create index if not exists curated_list_items_list_idx on public.curated_list_items(list_id);
create index if not exists list_import_items_review_idx on public.list_import_items(batch_id, review_status, display_order);

alter table public.curated_lists enable row level security;
alter table public.curated_list_sections enable row level security;
alter table public.curated_list_items enable row level security;
alter table public.curated_list_item_sections enable row level security;
alter table public.list_import_batches enable row level security;
alter table public.list_import_items enable row level security;

revoke all on public.curated_lists, public.curated_list_sections, public.curated_list_items, public.curated_list_item_sections, public.list_import_batches, public.list_import_items from anon, authenticated;
grant select on public.curated_lists, public.curated_list_sections, public.curated_list_items, public.curated_list_item_sections to anon, authenticated;

create policy "Public reads published curated lists" on public.curated_lists for select to anon, authenticated using (status = 'published');
create policy "Public reads visible published list sections" on public.curated_list_sections for select to anon, authenticated using (visible and exists (select 1 from public.curated_lists l where l.id = list_id and l.status = 'published'));
create policy "Public reads visible reviewed list items" on public.curated_list_items for select to anon, authenticated using (visible and verification_status = 'verified' and exists (select 1 from public.curated_lists l where l.id = list_id and l.status = 'published'));
create policy "Public reads visible published placements" on public.curated_list_item_sections for select to anon, authenticated using (visible and exists (select 1 from public.curated_list_items i join public.curated_lists l on l.id = i.list_id where i.id = item_id and i.visible and i.verification_status = 'verified' and l.status = 'published'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('curated-list-sources', 'curated-list-sources', false, 8388608, array['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- No storage.objects policy is created. Only the server-side service role may upload
-- or sign private source documents after the allowlisted admin API authorizes a request.

commit;
