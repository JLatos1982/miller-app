import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import registry from "../src/data/farm-listener-registry-v1.json" with { type: "json" }
import resources from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import { auditCanonicalResources, FARM_SELF_HEALING_POLICY } from "../server/farmDataQuality.js"
import { buildFarmEvidenceGraph, reconcileFarmGraphEdge, suggestLegalSupportPathways } from "../server/farmEvidenceGraph.js"
import { executeFarmJob, farmJobDue, farmListenerInventory, planFarmJobs, runFarmCycle } from "../server/farmJobScheduler.js"
import { createFarmOperationsStore } from "../server/farmOperationsStore.js"
import { detectFarmListenerAnomaly, normalizeFarmListenerResult, protectFarmListenerMemory, recommendTransparentCadence, reconcileListenerDocument, transparentSourceYield, validateFarmListenerRegistry } from "../server/farmListenerFramework.js"
import { compareLegalIndexDocuments, parseLegalDecisionIndex, runLegalIndexListener } from "../server/farmLegalListeners.js"
import { deterministicQwenFallback, runFarmQwenTriage, validateFarmQwenProposal, validateFarmQwenTask } from "../server/farmQwenTriage.js"
import { inventoryFarmSecurityMaintenance, runFarmSecuritySanity } from "../server/farmSecurityMaintenance.js"
import { buildFarmWeeklyOwnerEmail, privacySafeFarmRun } from "../server/farmWeeklyOwnerEmail.js"

const now = new Date("2026-09-07T12:00:00.000Z")
const listener = (overrides = {}) => ({ ...registry.listeners[0], listener_id: "test_listener", enabled: true, schedule: { kind: "interval", days: 7, first_run_at: "2026-09-01T00:00:00.000Z" }, adapter: "test", ...overrides })

test("central registry has explainable read-only schedules and no publication authority", () => {
  const result = validateFarmListenerRegistry(registry)
  assert.equal(result.total, registry.listeners.length)
  assert.ok(result.enabled >= 10)
  assert.ok(registry.listeners.every(item => item.mutation_authority === false && item.publication_authority === false))
  assert.ok(registry.listeners.some(item => item.execution_target === "igor" && item.enabled))
  assert.ok(registry.listeners.some(item => item.listener_id === "farm_production_health_weekly" && item.enabled))
  assert.ok(registry.listeners.some(item => !item.enabled && item.yield_class === "milestone_only"))
})

test("listener results normalize to one stable contract and flag bulk anomalies", () => {
  const value = normalizeFarmListenerResult({ fetched: 100, new_documents: 75, owner_review_count: 2 })
  assert.equal(value.checked, 100)
  assert.equal(value.owner_review, 2)
  assert.equal(detectFarmListenerAnomaly(value).action, "quarantine_owner_review")
  assert.match(value.output_fingerprint, /^[a-f0-9]{64}$/)
})

test("document reconciliation suppresses identical documents and links same-event evidence", () => {
  const prior = [{ listener_id: "x", source_id: "a", document_fingerprint: "one", event_fingerprint: "event" }]
  assert.equal(reconcileListenerDocument({ listenerId: "x", sourceId: "a", documentFingerprint: "one", eventFingerprint: "event", previousDocuments: prior }).change, "unchanged")
  assert.equal(reconcileListenerDocument({ listenerId: "x", sourceId: "b", documentFingerprint: "two", eventFingerprint: "event", previousDocuments: prior }).event_disposition, "existing_event_new_evidence")
})

test("transparent yield uses auditable counts rather than an opaque score", () => {
  const result = transparentSourceYield([{ status: "completed", checked: 100, new_events: 1, existing_events_strengthened: 1, material_changes: 0, duplicates_suppressed: 20, cost_usd: 0 }])
  assert.equal(result.qualifying_per_100_documents, 2)
  assert.equal(result.duplicate_rate, 0.2)
  assert.equal(result.yield_class, "high_yield")
})

test("cadence recommendations require enough transparent history and never self-apply", () => {
  const early = recommendTransparentCadence(listener(), { completed_runs: 1, failure_rate: 0, qualifying_per_100_documents: 0, material_items_per_cycle: 0, documents_checked: 100 })
  assert.equal(early.action, "observe")
  const quiet = recommendTransparentCadence(listener(), { completed_runs: 3, failure_rate: 0, qualifying_per_100_documents: 0, material_items_per_cycle: 0, documents_checked: 300 })
  assert.equal(quiet.days, 30)
})

