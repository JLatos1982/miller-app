begin;

create schema if not exists miller_internal authorization postgres;
revoke all on schema miller_internal from public, anon, service_role;
grant usage on schema miller_internal to authenticated;

create or replace function miller_internal.is_miller_resource_quality_reader_v1()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.miller_resource_quality_reader_authorization_v1
     where authorization_key = 'miller_resource_quality_reader_authorization_v1'
       and active
       and reader_id = (select auth.uid())
  );
$$;

revoke all on function miller_internal.is_miller_resource_quality_reader_v1() from public, anon, service_role;
grant execute on function miller_internal.is_miller_resource_quality_reader_v1() to authenticated;

drop policy miller_resource_quality_reader_select on public.miller_resource_quality_v1;
create policy miller_resource_quality_reader_select on public.miller_resource_quality_v1
  for select to authenticated using ((select miller_internal.is_miller_resource_quality_reader_v1()));

drop policy miller_resource_quality_detail_reader_select on public.miller_resource_quality_detail_v1;
create policy miller_resource_quality_detail_reader_select on public.miller_resource_quality_detail_v1
  for select to authenticated using ((select miller_internal.is_miller_resource_quality_reader_v1()));

drop function public.is_miller_resource_quality_reader_v1();

commit;
