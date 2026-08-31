import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { join } from "node:path"

const root = process.cwd()
const baselinePath = join(root, "supabase", "baselines", "miller-schema-baseline-v1", "schema.sql")
const manifestPath = join(root, "supabase", "baselines", "miller-schema-baseline-v1", "manifest.json")
const bootstrapPath = join(root, "scripts", "apply-miller-schema-baseline-v1.mjs")
const baseline = readFileSync(baselinePath, "utf8")
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
const bootstrap = readFileSync(bootstrapPath, "utf8")

test("baseline epoch is an immutable current-schema artifact rather than historical replay", () => {
  assert.equal(manifest.epoch, "miller-schema-baseline-v1")
  assert.equal(manifest.epoch_boundary_migration, "202608690001")
  assert.equal(manifest.contains_production_data, false)
  assert.equal(manifest.historical_migrations_replayed, false)
  assert.equal(manifest.baseline_not_for_production_deployment, true)
  assert.equal(createHash("sha256").update(baseline).digest("hex"), manifest.schema_file_sha256)
  assert.doesNotMatch(baseline, /^(INSERT|COPY)\s+/im)
})

test("baseline includes the required current schema structures", () => {
  for (const expression of [
    /CREATE TABLE IF NOT EXISTS "public"\."miller_resource_quality_v1"/,
    /CREATE TABLE IF NOT EXISTS "public"\."highgate_authoritative_location_reference"/,
    /CREATE TABLE IF NOT EXISTS "public"\."miller_project_binding_v1"/,
    /CREATE TABLE IF NOT EXISTS "public"\."miller_resource_quality_reader_authorization_v1"/,
    /CREATE TABLE IF NOT EXISTS "public"\."resource_canonical_profile"/,
    /CREATE TABLE IF NOT EXISTS "public"\."resource_canonical_profile_audit"/,
    /CREATE TABLE IF NOT EXISTS "public"\."miller_canonical_field_corrections"/,
    /CREATE OR REPLACE FUNCTION "public"\."apply_miller_canonical_field_correction_v1"/,
    /CREATE OR REPLACE FUNCTION "miller_internal"\."is_miller_resource_quality_reader_v1"/
  ]) assert.match(baseline, expression)
})

test("baseline and bootstrap contain no known production-bound values or remote path", () => {
  for (const literal of ["wccagykzugrahwugefqt", "f92a36ed-9af8-4fe5-be35-2fecb4d8e6a7", "23b498ab-7fed-5fbc-9f21-c9bea51cdf46", "7155 Kingsway"]) {
    assert.equal(baseline.includes(literal), false, `${literal} is absent from baseline schema`)
  }
  assert.match(bootstrap, /miller_schema_baseline_v1_requires_empty_local_database/)
  assert.match(bootstrap, /docker", \["exec", databaseContainer, "psql"/)
  assert.match(bootstrap, /revoke all on tables from anon, authenticated, service_role/)
  assert.doesNotMatch(bootstrap, /--linked|db push/)
  assert.match(bootstrap, /name\.slice\(0, 12\) > epoch/)
})
