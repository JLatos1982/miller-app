begin;

create extension if not exists pgtap with schema extensions;
select plan(39);

insert into auth.users(
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000009001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'practical-location-admin@example.invalid', '',
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.resource_registry(id, display_name, lifecycle_state, editorial_status) values
  ('00000000-0000-4000-8000-000000009101', 'Strict Authoritative Centre', 'active', 'approved'),
  ('00000000-0000-4000-8000-000000009102', 'Practical Parcelpoint Centre', 'active', 'approved'),
  ('00000000-0000-4000-8000-000000009103', 'Practical Accesspoint Centre', 'active', 'approved'),
  ('00000000-0000-4000-8000-000000009104', 'Weak Geocode Centre', 'active', 'approved'),
  ('00000000-0000-4000-8000-000000009105', 'Wrong Locality Centre', 'active', 'approved'),
  ('00000000-0000-4000-8000-000000009106', 'Protected Transition House', 'active', 'approved'),
  ('00000000-0000-4000-8000-000000009107', 'Shared Site Programme A', 'active', 'approved'),
  ('00000000-0000-4000-8000-000000009108', 'Shared Site Programme B', 'active', 'approved'),
  ('00000000-0000-4000-8000-000000009109', 'Normalization Centre', 'active', 'approved'),
  ('00000000-0000-4000-8000-000000009110', 'Conflict Centre', 'active', 'approved'),
  ('00000000-0000-4000-8000-000000009111', 'Post Office Centre', 'active', 'approved'),
  ('00000000-0000-4000-8000-000000009112', 'Missing Provenance Centre', 'active', 'approved'),
  ('00000000-0000-4000-8000-000000009113', 'Practical Block Accesspoint Centre', 'active', 'approved'),
  ('00000000-0000-4000-8000-000000009114', 'Ambiguous Practical Block Centre', 'active', 'approved'),
  ('00000000-0000-4000-8000-000000009115', 'Practical Parcelpoint Fallback Centre', 'active', 'approved');

create function public.practical_location_test_package(
  p_address text,
  p_locality text default 'Vancouver',
  p_score numeric default 100,
  p_descriptor text default 'parcelpoint',
  p_latitude double precision default 49.281,
  p_longitude double precision default -123.101,
  p_site_id text default 'fixture-site',
  p_source_url text default 'https://provider.example.test/public-location'
) returns jsonb
language sql
as $$
  select jsonb_build_object(
    'canonical_address', p_address,
    'locality', p_locality,
    'source_url', p_source_url,
    'source_title', 'Provider public location page',
    'source_excerpt', 'Example programme is available at ' || p_address || '.',
    'source_fingerprint', 'fixture-source-' || p_site_id,
    'source_reader', 'samwise_farm_source_reader_v1',
    'source_quality', 'credible_primary',
    'source_authority', 75,
    'geocoder', jsonb_build_object(
      'provider', 'bc_address_geocoder',
      'standardized_address', p_address,
      'returned_address', p_address,
      'locality', p_locality,
      'score', p_score,
      'precision', 'civic_number',
      'precision_points', 100,
      'location_descriptor', p_descriptor,
      'site_id', p_site_id,
      'municipality_match', true,
      'province_match', true,
      'civic_number_match', true,
      'street_match', true,
      'valid_coordinate', true,
      'materially_faulted', false,
      'result_count', 1,
      'coordinates', jsonb_build_object('latitude', p_latitude, 'longitude', p_longitude)
    )
  )
$$;

-- The strict, authoritative route remains exact-100/parcelpoint and receives
-- the default authoritative tier without any change to its RPC shape.
insert into public.location_qc_reviews(
  canonical_resource_id, policy_version, classification_fingerprint, decision,
  review_snapshot, version, reviewed_by
) values (
  '00000000-0000-4000-8000-000000009101', 'strict-fixture-v1', repeat('a', 64), 'pilot_eligible',
  '{"submitted_address":"10 Strict Street","returned_address":"10 Strict Street","locality":"Vancouver","program_occupancy_confidence":"supported","score":100,"location_descriptor":"parcelpoint","coordinates":{"latitude":49.281,"longitude":-123.101},"conflicts":[],"sensitivity_flags":[]}'::jsonb,
  1, '00000000-0000-4000-8000-000000009001'
);
insert into public.resource_fact_claims(
  id, resource_id, field_name, proposed_value, risk, recommendation, confidence,
  engine_version, status, claim_fingerprint
) values (
  '00000000-0000-4000-8000-000000009201', '00000000-0000-4000-8000-000000009101',
  'location_occupancy', '"10 Strict Street"'::jsonb, 'medium', 'human_review', 'high',
  'strict-fixture', 'observed', repeat('b', 64)
);
insert into public.resource_fact_evidence(
  claim_id, source_type, source_url, source_authority, extraction_method,
  independent_key, evidence_fingerprint
) values (
  '00000000-0000-4000-8000-000000009201', 'official_provider',
  'https://strict.example.test/location', 95, 'fixture', 'strict.example.test', repeat('c', 64)
);
select is(
  (public.publish_verified_map_pin('00000000-0000-4000-8000-000000009101', 1, '00000000-0000-4000-8000-000000009001')).public_map,
  true,
  'strict authoritative 100/parcelpoint route still publishes'
);
select is(
  (select evidence_tier from public.resource_locations where resource_id = '00000000-0000-4000-8000-000000009101'),
  'verified_authoritative_location',
  'strict route retains the authoritative evidence tier'
);
select is(
  (select public_location_source_url from public.resource_locations where resource_id = '00000000-0000-4000-8000-000000009101'),
  null,
  'strict route has not been changed to require practical source metadata'
);

select is(
  (public.preflight_public_location_v1(
    '00000000-0000-4000-8000-000000009102',
    public.practical_location_test_package('100 Practical Street', 'Vancouver', 100, 'parcelpoint', 49.282, -123.102, 'practical-100')
  )->>'status'),
  'eligible_publicly_listed_location',
  'credible source plus 100/parcelpoint preflights successfully'
);
select is(
  (public.publish_practical_public_location_v1(
    '00000000-0000-4000-8000-000000009102',
    public.practical_location_test_package('100 Practical Street', 'Vancouver', 100, 'parcelpoint', 49.282, -123.102, 'practical-100'),
    '00000000-0000-4000-8000-000000009001'
  )->>'status'),
  'published',
  'credible source plus 100/parcelpoint publishes'
);
select is(
  (select evidence_tier from public.resource_locations where resource_id = '00000000-0000-4000-8000-000000009102'),
  'publicly_listed_location',
  'practical row uses the publicly listed evidence tier'
);
select is(
  (select public_location_caution from public.resource_locations where resource_id = '00000000-0000-4000-8000-000000009102'),
  'Publicly listed location — confirm with provider.',
  'practical row retains the public caution'
);
select is(
  (select public_location_source_url from public.resource_locations where resource_id = '00000000-0000-4000-8000-000000009102'),
  'https://provider.example.test/public-location',
  'practical row retains the source URL'
);
select is(
  (select count(*)::integer from public.practical_public_location_receipts where resource_id = '00000000-0000-4000-8000-000000009102'),
  1,
  'successful practical publication creates one receipt'
);
select is(
  (select publication_result from public.practical_public_location_receipts where resource_id = '00000000-0000-4000-8000-000000009102'),
  'published',
  'receipt records the practical publication result'
);

select is(
  (public.preflight_public_location_v1(
    '00000000-0000-4000-8000-000000009103',
    public.practical_location_test_package('200 Access Street', 'Vancouver', 99, 'accesspoint', 49.283, -123.103, 'practical-99')
  )->>'status'),
  'eligible_publicly_listed_location',
  'locality-consistent 99/accesspoint preflights successfully'
);
select is(
  (public.publish_practical_public_location_v1(
    '00000000-0000-4000-8000-000000009103',
    public.practical_location_test_package('200 Access Street', 'Vancouver', 99, 'accesspoint', 49.283, -123.103, 'practical-99'),
    '00000000-0000-4000-8000-000000009001'
  )->>'status'),
  'published',
  'locality-consistent 99/accesspoint publishes'
);
select is(
  (public.preflight_public_location_v1(
    '00000000-0000-4000-8000-000000009113',
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(public.practical_location_test_package('520 Richards St', 'Vancouver', 99, 'accesspoint', 49.282967, -123.1135601, 'practical-block'), '{geocoder,precision}', '"block"'::jsonb),
          '{geocoder,result_count}', '5'::jsonb),
        '{geocoder,candidate_identity_clear}', 'true'::jsonb),
      '{geocoder,materially_competing_candidate}', 'false'::jsonb)
  )->>'status'),
  'eligible_publicly_listed_location',
  'strong same-civic 99/accesspoint block result with only low-scoring fallbacks preflights'
);
select is(
  (public.preflight_public_location_v1(
    '00000000-0000-4000-8000-000000009114',
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(public.practical_location_test_package('522 Richards St', 'Vancouver', 99, 'accesspoint', 49.282967, -123.1135601, 'practical-ambiguous'), '{geocoder,precision}', '"block"'::jsonb),
          '{geocoder,result_count}', '2'::jsonb),
        '{geocoder,candidate_identity_clear}', 'false'::jsonb),
      '{geocoder,materially_competing_candidate}', 'true'::jsonb)
  )->>'status'),
  'rejected_weak_geocode',
  'materially ambiguous practical block candidates reject'
);
select is(
  (public.preflight_public_location_v1(
    '00000000-0000-4000-8000-000000009115',
    jsonb_set(
      jsonb_set(
        jsonb_set(public.practical_location_test_package('2184 W Broadway', 'Vancouver', 100, 'parcelpoint', 49.2635301, -123.1548768, 'practical-parcelpoint-fallback'), '{geocoder,precision}', '"unit"'::jsonb),
        '{geocoder,result_count}', '5'::jsonb),
      '{geocoder,candidate_identity_clear}', 'true'::jsonb)
  )->>'status'),
  'eligible_publicly_listed_location',
  'strong same-civic 100/parcelpoint with low-scoring fallbacks preflights'
);
select is(
  (select geocoder_score from public.practical_public_location_receipts where resource_id = '00000000-0000-4000-8000-000000009103'),
  99::numeric,
  '99/accesspoint receipt retains the geocoder score'
);

