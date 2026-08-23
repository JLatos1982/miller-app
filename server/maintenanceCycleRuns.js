import { createHash, randomUUID } from "node:crypto"

const STALE_MS = 20 * 60 * 1000
const key = () => createHash("sha256").update(`maintenance-cycle|${randomUUID()}`).digest("hex")
export function createMaintenanceCycleStore(supabase, { now = () => Date.now() } = {}) {
  const timestamp = () => new Date(now()).toISOString()
  async function active() { const result = await supabase.from("miller_maintenance_cycles").select("*").eq("status", "running").order("started_at", { ascending: false }).limit(1).maybeSingle(); if (result.error) throw result.error; return result.data }
  async function finish(cycle, values) { const result = await supabase.from("miller_maintenance_cycles").update({ ...values, completed_at: timestamp(), phase: values.phase || "idle" }).eq("id", cycle.id).select().single(); if (result.error) throw result.error; return result.data }
  return { inspectActive: active, async start(mode = "observe", triggerType = "manual_admin") { const current = await active(); if (current) return { already_running: true, cycle: current }; const trigger_type = ["manual_admin", "scheduled"].includes(triggerType) ? triggerType : "manual_admin"; const result = await supabase.from("miller_maintenance_cycles").insert({ cycle_key: key(), mode, trigger_type, phase: "waking", status: "running", completeness: "partial" }).select().single(); if (result.error) { if (result.error.code === "23505") return { already_running: true, cycle: await active() }; throw result.error } return { already_running: false, cycle: result.data } }, finish, fail(cycle, summary = {}) { return finish(cycle, { ...summary, status: "failed", completeness: "failed" }) } }
}
