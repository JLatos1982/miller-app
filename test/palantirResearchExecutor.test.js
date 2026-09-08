import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { learningLedgerFixture as learning, palantirProofFixture as proof } from "./fixtures/privateArtifactSummaries.js"
import { validateListenerManifest } from "../server/farmIgorWorker.js"
import { buildPalantirReviewPacket, cancelPalantirExecution, createPalantirResearchPlan, executePalantirResearch, pausePalantirExecution, resumePalantirExecution, transitionPalantirResearchPlan } from "../server/palantirResearchExecutor.js"
import { persistPalantirExecution, persistPalantirPlan, readPalantirExecutionStore } from "../server/palantirExecutionStore.js"
import { calculatePalantirLearningImpact, createPalantirLearningLesson, proposePalantirRulePromotion } from "../server/palantirOperationalLearning.js"
import { processPalantirOwnerRequest } from "../server/palantirOwnerWorkflow.js"
import { validateFarmOwnerRequest } from "../server/farmSupabaseInteraction.js"

const basePlan = (sources = ["research:one", "research:two"]) => ({
  schema_version: "samwise-universal-research-plan-v1",
  capability_id: "samwise_public_records_intelligence",
  research_request_id: "research:12345678",
  request_fingerprint: "a".repeat(64),
  request_type: "research_public_records",
  parameters: { topic: "bounded test", depth: "single" },
  source_plan: sources.map(source_id => ({ source_id, source_family: "government_audits", jurisdiction: "Alberta", operations: ["exact_document_review"], scheduled_listener_id: null, selection_score: 10, selection_reasons: ["domain:government_services"] })),
  limits: { sources: sources.length, documents: 12, branch_depth: 2 },
  state: "planned",
  arbitrary_url_allowed: false,
  arbitrary_command_allowed: false,
  automatic_execution: false,
  mutation_authority: false,
  publication_authority: false,
})

function approvedPlan(sources) {
  const draft = createPalantirResearchPlan(basePlan(sources), { now: new Date("2026-09-08T00:00:00Z") })
  return transitionPalantirResearchPlan(draft, "approved", { actor: "owner", now: new Date("2026-09-08T00:00:01Z") })
}

test("Palantír requires owner approval and supports explicit plan state controls", () => {
  const draft = createPalantirResearchPlan(basePlan(), { now: new Date("2026-09-08T00:00:00Z") })
  assert.equal(draft.state, "draft")
  assert.equal(draft.display_name, "Palantír")
  assert.ok(draft.source_plan.every(source => source.why_selected.length && source.document_budget > 0 && source.estimated_cost_usd === 0))
  assert.throws(() => transitionPalantirResearchPlan(draft, "approved", { actor: "igor" }), /owner_approval/)
  const approved = transitionPalantirResearchPlan(draft, "approved", { actor: "owner" })
  const paused = transitionPalantirResearchPlan(approved, "paused", { actor: "owner" })
  assert.equal(transitionPalantirResearchPlan(paused, "approved", { actor: "owner" }).state, "approved")
  assert.equal(transitionPalantirResearchPlan(approved, "cancelled", { actor: "owner" }).state, "cancelled")
})

test("executor checkpoints each source and resumes at the interrupted source", async () => {
  const plan = approvedPlan()
  const persisted = []
  const first = await executePalantirResearch({
    plan,
    adapters: {
      "research:one": async () => ({ documents: [{ id: "one", source_url: "https://example.org/one", review_level: "full_document" }], findings: [{ id: "finding-one", title: "One" }] }),
      "research:two": async () => { throw new Error("source_timeout") },
    },
    persistCheckpoint: async state => persisted.push(structuredClone(state)),
  })
  assert.equal(first.state, "paused")
  assert.equal(first.source_checkpoints[0].status, "completed")
  assert.equal(first.source_checkpoints[1].status, "interrupted")
  const resumed = await executePalantirResearch({
    plan,
    execution: resumePalantirExecution(first),
    adapters: {
      "research:one": async () => { throw new Error("completed_source_replayed") },
      "research:two": async () => ({ documents: [{ id: "two", source_url: "https://example.org/two", review_level: "full_document" }], findings: [{ id: "finding-two", title: "Two" }] }),
    },
  })
  assert.equal(resumed.state, "completed")
  assert.deepEqual(resumed.documents.map(item => item.document_id), ["one", "two"])
  assert.ok(persisted.length >= 2)
})

test("failure modes preserve state and quarantine anomalous source changes", async () => {
  const plan = approvedPlan(["research:one"])
  const workerUnavailable = await executePalantirResearch({ plan, igorManifestValidator: async () => { throw new Error("igor_offline") } })
  assert.equal(workerUnavailable.state, "paused")
  assert.equal(workerUnavailable.stopping_reason, "igor_manifest_validation_unavailable")
  const malformed = await executePalantirResearch({ plan, adapters: { "research:one": async () => "bad" } })
  assert.equal(malformed.state, "paused")
  assert.equal(malformed.source_checkpoints[0].status, "interrupted")
  const anomalous = await executePalantirResearch({ plan, adapters: { "research:one": async () => ({ documents: [], findings: [], anomaly: true }) } })
  assert.equal(anomalous.state, "owner_review")
  assert.equal(anomalous.source_checkpoints[0].status, "quarantined")
  assert.equal(anomalous.documents.length, 0)
})

