import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("attachment quarantine migration requires a scanner decision before availability", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/202608290001_add_resource_suggestion_attachment_quarantine.sql", import.meta.url), "utf8")

  assert.match(sql, /create table public\.resource_submission_attachment_scan_decisions/i)
  assert.match(sql, /decision in \('clean', 'malicious', 'failed'\)/i)
  assert.match(sql, /actor_type in \('administrator', 'scanner_service'\)/i)
  assert.match(sql, /alter table public\.resource_submission_attachment_scan_decisions enable row level security/i)
  assert.match(sql, /revoke all on public\.resource_submission_attachment_scan_decisions from public, anon, authenticated/i)
  assert.match(sql, /attachment cannot be available without a clean scanner-service decision/i)
  assert.match(sql, /clean scan decisions require a scanner-service reference/i)
  assert.match(sql, /security definer/i)
  assert.match(sql, /grant execute .* to service_role/i)
  assert.doesNotMatch(sql, /create policy|storage\.objects|createSignedUrl|public = true/i)
})

test("server exposes metadata-only quarantine review and no attachment delivery endpoint", () => {
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")

  assert.match(server, /app\.get\("\/api\/admin\/resource-submission-attachments\/quarantine", requireAdmin/)
  assert.match(server, /resource_submission_attachments"\)[\s\S]{0,120}\.select\("id,submission_id,display_filename,byte_size,detected_mime_type,status,created_at"\)/)
  assert.doesNotMatch(server, /resource-submission-attachments[^\n]*createSignedUrl/i)
  assert.doesNotMatch(server, /app\.get\("\/api\/resource-submissions\/.*attachment/i)
})
