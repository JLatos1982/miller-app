begin;

-- Reconstruct the minimum application schema that predates Miller's tracked
-- migrations. This is structural development state only: no production rows,
-- users, sessions, research records, or other application data belong here.
create extension if not exists pgcrypto;

-- Production catalog evidence shows Miller's pre-tracked schema granted the
-- backend role access to application objects created by postgres. Newer local
-- Supabase defaults no longer auto-expose them, so preserve only the required
-- service-role defaults (never broad anon/authenticated defaults).
alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to service_role;
alter default privileges for role postgres in schema public
  grant all on functions to service_role;

create table public.tavily_resources (
  id bigint generated always as identity primary key,
  name text,
  organization text,
  description text,
  website text,
  city text,
  category text,
  service_type text,
  source text,
  approved boolean default false,
  original_query text,
  created_at timestamptz default now(),
  quality_score integer default 40,
  hidden boolean default false
);

create unique index tavily_resources_unique_website
  on public.tavily_resources (website)
  where website is not null and btrim(website) <> '';

alter table public.tavily_resources enable row level security;
grant all on table public.tavily_resources to service_role;
grant all on sequence public.tavily_resources_id_seq to service_role;
grant select on table public.tavily_resources to anon, authenticated;

-- Both policies existed before 202607230001. That migration deliberately drops
-- only the unrestricted policy and preserves approved/non-hidden public reads.
create policy "Enable read access for all users"
  on public.tavily_resources for select to anon, authenticated
  using (true);
create policy "Public can read approved tavily resources"
  on public.tavily_resources for select to anon, authenticated
  using (approved is true and coalesce(hidden, false) is false);

create table public.site_events (
  id uuid primary key default gen_random_uuid(),
  event_type text,
  query text,
  city text,
  resource_name text,
  created_at timestamptz default now(),
  miller_theme text,
  session_id text,
  conversation_turn integer,
  inferred_categories text[],
  result_count integer,
  selected_resource text,
  response_time_ms integer,
  memory_used boolean default false
);

alter table public.site_events enable row level security;
grant all on table public.site_events to service_role;
grant insert on table public.site_events to anon, authenticated;
create policy "Allow public inserts"
  on public.site_events for insert to anon, authenticated
  with check (true);

create table public.resource_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text,
  city text,
  category text,
  description text,
  phone text,
  website text,
  notes text,
  status text default 'pending',
  note text,
  resource_name text
);

alter table public.resource_submissions enable row level security;
grant all on table public.resource_submissions to service_role;
grant insert on table public.resource_submissions to anon, authenticated;
create policy "Allow anon insert to resource_submissions"
  on public.resource_submissions for insert to anon
  with check (true);

commit;
