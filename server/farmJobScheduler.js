import { detectFarmListenerAnomaly, normalizeFarmListenerResult, protectFarmListenerMemory, recommendTransparentCadence, transparentSourceYield, validateFarmListenerRegistry } from "./farmListenerFramework.js"

const DAY = 24 * 60 * 60 * 1000
const cleanError = error => String(error?.message || error || "farm_job_failed").replace(/[^a-z0-9_-]/gi, "_").slice(0, 120)

export function nextFarmRun(listener, from = new Date()) {
  if (listener.schedule.kind !== "interval") return listener.schedule.next_expected_at || null
  return new Date(new Date(from).getTime() + listener.schedule.days * DAY).toISOString()
}

export function farmJobDue(listener, state = {}, now = new Date()) {
  if (!listener.enabled || listener.schedule.kind === "manual") return false
  const current = state.jobs?.[listener.listener_id]
  if (listener.schedule.kind === "milestone") {
    const trigger = listener.schedule.next_expected_at
    if (!trigger || new Date(trigger).getTime() > new Date(now).getTime()) return false
    return !current?.last_attempted_at || new Date(current.last_attempted_at).getTime() < new Date(trigger).getTime()
  }
  const next = current?.next_run_at || listener.schedule.first_run_at || listener.schedule.next_expected_at
  return !next || new Date(next).getTime() <= new Date(now).getTime()
}

export function planFarmJobs({ registry, state = {}, now = new Date(), only = null } = {}) {
  validateFarmListenerRegistry(registry)
  return registry.listeners.map(listener => {
    const current = state.jobs?.[listener.listener_id] || {}
    const due = only ? listener.listener_id === only : farmJobDue(listener, state, now)
    return {
      listener_id: listener.listener_id,
      enabled: listener.enabled,
      execution_target: listener.execution_target,
      due,
      last_run_at: current.last_attempted_at || null,
      last_successful_run_at: current.last_successful_at || null,
      next_run_at: current.next_run_at || listener.schedule.first_run_at || null,
      consecutive_failures: Number(current.consecutive_failures || 0),
      owner_notification_policy: listener.owner_notification_policy,
    }
  })
}

export async function executeFarmJob({ listener, state = {}, adapter, workerHealth = {}, now = () => new Date(), mode = "execute" } = {}) {
  const started = now()
  const prior = state.jobs?.[listener.listener_id] || {}
  const base = {
    listener_id: listener.listener_id,
    source_family: listener.source_family,
    project_scope: listener.project_scope,
    target_worker: listener.execution_target,
    started_at: started.toISOString(),
    mutation_authority: false,
    publication_authority: false,
  }
  if (mode === "dry_run") {
    const result = normalizeFarmListenerResult({ status: "deferred", notes: ["Dry run only; adapter was not executed."] })
    return { run: { ...base, status: result.status, completed_at: now().toISOString(), duration_ms: 0, ...result }, state: prior }
  }
  if (listener.execution_target === "igor" && workerHealth.igor?.available !== true) {
    const result = normalizeFarmListenerResult({ status: "deferred", errors: 0, notes: ["Igor unavailable; job retained for its next configured run. Samwise did not take over."] })
    return { run: { ...base, status: result.status, completed_at: now().toISOString(), duration_ms: 0, ...result }, state: { ...prior, last_attempted_at: started.toISOString(), last_status: "deferred", next_run_at: prior.next_run_at || listener.schedule.first_run_at || null } }
  }
  if (typeof adapter !== "function") {
    const result = normalizeFarmListenerResult({ status: "deferred", notes: ["Listener is registered but its production adapter is not enabled."] })
    return { run: { ...base, status: result.status, completed_at: now().toISOString(), duration_ms: 0, ...result }, state: { ...prior, last_attempted_at: started.toISOString(), last_status: "deferred", next_run_at: prior.next_run_at || listener.schedule.first_run_at || null } }
  }
  try {
    const raw = await adapter({ listener, previous: prior.listener_memory || null })
    let result = normalizeFarmListenerResult(raw)
    const anomaly = detectFarmListenerAnomaly(result, listener.anomaly_policy)
    if (anomaly.anomalous) result = normalizeFarmListenerResult({ ...result, status: "quarantined", owner_review: Math.max(1, result.owner_review), notes: [...result.notes, "Unexpected change volume was quarantined; no publication action was taken."] })
    const completed = now()
    const next = nextFarmRun(listener, completed)
    const nextState = {
      ...prior,
      last_attempted_at: started.toISOString(),
      last_status: result.status,
      consecutive_failures: 0,
      next_run_at: next,
      last_result_fingerprint: result.output_fingerprint,
      listener_memory: protectFarmListenerMemory({ previous: prior.listener_memory, candidate: raw?.memory, result }),
      ...(result.status === "quarantined" ? {} : { last_successful_at: completed.toISOString() }),
      ...(result.material_changes || result.new_documents || result.updated_documents || result.new_events || result.existing_events_strengthened ? { last_material_change_at: completed.toISOString() } : {}),
    }
    return { run: { ...base, ...result, completed_at: completed.toISOString(), duration_ms: Math.max(0, completed - started), anomaly }, state: nextState }
  } catch (error) {
    const completed = now()
    const failures = Number(prior.consecutive_failures || 0) + 1
    const retryDays = Math.min(listener.retry_policy?.max_backoff_days || 14, Math.max(1, listener.retry_policy?.base_backoff_days || 1) * failures)
    const result = normalizeFarmListenerResult({ status: "failed", errors: 1, notes: [`Failure recorded as ${cleanError(error)}; prior listener memory retained.`] })
    return {
      run: { ...base, ...result, completed_at: completed.toISOString(), duration_ms: Math.max(0, completed - started), failure_code: cleanError(error) },
      state: { ...prior, last_attempted_at: started.toISOString(), last_status: "failed", consecutive_failures: failures, next_run_at: new Date(completed.getTime() + retryDays * DAY).toISOString(), listener_memory: prior.listener_memory || null },
    }
  }
}

