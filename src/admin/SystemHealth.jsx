import { useCallback, useEffect, useState } from "react"
import { adminFetch } from "../adminApi.js"
import SecurityRoom from "./SecurityRoom.jsx"
import ControlRoom from "./ControlRoom.jsx"
import MaintenanceToolbox from "./MaintenanceToolbox.jsx"
import Heartbeat from "./Heartbeat.jsx"
import Attention from "./Attention.jsx"
import HumanNeeds from "./HumanNeeds.jsx"
import CoverageHypotheses from "./CoverageHypotheses.jsx"
import QuietMaintenance from "./QuietMaintenance.jsx"
const readable = (value) => String(value || "unknown").replaceAll("_", " ")
export default function SystemHealth() { const [report,setReport]=useState(null),[error,setError]=useState("");const load=useCallback(async()=>{try{const response=await adminFetch("/api/admin/system-health"),body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||"System health is unavailable.");setReport(body);setError("")}catch(reason){setError(reason.message||"System health is unavailable.")}},[]);useEffect(()=>{const timer=window.setTimeout(load,0);return()=>window.clearTimeout(timer)},[load]);return <><SecurityRoom/><ControlRoom/><MaintenanceToolbox/><Heartbeat/><Attention/><HumanNeeds/><CoverageHypotheses/><QuietMaintenance/><section className="admin-review-panel system-health" aria-labelledby="system-health-title"><p className="eyebrow">Administrator only · read-only</p><h2 id="system-health-title">System Health</h2>{error?<p role="alert">{error}</p>:!report?<p role="status">Checking knowledge and protective controls…</p>:<><p>Knowledge and system findings are deterministic diagnostics. No attachment contents, credentials, or secret configuration values are shown.</p><dl className="planner-summary"><dt>Knowledge findings</dt><dd>{report.summary.knowledge_findings}</dd><dt>System findings</dt><dd>{report.summary.security_findings}</dd><dt>High severity</dt><dd>{report.summary.high_severity_findings}</dd><dt>Quiet maintenance</dt><dd>{readable(report.summary.quiet_maintenance_status)}</dd><dt>Quarantine backlog</dt><dd>{report.summary.quarantine_backlog}</dd></dl></>}</section></> }
