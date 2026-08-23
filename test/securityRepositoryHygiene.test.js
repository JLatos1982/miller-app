import test from "node:test"
import assert from "node:assert/strict"
import { inspectRepositoryHygiene } from "../server/securityRepositoryHygiene.js"

test("repository hygiene reports only sanitized metadata", async () => {
  const result = await inspectRepositoryHygiene({ root: "/repo", files: [".env", "src/client.js"], read: async (file) => file.endsWith("client.js") ? "const value = process.env.SUPABASE_SERVICE_ROLE_KEY" : "REAL_SECRET_VALUE" })
  assert.equal(result.external_requests, 0)
  assert.ok(result.findings.some((item) => item.finding_type === "tracked_sensitive_file"))
  assert.ok(result.findings.some((item) => item.finding_type === "client_service_role_reference"))
  assert.doesNotMatch(JSON.stringify(result), /REAL_SECRET_VALUE/)
})

test("repository hygiene cannot leave the trusted repository root", async () => {
  await assert.rejects(() => inspectRepositoryHygiene({ root: "/repo", files: ["../outside.txt"] }), /repository_scope_denied/)
})
