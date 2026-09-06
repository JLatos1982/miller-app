begin;

-- The existing verified-map publication path remains the authoritative tier.
-- This additive tier is for a public civic location found in a trusted backend
-- source read and validated by the BC address geocoder.
alter table public.resource_locations
  add column if not exists evidence_tier text not null default 'verified_authoritative_location'
    check (evidence_tier in ('verified_authoritative_location', 'publicly_listed_location')),
  add column if not exists public_location_caution text,
  add column if not exists public_location_source_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.resource_locations'::regclass
      and conname = 'resource_locations_public_location_metadata_check'
  ) then
    alter table public.resource_locations
      add constraint resource_locations_public_location_metadata_check check (
        evidence_tier <> 'publicly_listed_location'
        or (
          nullif(btrim(public_location_caution), '') is not null
          and public_location_source_url ~ '^https://[^[:space:]]+$'
        )
      );
  end if;
end;
$$;

-- A receipt is deliberately much smaller than a staging/package system. It is
-- the durable proof of a trusted practical publication and is never edited.
create table public.practical_public_location_receipts (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resource_registry(id) on delete restrict,
  location_id uuid references public.resource_locations(id) on delete restrict,
  package_fingerprint text not null unique check (package_fingerprint ~ '^[a-f0-9]{64}$'),
  canonical_address text not null,
  latitude double precision not null check (latitude between 48 and 60),
  longitude double precision not null check (longitude between -140 and -114),
  source_url text not null check (source_url ~ '^https://[^[:space:]]+$'),
  geocoder_score numeric not null check (geocoder_score in (99, 100)),
  geocoder_type text not null check (geocoder_type in ('parcelpoint', 'accesspoint')),
  evidence_tier text not null check (evidence_tier = 'publicly_listed_location'),
  policy_version text not null check (policy_version = 'practical_public_location_v1'),
  decision text not null check (decision = 'eligible_publicly_listed_location'),
  publication_result text not null check (publication_result in ('published', 'same_location_normalization', 'already_published_same_location')),
  created_at timestamptz not null default now()
);

create index practical_public_location_receipts_resource_created_idx
  on public.practical_public_location_receipts (resource_id, created_at desc);

alter table public.practical_public_location_receipts enable row level security;
alter table public.practical_public_location_receipts force row level security;
revoke all on table public.practical_public_location_receipts from public, anon, authenticated;
grant select on table public.practical_public_location_receipts to service_role;

create or replace function public.prevent_practical_public_location_receipt_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'practical public location receipts are append-only';
end;
$$;

create trigger practical_public_location_receipts_append_only
  before update or delete on public.practical_public_location_receipts
  for each row execute function public.prevent_practical_public_location_receipt_mutation();

