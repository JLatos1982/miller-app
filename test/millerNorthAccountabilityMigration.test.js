import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

const sql = readFileSync(new URL("../supabase/migrations/20260906033000_miller_north_accountability_actions_v1.sql", import.meta.url), "utf8")

test("accountability migration stays private, review-gated and relationship-first", () => {
  for (const table of ["miller_north_accountability_actions", "miller_north_accountability_cohorts", "miller_north_accountability_action_sources", "miller_north_accountability_action_incident_links", "miller_north_accountability_action_cohort_links"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"))
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"))
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`, "i"))
  }
  assert.match(sql, /accountability_chain_id text not null/i)
  assert.match(sql, /accountability_stage text not null check \(accountability_stage in \('allegation'/i)
  assert.match(sql, /unique \(accountability_action_id, incident_id, relationship_type\)/i)
  assert.match(sql, /unique \(accountability_action_id, accountability_cohort_id, relationship_type\)/i)
  assert.match(sql, /source_role text not null check \(source_role in \('underlying_incident', 'investigation', 'finding', 'recommendation', 'commitment', 'implementation', 'follow_up'\)/i)
  assert.match(sql, /not owner_review_flag or publication_state in \('staged_private_review', 'owner_review_required', 'publication_blocked'\)/i)
  assert.match(sql, /revoke all on public\.miller_north_accountability_cohorts/i)
  assert.doesNotMatch(sql, /grant .* to anon|grant .* to authenticated|create policy/i)
})