create temporary table practical_zero_write_counts as
select
  (select count(*) from public.resource_fact_claims) as claims,
  (select count(*) from public.resource_fact_evidence) as evidence,
  (select count(*) from public.resource_locations) as locations,
  (select count(*) from public.practical_public_location_receipts) as receipts;

select is(
  (public.preflight_public_location_v1(
    '00000000-0000-4000-8000-000000009104',
    jsonb_set(public.practical_location_test_package('300 Weak Street', 'Vancouver', 100, 'parcelpoint', 49.284, -123.104, 'weak'), '{geocoder,score}', '98'::jsonb)
  )->>'status'),
  'rejected_weak_geocode',
  'weak approximate geocode rejects'
);
select is((select count(*) from public.resource_fact_claims), (select claims from practical_zero_write_counts), 'rejected preflight writes no claims');
select is((select count(*) from public.resource_fact_evidence), (select evidence from practical_zero_write_counts), 'rejected preflight writes no evidence');
select is((select count(*) from public.resource_locations), (select locations from practical_zero_write_counts), 'rejected preflight writes no locations');
select is((select count(*) from public.practical_public_location_receipts), (select receipts from practical_zero_write_counts), 'rejected preflight writes no receipts');

select is(
  (public.preflight_public_location_v1(
    '00000000-0000-4000-8000-000000009105',
    jsonb_set(public.practical_location_test_package('400 Locality Street', 'Vancouver', 100, 'parcelpoint', 49.285, -123.105, 'wrong-locality'), '{geocoder,locality}', '"Burnaby"'::jsonb)
  )->>'status'),
  'rejected_wrong_locality',
  'wrong locality rejects'
);
select is(
  (public.preflight_public_location_v1(
    '00000000-0000-4000-8000-000000009106',
    public.practical_location_test_package('500 Protected Street', 'Vancouver', 100, 'parcelpoint', 49.286, -123.106, 'protected')
  )->>'status'),
  'rejected_protected',
  'protected resource rejects'
);