-- Comparison is intentionally limited to civic normalization. It is used only
-- to decide whether the same resource already has this location; it never
-- deduplicates different resources that happen to share a site.
create or replace function public.practical_public_location_key_v1(p_address text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare v_value text := lower(coalesce(p_address, ''));
begin
  v_value := regexp_replace(v_value, '\m(street|st)\M', 'st', 'g');
  v_value := regexp_replace(v_value, '\m(avenue|ave)\M', 'ave', 'g');
  v_value := regexp_replace(v_value, '\m(road|rd)\M', 'rd', 'g');
  v_value := regexp_replace(v_value, '\m(drive|dr)\M', 'dr', 'g');
  v_value := regexp_replace(v_value, '\m(boulevard|blvd)\M', 'blvd', 'g');
  v_value := regexp_replace(v_value, '\m(highway|hwy)\M', 'hwy', 'g');
  v_value := regexp_replace(v_value, '\m(parkway|pkwy|pky)\M', 'pky', 'g');
  return regexp_replace(v_value, '[^a-z0-9]', '', 'g');
end;
$$;

create or replace function public.practical_public_location_text_key_v1(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]', '', 'g')
$$;

-- This function is intentionally read-only. The trusted application uses it
-- before the publication RPC, and the publication RPC calls it again while
-- holding the resource transaction lock.
create or replace function public.preflight_public_location_v1(
  p_resource_id uuid,
  p_package jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resource public.resource_registry;
  v_existing public.resource_locations;
  v_source_address text := btrim(coalesce(p_package->>'canonical_address', ''));
  v_locality text := btrim(coalesce(p_package->>'locality', ''));
  v_source_url text := btrim(coalesce(p_package->>'source_url', ''));
  v_source_excerpt text := btrim(coalesce(p_package->>'source_excerpt', ''));
  v_geocoder jsonb := coalesce(p_package->'geocoder', '{}'::jsonb);
  v_geo_address text := btrim(coalesce(p_package->'geocoder'->>'standardized_address', p_package->'geocoder'->>'returned_address', ''));
  v_geo_locality text := btrim(coalesce(p_package->'geocoder'->>'locality', ''));
  v_score_text text := coalesce(p_package->'geocoder'->>'score', '');
  v_latitude_text text := coalesce(p_package#>>'{geocoder,coordinates,latitude}', '');
  v_longitude_text text := coalesce(p_package#>>'{geocoder,coordinates,longitude}', '');
  v_score numeric;
  v_latitude double precision;
  v_longitude double precision;
  v_descriptor text := lower(regexp_replace(coalesce(p_package->'geocoder'->>'location_descriptor', ''), '[^a-z]', '', 'g'));
  v_precision text := lower(regexp_replace(coalesce(p_package->'geocoder'->>'precision', ''), '[^a-z0-9]', '_', 'g'));
  v_source_authority_text text := coalesce(p_package->>'source_authority', '');
  v_source_authority numeric;
  v_civic text;
  v_existing_mode text := 'new_location';
begin
  if jsonb_typeof(p_package) <> 'object' then
    return jsonb_build_object('status', 'rejected_missing_source_provenance');
  end if;

  select * into v_resource
  from public.resource_registry
  where id = p_resource_id;

  if not found or v_resource.lifecycle_state <> 'active' or v_resource.editorial_status = 'hidden' then
    return jsonb_build_object('status', 'review_required_resource_ineligible');
  end if;

  if coalesce(p_package->>'protected', 'false') = 'true'
     or coalesce(p_package->>'confidential', 'false') = 'true'
     or v_resource.display_name ~* '(safe home|transition house|domestic violence|trafficking|confidential|undisclosed|recovery home|recovery house)'
     or exists (
       select 1 from public.resource_locations l
       where l.resource_id = p_resource_id
         and (l.location_type in ('confidential', 'undisclosed') or l.review_status = 'confidential')
     ) then
    return jsonb_build_object('status', 'rejected_protected');
  end if;

  if coalesce(p_package->>'non_physical', 'false') = 'true'
     or v_source_address ~* '\m(virtual|mobile|service[[:space:]-]*area|mailing[[:space:]-]*only|intake[[:space:]-]*only)\M' then
    return jsonb_build_object('status', 'rejected_nonphysical');
  end if;

  if v_source_address ~* '\m(p\.?[[:space:]]*o\.?[[:space:]]*box|post office box)\M' then
    return jsonb_build_object('status', 'rejected_po_box');
  end if;

  if v_source_address !~* '^\s*(?:(unit|suite|ste|office|apt|apartment)[[:space:]]+[a-z0-9-]+[[:space:]]*,[[:space:]]*|[a-z0-9-]+[[:space:]]*-[[:space:]]*)?[0-9]{1,6}[a-z]?[[:space:]]+.{2,}$'
     or v_locality = '' then
    return jsonb_build_object('status', 'rejected_malformed_address');
  end if;

  if v_source_url !~ '^https://[^[:space:]]+$'
     or v_source_url ~* '^https://[^/]*tavily'
     or nullif(btrim(p_package->>'source_title'), '') is null
     or nullif(btrim(p_package->>'source_fingerprint'), '') is null
     or nullif(btrim(p_package->>'source_reader'), '') <> 'samwise_farm_source_reader_v1'
     or coalesce(p_package->>'source_quality', '') not in ('authoritative_primary', 'credible_primary')
     or v_source_excerpt = ''
     or length(v_source_excerpt) > 12000 then
    return jsonb_build_object('status', 'rejected_missing_source_provenance');
  end if;

  if v_source_authority_text !~ '^[0-9]+([.][0-9]+)?$' then
    return jsonb_build_object('status', 'rejected_missing_source_provenance');
  end if;
  v_source_authority := v_source_authority_text::numeric;
  if v_source_authority < 70 or v_source_authority > 100 then
    return jsonb_build_object('status', 'rejected_missing_source_provenance');
  end if;

  v_civic := (regexp_match(v_source_address, '([0-9]{1,6}[A-Za-z]?)'))[1];
  if v_civic is null or position(lower(v_civic) in lower(v_source_excerpt)) = 0 then
    return jsonb_build_object('status', 'rejected_missing_source_provenance');
  end if;

  if coalesce(v_geocoder->>'provider', '') <> 'bc_address_geocoder'
     or v_geo_address = ''
     or v_score_text !~ '^[0-9]+([.][0-9]+)?$'
     or v_latitude_text !~ '^-?[0-9]+([.][0-9]+)?$'
     or v_longitude_text !~ '^-?[0-9]+([.][0-9]+)?$' then
    return jsonb_build_object('status', 'rejected_weak_geocode');
  end if;
  v_score := v_score_text::numeric;
  v_latitude := v_latitude_text::double precision;
  v_longitude := v_longitude_text::double precision;

  if v_geo_locality = ''
     or public.practical_public_location_text_key_v1(v_locality) <> public.practical_public_location_text_key_v1(v_geo_locality)
     or coalesce(v_geocoder->>'municipality_match', 'false') <> 'true'
     or coalesce(v_geocoder->>'province_match', 'false') <> 'true' then
    return jsonb_build_object('status', 'rejected_wrong_locality');
  end if;

  if v_latitude not between 48 and 60
     or v_longitude not between -140 and -114
     or coalesce(v_geocoder->>'valid_coordinate', 'false') <> 'true'
     or coalesce(v_geocoder->>'civic_number_match', 'false') <> 'true'
     or coalesce(v_geocoder->>'street_match', 'false') <> 'true'
     or coalesce(v_geocoder->>'materially_faulted', 'true') <> 'false'
     or coalesce(v_geocoder->>'result_count', '') <> '1'
     or v_precision not in ('civic_number', 'unit', 'site', 'occupant')
     or coalesce(v_geocoder->>'precision_points', '') !~ '^[0-9]+([.][0-9]+)?$'
     or (v_geocoder->>'precision_points')::numeric < 95
     or not (
       (v_score = 100 and v_descriptor = 'parcelpoint')
       or (v_score = 99 and v_descriptor = 'accesspoint')
     ) then
    return jsonb_build_object('status', 'rejected_weak_geocode');
  end if;

  for v_existing in
    select *
    from public.resource_locations l
    where l.resource_id = p_resource_id
      and l.location_type = 'fixed'
      and l.review_status = 'approved'
    order by l.public_map desc, l.updated_at desc
  loop
    if public.practical_public_location_key_v1(v_existing.street_address)
         <> public.practical_public_location_key_v1(v_geo_address)
       or v_existing.latitude is null
       or abs(v_existing.latitude - v_latitude) > 0.0002
       or abs(v_existing.longitude - v_longitude) > 0.0002 then
      return jsonb_build_object('status', 'hold_existing_location_conflict');
    end if;
    v_existing_mode := case
      when v_existing.street_address = v_geo_address then 'same_location_confirmation'
      else 'same_location_normalization'
    end;
  end loop;

  return jsonb_build_object(
    'status', 'eligible_publicly_listed_location',
    'decision', 'eligible_publicly_listed_location',
    'policy_version', 'practical_public_location_v1',
    'evidence_tier', 'publicly_listed_location',
    'canonical_address', v_geo_address,
    'locality', v_geo_locality,
    'coordinates', jsonb_build_object('latitude', v_latitude, 'longitude', v_longitude),
    'geocoder_score', v_score,
    'geocoder_type', v_descriptor,
    'existing_location_mode', v_existing_mode,
    'shared_site', 'allowed'
  );
end;
$$;

-- This is the only practical publication write path. It accepts a package
-- assembled by trusted Miller/Samwise backend code, revalidates it inside the
-- transaction, and never accepts a separate caller-provided coordinate.
create or replace function public.publish_practical_public_location_v1(
  p_resource_id uuid,
  p_package jsonb,
  p_actor_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preflight jsonb;
  v_existing public.resource_locations;
  v_location public.resource_locations;
  v_receipt public.practical_public_location_receipts;
  v_claim public.resource_fact_claims;
  v_source_evidence public.resource_fact_evidence;
  v_geocoder_evidence public.resource_fact_evidence;
  v_fingerprint text;
  v_claim_fingerprint text;
  v_source_evidence_fingerprint text;
  v_geocoder_evidence_fingerprint text;
  v_geo jsonb;
  v_publication_result text;
  v_caution constant text := 'Publicly listed location — confirm with provider.';
begin
  perform pg_advisory_xact_lock(hashtextextended(p_resource_id::text, 91));

  v_preflight := public.preflight_public_location_v1(p_resource_id, p_package);
  if v_preflight->>'status' <> 'eligible_publicly_listed_location' then
    raise exception 'practical public location preflight rejected: %', v_preflight->>'status';
  end if;

  v_geo := p_package->'geocoder';
  v_fingerprint := encode(extensions.digest(
    'practical_public_location_v1:' || p_resource_id::text || ':' ||
    public.practical_public_location_key_v1(v_preflight->>'canonical_address') || ':' ||
    lower(p_package->>'source_url') || ':' || (p_package->>'source_fingerprint') || ':' ||
    coalesce(v_geo->>'site_id', ''),
    'sha256'
  ), 'hex');

  select * into v_receipt
  from public.practical_public_location_receipts
  where package_fingerprint = v_fingerprint
  for update;
  if found then
    return jsonb_build_object(
      'status', 'idempotent', 'receipt_id', v_receipt.id,
      'location_id', v_receipt.location_id, 'publication_result', v_receipt.publication_result
    );
  end if;

  v_claim_fingerprint := encode(extensions.digest(
    'practical_public_location_claim_v1:' || p_resource_id::text || ':' ||
    public.practical_public_location_key_v1(v_preflight->>'canonical_address') || ':' || lower(p_package->>'source_url'),
    'sha256'
  ), 'hex');

  select * into v_claim
  from public.resource_fact_claims
  where claim_fingerprint = v_claim_fingerprint
  for update;
  if not found then
    insert into public.resource_fact_claims(
      resource_id, field_name, proposed_value, risk, recommendation, confidence,
      reason_codes, engine_version, status, claim_fingerprint, decision_category,
      research_summary, last_observed_at
    ) values (
      p_resource_id, 'location_occupancy', to_jsonb(v_preflight->>'canonical_address'),
      'medium', 'human_review', 'bounded',
      array['publicly_listed_location', 'trusted_backend_source_read', 'bc_geocoder_validated'],
      'practical_public_location_v1', 'observed', v_claim_fingerprint, 'location_occupancy',
      'Trusted backend validated a publicly listed civic location.', now()
    ) returning * into v_claim;
  end if;

  v_source_evidence_fingerprint := encode(extensions.digest(
    'practical_public_location_source_v1:' || v_claim.id::text || ':' || lower(p_package->>'source_url') || ':' || (p_package->>'source_fingerprint'),
    'sha256'
  ), 'hex');
  insert into public.resource_fact_evidence(
    claim_id, source_type, source_record_id, source_url, extracted_value,
    extraction_method, retrieved_at, source_authority, independent_key, stale, evidence_fingerprint
  ) values (
    v_claim.id, 'publicly_listed_location', p_package->>'source_fingerprint', p_package->>'source_url',
    jsonb_build_object(
      'canonical_address', v_preflight->>'canonical_address',
      'source_address', p_package->>'canonical_address',
      'locality', v_preflight->>'locality',
      'source_title', p_package->>'source_title',
      'source_excerpt', left(p_package->>'source_excerpt', 1200),
      'source_reader', p_package->>'source_reader',
      'source_quality', p_package->>'source_quality'
    ),
    'trusted_backend_practical_public_location_v1', now(),
    (p_package->>'source_authority')::integer,
    regexp_replace(p_package->>'source_url', '^https://([^/]+).*', '\\1'), false,
    v_source_evidence_fingerprint
  ) on conflict (evidence_fingerprint) where evidence_fingerprint is not null do nothing;
  select * into v_source_evidence
  from public.resource_fact_evidence
  where evidence_fingerprint = v_source_evidence_fingerprint;

  v_geocoder_evidence_fingerprint := encode(extensions.digest(
    'practical_public_location_geocoder_v1:' || v_claim.id::text || ':' ||
    public.practical_public_location_key_v1(v_preflight->>'canonical_address') || ':' || coalesce(v_geo->>'site_id', ''),
    'sha256'
  ), 'hex');
  insert into public.resource_fact_evidence(
    claim_id, source_type, source_record_id, source_url, extracted_value,
    extraction_method, retrieved_at, source_authority, independent_key, stale, evidence_fingerprint
  ) values (
    v_claim.id, 'bc_geocoder', nullif(v_geo->>'site_id', ''), 'https://geocoder.api.gov.bc.ca', v_geo,
    'trusted_backend_practical_public_location_v1', now(), 85, 'bc_address_geocoder', false,
    v_geocoder_evidence_fingerprint
  ) on conflict (evidence_fingerprint) where evidence_fingerprint is not null do nothing;
  select * into v_geocoder_evidence
  from public.resource_fact_evidence
  where evidence_fingerprint = v_geocoder_evidence_fingerprint;

  insert into public.resource_fact_change_audit(
    claim_id, resource_id, field_name, previous_value, new_value, action,
    reason_codes, actor_type, actor_id
  ) values (
    v_claim.id, p_resource_id, 'location_occupancy', null, v_claim.proposed_value, 'observe',
    array['practical_public_location_v1', 'publicly_listed_location'], 'miller_automation', p_actor_id
  );

  select * into v_existing
  from public.resource_locations l
  where l.resource_id = p_resource_id
    and l.location_type = 'fixed'
    and l.review_status = 'approved'
  order by l.public_map desc, l.updated_at desc
  limit 1
  for update;

  if found and v_existing.public_map then
    v_location := v_existing;
    v_publication_result := 'already_published_same_location';
  elsif found then
    update public.resource_locations
    set
      original_address_text = p_package->>'canonical_address',
      street_address = v_preflight->>'canonical_address',
      city = v_preflight->>'locality',
      province = 'BC',
      country = 'Canada',
      latitude = (v_preflight#>>'{coordinates,latitude}')::double precision,
      longitude = (v_preflight#>>'{coordinates,longitude}')::double precision,
      geocode_source = 'bc_address_geocoder',
      geocode_confidence = (v_preflight->>'geocoder_score')::double precision / 100,
      geocode_status = 'verified',
      review_status = 'approved',
      public_map = true,
      reviewed_by = p_actor_id,
      reviewed_at = now(),
      location_last_verified = now(),
      updated_at = now(),
      evidence_tier = 'publicly_listed_location',
      public_location_caution = v_caution,
      public_location_source_url = p_package->>'source_url'
    where id = v_existing.id
    returning * into v_location;
    v_publication_result := 'same_location_normalization';
    insert into public.resource_location_audit(location_id, action, previous_values, new_values, actor_id, reason)
    values (v_location.id, 'publication_changed', to_jsonb(v_existing), to_jsonb(v_location), p_actor_id,
      'Trusted-backend practical public location normalization with source and geocoder provenance.');
  else
    insert into public.resource_locations(
      resource_id, location_label, location_type, original_address_text, street_address,
      city, province, country, latitude, longitude, geocode_source, geocode_confidence,
      geocode_status, review_status, public_map, reviewed_by, reviewed_at,
      location_last_verified, evidence_tier, public_location_caution, public_location_source_url
    ) values (
      p_resource_id, 'Publicly listed location', 'fixed', p_package->>'canonical_address',
      v_preflight->>'canonical_address', v_preflight->>'locality', 'BC', 'Canada',
      (v_preflight#>>'{coordinates,latitude}')::double precision,
      (v_preflight#>>'{coordinates,longitude}')::double precision,
      'bc_address_geocoder', (v_preflight->>'geocoder_score')::double precision / 100,
      'verified', 'approved', true, p_actor_id, now(), now(),
      'publicly_listed_location', v_caution, p_package->>'source_url'
    ) returning * into v_location;
    v_publication_result := 'published';
    insert into public.resource_location_audit(location_id, action, previous_values, new_values, actor_id, reason)
    values (v_location.id, 'publication_changed', null, to_jsonb(v_location), p_actor_id,
      'Trusted-backend practical public location publication with source and geocoder provenance.');
  end if;

  insert into public.practical_public_location_receipts(
    resource_id, location_id, package_fingerprint, canonical_address, latitude, longitude,
    source_url, geocoder_score, geocoder_type, evidence_tier, policy_version, decision, publication_result
  ) values (
    p_resource_id, v_location.id, v_fingerprint, v_preflight->>'canonical_address',
    (v_preflight#>>'{coordinates,latitude}')::double precision,
    (v_preflight#>>'{coordinates,longitude}')::double precision,
    p_package->>'source_url', (v_preflight->>'geocoder_score')::numeric,
    v_preflight->>'geocoder_type', 'publicly_listed_location', 'practical_public_location_v1',
    'eligible_publicly_listed_location', v_publication_result
  ) returning * into v_receipt;

  return jsonb_build_object(
    'status', 'published', 'receipt_id', v_receipt.id, 'location_id', v_location.id,
    'claim_id', v_claim.id, 'source_evidence_id', v_source_evidence.id,
    'geocoder_evidence_id', v_geocoder_evidence.id,
    'publication_result', v_publication_result,
    'evidence_tier', 'publicly_listed_location'
  );
end;
$$;

revoke all on function public.prevent_practical_public_location_receipt_mutation() from public, anon, authenticated;
revoke all on function public.practical_public_location_key_v1(text) from public, anon, authenticated;
revoke all on function public.practical_public_location_text_key_v1(text) from public, anon, authenticated;
revoke all on function public.preflight_public_location_v1(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.publish_practical_public_location_v1(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.preflight_public_location_v1(uuid, jsonb) to service_role;
grant execute on function public.publish_practical_public_location_v1(uuid, jsonb, uuid) to service_role;

commit;
