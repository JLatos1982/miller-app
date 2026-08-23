begin;

create table public.miller_need_observation_buckets (
  bucket_key text primary key check(bucket_key ~ '^[a-f0-9]{64}$'),
  source text not null check(source = 'public_directory_search'),
  schema_version text not null check(schema_version = 'human-needs-v1'),
  kind text not null check(kind in ('need','barrier')),
  theme text not null check(theme in ('withdrawal_management','outpatient_treatment','residential_treatment','opioid_agonist_treatment','counselling','harm_reduction','overdose_prevention','youth_services','family_support','housing_support','shelter','peer_support','medical_support','crisis_support','transportation','mobility_accessibility','cost','waitlist','eligibility','age_restriction','referral_requirement','hours_availability','language_access','virtual_access','geographic_distance','immediate_access')),
  geography text not null check(geography in ('province','fraser','vancouver_coastal','island','interior','northern')),
  observed_hour timestamptz not null,
  observation_count integer not null default 1 check(observation_count between 1 and 10000),
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check(expires_at <= first_observed_at + interval '31 days')
);
create index miller_need_observation_buckets_active_idx on public.miller_need_observation_buckets(expires_at, observation_count desc);
alter table public.miller_need_observation_buckets enable row level security;
revoke all on public.miller_need_observation_buckets from public, anon, authenticated;
grant select, insert, update, delete on public.miller_need_observation_buckets to service_role;

create or replace function public.record_human_need_observation(p_bucket_key text, p_kind text, p_theme text, p_geography text, p_observed_hour timestamptz, p_expires_at timestamptz)
returns public.miller_need_observation_buckets language plpgsql security definer set search_path = public as $$
declare result public.miller_need_observation_buckets;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  insert into public.miller_need_observation_buckets(bucket_key,source,schema_version,kind,theme,geography,observed_hour,expires_at)
  values (p_bucket_key,'public_directory_search','human-needs-v1',p_kind,p_theme,p_geography,p_observed_hour,p_expires_at)
  on conflict(bucket_key) do update set observation_count = public.miller_need_observation_buckets.observation_count + 1, last_observed_at = now()
  returning * into result;
  return result;
end $$;
create or replace function public.cleanup_expired_human_need_observations(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare deleted_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  delete from public.miller_need_observation_buckets where expires_at <= p_now;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end $$;
revoke all on function public.record_human_need_observation(text,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.cleanup_expired_human_need_observations(timestamptz) from public, anon, authenticated;
grant execute on function public.record_human_need_observation(text,text,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.cleanup_expired_human_need_observations(timestamptz) to service_role;

commit;
