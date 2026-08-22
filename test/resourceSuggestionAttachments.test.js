import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const migrationUrl = new URL("../supabase/migrations/202608280001_add_resource_suggestion_attachments.sql", import.meta.url)
const pgTapUrl = new URL("../supabase/tests/resource_suggestion_attachments.test.sql", import.meta.url)

test("resource-suggestion attachment migration is additive and private", () => {
  const sql = fs.readFileSync(migrationUrl, "utf8")

  assert.match(sql, /create table public\.resource_submission_attachments/i)
  assert.match(sql, /submission_id uuid not null references public\.resource_submissions\(id\) on delete cascade/i)
  assert.match(sql, /storage_path text not null unique check \(btrim\(storage_path\) <> ''\)/i)
  assert.match(sql, /display_filename text not null check \(btrim\(display_filename\) <> ''\)/i)
  assert.match(sql, /byte_size bigint not null check \(byte_size > 0\)/i)
  assert.match(sql, /status text not null default 'pending_scan'/i)
  assert.match(sql, /'pending_scan', 'available', 'rejected', 'deleted'/i)
  assert.match(sql, /alter table public\.resource_submission_attachments enable row level security/i)
  assert.match(sql, /revoke all on public\.resource_submission_attachments from public, anon, authenticated/i)
  assert.match(sql, /grant all on public\.resource_submission_attachments to service_role/i)
  assert.match(sql, /resource-suggestion-attachments'.*false/is)
  assert.match(sql, /Intentionally no storage\.objects policy is created/i)
  assert.doesNotMatch(sql, /alter table public\.resource_submissions/i)
  assert.doesNotMatch(sql, /create policy/i)
  assert.doesNotMatch(sql, /\bdelete\s+from\b|\btruncate\b|drop table/i)
})

test("attachment pgTAP coverage exercises schema, grants, and private storage", () => {
  const sql = fs.readFileSync(pgTapUrl, "utf8")

  assert.match(sql, /select plan\(22\)/i)
  assert.match(sql, /a submission can have multiple attachments/i)
  assert.match(sql, /null required submission is rejected/i)
  assert.match(sql, /unsupported attachment status is rejected/i)
  assert.match(sql, /anonymous users have no attachment table privileges/i)
  assert.match(sql, /ordinary authenticated users have no attachment table privileges/i)
  assert.match(sql, /service role can manage attachment metadata/i)
  assert.match(sql, /attachment metadata has row level security enabled/i)
  assert.match(sql, /attachment storage bucket exists and is private/i)
  assert.match(sql, /no storage object policy grants direct access to the attachment bucket/i)
})
