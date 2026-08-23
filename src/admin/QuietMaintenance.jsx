import { useCallback, useEffect, useRef, useState } from "react"
import { adminFetch } from "../adminApi.js"

const readable = (value) => String(value || "unknown").replaceAll("_", " ")

export default function QuietMaintenance() {
  const [report, setReport] = useState(null), [message, setMessage] = useState(""), [running, setRunning] = useState(false), key = useRef(crypto.randomUUID())
  const load = useCallback(async () => { try { const response = await adminFetch("/api/admin/quiet-maintenance"), body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error); setReport(body) } catch (error) { setMessage(error.message || "Quiet maintenance is unavailable.") } }, [])
  useEffect(() => { load() }, [load])
  const run = async () => {
    if (!window.confirm("Run one local quiet-maintenance pass over existing private derived state? It makes no network request and cannot change resources, locations, or map pins.")) return
    setRunning(true); setMessage("")
    try { const response = await adminFetch("/api/admin/quiet-maintenance/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true, idempotency_key: key.current }) }), body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || body.code); setMessage(body.idempotent ? "This quiet-maintenance pass was already completed." : "Quiet maintenance completed. The bounded working set has been refreshed."); key.current = crypto.randomUUID(); await load() } catch (error) { setMessage(error.message || "Quiet maintenance failed safely.") } finally { setRunning(false) }
  }
  const last = report?.last_run
  return <section className="admin-review-panel" aria-labelledby="quiet-maintenance-title"><p className="eyebrow">Administrator only · local manual maintenance</p><h2 id="quiet-maintenance-title">Quiet Maintenance</h2><p>A bounded inspection of private derived state: regulation, expiry, consolidation, and carry-forward. It does not browse, contact anyone, change directory facts, or publish locations.</p>{message ? <p role="status">{message}</p> : null}{report && !report.enabled ? <p>Quiet maintenance is disabled unless the explicit local-only development flag is enabled.</p> : <button type="button" onClick={run} disabled={running}>{running ? "Running quiet maintenance…" : "Run quiet maintenance"}</button>}{last ? <dl className="planner-summary"><dt>Last run</dt><dd>{last.completed_at || last.started_at}</dd><dt>Status</dt><dd>{readable(last.status)}</dd><dt>Inspected</dt><dd>{Object.values(last.inspected_counts || {}).reduce((sum, value) => sum + Number(value || 0), 0)}</dd><dt>Carried forward</dt><dd>{last.carry_forward?.length || 0}</dd></dl> : <p>No quiet-maintenance pass has run yet.</p>}<p><strong>While Miller was quiet:</strong> active state is kept small, repeated unchanged signals can be softened, expired aggregate state can be removed, and already-satisfied directory questions can be resolved from existing evidence.</p></section>
}
