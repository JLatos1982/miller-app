import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import registry from "../src/data/samwise-capability-intelligence-registry-v1.json" with { type: "json" }
import seededPolicy from "../src/data/samwise-autonomy-policy-v1.json" with { type: "json" }
import { HARD_PROHIBITED_AUTONOMY, autonomyPolicyDecision, createFarmStewardStore, createSamwiseAutonomyPolicy, deriveAutonomyPromotionProposals, deriveListenerOpportunities, recordStewardLearning, runFarmStewardOnce, stewardMaintenanceOpportunities } from "../server/samwiseFarmSteward.js"

const temporaryRoot = () => mkdtempSync(path.join(tmpdir(), "samwise-farm-steward-"))
const entry = input => ({ task_type: "safe_local_check", capability_id: "samwise_capability_intelligence", autonomy_level: "autonomous_allowed", allowed_environments: ["local"], local_only: true, network_allowed: false, external_service_allowed: false, paid_service_allowed: false, mutation_allowed: false, publication_allowed: false, outreach_allowed: false, max_cost_class: "free_local", max_runtime_ms: 1000, max_items: 1, validation_required: true, required_prior_success_count: 0, required_workflow_confidence: "low", owner_review_after_run: false, owner_approved: true, stop_conditions: ["validation_failure"], rationale: "Test-only bounded local check.", version: "1.0.0", ...input })
const policy = entries => createSamwiseAutonomyPolicy({ schema_version: "samwise-autonomy-policy-v1", version: "1.0.0", entries })

test("seed policy defaults to restrictive, with no activated autonomous entry", () => {
  const seeded = createSamwiseAutonomyPolicy(seededPolicy)
  assert.equal(seeded.default_autonomy_level, "prohibited_autonomous")
  assert.equal(seeded.entries.filter(item => item.autonomy_level === "autonomous_allowed").length, 0)
  assert.equal(autonomyPolicyDecision({ policy: seeded, task: { task_type: "unknown_task" } }).outcome, "prohibited")
})

test("hard prohibitions cover publication, outreach, production mutation, policy changes and paid escalation", () => {
  const approved = policy([entry()])
  for (const task_type of ["publish", "send_email", "outreach", "production_database_mutation", "rls_change", "credential_rotation", "production_deploy", "rewrite_autonomy_policy"]) assert.equal(autonomyPolicyDecision({ policy: approved, task: { task_type } }).outcome, "prohibited")
  assert.ok(HARD_PROHIBITED_AUTONOMY.includes("publish"))
  const deniedCost = autonomyPolicyDecision({ policy: approved, task: { task_type: "safe_local_check", capability_id: "samwise_capability_intelligence", environment: "local", cost_class: "low" } })
  assert.equal(deniedCost.reason, "cost_exceeds_policy")
})

test("earned autonomy requires explicit approval, local-first conditions, validated history and bounded limits", () => {
  const notApproved = policy([entry({ owner_approved: false, autonomy_level: "prepare_only" })])
  assert.equal(autonomyPolicyDecision({ policy: notApproved, task: { task_type: "safe_local_check", capability_id: "samwise_capability_intelligence", environment: "local", cost_class: "free_local" } }).outcome, "prepare_only")
  const approved = policy([entry({ required_prior_success_count: 3, required_workflow_confidence: "moderate" })])
  assert.equal(autonomyPolicyDecision({ policy: approved, task: { task_type: "safe_local_check", capability_id: "samwise_capability_intelligence", environment: "local", cost_class: "free_local" }, prior_success_count: 2, workflow_confidence: "moderate" }).reason, "earned_autonomy_not_established")
  const yes = autonomyPolicyDecision({ policy: approved, task: { task_type: "safe_local_check", capability_id: "samwise_capability_intelligence", environment: "local", cost_class: "free_local" }, prior_success_count: 3, workflow_confidence: "moderate" })
  assert.equal(yes.eligible, true)
  assert.equal(autonomyPolicyDecision({ policy: approved, task: { task_type: "safe_local_check", capability_id: "samwise_capability_intelligence", environment: "remote", cost_class: "free_local" }, prior_success_count: 3, workflow_confidence: "moderate" }).reason, "environment_not_allowed")
})

