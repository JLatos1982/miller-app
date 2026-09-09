import assert from "node:assert/strict"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import nativeMemory from "../artifacts/samwise/native-app-build-validation-miller-navigator-memory-2026-09-08.json" with { type: "json" }
import { createFailureSignature, createWorkflowEpisode, createWorkflowMemoryStore, deriveCapabilityGapSignals, deriveWorkflowStrategies, extractNativeAppWorkflowEpisodes, recommendPriorWorkflowExperience, summarizeWorkflowFailures, workflowSignature } from "../server/samwiseWorkflowMemory.js"

const temporaryRoot = () => mkdtempSync(path.join(tmpdir(), "samwise-workflow-memory-"))
const episode = input => createWorkflowEpisode({ project: "miller-app", workflow_category: "structured_comparison", domain: "public_records", goal: "Compare bounded records", started_at: "2026-09-09T00:00:00.000Z", ended_at: "2026-09-09T00:01:00.000Z", capabilities: ["farm_igor_local_analysis"], route_taken: ["farm", "igor"], significant_steps: [{ stage: "compare", status: "passed", summary: "Compared bounded records." }], validations: [{ kind: "test", status: "passed", reference: "test-id" }], final_outcome: "succeeded", actually_validated: true, completion_confidence: "high", requested_outcome: "validated_structured_result", environment_class: "local_node", source_observation_ids: ["obs-a"], ...input })

test("episodes validate completed work and reject unvalidated success", () => {
  const complete = episode({})
  assert.equal(complete.final_outcome, "succeeded")
  assert.equal(complete.actually_validated, true)
  assert.throws(() => episode({ final_outcome: "succeeded", actually_validated: false }), /success_requires_validation/)
  const incomplete = episode({ final_outcome: "incomplete", actually_validated: false, source_observation_ids: ["obs-incomplete"] })
  assert.equal(incomplete.final_outcome, "incomplete")
})

test("workflow signatures are deterministic and preserve structural rather than raw-content matching", () => {
  const first = workflowSignature({ workflow_category: "structured_comparison", domain: "public_records", requested_outcome: "validated_structured_result", environment_class: "local_node", capabilities: ["b", "a"] })
  const second = workflowSignature({ workflow_category: "structured_comparison", domain: "public_records", requested_outcome: "validated_structured_result", environment_class: "local_node", capabilities: ["a", "b"] })
  assert.equal(first.signature_id, second.signature_id)
  assert.equal(createFailureSignature({ workflow_category: "structured_comparison", category: "unsupported_api", environment_class: "local_node", detail: "Authorization: Bearer eyJabcdefghijklmnopqrstuvwxyz" }).detail, "Authorization: [REDACTED]")
})

test("native operational memory produces a validated launch episode and an incomplete enhancement episode", () => {
  const episodes = extractNativeAppWorkflowEpisodes(nativeMemory)
  assert.equal(episodes.length, 2)
  assert.equal(episodes[0].actually_validated, true)
  assert.equal(episodes[0].final_outcome, "succeeded")
  assert.equal(episodes[1].actually_validated, false)
  assert.equal(episodes[1].final_outcome, "incomplete")
  assert.ok(episodes[1].failures.some(item => item.category === "unsupported_api"))
})

test("strategies remain provisional with sparse evidence and link failure recoveries", () => {
  const failureSignature = createFailureSignature({ workflow_category: "structured_comparison", category: "unsupported_api", environment_class: "local_node" }).failure_signature_id
  const first = episode({ source_observation_ids: ["obs-1"], failures: [{ category: "unsupported_api", detail: "Unsupported API", source_observation_id: "obs-1", resolved: true }], recoveries: [{ summary: "Replaced API with compatible call.", status: "succeeded", related_failure_signature_id: failureSignature }] })
  const second = episode({ source_observation_ids: ["obs-2"], ended_at: "2026-09-10T00:01:00.000Z", failures: [{ category: "unsupported_api", detail: "Unsupported API", source_observation_id: "obs-2", resolved: true }], recoveries: [{ summary: "Replaced API with compatible call.", status: "succeeded", related_failure_signature_id: failureSignature }] })
  const provisional = deriveWorkflowStrategies([first])
  assert.equal(provisional[0].provisional, true)
  const established = deriveWorkflowStrategies([first, second])
  assert.equal(established[0].provisional, false)
  assert.equal(established[0].owner_review_required, true)
  assert.deepEqual(established[0].frequent_failure_patterns, ["unsupported_api"])
  const failures = summarizeWorkflowFailures([first, second])
  assert.equal(failures[0].occurrences, 2)
  assert.equal(failures[0].episode_count, 2)
  assert.equal(failures[0].successful_recovery_observed, true)
})

test("recommendations match similar work, reject unrelated work, and stay advisory", () => {
  const history = [episode({ source_observation_ids: ["obs-r1"] })]
  const recommendation = recommendPriorWorkflowExperience({ episodes: history, task: { workflow_category: "structured_comparison", domain: "public_records", requested_outcome: "validated_structured_result", environment_class: "local_node", capabilities: ["farm_igor_local_analysis"] } })
  assert.equal(recommendation.matching_episodes.length, 1)
  assert.equal(recommendation.advisory_only, true)
  assert.equal(recommendation.evidence_insufficient, true)
  const unrelated = recommendPriorWorkflowExperience({ episodes: history, task: { workflow_category: "native_app_build_validation", domain: "app_development", requested_outcome: "simulator_launch", environment_class: "ios_xcode_simulator" } })
  assert.equal(unrelated.matching_episodes.length, 0)
})

test("gaps require repeated unregistered workarounds and the local index is append-only", () => {
  const gaps = ["one", "two", "three"].map(source => episode({ source_observation_ids: [`obs-${source}`], uncovered_requirements: [{ requirement: "simulator_ui_accessibility_observer", description: "Capture bounded VoiceOver outcome evidence.", workaround: "Owner performs manual VoiceOver check." }] }))
  assert.equal(deriveCapabilityGapSignals({ episodes: gaps, registered_capability_ids: ["farm_igor_local_analysis"] }).length, 1)
  assert.equal(deriveCapabilityGapSignals({ episodes: gaps.slice(0, 2), registered_capability_ids: [] }).length, 0)
  const store = createWorkflowMemoryStore(temporaryRoot())
  assert.equal(store.append(gaps[0]).duplicate, false)
  assert.equal(store.append(gaps[0]).duplicate, true)
  const corrected = store.append({ ...gaps[0], goal: "Corrected safe reference.", supersedes_episode_id: gaps[0].episode_id })
  assert.equal(corrected.duplicate, false)
  assert.equal(store.list().length, 1)
  assert.equal(store.status().audit_episode_count, 2)
  assert.match(readFileSync(store.paths.episodePath, "utf8"), /samwise-workflow-episode-v1/)
})
