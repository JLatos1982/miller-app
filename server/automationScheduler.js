export const AUTOMATION_POLICY = Object.freeze({ version: "automation-scheduler-v1", heartbeatMs: 15 * 60 * 1000, pulseMs: 6 * 60 * 60 * 1000, pulseTimeoutMs: 30_000, pulseFailureBackoffMs: 60 * 60 * 1000, pulseFailureLimit: 2, leaseMs: 5 * 60 * 1000, maxChildren: 1, productionEligible: false })
const age = (value, now) => value ? Math.max(0, now - new Date(value).getTime()) : null
const within = async (operation, timeoutMs) => {
  let timer
  try {
    return await Promise.race([operation(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("automation_child_timeout")), timeoutMs) })])
  } finally {
    clearTimeout(timer)
  }
}

export function automationPosture({ enabled = false, lastRun = null, now = Date.now(), policy = AUTOMATION_POLICY } = {}) {
  if (!enabled) return { state: "disabled", reason: "Automation is disabled by policy." }
  if (!lastRun) return { state: "never_started", reason: "No recorded heartbeat exists yet." }
  if (lastRun.status === "running" && new Date(lastRun.lease_expires_at || 0).getTime() > now) return { state: "running", reason: "Another scheduler holds the current lease." }
  if (lastRun.status === "failed" && Number(lastRun.failure_streak || 0) >= policy.pulseFailureLimit) return { state: "degraded", reason: "Automatic retries are paused after repeated failures." }
  return age(lastRun.started_at, now) > policy.heartbeatMs * 2 ? { state: "overdue", reason: "A heartbeat is later than the allowed window." } : { state: "healthy", reason: "The scheduler has a recent heartbeat." }
}

export function planAutomationWake({ enabled = false, lastRun = null, lastPulse = null, now = Date.now(), policy = AUTOMATION_POLICY } = {}) {
  const posture = automationPosture({ enabled, lastRun, now, policy })
  if (!enabled) return { posture, due: [], next_expected_at: null }
  const pulseAge = age(lastPulse?.completed_at, now), pulseFailed = lastPulse?.status === "failed", failures = Number(lastPulse?.failure_streak || 0)
  const pulseDue = !lastPulse || pulseAge >= policy.pulseMs
  const backoff = pulseFailed && failures >= policy.pulseFailureLimit ? policy.pulseFailureBackoffMs * failures : 0
  const retryReady = !pulseFailed || pulseAge === null || pulseAge >= backoff
  const due = pulseDue && retryReady ? [{ id: "security_pulse", authority: "safe_observation", cadence: "routine", reason: !lastPulse ? "never_run" : pulseFailed ? "retry_due" : "stale", timeout_ms: policy.pulseTimeoutMs }] : []
  return { posture, due: due.slice(0, policy.maxChildren), next_expected_at: new Date(now + policy.heartbeatMs).toISOString(), pulse: { freshness: pulseDue ? "due" : "fresh", failure_backoff_active: pulseFailed && !retryReady } }
}

export async function runAutomationWake({ enabled = false, store, loadState, executeSecurityPulse, now = () => Date.now(), policy = AUTOMATION_POLICY } = {}) {
  if (!store || typeof store.acquire !== "function" || typeof loadState !== "function") throw new Error("automation_scheduler_dependencies_required")
  const startedAt = now(), lease = await store.acquire({ leaseMs: policy.leaseMs, startedAt: new Date(startedAt).toISOString() })
  if (lease?.already_running) return { status: "already_running", run: lease.run || null, children_started: 0 }
  const run = lease.run || lease
  try {
    const state = await loadState(), plan = planAutomationWake({ enabled, lastRun: state.lastRun, lastPulse: state.lastPulse, now: startedAt, policy }), started = []
    if (!enabled) { await store.finish(run, { status: "disabled", heartbeat_status: plan.posture.state, due_capabilities: [], started_capabilities: [] }); return { status: "disabled", orientation: plan, children_started: 0 } }
    for (const capability of plan.due) {
      if (capability.id === "security_pulse" && typeof executeSecurityPulse === "function") { const result = await within(executeSecurityPulse, capability.timeout_ms); started.push({ id: capability.id, status: result?.status || "completed" }) }
    }
    await store.finish(run, { status: started.some((item) => item.status === "failed") ? "degraded" : "completed", heartbeat_status: plan.posture.state, due_capabilities: plan.due, started_capabilities: started })
    return { status: started.some((item) => item.status === "failed") ? "degraded" : "completed", orientation: plan, children_started: started.length, started }
  } catch (error) { await store.fail(run, { failure_code: String(error?.message || "automation_scheduler_failed").replace(/[^a-z0-9_-]/gi, "_").slice(0, 120) }); throw error }
}
