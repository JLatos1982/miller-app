import test from "node:test"
import assert from "node:assert/strict"

import { buildFarmReviewItemsFromRuns, buildFarmStatusSnapshot, createFarmSupabasePublisher, validateFarmOwnerRequest } from "../server/farmSupabaseInteraction.js"

test("typed Farm requests reject arbitrary operations and normalize bounded parameters", () => {
  const request = validateFarmOwnerRequest({ request_type: "run_listener", target_id: "mn_bc_inquests_weekly", parameters: { jurisdiction: "BC", depth: "bounded" } })
  assert.equal(request.schema_version, "farm-owner-request-v1")
  assert.match(request.request_fingerprint, /^[a-f0-9]{64}$/)
  assert.throws(() => validateFarmOwnerRequest({ request_type: "shell", target_id: "rm" }), /unsupported/)
  assert.throws(() => validateFarmOwnerRequest({ request_type: "run_listener", target_id: "ok", parameters: { sql: "select 1" } }), /parameters_unsupported/)
})

test("owner status projection is conversational, bounded, and excludes raw evidence", () => {
  const inventory = [
    { listener_id: "a", enabled: true, status: "no_material_change", execution_target: "samwise", next_run_at: "2026-09-09T00:00:00Z", consecutive_failures: 0 },
    { listener_id: "b", enabled: false, status: "disabled", execution_target: "igor", next_run_at: null, consecutive_failures: 0 },
  ]
  const history = [{ source_family: "miller_location_data_quality", completed_at: "2026-09-08T00:00:00Z", checked: 300, material_changes: 31, owner_review: 16 }]
  const snapshot = buildFarmStatusSnapshot({ inventory, history, workerHealth: { igor: { available: true, authenticated: true, state: "idle", version: "v1", capabilities: ["structured_diff"] } }, now: new Date("2026-09-08T01:00:00Z") })
  assert.equal(snapshot.overall_state, "attention")
  assert.deepEqual(snapshot.digest.listeners, { registered: 2, enabled: 1, disabled: 1, failed: 0, deferred: 0, recent_runs: 1, checked_this_week: 300 })
  assert.equal(snapshot.digest.data_quality.proposed_corrections, 31)
  assert.equal(snapshot.digest.next_scheduled.listener_id, "a")
  assert.doesNotMatch(JSON.stringify(snapshot), /raw_body|credential|medical narrative/i)
})

test("review packet generation uses bounded metadata and no publication authority", () => {
  const items = buildFarmReviewItemsFromRuns([{ listener_id: "legal_sk", source_family: "saskatchewan_human_rights", project_scope: "both", status: "completed", checked: 8, owner_review: 1, output_titles: ["2026 SKHRC 1"], completed_at: "2026-09-08T00:00:00Z" }])
  assert.equal(items.length, 1)
  assert.equal(items[0].item_type, "legal_decision_candidate")
  assert.equal(items[0].review_state, "pending")
  assert.deepEqual(Object.keys(items[0].metadata).sort(), ["counts", "listener_id", "status", "suggested_action"])
})

test("Supabase publisher is inert without configuration and uses only typed tables when enabled", async () => {
  const disabled = createFarmSupabasePublisher()
  assert.deepEqual(await disabled.publishStatus({}), { status: "disabled" })
  const calls = []
  const publisher = createFarmSupabasePublisher({
    enabled: true,
    url: "https://example.supabase.co",
    serviceRoleKey: "x".repeat(40),
    ownerId: "11111111-1111-4111-8111-111111111111",
    fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response(null, { status: 201 }) },
  })
  const snapshot = buildFarmStatusSnapshot({ now: new Date("2026-09-08T01:00:00Z") })
  assert.deepEqual(await publisher.publishStatus(snapshot), { status: "published" })
  assert.match(calls[0].url, /farm_owner_status_history$/)
  assert.doesNotMatch(calls[0].options.body, /serviceRoleKey|authorization/)
})

test("publisher reads and completes only bounded runnable mailbox requests", async () => {
  const calls = []
  const publisher = createFarmSupabasePublisher({
    enabled: true,
    url: "https://private-example.supabase.co",
    serviceRoleKey: "x".repeat(40),
    ownerId: "11111111-1111-4111-8111-111111111111",
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      if (options.method === "GET") return { ok: true, json: async () => [{ id: "22222222-2222-4222-8222-222222222222", request_type: "run_listener", target_id: "legal_bchrt_recent_biweekly" }] }
      return { ok: true, json: async () => [] }
    },
  })
  const request = await publisher.fetchRunnableRequest()
  assert.equal(request.target_id, "legal_bchrt_recent_biweekly")
  await publisher.completeRequest(request.id, { state: "completed", resultCode: "completed_no_change", resultReference: "run-1" })
  assert.match(calls[0].url, /state=eq\.pending/)
  assert.doesNotMatch(calls[0].url, /research_case/)
  assert.equal(JSON.parse(calls[1].options.body).state, "completed")
})
