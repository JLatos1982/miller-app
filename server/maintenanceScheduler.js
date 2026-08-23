import { runMaintenanceCycle } from "./maintenanceRunner.js"

export const SCHEDULER_DEFAULTS = Object.freeze({ enabled: false, execution_mode: "dry_run", cadence_hours: 24, display_timezone: "America/Vancouver" })
const DAY = 24 * 60 * 60 * 1000
const compact = (value, limit = 12) => Array.isArray(value) ? value.slice(0, limit) : value || {}

export function normalizeSchedulerConfig(value = {}) {
  const cadence = Number(value.cadence_hours ?? SCHEDULER_DEFAULTS.cadence_hours)
  return { ...SCHEDULER_DEFAULTS, ...value, enabled: value.enabled === true, execution_mode: value.execution_mode === "active" ? "active" : "dry_run", cadence_hours: Number.isInteger(cadence) && cadence >= 24 && cadence <= 168 ? cadence : SCHEDULER_DEFAULTS.cadence_hours }
}
export function nextExpectedWake(lastScheduledAt, cadenceHours = 24) {
  const base = lastScheduledAt ? new Date(lastScheduledAt).getTime() : Date.now()
  return new Date(base + Number(cadenceHours) * 60 * 60 * 1000).toISOString()
}
export function weeklyMaintenanceSummary(journals = [], now = Date.now()) {
  const cutoff = now - 7 * DAY, items = journals.filter((item) => new Date(item.started_at).getTime() >= cutoff)
  const count = (predicate) => items.filter(predicate).length
  const actions = items.map((item) => item.selected_action?.action_id).filter(Boolean)
  const refused = items.flatMap((item) => item.refused || []).map((item) => item.reason_code || item).filter(Boolean)
  return { period_days: 7, cycles_attempted: items.length, cycles_completed: count((item) => ["completed", "degraded"].includes(item.status)), no_op_cycles: count((item) => !item.selected_action?.action_id && ["completed", "degraded"].includes(item.status)), tier1_actions_performed: actions.length, successful_verifications: count((item) => item.verification?.status === "passed"), failed_verifications: count((item) => item.verification?.status === "failed"), failures: count((item) => item.status === "failed"), actions: [...new Set(actions)], most_common_refusals: [...new Set(refused)].slice(0, 8) }
}
export async function runScheduledMaintenanceCycle({ trigger = "scheduled", config, store, journal, persistence, snapshot, now = () => Date.now(), ...dependencies } = {}) {
  const safeConfig = normalizeSchedulerConfig(config)
  if (trigger === "scheduled" && !safeConfig.enabled) return { status: "disabled", execution_mode: safeConfig.execution_mode, next_expected_at: nextExpectedWake(safeConfig.last_scheduled_at, safeConfig.cadence_hours) }
  const executionMode = safeConfig.execution_mode
  const mode = executionMode === "active" ? "maintain" : "observe"
  const startedAt = now()
  let journalId = null
  const result = await runMaintenanceCycle({
    ...dependencies, mode, triggerType: trigger, store, persistence, snapshot, now,
    onCycleStarted: async (cycle) => { const entry = await journal.start({ cycle, trigger, executionMode }); journalId = entry?.id || null },
    onCycleFinished: async (payload) => journal.finish(journalId, journalValues(payload, startedAt, now())),
    onCycleFailed: async ({ cycle, error }) => journal.fail(journalId, { cycle, duration_ms: Math.max(0, now() - startedAt), failure_code: safeFailureCode(error) }),
  })
  if (trigger === "scheduled" && typeof journal.updateSchedule === "function") { const scheduledAt = new Date(now()).toISOString(); await journal.updateSchedule({ last_scheduled_at: scheduledAt, next_expected_at: nextExpectedWake(scheduledAt, safeConfig.cadence_hours) }) }
  return { ...result, execution_mode: executionMode, trigger, journal_id: journalId }
}
function safeFailureCode(error) { return String(error?.message || "maintenance_cycle_failed").replace(/[^a-z0-9_-]/gi, "_").slice(0, 120) }
function journalValues(result, startedAt, completedAt) {
  const refused = (result.orientation?.needs || []).filter((item) => !item.executable).map((item) => ({ id: item.id, reason_code: item.action || "human_review_required" })).slice(0, 20)
  const outcome = result.outcomes?.[0] || null
  return { status: result.status, completed_at: new Date(completedAt).toISOString(), duration_ms: Math.max(0, completedAt - startedAt), security_summary: compact(result.orientation?.inventory?.security ? { state: result.orientation.inventory.security } : {}), orientation_summary: { needs_found: result.orientation?.needs?.length || 0, safe_actions: result.orientation?.safe_work?.length || 0, capability_gaps: result.capability_gaps?.length || 0 }, considered: compact((result.orientation?.safe_work || []).map((item) => ({ action_id: item.action_id, target_id: item.target_id }))), selected_action: result.selected ? { action_id: result.selected.action_id, target_id: result.selected.target_id, reason_codes: result.selected.reason_codes || [] } : {}, refused, verification: outcome ? { status: outcome.verified ? "passed" : "failed", classification: outcome.classification } : { status: "not_applicable" }, learning_summary: { outcome_count: result.outcomes?.length || 0, growth_observed: result.growth?.length || 0, capability_gaps_observed: result.capability_gaps?.length || 0 }, reflection: result.reflection || {} }
}