select is(
  (public.publish_practical_public_location_v1(
    '00000000-0000-4000-8000-000000009107',
    public.practical_location_test_package('700 Shared Street', 'Vancouver', 100, 'parcelpoint', 49.287, -123.107, 'shared-a', 'https://provider.example.test/shared-a'),
    '00000000-0000-4000-8000-000000009001'
  )->>'status'),
  'published',
  'first resource at a shared site publishes'
);
select is(
  (public.publish_practical_public_location_v1(
    '00000000-0000-4000-8000-000000009108',
    public.practical_location_test_package('700 Shared Street', 'Vancouver', 100, 'parcelpoint', 49.287, -123.107, 'shared-b', 'https://provider.example.test/shared-b'),
    '00000000-0000-4000-8000-000000009001'
  )->>'status'),
  'published',
  'second distinct resource at the same site publishes'
);
select is(
  (select count(*)::integer from public.resource_locations where street_address = '700 Shared Street' and public_map),
  2,
  'shared site preserves two distinct resources rather than merging them'
);

insert into public.resource_locations(
  resource_id, location_label, location_type, original_address_text, street_address,
  city, province, latitude, longitude, geocode_source, geocode_confidence,
  geocode_status, review_status, public_map
) values (
  '00000000-0000-4000-8000-000000009109', 'Existing normalized address', 'fixed',
  '900 Normalized Street', '900 Normalized Street', 'Vancouver', 'BC',
  49.288, -123.108, 'fixture', 1, 'verified', 'approved', false
);
select is(
  (public.preflight_public_location_v1(
    '00000000-0000-4000-8000-000000009109',
    public.practical_location_test_package('900 Normalized St', 'Vancouver', 100, 'parcelpoint', 49.288, -123.108, 'normalize')
  )->>'existing_location_mode'),
  'same_location_normalization',
  'same civic site formatting is recognized as normalization'
);
select is(
  (public.publish_practical_public_location_v1(
    '00000000-0000-4000-8000-000000009109',
    public.practical_location_test_package('900 Normalized St', 'Vancouver', 100, 'parcelpoint', 49.288, -123.108, 'normalize'),
    '00000000-0000-4000-8000-000000009001'
  )->>'publication_result'),
  'same_location_normalization',
  'same-location normalization publishes the existing compatible row'
);
select is(
  (select count(*)::integer from public.resource_locations where resource_id = '00000000-0000-4000-8000-000000009109'),
  1,
  'same-location normalization does not duplicate the location row'
);

