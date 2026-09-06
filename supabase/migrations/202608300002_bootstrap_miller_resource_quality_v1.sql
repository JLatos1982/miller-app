begin;

-- Historical provenance repair: the verified production-schema baseline records
-- this relation, but its original creation migration was not tracked.  Create it
-- only for clean rebuilds; an established environment is deliberately untouched.
do $$
begin
  if to_regclass('public.miller_resource_quality_v1') is null then
    create table public.miller_resource_quality_v1 (
      resource_id uuid primary key,
      quality_state text not null check (quality_state in ('clean', 'missing', 'stale')),
      completeness_score integer not null check (completeness_score between 0 and 5),
      source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
      updated_at timestamptz not null
    );

    alter table public.miller_resource_quality_v1 enable row level security;
    alter table public.miller_resource_quality_v1 force row level security;
    revoke all on table public.miller_resource_quality_v1 from public, anon, authenticated;
    grant select on table public.miller_resource_quality_v1 to authenticated;

    -- A later tracked migration replaces this bootstrap policy with the governed
    -- reader authorization policy.  Deny by default rather than infer an omitted
    -- historical predicate.
    create policy miller_resource_quality_reader_select on public.miller_resource_quality_v1
      for select to authenticated using (false);
  end if;
end;
$$;

commit;