test("duplicate documents are not replayed and owner cancellation preserves completed work", async () => {
  const plan = approvedPlan(["research:one"])
  const result = await executePalantirResearch({ plan, adapters: { "research:one": async () => ({ documents: [{ id: "same", fingerprint: "fp" }, { id: "same-copy", fingerprint: "fp" }], findings: [] }) } })
  assert.equal(result.documents.length, 1)
  const running = { ...result, state: "running", stopping_reason: null }
  const paused = pausePalantirExecution(running)
  const cancelled = cancelPalantirExecution(paused)
  assert.equal(cancelled.state, "cancelled")
  assert.equal(cancelled.documents.length, 1)
  assert.equal(cancelled.mutation_authority, false)
})

test("atomic execution store rejects checkpoint regression", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "palantir-store-"))
  const file = path.join(directory, "state.json")
  const plan = approvedPlan(["research:one"])
  persistPalantirPlan(file, plan)
  const complete = { schema_version: "palantir-research-execution-v1", execution_id: "exec-1", source_checkpoints: [{ source_id: "research:one", status: "completed" }] }
  persistPalantirExecution(file, complete)
  assert.throws(() => persistPalantirExecution(file, { ...complete, source_checkpoints: [{ source_id: "research:one", status: "pending" }] }), /checkpoint_regression/)
  assert.deepEqual(readPalantirExecutionStore(file).production_data_mutations, 0)
})

test("Igor validates only bounded registered-source manifests", () => {
  const plan = approvedPlan(["research:one"])
  const valid = validateListenerManifest({ plan_id: plan.plan_id, sources: plan.source_plan.map(item => ({ source_id: item.source_id, adapter: item.execution_adapter, document_budget: item.document_budget })) })
  assert.equal(valid.valid, true)
  assert.equal(validateListenerManifest({ plan_id: "bad", sources: [{ source_id: "https://arbitrary.example", adapter: "crawl", document_budget: 999 }] }).valid, false)
})

test("operational lessons need repeated evidence and a regression test before promotion", () => {
  const one = createPalantirLearningLesson({ lesson_type: "parser_rule", source_id: "research:one", observation: "Rows need a composite identity", proposed_rule: "Use source, entity and date", examples: [{ document_id: "one", evidence: "first row" }] })
  assert.throws(() => proposePalantirRulePromotion(one, { regressionTest: true, reviewedBy: "owner" }), /evidence_insufficient/)
  const two = createPalantirLearningLesson({ lesson_type: "parser_rule", source_id: "research:one", observation: "Rows need a composite identity", proposed_rule: "Use source, entity and date", examples: [{ document_id: "one", evidence: "first row" }, { document_id: "two", evidence: "second row" }] })
  assert.equal(proposePalantirRulePromotion(two, { regressionTest: true, reviewedBy: "owner" }).promoted, true)
  assert.equal(calculatePalantirLearningImpact({ beforeFalsePositives: 5, afterFalsePositives: 2 }).reduced_by, 3)
})

test("proof cycles exercised three unrelated source shapes without consumer publication", () => {
  assert.deepEqual(proof.summary, { plans_generated: 3, plans_approved: 3, plans_completed: 3, sources_executed: 3, full_documents_reviewed: 6, findings: 6, cross_domain_discoveries: 4, igor_jobs_completed: 3, miller_resource_opportunities: 0, miller_north_candidates: 0, future_project_candidates: 4, owner_intelligence_items: 6, external_api_cost_usd: 0, qwen_usage: 0, production_database_writes: 0, publication_actions: 0 })
  assert.ok(proof.cycles.every(cycle => cycle.checkpoints_written >= 2 && cycle.execution.state === "completed"))
  assert.equal(proof.cycles[0].plan.continuation_of, "research:public-benefits-administration-v2")
  assert.equal(proof.cycles[0].plan.source_plan[0].source_id, "research:alberta_auditor_general_reports")
  assert.equal(learning.summary.lessons, 9)
  assert.equal(learning.summary.promoted_shared_rules, 6)
  assert.doesNotMatch(JSON.stringify(proof), /miller_north_evidence_candidate|miller_resource_candidate/)
  assert.equal(buildPalantirReviewPacket(proof.cycles[0].execution).raw_logs_included, false)
})

test("typed owner request becomes a draft plan and executes only after a separate approval", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "palantir-owner-")); const file = path.join(directory, "store.json")
  const sourceCatalog = { schema_version: "samwise-universal-source-catalog-v1", sources: [{ source_id: "research:one", name: "One", jurisdiction: "Alberta", source_family: "government_audits", public_index: "https://example.org", supported_domains: ["government_services"], selection_terms: ["fairness"], operations: ["exact_document_review"], enabled: true, recent_capable: true, historical_capable: true, scheduled_listener_id: null }] }
  const request = validateFarmOwnerRequest({ request_type: "research_public_records", target_id: "samwise_public_records_intelligence", parameters: { topic: "fairness", jurisdiction: "Alberta", domains: ["government_services"], depth: "single" } })
  const planned = await processPalantirOwnerRequest({ request, sourceCatalog, executionStorePath: file, now: new Date("2026-09-08T00:00:00Z") })
  assert.equal(planned.status, "owner_review")
  assert.equal(readPalantirExecutionStore(file).executions.length, 0)
  const approval = validateFarmOwnerRequest({ request_type: "approve_research_plan", target_id: "samwise_public_records_intelligence", parameters: { plan_id: planned.plan.plan_id, reason: "approved bounded test" } })
  const executed = await processPalantirOwnerRequest({ request: approval, sourceCatalog, executionStorePath: file, adapters: { "research:one": async () => ({ documents: [{ id: "doc", source_url: "https://example.org/doc", review_level: "full_document" }], findings: [{ id: "finding", title: "Finding" }] }) } })
  assert.equal(executed.status, "completed")
  assert.equal(readPalantirExecutionStore(file).executions.length, 1)
  assert.equal(executed.production_data_mutations, 0)
})
