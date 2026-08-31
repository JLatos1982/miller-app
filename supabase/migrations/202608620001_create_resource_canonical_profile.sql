begin;

-- This projection deliberately starts empty.  It never infers a canonical
-- contact or location from aliases, Tavily rows, or source evidence.
create table public.resource_canonical_profile (
  resource_id uuid primary key references public.resource_registry(id) on delete restrict,
  canonical_location_id uuid references public.resource_locations(id) on delete restrict,
  phone text,
  website text,
  version integer not null default 1 check (version >= 1),
  canonical_fingerprint text not null,
  provenance jsonb not null default '[]'::jsonb check (jsonb_typeof(provenance) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (phone is null or phone ~ '^\\+[1-9][0-9]{7,14}$'),
  check (website is null or website ~ '^https://[^/?#[:space:]]+[^[:space:]]*$'),
  check (canonical_fingerprint ~ '^[0-9a-f]{64}$')
);

-- Append-only history is intentionally separate from the current projection.
create table public.resource_canonical_profile_audit (
  id bigint generated always as identity primary key,
  resource_id uuid not null references public.resource_registry(id) on delete restrict,
  prior_profile jsonb,
  new_profile jsonb,
  supporting_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(supporting_evidence) = 'array'),
  policy_version text not null check (policy_version = 'miller-canonical-contact-location-projection-v1'),
  actor_id uuid references auth.users(id),
  actor_type text not null check (actor_type in ('administrator','samwise_trusted_backend','system')),
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);

create index resource_canonical_profile_audit_resource_idx
  on public.resource_canonical_profile_audit(resource_id, created_at desc);

alter table public.resource_canonical_profile enable row level security;
alter table public.resource_canonical_profile_audit enable row level security;
revoke all on public.resource_canonical_profile, public.resource_canonical_profile_audit from public, anon, authenticated;
grant select, insert, update on public.resource_canonical_profile to service_role;
grant select, insert on public.resource_canonical_profile_audit to service_role;

create or replace function public.canonical_profile_fingerprint_v1(
  p_phone text, p_website text, p_location_id uuid, p_city text, p_province text, p_street text, p_version integer
) returns text language sql immutable set search_path = public as $$
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

create or replace function public.enforce_resource_canonical_profile_v1()
returns trigger language plpgsql security definer set search_path = public as $$
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
end $$;

create trigger resource_canonical_profile_enforce
before insert or update on public.resource_canonical_profile
for each row execute function public.enforce_resource_canonical_profile_v1();

create or replace function public.prevent_resource_canonical_profile_audit_mutation()
returns trigger language plpgsql as $$ begin raise exception 'canonical profile audit is append-only'; end $$;
create trigger resource_canonical_profile_audit_append_only
before update or delete on public.resource_canonical_profile_audit
for each row execute function public.prevent_resource_canonical_profile_audit_mutation();

-- No write function is added here.  A future fixed correction transaction will
-- own version increments and audit insertion atomically.
commit;
