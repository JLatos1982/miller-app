import { createHash } from "node:crypto"
import { activeCoverageWorkspace } from "./coverageHypotheses.js"
import { recalculateTopic } from "./attentionEngine.js"

export const QUIET_MAINTENANCE = Object.freeze({ policyVersion: "quiet-maintenance-v1", maxTopics: 50, maxHypotheses: 50, maxBuckets: 100, maxCarryForward: 10, maxPerFamily: 3, maxReflections: 4 })
const forbidden = /(?:raw_?query|query_text|session_?id|user_?id|ip_?address|device|email|phone|counselling)/i
const hash = (parts) => createHash("sha256").update(parts.map((part) => String(part ?? "")).join("|")).digest("hex")
const dateMs = (value) => new Date(value || 0).getTime() || 0
const round = (value) => Math.round(Number(value || 0) * 100) / 100
const count = (items, key) => items.filter((item) => item === key).length

export function assertQuietMaintenancePrivacy(value) {
  const text = JSON.stringify(value)
  if (forbidden.test(text)) throw new Error("quiet_maintenance_privacy_boundary")
  return true
}

export function attentionHabituation(topic, signals = [], asOf = new Date().toISOString()) {
  const baseline = recalculateTopic(topic, signals, asOf)
  const currentAt = dateMs(topic.last_recalculated_at || topic.last_reinforced_at || topic.first_observed_at)
  const fresh = signals.filter((signal) => dateMs(signal.observed_at || signal.effective_at) > currentAt)
  const materiallyNew = fresh.some((signal) => Number(signal.novelty || 0) >= 0.6) || new Set(fresh.map((signal) => signal.source_id)).size > 1
  const sourceGroups = new Map()
  for (const signal of signals) {
    const key = `${signal.source_id || "unknown"}|${signal.signal_family || "unknown"}`
    sourceGroups.set(key, (sourceGroups.get(key) || 0) + 1)
  }
  const repeated = [...sourceGroups.values()].reduce((sum, value) => sum + Math.max(0, value - 1), 0)
  const staleDays = Math.max(0, (dateMs(asOf) - currentAt) / 86_400_000)
  const repetitionSuppression = materiallyNew ? 0 : Math.min(0.55, repeated * 0.12)
  const stalenessSuppression = materiallyNew ? 0 : staleDays > 14 ? Math.min(0.35, ((staleDays - 14) / 90) * 0.35) : 0
  const suppression = Math.min(0.7, repetitionSuppression + stalenessSuppression)
  const nextScore = round(baseline.current_score * (1 - suppression))
  const nextState = nextScore < 15 ? "background" : baseline.state
  const reason_codes = [...new Set([...(baseline.reason_codes || []), ...(repetitionSuppression ? ["repeated_unchanged_source_habituated"] : []), ...(stalenessSuppression ? ["stale_attention_decayed"] : []), ...(materiallyNew ? ["material_novelty_restored"] : [])])].slice(0, 8)
  return { ...baseline, current_score: nextScore, state: nextState, suppression, materially_new: materiallyNew, repeated_signal_count: repeated, reason_codes }
}

function topicFamily(signals) { return signals.map((signal) => signal.signal_family).sort()[0] || "other" }
function reflection({ runKey, category, explanation, recommendation, confidence = 0.6, humanImpact = "low" }) {
  return { reflection_key: hash(["quiet", runKey, category, explanation]), category, signal_ids: [], explanation, confidence, human_impact: humanImpact, recommendation }
}

