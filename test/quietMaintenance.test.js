import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { attentionHabituation, assertQuietMaintenancePrivacy, buildQuietMaintenancePlan, quietMaintenanceMetrics } from "../server/quietMaintenance.js"

const topic = (overrides = {}) => ({ id: "00000000-0000-0000-0000-000000000001", topic_key: "service_system:transportation", status: "active", state: "focus", current_score: 60, version: 1, first_observed_at: "2026-01-01T00:00:00Z", last_recalculated_at: "2026-01-01T00:00:00Z", ...overrides })
const signal = (overrides = {}) => ({ topic_id: "00000000-0000-0000-0000-000000000001", topic_key: "service_system:transportation", signal_type: "coverage_gap", signal_family: "growth", source_id: "aggregate", source_authority: 80, magnitude: .8, novelty: .2, relevance: .8, confidence: .8, observed_at: "2026-01-01T00:00:00Z", decay_class: "medium", underlying_event_key: `event-${Math.random()}`, provenance: {}, ...overrides })
const hypothesis = (overrides = {}) => ({ id: "00000000-0000-0000-0000-000000000002", hypothesis_key: "a".repeat(64), status: "evidence_available", coverage_state: "represented", matching_resource_count: 3, expires_at: "2026-02-01T00:00:00Z", strength_band: "recurring", updated_at: "2026-01-01T00:00:00Z", theme: "transportation", geography: "fraser", ...overrides })

test("unchanged repeated signals habituate, while material novelty restores attention", () => {
  const repeated = attentionHabituation(topic(), Array.from({ length: 6 }, (_, index) => signal({ underlying_event_key: `same-source-${index}` })), "2026-01-20T00:00:00Z")
  const novel = attentionHabituation(topic(), [...Array.from({ length: 6 }, (_, index) => signal({ underlying_event_key: `same-source-${index}` })), signal({ source_id: "independent", novelty: .8, observed_at: "2026-01-19T00:00:00Z", underlying_event_key: "new-authoritative-event" })], "2026-01-20T00:00:00Z")
  assert.ok(repeated.suppression > 0)
  assert.equal(novel.materially_new, true)
  assert.equal(novel.suppression, 0)
  assert.ok(novel.current_score > repeated.current_score)
})

test("quiet maintenance is bounded, resolves only existing sufficient directory evidence, and forgets expired derived state", () => {
  const plan = buildQuietMaintenancePlan({ runKey: "b".repeat(64), topics: Array.from({ length: 20 }, (_, index) => topic({ id: `00000000-0000-0000-0000-${String(index + 10).padStart(12, "0")}`, topic_key: `service_system:topic_${index}` })), signals: [], hypotheses: [hypothesis(), hypothesis({ id: "00000000-0000-0000-0000-000000000003", hypothesis_key: "c".repeat(64), status: "awaiting_evidence", expires_at: "2026-01-01T00:00:00Z" })], buckets: [{ bucket_key: "d".repeat(64), expires_at: "2026-01-01T00:00:00Z" }], asOf: "2026-01-20T00:00:00Z" })
  assert.equal(plan.hypothesis_updates.filter((item) => item.next_status === "resolved").length, 1)
  assert.equal(plan.hypothesis_updates.filter((item) => item.next_status === "expired").length, 1)
  assert.equal(plan.expired_buckets.length, 1)
  assert.ok(plan.carry_forward.length <= 10)
  assert.ok(plan.carry_forward.filter((item) => item.kind === "attention").length <= 3)
  assert.equal(plan.result_summary.external_requests, 0)
  assert.equal(plan.result_summary.canonical_mutations, 0)
})

