import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { createOwnerAdvisory, createOwnerAdvisoryInbox, generateOwnerAdvisories } from "../server/samwiseOwnerAdvisories.js"
import { buildSamwiseOwnerBrief, createReadOnlySamwiseOwnerBriefSurface, diagnoseChatGptBridge, localSignalProducerState, normalizeSignalForOwnerAdvisory, samwiseSignalProducerInventory } from "../server/samwiseUnifiedSignals.js"

const temporaryRoot = () => mkdtempSync(path.join(tmpdir(), "samwise-unified-signals-"))
const advisory = input => createOwnerAdvisory({ created_at: "2026-09-09T00:00:00.000Z", project: "miller-app", advisory_type: "security_change", title: "New bounded security finding", concise_summary: "One source-supported aggregate finding requires review.", significance: "important", confidence: "moderate", evidence_count: 1, source_system: "miller_security_status", source_ids: ["security-run-1"], suggested_action: "Review the bounded security finding.", owner_decision_required: true, urgency: "high", ...input })

test("signal inventory documents producers without claiming unobserved liveness", () => {
  const inventory = samwiseSignalProducerInventory({ listenerRegistry: { listeners: [{}, {}] } })
  assert.ok(inventory.some(item => item.id === "miller_security_status" && item.owner_status))
  assert.ok(inventory.some(item => item.id === "farm_listener_framework" && item.observes.includes("2 bounded")))
  assert.ok(inventory.every(item => typeof item.advisory_feed === "string"))
})

test("normalization preserves material security, listener, Miller and learning provenance", () => {
  for (const kind of ["security", "listener", "miller", "learning"]) {
    const normalized = normalizeSignalForOwnerAdvisory({ kind, material: true, source_system: `${kind}_source`, source_ids: [`${kind}-1`], title: `${kind} changed`, concise_summary: "A material bounded change was observed.", confidence: "low" })
    assert.ok(normalized)
    assert.equal(normalized.source_ids[0], `${kind}-1`)
  }
  assert.equal(normalizeSignalForOwnerAdvisory({ kind: "healthy", material: true, source_system: "security", source_ids: ["x"], title: "Healthy", concise_summary: "Routine." }), null)
  const listener = normalizeSignalForOwnerAdvisory({ kind: "listener", material: true, source_system: "listener", source_ids: ["run-1"], title: "Changed", concise_summary: "Authorization: Bearer eyJabcdefghijklmnopqrstuvwxyz" })
  assert.match(listener.concise_summary, /\[REDACTED\]/)
})

test("normalized material events use the existing advisory dedupe gate", () => {
  const signal = normalizeSignalForOwnerAdvisory({ kind: "listener", material: true, source_system: "farm_listener", source_ids: ["run-42"], title: "A public source changed materially", concise_summary: "One bounded record changed.", evidence_count: 1 })
  const generated = generateOwnerAdvisories({ normalized_signals: [signal] })
  assert.equal(generated.advisories.length, 1)
  const inbox = createOwnerAdvisoryInbox(temporaryRoot())
  assert.equal(inbox.append(generated.advisories[0]).duplicate, false)
  assert.equal(inbox.append(generated.advisories[0]).duplicate, true)
})

test("owner brief is compact, read-only, bounded, and reports no meaningful changes", () => {
  const empty = buildSamwiseOwnerBrief({ advisories: [], producer_states: [{ producer_id: "security", availability: "unavailable" }] })
  assert.equal(empty.no_meaningful_changes, true)
  assert.equal(empty.overall_state, "no_meaningful_changes")
  const brief = buildSamwiseOwnerBrief({ advisories: [advisory()], producer_states: [], limit: 1 })
  assert.equal(brief.read_only, true)
  assert.equal(brief.security_changes.length, 1)
  assert.equal(brief.owner_decisions_needed.length, 1)
  assert.equal(brief.advisories.length, 1)
  const root = temporaryRoot()
  const surface = createReadOnlySamwiseOwnerBriefSurface(root)
  assert.deepEqual(surface.allowed_arguments, ["limit"])
  assert.throws(() => surface.retrieve({ limit: 21 }), /limit_invalid/)
  assert.ok(surface.forbidden_capabilities.includes("sql"))
  assert.doesNotMatch(JSON.stringify(surface.retrieve({ limit: 1 })), /token|secret|authorization|bearer/i)
})

test("local producer state marks unavailable and stale artifacts without treating either as an advisory", () => {
  const root = temporaryRoot()
  const missing = localSignalProducerState(root, { now: new Date("2026-09-09T00:00:00.000Z") })
  assert.equal(missing.find(item => item.producer_id === "samwise_work_observer").availability, "unavailable")
  const directory = path.join(root, "artifacts/samwise/runtime/work-observer")
  mkdirSync(directory, { recursive: true })
  writeFileSync(path.join(directory, "work-events-v1.ndjson"), `${JSON.stringify({ timestamp: "2025-01-01T00:00:00.000Z" })}\n`)
  const stale = localSignalProducerState(root, { now: new Date("2026-09-09T00:00:00.000Z") })
  assert.equal(stale.find(item => item.producer_id === "samwise_work_observer").availability, "stale")
})

test("bridge health keeps 404 diagnosis bounded and does not claim a cause not evidenced", () => {
  const health = diagnoseChatGptBridge({ configured_servers: [], bridge_process_observed: null, probe: { attempted: true, http_status: 404, route_kind: "sse" } })
  assert.equal(health.state, "tunnel_reachable_route_not_found")
  assert.match(health.diagnosis, /cannot distinguish/i)
  assert.match(health.owner_action, /read-only Samwise connection/i)
  assert.doesNotMatch(JSON.stringify(health), /https?:\/\/|bearer|token|secret/i)
  assert.equal(diagnoseChatGptBridge().state, "not_observable_from_workspace")
})