test("steward executes only an eligible validated local task, otherwise safely no-ops", async () => {
  const root = temporaryRoot()
  const approved = policy([entry()])
  const local = { task_id: "safe_local_check", task_type: "safe_local_check", capability_id: "samwise_capability_intelligence", environment: "local", cost_class: "free_local", network: false, external_service: false, mutation: false, publication: false, outreach: false, items: 1, estimated_runtime_ms: 10, prior_success_count: 0, workflow_confidence: "low", validation: () => true }
  const unsafe = { ...local, task_id: "paid", task_type: "unknown_paid", cost_class: "high" }
  const result = await runFarmStewardOnce({ root, policy: approved, registry, opportunities: [local, unsafe] })
  assert.equal(result.record.status, "completed")
  assert.deepEqual(result.record.selected_task_ids, ["safe_local_check"])
  assert.equal(result.record.cost.paid_cloud_requests, 0)
  const noWork = await runFarmStewardOnce({ root, policy: createSamwiseAutonomyPolicy(seededPolicy), registry, opportunities: [local] })
  assert.equal(noWork.record.status, "no_eligible_work")
})

test("audit and learning records preserve validation, advisory meaning, and Work Observer's explicit-session boundary", () => {
  const root = temporaryRoot()
  const approved = policy([entry()])
  const run = { schema_version: "samwise-farm-steward-run-v1", run_id: "run-1", started_at: "2026-09-09T00:00:00.000Z", completed_at: "2026-09-09T00:00:01.000Z", status: "completed", summary: "One local check completed.", task_results: [{ task_id: "safe_local_check", outcome: "completed", reason: "validated_local_maintenance", validation: "passed", cost_class: "free_local" }] }
  const learning = recordStewardLearning({ root, run, registry, policy: approved })
  assert.equal(createFarmStewardStore(root).history().length, 1)
  assert.equal(learning.capability_observations_recorded, 1)
  assert.equal(learning.workflow_episodes_recorded, 1)
  assert.equal(learning.work_observer_persistence, "requires_explicit_owner_started_matching_session")
  assert.match(learning.work_observer_event.summary, /local check completed/i)
})

test("promotion and listener opportunities are evidence-based proposals that never activate work", () => {
  const episodes = [0, 1, 2].map(index => ({ episode_id: `episode-${index}`, workflow_signature_id: "workflow-safe", final_outcome: "succeeded", actually_validated: true, owner_intervention: false, capabilities: ["samwise_capability_intelligence"], validations: [{ kind: "local_integrity", status: "passed" }], failures: [] }))
  const proposals = deriveAutonomyPromotionProposals({ episodes, registry })
  assert.equal(proposals.length, 1)
  assert.equal(proposals[0].owner_approval_required, true)
  assert.equal(proposals[0].automatic_activation, false)
  assert.equal(deriveAutonomyPromotionProposals({ episodes: [...episodes, { ...episodes[0], episode_id: "failed", final_outcome: "failed" }], registry }).length, 0)
  const listeners = deriveListenerOpportunities({ observations: [0, 1, 2].map(index => ({ candidate_source: "approved_health_authority_page", workflow_signature: `workflow-${index}`, domain: "health", approved_source: true })), existing_listener_source_families: [] })
  assert.equal(listeners.length, 1)
  assert.equal(listeners[0].automatic_activation, false)
  assert.equal(deriveListenerOpportunities({ observations: [{ candidate_source: "unapproved", approved_source: false }], existing_listener_source_families: [] }).length, 0)
})

test("real maintenance candidates remain prepare-only under the unactivated seed", async () => {
  const root = temporaryRoot()
  const seeded = createSamwiseAutonomyPolicy(seededPolicy)
  const opportunities = stewardMaintenanceOpportunities({ root, registry })
  const result = await runFarmStewardOnce({ root, policy: seeded, registry, opportunities })
  assert.equal(result.record.status, "no_eligible_work")
  assert.ok(result.decisions.every(item => item.decision.outcome === "prepare_only"))
})
