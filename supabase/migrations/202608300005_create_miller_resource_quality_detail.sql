-- Narrow, owner-authorized projection for an upstream-selected, bounded quality-review batch.
-- It is an isolated analytical table: the dedicated reader is never granted canonical-table access.
create table public.miller_resource_quality_detail_v1 (
  resource_id uuid primary key,
  name text not null,
  quality_state text not null check (quality_state in ('clean', 'missing', 'stale')),
  completeness_score integer not null check (completeness_score between 0 and 5),
  lifecycle_state text not null check (lifecycle_state in ('active', 'merged', 'retired')),
  editorial_status text not null check (editorial_status in ('pending', 'approved', 'hidden')),
  city text,
  province text,
  has_address boolean not null,
  has_coordinates boolean not null,
  location_state text not null check (location_state in ('no_location', 'confidential_or_undisclosed', 'missing_public_address', 'missing_coordinates', 'coordinates_need_qc', 'public_map_ready', 'location_present')),
  qc_state text not null check (qc_state in ('not_applicable', 'missing_location', 'needs_geocode', 'coordinates_pending_qc', 'verified_public')),
  evidence_freshness text not null check (evidence_freshness in ('unknown', 'stale', 'current')),
  last_verified_at timestamptz
);

insert into public.miller_resource_quality_detail_v1 (
  resource_id, name, quality_state, completeness_score, lifecycle_state, editorial_status,
  city, province, has_address, has_coordinates, location_state, qc_state,
  evidence_freshness, last_verified_at
)
select
  r.id, r.display_name, q.quality_state, q.completeness_score, r.lifecycle_state, r.editorial_status,
  l.city, l.province, coalesce(l.has_address, false), coalesce(l.has_coordinates, false),
  case when coalesce(l.location_count, 0) = 0 then 'no_location' when coalesce(l.has_confidential_or_undisclosed, false) and not coalesce(l.has_reviewable_location, false) then 'confidential_or_undisclosed' when not coalesce(l.has_address, false) then 'missing_public_address' when not coalesce(l.has_coordinates, false) then 'missing_coordinates' when coalesce(l.has_verified_public_map, false) then 'public_map_ready' when coalesce(l.has_coordinates, false) then 'coordinates_need_qc' else 'location_present' end,
  case when coalesce(l.location_count, 0) = 0 then 'missing_location' when not coalesce(l.has_reviewable_location, false) then 'not_applicable' when not coalesce(l.has_address, false) then 'missing_location' when not coalesce(l.has_coordinates, false) then 'needs_geocode' when coalesce(l.has_verified_public_map, false) then 'verified_public' else 'coordinates_pending_qc' end,
  case when l.last_verified_at is null then 'unknown' when l.last_verified_at < now() - interval '365 days' then 'stale' else 'current' end,
  l.last_verified_at
from public.resource_registry r
join public.miller_resource_quality_v1 q on q.resource_id = r.id
left join lateral (
  select count(*) as location_count,
    bool_or(location_type in ('confidential', 'undisclosed')) as has_confidential_or_undisclosed,
    bool_or(location_type not in ('confidential', 'undisclosed') and review_status <> 'confidential') as has_reviewable_location,
    bool_or(location_type not in ('confidential', 'undisclosed') and review_status <> 'confidential' and nullif(btrim(street_address), '') is not null) as has_address,
    bool_or(location_type not in ('confidential', 'undisclosed') and review_status <> 'confidential' and latitude is not null and longitude is not null) as has_coordinates,
    bool_or(public_map and location_type = 'fixed' and geocode_status = 'verified' and review_status = 'approved' and latitude is not null and longitude is not null) as has_verified_public_map,
    case when count(distinct nullif(btrim(city), '')) filter (where location_type not in ('confidential', 'undisclosed') and review_status <> 'confidential') = 1 then min(nullif(btrim(city), '')) filter (where location_type not in ('confidential', 'undisclosed') and review_status <> 'confidential') else null end as city,
    case when count(distinct nullif(btrim(province), '')) filter (where location_type not in ('confidential', 'undisclosed') and review_status <> 'confidential') = 1 then min(nullif(btrim(province), '')) filter (where location_type not in ('confidential', 'undisclosed') and review_status <> 'confidential') else null end as province,
    max(location_last_verified) as last_verified_at
  from public.resource_locations where resource_id = r.id
) l on true;

alter table public.miller_resource_quality_detail_v1 enable row level security;
alter table public.miller_resource_quality_detail_v1 force row level security;
revoke all on public.miller_resource_quality_detail_v1 from public, anon, authenticated;
grant select on public.miller_resource_quality_detail_v1 to authenticated;
create policy miller_resource_quality_detail_reader_select on public.miller_resource_quality_detail_v1
  for select to authenticated using ((select auth.uid()) = 'f92a36ed-9af8-4fe5-be35-2fecb4d8e6a7'::uuid);
