begin;
-- Trigger helpers are not RPC surfaces.
revoke all on function public.enforce_resource_canonical_profile_v1() from public, anon, authenticated;
revoke all on function public.prevent_resource_canonical_profile_audit_mutation() from public, anon, authenticated;
commit;