test("scheduler selects due jobs, records next run and never grants mutation authority", async () => {
  assert.equal(farmJobDue(listener(), {}, now), true)
  assert.equal(planFarmJobs({ registry: { schema_version: "farm-listener-registry-v1", listeners: [listener()] }, state: {}, now }).length, 1)
  const result = await executeFarmJob({ listener: listener(), state: { jobs: {} }, adapter: async () => ({ checked: 3, new_documents: 1, memory: { documents: [1] } }), workerHealth: {}, now: (() => { const times = [now, new Date(now.getTime() + 20)]; return () => times.shift() || now })() })
  assert.equal(result.run.new_documents, 1)
  assert.equal(result.run.mutation_authority, false)
  assert.ok(result.state.next_run_at)
})

test("failed listeners preserve prior memory and back off", async () => {
  const prior = { schema_version: "farm-job-state-v1", jobs: { test_listener: { listener_memory: { documents: ["safe"] }, consecutive_failures: 1 } } }
  const result = await executeFarmJob({ listener: listener(), state: prior, adapter: async () => { throw new Error("source unavailable") }, now: () => now })
  assert.equal(result.run.status, "failed")
  assert.deepEqual(result.state.listener_memory, { documents: ["safe"] })
  assert.equal(result.state.consecutive_failures, 2)
  assert.deepEqual(protectFarmListenerMemory({ previous: { a: 1 }, candidate: { a: 2 }, result: result.run }), { a: 1 })
})

test("Igor work defers without silent Samwise takeover", async () => {
  const igor = listener({ execution_target: "igor" })
  let called = false
  const result = await executeFarmJob({ listener: igor, state: { jobs: {} }, workerHealth: { igor: { available: false } }, adapter: async () => { called = true }, now: () => now })
  assert.equal(result.run.status, "deferred")
  assert.equal(called, false)
  assert.match(result.run.notes.join(" "), /did not take over/)
})

test("cycle obeys max-job and lock store prevents overlap", async () => {
  const small = { schema_version: "farm-listener-registry-v1", listeners: [listener({ listener_id: "one" }), listener({ listener_id: "two" })] }
  const cycle = await runFarmCycle({ registry: small, state: { jobs: {} }, adapters: { test: async () => ({ checked: 1 }) }, now: () => now, maxJobs: 1 })
  assert.equal(cycle.runs.length, 1)
  const root = mkdtempSync(join(tmpdir(), "farm-ops-"))
  const first = createFarmOperationsStore(root, { now: () => now })
  const second = createFarmOperationsStore(root, { now: () => now })
  assert.equal(first.acquire().acquired, true)
  assert.deepEqual(second.acquire(), { acquired: false, reason: "already_running" })
  first.release()
})

test("operations history is append-only and inventory exposes last and next runs", () => {
  const root = mkdtempSync(join(tmpdir(), "farm-history-"))
  const store = createFarmOperationsStore(root)
  store.appendRuns([{ listener_id: "one", status: "completed", checked: 1 }, { listener_id: "one", status: "no_material_change", checked: 2 }])
  assert.equal(store.loadHistory().length, 2)
  assert.equal(readFileSync(store.paths.historyPath, "utf8").trim().split("\n").length, 2)
  const inventory = farmListenerInventory({ registry: { schema_version: "farm-listener-registry-v1", listeners: [listener({ listener_id: "one" })] }, state: { jobs: { one: { last_attempted_at: now.toISOString(), next_run_at: "2026-09-14T12:00:00.000Z" } } }, history: store.loadHistory(), now })
  assert.equal(inventory[0].yield.documents_checked, 3)
})

test("legal index adapter baselines existing links then detects deterministic changes", async () => {
  const html = '<main><a href="/law-library/decisions/2026/example">Example decision</a></main>'
  const documents = parseLegalDecisionIndex(html, { baseUrl: "https://www.bchrt.bc.ca/law-library/decisions/recent/", sourceId: "bchrt" })
  assert.equal(documents.length, 1)
  assert.equal(compareLegalIndexDocuments(documents, { documents }).unchanged_documents.length, 1)
  const result = await runLegalIndexListener({ listenerId: "bchrt", url: "https://www.bchrt.bc.ca/law-library/decisions/recent/", fetchImpl: async () => ({ ok: true, text: async () => html }) })
  assert.equal(result.new_documents, 0)
  assert.match(result.notes[0], /baseline/i)
})

test("Qwen output is constrained, evidence-backed and optional", async () => {
  const accepted = validateFarmQwenProposal({ task: "document_role", sourceText: "The Tribunal made a procedural decision only.", proposal: { label: "procedural_ruling", confidence: 0.9, evidence: "procedural decision" } })
  assert.equal(accepted.advisory_only, true)
  assert.throws(() => validateFarmQwenProposal({ task: "document_role", sourceText: "No support", proposal: { label: "merits_decision", confidence: 1, evidence: "invented phrase" } }), /evidence_not_supported/)
  assert.throws(() => validateFarmQwenTask("indigenous_identity"), /forbidden/)
  const malformed = await runFarmQwenTriage({ task: "document_role", sourceText: "A decision", fetchImpl: async () => ({ ok: true, json: async () => ({ message: { content: "not json" } }) }) })
  assert.equal(malformed.validation_result, "deterministic_fallback")
  assert.equal(deterministicQwenFallback({ task: "project_route" }).label, null)
})

