begin;

-- Contract: UTF-8 bytes of the following length-delimited fields, joined by
-- the actual ASCII unit separator byte (0x1f), then SHA-256 encoded as
-- lower-case hexadecimal. The JavaScript/Samwise helper is the shared source
-- contract; this definition makes PostgreSQL byte-identical to it.
create or replace function public.canonical_profile_fingerprint_v1(
  p_phone text,
  p_website text,
  p_location_id uuid,
  p_city text,
  p_province text,
  p_street text,
  p_version integer
) returns text language sql immutable set search_path=public as $$
  select encode(extensions.digest(
    octet_length('miller-canonical-profile-v1')::text || ':miller-canonical-profile-v1' || E'\x1f' ||
    case when p_phone is null then '-1:' else octet_length(p_phone)::text || ':' || p_phone end || E'\x1f' ||
    case when p_website is null then '-1:' else octet_length(p_website)::text || ':' || p_website end || E'\x1f' ||
    case when p_location_id is null then '-1:' else octet_length(p_location_id::text)::text || ':' || p_location_id::text end || E'\x1f' ||
    case when p_city is null then '-1:' else octet_length(p_city)::text || ':' || p_city end || E'\x1f' ||
    case when p_province is null then '-1:' else octet_length(p_province)::text || ':' || p_province end || E'\x1f' ||
    case when p_street is null then '-1:' else octet_length(p_street)::text || ':' || p_street end || E'\x1f' ||
    octet_length(p_version::text)::text || ':' || p_version::text,
    'sha256'), 'hex');
$$;

-- Preserve the original E.164 intent while correcting the accidental literal
-- double-backslash in the historical PostgreSQL regular expression.
alter table public.resource_canonical_profile
  drop constraint resource_canonical_profile_phone_check,
  add constraint resource_canonical_profile_phone_check
    check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');

revoke all on function public.canonical_profile_fingerprint_v1(text,text,uuid,text,text,text,integer) from public;
grant execute on function public.canonical_profile_fingerprint_v1(text,text,uuid,text,text,text,integer) to anon, authenticated, service_role;

commit;
