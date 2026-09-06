import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const migrations = join(process.cwd(), "supabase", "migrations")
const qualityBootstrap = readFileSync(join(migrations, "202608300002_bootstrap_miller_resource_quality_v1.sql"), "utf8")
const qualityDetail = readFileSync(join(migrations, "202608300005_create_miller_resource_quality_detail.sql"), "utf8")

test("quality-detail population has its tracked dependencies before it runs", () => {
  assert.match(qualityBootstrap, /create table public\.miller_resource_quality_v1/i)
  assert.match(qualityBootstrap, /force row level security/i)
  assert.match(qualityDetail, /to_regclass\('public\.resource_registry'\)/)
  assert.match(qualityDetail, /to_regclass\('public\.resource_locations'\)/)
  assert.match(qualityDetail, /to_regclass\('public\.miller_resource_quality_v1'\)/)
  assert.ok(qualityDetail.indexOf("miller_resource_quality_detail_v1 dependencies are missing") < qualityDetail.indexOf("insert into public.miller_resource_quality_detail_v1"))
})
