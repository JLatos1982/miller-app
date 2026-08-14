import { useCallback, useEffect, useMemo, useState } from "react"
import { adminFetch } from "../adminApi.js"

const tabs = [
  ["automatic", "Automatically mapped"], ["quality", "Quality check"], ["B", "Needs my decision"],
  ["C", "Could not map"], ["public", "Public"], ["history", "History"],
]
export default function LocationAutomationReview() {
  const [report, setReport] = useState({ records: [], counts: {}, baseline: {} }), [tab, setTab] = useState("B"), [status, setStatus] = useState("Loading automation review…")
  const load = useCallback(async () => { const response = await adminFetch("/api/admin/location-automation/dry-run"); const body = await response.json().catch(() => ({})); if (!response.ok) return setStatus(body.error || "Automation review is unavailable."); setReport(body); setStatus(body.bc_access?.usable ? "Provider validation is configured." : "BC provider access is not configured. No requests or publications were made.") }, [])
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer) }, [load])
  const visible = useMemo(() => tab === "B" || tab === "C" ? report.records.filter((item) => item.tier === tab) : [], [report, tab])
  const count = (id) => id === "B" || id === "C" ? report.counts?.[id] || 0 : id === "public" ? report.baseline?.approved_public_locations || 0 : id === "history" ? report.records?.length || 0 : 0
  return <section className="address-evidence" aria-labelledby="automation-review-title"><header><p className="eyebrow">Administrator only · deterministic policy</p><h2 id="automation-review-title">Location automation v1.2</h2><p role="status">{status}</p></header><div className="review-tabs" role="tablist" aria-label="Location automation queues">{tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label} ({count(id)})</button>)}</div>{visible.length ? <div className="evidence-cards">{visible.map((item) => <article className="evidence-card" key={item.canonical_uuid}><div><h3>{item.resource_name}</h3><p><strong>Submitted:</strong> {item.submitted_address}<br/><strong>Municipality:</strong> {item.municipality}</p><p><strong>Reason:</strong> {item.reason}; {item.failed_hard_gates.join(", ")}</p><small>No coordinate; not public.</small></div></article>)}</div> : <p>No records in this local dry-run view. Automatic publication remains blocked.</p>}</section>
}
