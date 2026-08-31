begin;

revoke insert, update, delete
  on table public.highgate_authoritative_location_reference
  from service_role;

grant select
  on table public.highgate_authoritative_location_reference
  to service_role;

commit;
