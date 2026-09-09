import assert from "node:assert/strict"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { buildSamwiseBrief, compactOwnerAdvisoryRetrieval, createOwnerAdvisory, createOwnerAdvisoryInbox, generateOwnerAdvisories, meaningfulOwnerAdvisory, privateOwnerAdvisoryPersistencePlan } from "../server/samwiseOwnerAdvisories.js"

const temporaryRoot = () => mkdtempSync(path.join(tmpdir(), "samwise-owner-advisories-"))
const advisory = input => createOwnerAdvisory({ created_at: "2026-09-09T00:00:00.000Z", project: "miller-app", advisory_type: "repeated_failure", title: "Native app validation has repeated observed failures", concise_summary: "Two bounded outcomes need owner review.", significance: "meaningful", confidence: "low", evidence_count: 2, source_system: "capability_intelligence", source_ids: ["signal-1", "obs-1"], affected_capabilities: ["native_app_build_validation"], suggested_action: "Review before changing routing.", owner_decision_required: true, urgency: "normal", ...input })

test("advisory contract is canonical, compact, and redacts sensitive content", () => {
  const first = advisory({ concise_summary: "Authorization: Bearer eyJabcdefghijklmnopqrstuvwxyz", source_ids: ["signal-1"] })
  const second = advisory({ concise_summary: "Authorization: Bearer eyJabcdefghijklmnopqrstuvwxyz", source_ids: ["signal-1"] })
  assert.equal(first.advisory_id, second.advisory_id)
  assert.match(first.concise_summary, /\[REDACTED\]/)
  assert.doesNotMatch(first.concise_summary, /eyJabcdefgh/)
  assert.throws(() => createOwnerAdvisory({}), /invalid/)
})

test("meaningfulness gate suppresses routine, sparse, and provisional noise", () => {
  assert.equal(meaningfulOwnerAdvisory({ advisory_type: "repeated_failure", source_ids: ["x"], evidence_count: 1 }).meaningful, false)
  assert.equal(meaningfulOwnerAdvisory({ advisory_type: "successful_new_workflow", source_ids: ["x"], evidence_count: 3, provisional: true }).reason, "provisional_workflow")
  assert.equal(meaningfulOwnerAdvisory({ advisory_type: "configuration_problem", source_ids: ["x"], evidence_count: 1, blocked: false }).meaningful, false)
})

test("generation preserves low confidence and produces only supported real-pattern shapes", () => {
  const generated = generateOwnerAdvisories({ routing_signals: [{ signal_type: "repeated_failure", signal_id: "signal-native", affected_capabilities: ["native_app_build_validation"], evidence_count: 2, confidence: "low", observed_pattern: "Observed 2 failed executions.", recommended_change: "Review constraints.", supporting_observation_ids: ["obs-a", "obs-b"] }], workflow_episodes: [{ episode_id: "episode-blocked", final_outcome: "incomplete", failures: [{ category: "missing_developer_tool" }], source_observation_ids: ["attempt-x"], capabilities: ["native_app_build_validation"], artifact_references: ["memory.json"] }], workflow_strategies: [{ strategy_id: "strategy-provisional", provisional: true, successful_episode_count: 1, confidence: "low", supporting_episode_ids: ["episode-x"], required_capabilities: [] }] })
  assert.equal(generated.advisories.length, 2)
  assert.equal(generated.advisories.find(item => item.advisory_type === "repeated_failure").confidence, "low")
  assert.ok(generated.suppressed.some(item => item.reason === "provisional_workflow"))
})

test("inbox suppresses duplicate novelty and status changes are append-only local events", () => {
  const inbox = createOwnerAdvisoryInbox(temporaryRoot())
  const first = inbox.append(advisory({}))
  assert.equal(first.duplicate, false)
  assert.equal(inbox.append(advisory({ concise_summary: "Same evidence, wording may change." })).duplicate, true)
  assert.equal(inbox.transition(first.advisory.advisory_id, "acknowledged").status, "acknowledged")
  assert.equal(inbox.transition(first.advisory.advisory_id, "dismissed").status, "dismissed")
  assert.equal(inbox.summary().counts.dismissed, 1)
  assert.match(readFileSync(inbox.paths.eventPath, "utf8"), /samwise-owner-advisory-event-v1/)
})

test("brief and ChatGPT retrieval are bounded and silence empty inboxes", () => {
  assert.equal(buildSamwiseBrief([]).status, "no_meaningful_changes")
  const item = { ...advisory({}), status: "new" }
  const brief = buildSamwiseBrief([item])
  assert.equal(brief.status, "meaningful_changes_available")
  assert.equal(compactOwnerAdvisoryRetrieval([item])[0].source_system, "capability_intelligence")
  assert.deepEqual(privateOwnerAdvisoryPersistencePlan().anon_access, false)
})

test("private Supabase proposal is owner-scoped and never grants anon access", () => {
  const proposal = readFileSync(new URL("../artifacts/samwise/samwise-owner-advisory-supabase-schema-v1.sql", import.meta.url), "utf8")
  assert.match(proposal, /enable row level security/)
  assert.match(proposal, /revoke all on all tables in schema private from public, anon, authenticated/)
  assert.match(proposal, /to authenticated using \(\(select auth\.uid\(\)\) = owner_user_id\)/)
  assert.doesNotMatch(proposal, /grant .* to anon/i)
})
