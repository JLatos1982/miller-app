import test from "node:test"
import assert from "node:assert/strict"

import { legalCorpusV3Fixture as corpus } from "./fixtures/privateArtifactSummaries.js"
import { buildFarmLegalReviewItems, buildFarmReviewItemsFromRuns, buildFarmStatusSnapshot, createFarmSupabasePublisher, validateFarmOwnerRequest } from "../server/farmSupabaseInteraction.js"

test("typed Farm requests reject arbitrary operations and normalize bounded parameters", () => {
  const request = validateFarmOwnerRequest({ request_type: "run_listener", target_id: "mn_bc_inquests_weekly", parameters: { jurisdiction: "BC", depth: "bounded" } })
  assert.equal(request.schema_version, "farm-owner-request-v1")
  assert.match(request.request_fingerprint, /^[a-f0-9]{64}$/)
  assert.throws(() => validateFarmOwnerRequest({ request_type: "shell", target_id: "rm" }), /unsupported/)
  assert.throws(() => validateFarmOwnerRequest({ request_type: "run_listener", target_id: "ok", parameters: { sql: "select 1" } }), /parameters_unsupported/)
})

test("Palantír plan controls are typed and require canonical plan IDs", () => {
  const planId = "palantir-plan:" + "a".repeat(24)
  for (const request_type of ["approve_research_plan", "pause_research", "cancel_research"]) {
    const request = validateFarmOwnerRequest({ request_type, target_id: "samwise_public_records_intelligence", parameters: { plan_id: planId, reason: "owner action" } })
    assert.equal(request.parameters.plan_id, planId)
  }
  assert.throws(() => validateFarmOwnerRequest({ request_type: "approve_research_plan", target_id: "samwise_public_records_intelligence", parameters: { plan_id: "arbitrary" } }), /plan_id_invalid/)
  assert.throws(() => validateFarmOwnerRequest({ request_type: "pause_research", target_id: "other", parameters: { plan_id: planId } }), /target_invalid/)
  assert.equal(validateFarmOwnerRequest({ request_type: "continue_research", target_id: "samwise_public_records_intelligence", parameters: { research_request_id: "research:public-benefits-administration-v2" } }).request_type, "continue_research")
})

test("owner status projection is conversational, bounded, and excludes raw evidence", () => {
  const inventory = [
    { listener_id: "a", enabled: true, status: "no_material_change", execution_target: "samwise", next_run_at: "2026-09-09T00:00:00Z", consecutive_failures: 0 },
    { listener_id: "b", enabled: false, status: "disabled", execution_target: "igor", next_run_at: null, consecutive_failures: 0 },
  ]
  const history = [{ source_family: "miller_location_data_quality", completed_at: "2026-09-08T00:00:00Z", checked: 300, material_changes: 31, owner_review: 16, domain_counts: { housing_homelessness: { checked: 4, changed: 1, relevant: 1, owner_review: 1 } }, cross_lane_discoveries: [{ canonical_id: "legal:smith", primary_domain: "housing_homelessness", secondary_domains: ["human_rights_public_services"], outcome: "merits finding reviewed", private_narrative: "excluded" }] }]
  const snapshot = buildFarmStatusSnapshot({ inventory, history, workerHealth: { igor: { available: true, authenticated: true, state: "idle", version: "v1", capabilities: ["structured_diff"] } }, now: new Date("2026-09-08T01:00:00Z") })
  assert.equal(snapshot.overall_state, "attention")
  assert.deepEqual(snapshot.digest.listeners, { registered: 2, enabled: 1, disabled: 1, failed: 0, deferred: 0, recent_runs: 1, checked_this_week: 300 })
  assert.equal(snapshot.digest.data_quality.proposed_corrections, 31)
  assert.deepEqual(snapshot.digest.domains.housing_homelessness, { checked: 4, changed: 1, relevant: 1, owner_review: 1 })
  assert.equal(snapshot.digest.cross_lane.count, 1)
  assert.doesNotMatch(JSON.stringify(snapshot), /excluded/)
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

test("legal corpus produces a bounded conversational owner-review packet", () => {
  const items = buildFarmLegalReviewItems(corpus.new_records, "2026-09-08T00:00:00Z")
  assert.equal(items.length, 15)
  assert.ok(items.every(item => item.item_type === "legal_decision_candidate" && item.review_state === "pending"))
  assert.ok(items.every(item => item.metadata.publication_authority === false && item.metadata.mutation_authority === false))
  assert.doesNotMatch(JSON.stringify(items), /medical history|credential|hmac|service_role/i)
  assert.match(items.find(item => item.metadata.citation === "2025 CHRT 6").summary, /compliance_order/)
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

test("publisher exposes Samwise research requests through a separate typed mailbox read", async () => {
  const calls = []
  const publisher = createFarmSupabasePublisher({
    enabled: true,
    url: "https://private-example.supabase.co",
    serviceRoleKey: "x".repeat(40),
    ownerId: "11111111-1111-4111-8111-111111111111",
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return { ok: true, json: async () => [{ id: "22222222-2222-4222-8222-222222222222", request_type: "research_public_records", target_id: "samwise_public_records_intelligence", parameters: { topic: "workplace safety" } }] }
    },
  })
  const request = await publisher.fetchPendingSamwiseResearchRequest()
  assert.equal(request.target_id, "samwise_public_records_intelligence")
  assert.match(calls[0].url, /request_type=in\.\(research_public_records,approve_research_plan,continue_research,pause_research,cancel_research\)/)
  assert.match(calls[0].url, /target_id=eq\.samwise_public_records_intelligence/)
  assert.doesNotMatch(calls[0].url, /run_listener/)
})
