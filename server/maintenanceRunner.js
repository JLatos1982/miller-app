import { orientMaintenanceCycle, reflectMaintenanceCycle } from "./maintenanceCycle.js"
import { HEALING_ACTIONS, staleCycleNeed, recoverStaleMaintenanceCycle } from "./maintenanceHealing.js"
import { createInitialMachineQcHealing } from "./maintenanceToolbox.js"

export const MAX_TIER1_HEALING_ACTIONS_PER_CYCLE = 1

const learningAdjustment = (need, lessons = []) => {
  const lesson = lessons.find((item) => item.scope?.action_id === need.action_id && item.scope?.target_type === (need.target_type || "maintenance_cycle"))
  if (!lesson) return 0
  if (lesson.status === "contradicted") return -30
  return lesson.status === "supported" ? 10 : 0
}

export function selectHealingNeed(needs = [], lessons = []) {
  return needs
    .filter((need) => HEALING_ACTIONS[need.action_id]?.enabled && HEALING_ACTIONS[need.action_id].tier === 1)
    .map((need) => ({ ...need, selection_score: Number(need.value || HEALING_ACTIONS[need.action_id].priority || 0) + learningAdjustment(need, lessons) }))
    .sort((a, b) => b.selection_score - a.selection_score || String(a.occurred_at || "").localeCompare(String(b.occurred_at || "")) || a.id.localeCompare(b.id))[0] || null
}

const outcomeFor = (cycle, need, result) => ({ cycle_id: cycle.id, need_key: need.id, action_id: need.action_id, domain: need.domain, target_type: need.target_type || "maintenance_cycle", target_key: need.target_id, before: result.before, expected: need.expected, after: result.after, verified: result.verified, classification: result.classification, selection_reasons: need.reason_codes || ["highest_deterministic_value", "registered_tier1_action"] })

export async function runMaintenanceCycle({ mode = "observe", store, persistence, snapshot = async () => ({}), findStaleCycle = async () => null, now = () => Date.now(), db = null, actorId = null, loadMachineQcState = null } = {}) {
  if (!["observe", "maintain", "preview_growth"].includes(mode)) throw new Error("maintenance_mode_denied")
  let preHealing = null
  if (typeof store.inspectActive === "function") {
    const active = await store.inspectActive()
    const need = staleCycleNeed(active, now())
    if (active && !need) return { status: "already_running", cycle: active }
    if (need && mode !== "maintain") return { status: "already_running", cycle: active }
    if (need) preHealing = { need: { ...need, target_type: "maintenance_cycle", value: 100 }, result: await recoverStaleMaintenanceCycle({ store, cycle: active, now: now() }) }
  }
  const started = await store.start(mode)
  if (started.already_running) return { status: "already_running", cycle: started.cycle }
  const cycle = started.cycle
  try {
    const state = await snapshot()
    const orientation = orientMaintenanceCycle(state)
    const staleTarget = preHealing ? null : await findStaleCycle()
    const stale = preHealing ? null : staleCycleNeed(staleTarget, now())
    const candidates = [...(stale ? [{ ...stale, target_type: "maintenance_cycle", value: 100 }] : []), ...(state.healing_needs || [])]
    const selected = preHealing?.need || (mode === "maintain" ? selectHealingNeed(candidates, state.lessons || []) : null)
    const outcomes = []
    if (selected) {
      let result
      if (preHealing && selected.action_id === "recover_stale_maintenance_cycle") result = preHealing.result
      else if (selected.action_id === "recover_stale_maintenance_cycle") result = await recoverStaleMaintenanceCycle({ store, cycle: staleTarget, now: now() })
      else if (selected.action_id === "create_initial_machine_location_qc") result = await createInitialMachineQcHealing({ db, item: selected.context, actorId, loadState: loadMachineQcState })
      else throw new Error("unregistered_maintenance_action")
      const outcome = outcomeFor(cycle, selected, result)
      const saved = await persistence.recordOutcome(outcome)
      await persistence.updateLesson({ ...outcome, verification: saved.verification })
      outcomes.push(outcome)
    }
    const growth = []
    for (const item of (state.growth_opportunities || []).slice(0, 20)) growth.push(await persistence.observeGrowth(item))
    const reflection = reflectMaintenanceCycle({ orientation, outcomes: outcomes.map((item) => ({ operation_id: item.action_id, verification: item.verified ? "passed" : "failed" })) })
    const final = await store.finish(cycle, { status: outcomes.some((item) => !item.verified) ? "degraded" : "completed", completeness: "complete", phase: "idle", needs_discovered: orientation.needs.length + candidates.length, growth_opportunities: growth.length, work_attempted: outcomes.length, work_improved: outcomes.filter((item) => ["resolved", "improved"].includes(item.classification)).length, work_failed: outcomes.filter((item) => !item.verified).length, healing_attempted: outcomes.length, summary: { selected_action: selected ? { action_id: selected.action_id, target_id: selected.target_id, reason_codes: selected.reason_codes || [] } : null, reflection } })
    return { status: final.status, cycle: final, orientation, selected, outcomes, growth, reflection }
  } catch (error) {
    await store.fail(cycle, { phase: "idle", summary: { failure_code: "maintenance_cycle_failed" } })
    throw error
  }
}
