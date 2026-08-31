import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const migrationPath = join(process.cwd(), "supabase", "migrations", "202608650001_refactor_highgate_reference_data.sql")
const aclMigrationPath = join(process.cwd(), "supabase", "migrations", "202608660001_highgate_reference_acl_select_only.sql")
const manifestPath = join(process.cwd(), "docs", "HIGHGATE_REVIEWED_DEPENDENCY_MANIFEST_V1.json")
const migration = readFileSync(migrationPath, "utf8")
const aclMigration = readFileSync(aclMigrationPath, "utf8")
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))

function functionBody(name) {
  const start = migration.indexOf(`create or replace function public.${name}`)
  assert.ok(start >= 0, `${name} exists`)
  const end = migration.indexOf("end $$;", start)
  assert.ok(end > start, `${name} has a bounded body`)
  return migration.slice(start, end + 7)
}

test("reviewed HighGate closure is bounded and catalog verified", () => {
  assert.equal(manifest.contract, "highgate-reviewed-dependency-manifest-v1")
  assert.equal(manifest.closure_status, "bounded_catalog_verified_twice")
  assert.equal(manifest.dynamic_sql, false)
  assert.deepEqual(manifest.unresolved_or_dynamic_dependencies, [])
  assert.equal(manifest.objects.filter(({ kind }) => kind === "root_function").length, 2)
  for (const object of manifest.objects) assert.match(object.definition_sha256, /^[0-9a-f]{64}$/)
})

test("typed reference migration stays narrow and backend-only", () => {
  assert.match(migration, /create table public\.highgate_authoritative_location_reference/i)
  assert.match(migration, /resource_id uuid primary key references public\.resource_registry\(id\) on delete restrict/i)
  assert.match(migration, /create unique index highgate_authoritative_location_reference_one_active_qc/i)
  assert.match(migration, /alter table public\.highgate_authoritative_location_reference enable row level security/i)
  assert.match(migration, /revoke all on public\.highgate_authoritative_location_reference from public, anon, authenticated/i)
  assert.match(migration, /grant select on public\.highgate_authoritative_location_reference to service_role/i)
  assert.doesNotMatch(migration, /create table public\.(config|configuration|settings)\b/i)
})

test("fixed address check is replaced by exact typed-reference validation", () => {
  assert.match(migration, /drop constraint authoritative_location_corrections_corrected_address_check/i)
  assert.match(migration, /new\.corrected_address <> v_reference\.corrected_address/i)
  assert.match(migration, /new\.correction_policy <> v_reference\.correction_policy/i)
  assert.match(migration, /new\.reason_code <> v_reference\.reason_code/i)
  assert.match(migration, /new\.authoritative_sources <> v_reference\.authoritative_sources/i)
  assert.match(migration, /using errcode = '23514'/i)
})

test("refactored executable definitions contain no production-bound HighGate values", () => {
  const executable = [
    functionBody("apply_highgate_authoritative_location_correction"),
    functionBody("supersede_highgate_human_qc_with_machine_initial"),
    functionBody("validate_authoritative_location_correction_reference"),
  ].join("\n")
  for (const literal of [
    "23b498ab-7fed-5fbc-9f21-c9bea51cdf46",
    "b980ad5f-6dfc-5c03-ab5e-bbaaaf3d499f",
    "Unit 320, 7155 Kingsway, Burnaby, BC",
    "#320-7155 Kingsway",
    "fraserhealth.ca",
    "'Burnaby'",
  ]) assert.equal(executable.includes(literal), false, `schema body excludes ${literal}`)
})

test("HighGate reference ACL migration revokes only service-role DML and preserves SELECT", () => {
  assert.match(aclMigration, /revoke insert, update, delete\s+on table public\.highgate_authoritative_location_reference\s+from service_role/i)
  assert.match(aclMigration, /grant select\s+on table public\.highgate_authoritative_location_reference\s+to service_role/i)
  assert.doesNotMatch(aclMigration, /^\s*(insert\s+into|update\s+public\.|delete\s+from|truncate|alter\s+table|create|drop)\b/im)
  const tableReferences = aclMigration.match(/public\.[a-z_]+/gi) ?? []
  assert.deepEqual([...new Set(tableReferences)], ["public.highgate_authoritative_location_reference"])
})
