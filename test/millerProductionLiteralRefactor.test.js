import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const path = join(process.cwd(), "supabase", "migrations", "202608680001_refactor_production_literal_bindings.sql")
const migration = readFileSync(path, "utf8")

function functionBody(name) {
  const start = migration.indexOf(`create or replace function public.${name}`)
  assert.ok(start >= 0, `${name} exists`)
  const end = migration.indexOf("$$;", start)
  assert.ok(end > start, `${name} has a bounded definition`)
  return migration.slice(start, end + 3)
}

test("production bindings are typed singleton tables with no client mutation grants", () => {
  assert.match(migration, /create table public\.miller_project_binding_v1/i)
  assert.match(migration, /binding_key text primary key check \(binding_key = 'miller_project_binding_v1'\)/i)
  assert.match(migration, /create table public\.miller_resource_quality_reader_authorization_v1/i)
  assert.match(migration, /authorization_key text primary key check \(authorization_key = 'miller_resource_quality_reader_authorization_v1'\)/i)
  assert.match(migration, /reader_id uuid not null unique references auth\.users\(id\) on delete restrict/i)
  for (const table of ["miller_project_binding_v1", "miller_resource_quality_reader_authorization_v1"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"))
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`, "i"))
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`, "i"))
  }
  assert.doesNotMatch(migration, /create table public\.(config|configuration|settings)\b/i)
})

test("run workflow checks become reference-backed validation without changing workflow caps or policies", () => {
  for (const constraint of [
    "canonical_authoritative_research_runs_project_ref_check",
    "map_auto_publication_runs_project_ref_check",
    "trusted_master_bootstrap_runs_project_ref_check"
  ]) assert.match(migration, new RegExp(`drop constraint ${constraint}`, "i"))
  for (const trigger of [
    "canonical_authoritative_research_runs_project_binding_v1",
    "map_auto_publication_runs_project_binding_v1",
    "trusted_master_bootstrap_runs_project_binding_v1"
  ]) assert.match(migration, new RegExp(`create trigger ${trigger}`, "i"))
  assert.match(functionBody("validate_miller_project_run_binding_v1"), /new\.project_ref is distinct from v_project_ref/i)
  for (const name of ["begin_canonical_authoritative_research_run", "begin_map_auto_publication_run", "begin_trusted_master_occupancy_bootstrap_run"]) {
    const body = functionBody(name)
    assert.match(body, /select project_ref into v_project_ref from public\.miller_project_binding_v1/i)
    assert.match(body, /Miller project binding is not configured/i)
    assert.doesNotMatch(body, /wccagykzugrahwugefqt/i)
  }
})

test("quality RLS policies delegate to a locked current-user authorization helper", () => {
  const helper = functionBody("is_miller_resource_quality_reader_v1")
  assert.match(helper, /security definer/i)
  assert.match(helper, /reader_id = \(select auth\.uid\(\)\)/i)
  assert.match(migration, /revoke all on function public\.is_miller_resource_quality_reader_v1\(\) from public, anon, service_role/i)
  assert.match(migration, /grant execute on function public\.is_miller_resource_quality_reader_v1\(\) to authenticated/i)
  for (const policy of ["miller_resource_quality_reader_select", "miller_resource_quality_detail_reader_select"]) {
    assert.match(migration, new RegExp(`drop policy ${policy}`, "i"))
    assert.match(migration, new RegExp(`create policy ${policy}[\\s\\S]*is_miller_resource_quality_reader_v1`, "i"))
  }
})

test("production-bound literals are seeded as rows, not retained in executable bodies", () => {
  const executable = [
    functionBody("validate_miller_project_run_binding_v1"),
    functionBody("begin_canonical_authoritative_research_run"),
    functionBody("begin_map_auto_publication_run"),
    functionBody("begin_trusted_master_occupancy_bootstrap_run"),
    functionBody("is_miller_resource_quality_reader_v1")
  ].join("\n")
  for (const literal of ["wccagykzugrahwugefqt", "f92a36ed-9af8-4fe5-be35-2fecb4d8e6a7"]) assert.equal(executable.includes(literal), false, `${literal} absent from executable definitions`)
})