export async function runFarmCycle({ registry, state = { schema_version: "farm-job-state-v1", jobs: {} }, adapters = {}, workerHealth = {}, now = () => new Date(), mode = "execute", only = null, maxJobs = 3 } = {}) {
  validateFarmListenerRegistry(registry)
  const planned = planFarmJobs({ registry, state, now: now(), only }).filter(item => item.due)
  const selected = planned.slice(0, Math.max(1, maxJobs))
  const runs = []
  const nextState = { ...state, schema_version: "farm-job-state-v1", jobs: { ...(state.jobs || {}) } }
  for (const plannedJob of selected) {
    const listener = registry.listeners.find(item => item.listener_id === plannedJob.listener_id)
    const outcome = await executeFarmJob({ listener, state: nextState, adapter: adapters[listener.adapter], workerHealth, now, mode })
    nextState.jobs[listener.listener_id] = outcome.state
    runs.push(outcome.run)
  }
  return { schema_version: "farm-operations-cycle-v1", mode, selected_jobs: selected.map(item => item.listener_id), runs, state: nextState }
}

export function farmListenerInventory({ registry, state = {}, history = [], now = new Date() } = {}) {
  return registry.listeners.map(listener => {
    const current = state.jobs?.[listener.listener_id] || {}
    const runs = history.filter(item => item.listener_id === listener.listener_id)
    const yieldMetrics = transparentSourceYield(runs)
    return {
      listener_id: listener.listener_id,
      source_family: listener.source_family,
      project_scope: listener.project_scope,
      enabled: listener.enabled,
      execution_target: listener.execution_target,
      schedule: listener.schedule,
      last_run_at: current.last_attempted_at || null,
      last_successful_run_at: current.last_successful_at || null,
      next_run_at: current.next_run_at || listener.schedule.first_run_at || null,
      due: farmJobDue(listener, state, now),
      status: current.last_status || "never_run",
      consecutive_failures: Number(current.consecutive_failures || 0),
      owner_notification_policy: listener.owner_notification_policy,
      yield: yieldMetrics,
      cadence_recommendation: recommendTransparentCadence(listener, yieldMetrics),
    }
  })
}