export function buildQuietMaintenancePlan({ runKey, topics = [], signals = [], hypotheses = [], buckets = [], asOf = new Date().toISOString() } = {}) {
  const attention_updates = [], hypothesis_updates = [], expired_buckets = [], integrity_findings = [], reflections = [], allRegulated = []
  for (const topic of topics.slice(0, QUIET_MAINTENANCE.maxTopics)) {
    const next = attentionHabituation(topic, signals.filter((signal) => signal.topic_id === topic.id), asOf)
    allRegulated.push({ topic, next, family: topicFamily(signals.filter((signal) => signal.topic_id === topic.id)) })
    if (round(topic.current_score) !== next.current_score || topic.state !== next.state) attention_updates.push({ action_key: hash([runKey, "attention", topic.id, topic.version, next.current_score, next.state]), topic_id: topic.id, expected_version: Number(topic.version), prior_score: Number(topic.current_score || 0), prior_state: topic.state, next_score: next.current_score, next_state: next.state, reason_codes: next.reason_codes })
  }
  for (const item of hypotheses.slice(0, QUIET_MAINTENANCE.maxHypotheses)) {
    const expired = dateMs(item.expires_at) <= dateMs(asOf)
    const resolved = item.status === "evidence_available" && item.coverage_state === "represented" && Number(item.matching_resource_count) >= 3
    if (item.status === "evidence_available" && (item.coverage_state === "unknown" || Number(item.matching_resource_count) === 0)) integrity_findings.push({ action_key: hash([runKey, "integrity", item.id, item.status]), target_id: item.id, reason_codes: ["derived_evidence_state_inconsistent","human_review_required"] })
    if (!expired && !resolved) continue
    const next_status = expired ? "expired" : "resolved"
    hypothesis_updates.push({ action_key: hash([runKey, "hypothesis", item.id, item.status, next_status]), hypothesis_id: item.id, expected_status: item.status, next_status, reason_codes: expired ? ["ttl_expired","working_memory_evicted"] : ["existing_directory_evidence_sufficient","no_external_research"] })
  }
  for (const bucket of buckets.slice(0, QUIET_MAINTENANCE.maxBuckets)) if (dateMs(bucket.expires_at) <= dateMs(asOf)) expired_buckets.push({ action_key: hash([runKey, "bucket", bucket.bucket_key]), bucket_key: bucket.bucket_key })
  const activeTopics = allRegulated.filter(({ next, topic }) => topic.status === "active" && next.current_score >= 15).sort((a, b) => b.next.current_score - a.next.current_score || a.topic.topic_key.localeCompare(b.topic.topic_key))
  const familyCounts = new Map(), carryTopics = []
  for (const item of activeTopics) { const current = familyCounts.get(item.family) || 0; if (current >= QUIET_MAINTENANCE.maxPerFamily || carryTopics.length >= QUIET_MAINTENANCE.maxCarryForward) continue; familyCounts.set(item.family, current + 1); carryTopics.push({ kind: "attention", topic_key: item.topic.topic_key, state: item.next.state, score: item.next.current_score, family: item.family }) }
  const activeHypotheses = activeCoverageWorkspace(hypotheses.filter((item) => !hypothesis_updates.some((update) => update.hypothesis_id === item.id && update.next_status === "expired")), asOf).slice(0, QUIET_MAINTENANCE.maxCarryForward - carryTopics.length).map((item) => ({ kind: "coverage_hypothesis", hypothesis_key: item.hypothesis_key, theme: item.theme, geography: item.geography, status: item.status }))
  const carry_forward = [...carryTopics, ...activeHypotheses].slice(0, QUIET_MAINTENANCE.maxCarryForward)
  const suppressed = attention_updates.filter((item) => item.reason_codes.includes("repeated_unchanged_source_habituated")).length
  const decayed = attention_updates.filter((item) => item.next_score < item.prior_score).length
  const resolved = count(hypothesis_updates.map((item) => item.next_status), "resolved")
  const expired = hypothesis_updates.filter((item) => item.next_status === "expired").length + expired_buckets.length
  if (suppressed) reflections.push(reflection({ runKey, category: "maintenance_regulation", explanation: `${suppressed} repeated unchanged internal signal pattern${suppressed === 1 ? " was" : "s were"} habituated during quiet maintenance.`, recommendation: "No automatic external follow-up is recommended." }))
  if (expired) reflections.push(reflection({ runKey, category: "maintenance_forgetting", explanation: `${expired} expired aggregate or derived working-memory item${expired === 1 ? " was" : "s were"} removed from active maintenance state while audit history was retained.`, recommendation: "No automatic external follow-up is recommended." }))
  if (resolved) reflections.push(reflection({ runKey, category: "maintenance_learning", explanation: `${resolved} directory-quality question${resolved === 1 ? " is" : "s are"} now answerable from existing Miller directory evidence; no external research was run.`, recommendation: "Human review may inspect the retained evidence and summary." }))
  if (integrity_findings.length) reflections.push(reflection({ runKey, category: "maintenance_uncertainty", explanation: `${integrity_findings.length} derived-state inconsistency was recorded for human review; no factual record was changed.`, recommendation: "Human review is required before interpreting or changing factual evidence." }))
  if (carry_forward.length) reflections.push(reflection({ runKey, category: "maintenance_uncertainty", explanation: `${carry_forward.length} bounded internal item${carry_forward.length === 1 ? " remains" : "s remain"} in the next working set after family caps and expiry rules.`, recommendation: "No automatic external follow-up is recommended." }))
  const plan = { attention_updates, hypothesis_updates, expired_buckets, integrity_findings, reflections: reflections.slice(0, QUIET_MAINTENANCE.maxReflections), inspected_counts: { attention_topics: topics.length, attention_signals: signals.length, coverage_hypotheses: hypotheses.length, aggregate_buckets: buckets.length }, action_counts: { attention_regulated: attention_updates.length, duplicate_signal_suppressed: suppressed, attention_decayed: decayed, hypotheses_resolved: resolved, expired_items_forgotten: expired, safe_repairs: 0, integrity_findings: integrity_findings.length }, carry_forward, result_summary: { external_requests: 0, canonical_mutations: 0, map_mutations: 0, contradictions_found: integrity_findings.length, unresolved_uncertainties: carry_forward.filter((item) => item.kind === "coverage_hypothesis").length + integrity_findings.length, bounded: true, privacy: "aggregate_only" } }
  assertQuietMaintenancePrivacy(plan)
  return plan
}

export function quietMaintenanceMetrics(plan = {}) { return { active_attention: (plan.carry_forward || []).filter((item) => item.kind === "attention").length, working_memory_occupancy: (plan.carry_forward || []).length, duplicate_signal_suppression_count: Number(plan.action_counts?.duplicate_signal_suppressed || 0), stale_item_count: Number(plan.action_counts?.attention_decayed || 0), expired_item_count: Number(plan.action_counts?.expired_items_forgotten || 0), question_resolution_count: Number(plan.action_counts?.hypotheses_resolved || 0), safe_repair_count: Number(plan.action_counts?.safe_repairs || 0) } }