test("simulated multi-day lifecycle decays stale state without losing historical plan provenance", () => {
  const day1 = buildQuietMaintenancePlan({ runKey: "e".repeat(64), topics: [topic()], signals: [signal({ novelty: .8 })], hypotheses: [hypothesis({ status: "awaiting_evidence", coverage_state: "limited", matching_resource_count: 1 })], asOf: "2026-01-02T00:00:00Z" })
  const day16 = buildQuietMaintenancePlan({ runKey: "f".repeat(64), topics: [topic()], signals: Array.from({ length: 5 }, (_, index) => signal({ underlying_event_key: `unchanged-${index}` })), hypotheses: [hypothesis({ status: "awaiting_evidence", coverage_state: "limited", matching_resource_count: 1, expires_at: "2026-01-10T00:00:00Z" })], asOf: "2026-01-16T00:00:00Z" })
  assert.equal(day1.result_summary.external_requests, 0)
  assert.ok(day16.action_counts.expired_items_forgotten >= 1)
  assert.ok(day16.action_counts.duplicate_signal_suppressed >= 1)
  assert.ok(quietMaintenanceMetrics(day16).working_memory_occupancy <= 10)
})

test("maintenance plans reject privacy-sensitive fields and reflections remain bounded", () => {
  assert.throws(() => assertQuietMaintenancePrivacy({ raw_query: "private" }), /privacy_boundary/)
  const plan = buildQuietMaintenancePlan({ runKey: "1".repeat(64), topics: [topic()], signals: [], hypotheses: [hypothesis()], buckets: [], asOf: "2026-01-20T00:00:00Z" })
  assert.ok(plan.reflections.length <= 4)
  assert.equal(JSON.stringify(plan).match(/raw_query|session_id|user_id|ip_address/i), null)
})

test("a derived-state contradiction is recorded for human review without changing facts", () => {
  const plan = buildQuietMaintenancePlan({ runKey: "2".repeat(64), topics: [], signals: [], hypotheses: [hypothesis({ coverage_state: "unknown", matching_resource_count: 0 })], buckets: [], asOf: "2026-01-20T00:00:00Z" })
  assert.equal(plan.integrity_findings.length, 1)
  assert.equal(plan.result_summary.contradictions_found, 1)
  assert.equal(plan.result_summary.canonical_mutations, 0)
})

test("a bounded human directive changes carry-forward ranking only, never evidence or scores", () => {
  const topics = [topic({ topic_key: "service_system:transportation", current_score: 50 }), topic({ id: "00000000-0000-0000-0000-000000000009", topic_key: "service_system:housing", current_score: 52 })]
  const signals = [signal({ topic_id: topics[0].id, magnitude: 1, novelty: 1, relevance: 1, confidence: 1 }), signal({ topic_id: topics[1].id, underlying_event_key: "housing", magnitude: 1, novelty: 1, relevance: 1, confidence: 1 })]
  const baseline = buildQuietMaintenancePlan({ runKey: "4".repeat(64), topics, signals, hypotheses: [], buckets: [], asOf: "2026-01-02T00:00:00Z" })
  const plan = buildQuietMaintenancePlan({ runKey: "3".repeat(64), topics, signals, hypotheses: [], buckets: [], directives: [{ status: "active", directive_type: "focus", strength: 2, topic_key: "service_system:transportation", expires_at: "2026-01-27T00:00:00Z" }], asOf: "2026-01-02T00:00:00Z" })
  assert.equal(plan.carry_forward[0].topic_key, "service_system:transportation")
  assert.equal(plan.carry_forward[0].human_directed, true)
  assert.equal(plan.carry_forward[0].human_directive_weight, 2)
  assert.deepEqual(plan.attention_updates.map((item) => [item.topic_id, item.next_score]), baseline.attention_updates.map((item) => [item.topic_id, item.next_score]))
  assert.equal(plan.result_summary.canonical_mutations, 0)
})

test("quiet maintenance has no external adapter or canonical mutation path", () => {
  const source = fs.readFileSync(new URL("../server/quietMaintenance.js", import.meta.url), "utf8")
  assert.doesNotMatch(source, /fetch\(|OpenAI|tavily|supabase|resource_registry|resource_locations|public_map/)
})