insert into public.resource_locations(
  resource_id, location_label, location_type, street_address, city, province,
  latitude, longitude, geocode_source, geocode_confidence, geocode_status, review_status, public_map
) values (
  '00000000-0000-4000-8000-000000009110', 'Conflicting accepted location', 'fixed',
  '950 Different Street', 'Vancouver', 'BC', 49.289, -123.109,
  'fixture', 1, 'verified', 'approved', true
);
select is(
  (public.preflight_public_location_v1(
    '00000000-0000-4000-8000-000000009110',
    public.practical_location_test_package('951 Different Street', 'Vancouver', 100, 'parcelpoint', 49.289, -123.109, 'conflict')
  )->>'status'),
  'hold_existing_location_conflict',
  'material existing accepted location conflict holds'
);
select is(
  (public.preflight_public_location_v1(
    '00000000-0000-4000-8000-000000009110',
    jsonb_set(public.practical_location_test_package('951 Different Street', 'Vancouver', 100, 'parcelpoint', 49.300, -123.110, 'additional-site'), '{multi_location_supported}', 'true'::jsonb)
  )->>'existing_location_mode'),
  'additional_supported_location',
  'explicitly supported distinct site is eligible for the same resource'
);
select is(
  (public.publish_practical_public_location_v1(
    '00000000-0000-4000-8000-000000009110',
    jsonb_set(public.practical_location_test_package('951 Different Street', 'Vancouver', 100, 'parcelpoint', 49.300, -123.110, 'additional-site'), '{multi_location_supported}', 'true'::jsonb),
    '00000000-0000-4000-8000-000000009001'
  )->>'publication_result'),
  'published',
  'explicitly supported distinct site publishes as an additional row'
);
select is(
  (select count(*)::integer from public.resource_locations where resource_id = '00000000-0000-4000-8000-000000009110' and public_map),
  2,
  'two supported locations remain distinct rows for one resource'
);
select is(
  (public.preflight_public_location_v1(
    '00000000-0000-4000-8000-000000009111',
    public.practical_location_test_package('PO Box 123', 'Vancouver', 100, 'parcelpoint', 49.290, -123.110, 'po-box')
  )->>'status'),
  'rejected_po_box',
  'PO box rejects'
);
select is(
  (public.preflight_public_location_v1(
    '00000000-0000-4000-8000-000000009112',
    public.practical_location_test_package('1000 Missing Street', 'Vancouver', 100, 'parcelpoint', 49.291, -123.111, 'missing-source') - 'source_url'
  )->>'status'),
  'rejected_missing_source_provenance',
  'missing source provenance rejects'
);

select throws_ok(
  $$update public.practical_public_location_receipts set publication_result = 'published' where resource_id = '00000000-0000-4000-8000-000000009102'$$,
  'P0001', 'practical public location receipts are append-only', 'receipt mutations reject'
);
select ok(not has_function_privilege('anon', 'public.publish_practical_public_location_v1(uuid,jsonb,uuid)', 'execute'), 'anonymous callers cannot publish practical locations');
select ok(not has_function_privilege('authenticated', 'public.preflight_public_location_v1(uuid,jsonb)', 'execute'), 'UI callers cannot preflight practical locations');
select ok(has_function_privilege('service_role', 'public.publish_practical_public_location_v1(uuid,jsonb,uuid)', 'execute'), 'trusted backend service role can publish practical locations');

select * from finish();
rollback;
