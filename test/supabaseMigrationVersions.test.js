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
