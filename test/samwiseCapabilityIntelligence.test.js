import assert from "node:assert/strict"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import registry from "../src/data/samwise-capability-intelligence-registry-v1.json" with { type: "json" }
import nativeMemory from "../artifacts/samwise/native-app-build-validation-miller-navigator-memory-2026-09-08.json" with { type: "json" }
import { createCapabilityExecutionObservation, createCapabilityIntelligenceStore, deriveRoutingLearningSignals, matchSamwiseCapabilities, nativeAppBuildMemoryToCapabilityObservations, ownerCapabilityInventory, recommendCapabilityRoute, summarizeCapabilityPerformance, validateSamwiseCapabilityIntelligenceRegistry } from "../server/samwiseCapabilityIntelligence.js"

const temporaryRoot = () => mkdtempSync(path.join(tmpdir(), "samwise-capability-intelligence-"))
const observation = input => createCapabilityExecutionObservation({ capability_id: "farm_igor_local_analysis", task_category: "structured_comparison", status: "succeeded", validation_result: "passed", useful_output: "yes", ...input })

test("registry contains real bounded capabilities and preserves existing execution authority", () => {
  assert.deepEqual(validateSamwiseCapabilityIntelligenceRegistry(registry), { valid: true, capability_id: "samwise_capability_intelligence", capabilities: 13 })
  assert.equal(registry.existing_orchestration, "Farm and existing routers remain authoritative for execution.")
  assert.equal(registry.capabilities.find(item => item.capability_id === "samwise_public_records_intelligence").mutation_authority, "none")
  assert.equal(registry.capabilities.find(item => item.capability_id === "native_app_build_validation").publication_authority, false)
  assert.equal(registry.capabilities.find(item => item.capability_id === "samwise_unified_signals").mutation_authority, "none")
  assert.equal(registry.capabilities.find(item => item.capability_id === "samwise_farm_steward").publication_authority, false)
})

test("matcher applies hard availability, locality, output, and mutation constraints", () => {
  const igor = matchSamwiseCapabilities({ registry, task: { task_type: "structured_comparison", domain: "public_records", required_output: "validated_structured_result", local_only: true } })
  assert.deepEqual(igor.map(item => item.capability_id), ["farm_igor_local_analysis"])
  const cloud = matchSamwiseCapabilities({ registry, task: { task_type: "cloud_research", domain: "miller_north", required_output: "research_source_candidates", local_only: true, allow_configuration_dependent: true } })
  assert.equal(cloud.length, 0)
  const noMutation = matchSamwiseCapabilities({ registry, task: { task_type: "native_app_build_validation", domain: "app_development", required_output: "build_validation_memory", mutation_requirement: "forbidden" } })
  assert.equal(noMutation.length, 0)
})

test("append-only observations redact sensitive text and summary remains conservative with sparse history", () => {
  const store = createCapabilityIntelligenceStore(temporaryRoot())
  const first = store.append(observation({ occurred_at: "2026-09-08T00:00:00.000Z", notes: "Authorization: Bearer eyJabcdefghijklmnopqrstuvwxyz db=postgresql://user:password@host/db", result_reference: "run-1" }))
  assert.equal(first.duplicate, false)
  assert.match(first.observation.notes, /\[REDACTED\]/)
  assert.doesNotMatch(first.observation.notes, /password/)
  assert.equal(store.append(observation({ occurred_at: "2026-09-08T00:00:00.000Z", notes: "Authorization: Bearer eyJabcdefghijklmnopqrstuvwxyz db=postgresql://user:password@host/db", result_reference: "run-1" })).duplicate, true)
  const summary = summarizeCapabilityPerformance({ registry, observations: store.list(20) }).find(item => item.capability_id === "farm_igor_local_analysis")
  assert.equal(summary.executions, 1)
  assert.equal(summary.evidence_level, "insufficient_evidence")
  assert.equal(summary.average_latency_ms, null)
  assert.match(readFileSync(store.paths.ledgerPath, "utf8"), /samwise-capability-execution-observation-v1/)
})

test("learning signals are advisory and recommendation never grants authority", () => {
  const observations = [
    observation({ status: "failed", error_category: "worker_timeout", occurred_at: "2026-09-01T00:00:00.000Z" }),
    observation({ status: "failed", error_category: "worker_timeout", occurred_at: "2026-09-02T00:00:00.000Z" }),
  ]
  const signals = deriveRoutingLearningSignals(observations)
  assert.equal(signals.length, 1)
  assert.equal(signals[0].requires_owner_approval, true)
  assert.equal(signals[0].automatic_policy_change, false)
  const route = recommendCapabilityRoute({ registry, task: { task_type: "structured_comparison", domain: "public_records", required_output: "validated_structured_result", local_only: true }, observations })
  assert.equal(route.advisory_only, true)
  assert.equal(route.mutation_authority_granted, false)
  assert.equal(route.preferred_capability.capability_id, "farm_igor_local_analysis")
  assert.equal(ownerCapabilityInventory({ registry, observations }).learning_signals.length, 1)
})

test("native-app operational memory is adapted as bounded historical observations", () => {
  const observations = nativeAppBuildMemoryToCapabilityObservations(nativeMemory)
  assert.equal(observations.length, 7)
  assert.equal(observations[0].capability_id, "native_app_build_validation")
  assert.equal(observations[0].status, "failed")
  assert.equal(observations[2].status, "succeeded")
  assert.equal(observations.at(-1).status, "deferred")
  assert.doesNotMatch(JSON.stringify(observations), /certificate|provisioning/i)
})
