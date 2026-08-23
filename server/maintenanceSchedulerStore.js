const bounded = (value, limit = 2000) => { const copy = JSON.parse(JSON.stringify(value || {})); return JSON.stringify(copy).length <= limit ? copy : {} }
export function createMaintenanceSchedulerStore(supabase) {
  async function config() { const result = await supabase.from("miller_maintenance_scheduler_config").select("*").eq("singleton", true).single(); if (result.error) throw result.error; return result.data }
  return {
    config,
    async updateConfig(values) { const result = await supabase.from("miller_maintenance_scheduler_config").update({ ...values, updated_at: new Date().toISOString() }).eq("singleton", true).select().single(); if (result.error) throw result.error; return result.data },
    async start({ cycle, trigger, executionMode }) { const result = await supabase.from("miller_maintenance_cycle_journal").insert({ cycle_id: cycle.id, trigger_type: trigger, execution_mode: executionMode }).select().single(); if (result.error) throw result.error; return result.data },
    async finish(id, values) { if (!id) return null; const result = await supabase.from("miller_maintenance_cycle_journal").update({ ...values, security_summary: bounded(values.security_summary), orientation_summary: bounded(values.orientation_summary), considered: bounded(values.considered), selected_action: bounded(values.selected_action), refused: bounded(values.refused), verification: bounded(values.verification), learning_summary: bounded(values.learning_summary), reflection: bounded(values.reflection) }).eq("id", id).select().single(); if (result.error) throw result.error; return result.data },
    async fail(id, values) { if (!id) return null; const result = await supabase.from("miller_maintenance_cycle_journal").update({ status: "failed", completed_at: new Date().toISOString(), duration_ms: values.duration_ms, failure_code: values.failure_code }).eq("id", id).select().single(); if (result.error) throw result.error; return result.data },
    async recent(limit = 20) { const result = await supabase.from("miller_maintenance_cycle_journal").select("*").order("started_at", { ascending: false }).limit(Math.max(1, Math.min(50, Number(limit) || 20))); if (result.error) throw result.error; return result.data || [] },
    async updateSchedule(values) { return this.updateConfig(values) },
  }
}
