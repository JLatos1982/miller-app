import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const migrationPath = new URL("../supabase/migrations/20260905191331_practical_public_location_qc_tier.sql", import.meta.url)

test("practical location migration is additive, service-role-only, and has no abandoned package binding scaffolding", async () => {
  const migration = await readFile(migrationPath, "utf8")
  const schemaSetup = migration.slice(0, migration.indexOf("create or replace function public.preflight_public_location_v1"))
  assert.match(migration, /add column if not exists evidence_tier text not null default 'verified_authoritative_location'/i)
  assert.match(migration, /publicly_listed_location/i)
  assert.match(migration, /create table public\.practical_public_location_receipts/i)
  assert.match(migration, /revoke all on function public\.publish_practical_public_location_v1\(uuid, jsonb, uuid\) from public, anon, authenticated/i)
  assert.match(migration, /grant execute on function public\.publish_practical_public_location_v1\(uuid, jsonb, uuid\) to service_role/i)
  assert.doesNotMatch(migration, /workflow_authorizations|publicly_listed_location_packages|persist_publicly_listed_location_package/i)
  assert.doesNotMatch(schemaSetup, /\b(?:insert|update|delete)\s+(?:into\s+)?public\.resource_locations\b/i, "migration setup does not mutate pre-existing map rows")
})
