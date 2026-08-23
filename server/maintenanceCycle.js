export const MAINTENANCE_RHYTHM = Object.freeze({
  sleeping: { purpose: "retain the last consolidated state", external_access: false, mutation: "none" },
  waking: { purpose: "load bounded current state", external_access: false, mutation: "none" },
  orienting: { purpose: "identify bounded needs", external_access: false, mutation: "none" },
  working: { purpose: "perform explicitly authorized bounded work", external_access: "policy_controlled", mutation: "policy_controlled" },
  reflecting: { purpose: "compare outcome with expected result", external_access: false, mutation: "none" },
  consolidating: { purpose: "retain verified summary and lessons", external_access: false, mutation: "private_audit_only" },
  idle: { purpose: "await human or scheduler authorization", external_access: false, mutation: "none" },
})

const priority = { critical: 0, high: 1, medium: 2, low: 3 }

export function orientMaintenanceCycle({ heartbeat = {}, guidance = {}, planner = {}, pulse = null, sensors = [], previous = null, healing_needs = [], growth_opportunities = [], research_handoffs = [] } = {}) {
  const needs = []
  if (["failed", "degraded", "stale"].includes(guidance?.pulse?.freshness)) needs.push({ id: "security_pulse_state", domain: "security", tier: 0, severity: guidance.pulse.freshness === "failed" ? "high" : "medium", action: "review_manual_security_pulse", reason: "Security Pulse is not current.", executable: false })
  for (const sensor of sensors.filter((item) => ["stale", "failed", "degraded"].includes(item.status || item.freshness)).slice(0, 8)) needs.push({ id: `sensor:${sensor.id}`, domain: "public_health", tier: 0, severity: "medium", action: "review_source_freshness", reason: "A source is not current enough for a complete view.", executable: false })
  for (const finding of (planner.audit_findings || []).filter((item) => item.recommended_next_action && item.recommended_next_action !== "no_action_needed").slice(0, 12)) needs.push({ id: `knowledge:${finding.resource_id}:${finding.issue_type}`, domain: "resource_data", tier: 0, severity: finding.issue_type === "authoritative_address_conflict" ? "high" : "medium", action: finding.recommended_next_action, reason: "Existing evidence diagnostics identify a bounded next action.", executable: false })
  if (heartbeat.status === "review_required") needs.push({ id: "heartbeat_review", domain: "operations", tier: 0, severity: "medium", action: "inspect_heartbeat", reason: "The cheap system check needs review.", executable: false })
  const normalizedHealing = healing_needs.slice(0, 20).map((item) => ({ ...item, tier: 1, executable: true, action: item.action_id, reason: "Trusted persisted inputs support a registered deterministic repair." }))
  const normalizedGrowth = growth_opportunities.slice(0, 20).map((item) => ({ id: `growth:${item.opportunity_fingerprint}`, domain: item.domain, tier: 0, severity: item.priority >= 80 ? "high" : "medium", action: "controlled_research_recommendation", reason: item.reason, executable: false }))
  const ordered = [...needs, ...normalizedHealing, ...normalizedGrowth].sort((a, b) => priority[a.severity] - priority[b.severity] || a.id.localeCompare(b.id)).slice(0, 40)
  return { phase: "orienting", prior_cycle: previous?.id || null, inventory: { system: heartbeat.status || "unknown", security: guidance.domains?.security || "unknown", public_health: guidance.domains?.public_health || "unknown", pulse: pulse?.status || "never_run" }, needs: ordered, safe_work: normalizedHealing, growth: normalizedGrowth, research_handoffs: research_handoffs.slice(0, 20), human_review: ordered.filter((item) => !item.executable), scheduling: "not_enabled" }
}

export function reflectMaintenanceCycle({ orientation = {}, outcomes = [] } = {}) {
  const verified = outcomes.filter((item) => item.verification === "passed"), failed = outcomes.filter((item) => item.verification === "failed"), lessons = verified.map((item) => ({ operation_id: item.operation_id, lesson: "The verified bounded operation produced its expected result.", reusable: true })).concat(failed.map((item) => ({ operation_id: item.operation_id, lesson: "The operation did not verify; do not infer repair from its attempt.", reusable: true }))).slice(0, 20)
  return { phase: "consolidating", status: failed.length ? "partial" : "complete", needs_considered: orientation.needs?.length || 0, outcomes: { verified: verified.length, failed: failed.length }, lessons, next_phase: "idle", scheduling: "not_enabled" }
}
