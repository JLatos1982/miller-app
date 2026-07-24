import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const migrationUrl = new URL("../supabase/migrations/202607230001_drop_broad_tavily_read_policy.sql", import.meta.url)

test("broad Tavily read-policy migration drops only the unrestricted policy", () => {
  const sql = fs.readFileSync(migrationUrl, "utf8")

  assert.match(sql, /drop policy if exists "Enable read access for all users"\s+on public\.tavily_resources/i)
  assert.doesNotMatch(sql, /drop policy[^;]*"Public can read approved tavily resources"/i)
  assert.doesNotMatch(sql, /resource_submissions|site_events/i)
  assert.doesNotMatch(sql, /\bdelete\b|\btruncate\b|drop table/i)
})
