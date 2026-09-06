import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

const sql = readFileSync(new URL("../supabase/migrations/20260906043000_miller_north_commitments_policy_legal_v1.sql", import.meta.url), "utf8")
const tables = [
  "miller_north_accountability_commitments",
  "miller_north_accountability_commitment_sources",
  "miller_north_policy_legal_instruments",
  "miller_north_policy_legal_instrument_sources",
  "miller_north_policy_legal_instrument_incident_links",
  "miller_north_policy_legal_instrument_cohort_links",
  "miller_north_policy_legal_instrument_action_links",
  "miller_north_policy_legal_instrument_commitment_links",
  "miller_north_policy_legal_instrument_relations",
]

test("migration creates only additive private commitment and policy/legal tables", () => {
  for (const table of tables) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"))
    assert.ok(sql.includes(`'${table}'`), `${table} is included in the private security loop`)
  }
  assert.match(sql, /force row level security/i)
  assert.match(sql, /revoke all on public\.%I from public, anon, authenticated/i)
  assert.match(sql, /grant select, insert, update, delete on public\.%I to service_role/i)
  assert.doesNotMatch(sql, /create policy|insert into|grant .* to anon|grant .* to authenticated/i)
})

test("migration distinguishes commitments, legal force, source roles and supersession", () => {
  assert.match(sql, /commitment_type text not null check/i)
  assert.match(sql, /implementation_status text not null check/i)
  assert.match(sql, /binding_status text not null check \(binding_status in \('binding', 'non_binding', 'mixed', 'unknown'\)\)/i)
  assert.match(sql, /current_status text not null check/i)
  assert.match(sql, /repeat_recommendation_flag boolean/i)
  assert.match(sql, /superseded_by_commitment_id uuid references/i)
  assert.match(sql, /source_instrument_id <> target_instrument_id/i)
  assert.match(sql, /unique \(policy_legal_instrument_id, accountability_commitment_id, relationship_type\)/i)
})
