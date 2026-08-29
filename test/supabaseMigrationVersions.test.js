import test from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const migrations = join(process.cwd(), "supabase", "migrations")
const names = () => readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort()

test("Supabase migration versions are unique", () => {
  const versions = names().map((name) => {
    const match = /^(\d+)_/.exec(name)
    assert.ok(match, `migration filename needs a numeric version: ${name}`)
    return match[1]
  })
  assert.equal(new Set(versions).size, versions.length, "duplicate Supabase migration versions are not ledger-safe")
})

test("ordinal geocoder persistence migration has a unique ordered version and stays narrowly scoped", () => {
  const name = "202608410002_allow_validated_ordinal_bc_geocoder_evidence.sql"
  assert.ok(names().includes(name))
  const sql = readFileSync(join(migrations, name), "utf8")
  assert.match(sql, /create or replace function public\.persist_canonical_bc_geocoder_evidence_v1/i)
  assert.match(sql, /canonical_authoritative_address_key_v1\(coalesce\(p_geocoder_package->>'submitted_address'/i)
  assert.doesNotMatch(sql, /\b(create|alter|drop)\s+table\b|\bresource_locations\b|\bmap[_ ]?pin\b|\bpublication\b/i)
})

test("maintenance history backfills deterministic legacy keys before adding a random default", () => {
  const sql = readFileSync(join(migrations, "202608540001_add_maintenance_cycle_history.sql"), "utf8")
  assert.match(sql, /add column cycle_key text,\s*add column trigger_type/i)
  assert.doesNotMatch(sql, /add column cycle_key text default/i)
  const backfill = sql.indexOf("update public.miller_maintenance_cycles set cycle_key=encode(extensions.digest('legacy-maintenance-cycle|'||id::text,'sha256'),'hex')")
  const defaultAfterBackfill = sql.indexOf("alter column cycle_key set default encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex')")
  assert.ok(backfill >= 0)
  assert.ok(defaultAfterBackfill > backfill)
  assert.match(sql, /where cycle_key is null/i)
})

test("pending scheduler and observer migrations keep activation and observer writes bounded", () => {
  const scheduler = readFileSync(join(migrations, "202608570001_add_maintenance_schedule_journal.sql"), "utf8")
  const security = readFileSync(join(migrations, "202608580001_add_security_core_registry.sql"), "utf8")
  assert.match(scheduler, /enabled boolean not null default false/i)
  assert.match(scheduler, /execution_mode text not null default 'dry_run'/i)
  assert.match(security, /if auth\.role\(\) <> 'authenticated'/i)
  assert.match(security, /auth_user_id=auth\.uid\(\) and enabled=true/i)
  assert.match(security, /set search_path=public/i)
  assert.match(security, /octet_length\(coalesce\(p_evidence_summary,'\{\}'::jsonb\)::text\)>2048/i)
  assert.match(security, /key ~\* '\(token\|secret\|authorization\|cookie\|body\|payload\)'/i)
  assert.match(security, /revoke all on function[\s\S]*from public,anon/i)
  assert.match(security, /grant execute on function[\s\S]*to authenticated/i)
})
