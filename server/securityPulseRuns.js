import { createHash, randomUUID } from "node:crypto"

const STALE_MS = 15 * 60 * 1000
const runKey = () => createHash("sha256").update(`security-pulse|${randomUUID()}`).digest("hex")
const completedAt = (now) => new Date(now()).toISOString()

export function createPulseRunStore(supabase, { now = () => Date.now() } = {}) {
  async function activeOrRecover() {
    const active = await supabase.from("miller_security_pulse_runs").select("*").eq("status", "running").order("started_at", { ascending: false }).limit(1).maybeSingle()
    if (active.error) throw active.error
    if (!active.data) return null
    if (now() - new Date(active.data.started_at).getTime() <= STALE_MS) return active.data
    const stale = await supabase.from("miller_security_pulse_runs").update({ status: "failed", completeness: "timed_out", completed_at: completedAt(now), summary: { failure_code: "stale_run_recovered" } }).eq("id", active.data.id)
    if (stale.error) throw stale.error
    return null
  }

  async function finalize(run, summary) {
    const result = await supabase.from("miller_security_pulse_runs").update({ ...summary, completed_at: completedAt(now) }).eq("id", run.id).select().single()
    if (result.error) throw result.error
    return result.data
  }

  return {
    async start() {
      const active = await activeOrRecover()
      if (active) return { already_running: true, run: active }
      const result = await supabase.from("miller_security_pulse_runs").insert({ run_key: runKey(), trigger_type: "manual_admin", mode: "local_manual", status: "running", completeness: "partial" }).select().single()
      if (result.error) {
        if (result.error.code === "23505") return { already_running: true, run: await activeOrRecover() }
        throw result.error
      }
      return { already_running: false, run: result.data }
    },
    finalize,
    fail(run, summary = {}) {
      return finalize(run, { ...summary, status: "failed", completeness: "failed" })
    },
    async latest() {
      const result = await supabase.from("miller_security_pulse_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle()
      if (result.error) throw result.error
      return result.data
    },
    async recent(limit = 20) {
      const result = await supabase.from("miller_security_pulse_runs").select("*").order("started_at", { ascending: false }).limit(Math.min(20, Math.max(1, Number(limit) || 20)))
      if (result.error) throw result.error
      return result.data || []
    },
  }
}