test("event graph connects canonical incidents, Watch, legal evidence and support without auto-merging", () => {
  const incident = { public_incident_id: "incident-1", title: "Hospital complaint", related_watch_chain_id: "watch-1" }
  const watch = { chain_id: "watch-1", title: "Hospital accountability" }
  const legal = { legal_record_id: "legal-1", case_name: "Case", process_role: "judicial_review", related_event_id: "incident-1", public_disposition: "owner_review" }
  const resource = { canonical_resource_id: "resource-1", name: "Clinic", project_visibility: ["miller_north"] }
  const graph = buildFarmEvidenceGraph({ incidents: [incident], watchChains: [watch], legalRecords: [legal], resources: [resource] })
  assert.equal(graph.counts.nodes, 4)
  assert.ok(graph.edges.some(edge => edge.type === "tracked_in"))
  assert.ok(graph.edges.some(edge => edge.type === "judicial_review_of" && edge.owner_review))
  const proposal = reconcileFarmGraphEdge(graph.edges, { type: "same_event_as", from: "incident:a", to: "incident:b" })
  assert.equal(proposal.automatic_merge, false)
})

test("incident-to-support mapping is general, non-advisory and owner reviewed", () => {
  const result = suggestLegalSupportPathways({ record: { title: "Hospital discrimination complaint" }, resources: resources.records })
  assert.match(result.disclaimer, /does not determine/)
  assert.equal(result.automatic_publication, false)
  assert.ok(result.suggestions.every(item => item.owner_review_required))
})

test("incident-to-support mapping respects province and Miller North visibility", () => {
  const candidates = [
    { canonical_resource_id: "bc", name: "BC help", organization: "BC Org", province: "BC", categories: ["legal_rights"], subcategories: ["human rights"], project_visibility: ["miller_north"] },
    { canonical_resource_id: "ab", name: "AB help", organization: "AB Org", province: "Alberta", categories: ["legal_rights"], subcategories: ["human rights"], project_visibility: ["miller_north"] },
    { canonical_resource_id: "miller", name: "Miller only", organization: "Miller Org", province: "BC", categories: ["legal_rights"], subcategories: ["human rights"], project_visibility: ["miller"] },
  ]
  const result = suggestLegalSupportPathways({ record: { public_incident_id: "i", title: "Hospital discrimination complaint", province: "British Columbia" }, resources: candidates })
  assert.deepEqual(result.suggestions.map(item => item.canonical_resource_id), ["bc"])
})

test("weekly owner email uses bounded structured fields, reports worker deferral and strips sensitive input", () => {
  const unsafe = { listener_id: "x", source_family: "legal", target_worker: "igor", status: "deferred", completed_at: now.toISOString(), checked: 2, owner_review: 0, output_titles: ["Public citation"], raw_source_body: "private medical history", credential_value: "redacted-test-token" }
  const safe = privacySafeFarmRun(unsafe)
  assert.equal("raw_source_body" in safe, false)
  const email = buildFarmWeeklyOwnerEmail({ runs: [unsafe], now })
  assert.doesNotMatch(JSON.stringify(email), /private medical history|redacted-test-token/)
  assert.match(email.subject, /Farm Weekly/)
  assert.equal(email.sections.igor.deferred, 1)
  assert.equal(email.nothing_material_changed, false)
})

test("data quality creates proposals, never silent production repairs", () => {
  const report = auditCanonicalResources([{ canonical_resource_id: "r", name: " Program ", organization: "Org", province: "BC", website: "https://example.org/?utm_source=x", last_verified_date: "2026-09-01" }], { now })
  assert.ok(report.safe_correction_candidates.length >= 1)
  assert.equal(report.production_mutations, 0)
  assert.equal(FARM_SELF_HEALING_POLICY.production_mutation_authority, false)
})

test("security maintenance inventory separates active, inactive, planned and obsolete states", () => {
  const inventory = inventoryFarmSecurityMaintenance()
  assert.ok(inventory.systems.some(item => item.status === "activated_read_only"))
  assert.ok(inventory.systems.some(item => item.status === "implemented_inactive"))
  assert.ok(inventory.systems.some(item => item.status === "planned_only"))
  assert.ok(inventory.systems.some(item => item.status === "obsolete_for_automation"))
  assert.equal(runFarmSecuritySanity({ environment: {} }).secret_values_reported, false)
})
