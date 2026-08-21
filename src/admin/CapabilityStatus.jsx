import { useEffect, useState } from "react"
import { adminFetch } from "../adminApi.js"

export default function CapabilityStatus() {
  const [report, setReport] = useState(null)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    adminFetch("/api/admin/capabilities").then(async (response) => {
      const body = await response.json().catch(() => ({})); if (!active) return
      if (!response.ok) setError(body.error || "Capability status could not be loaded."); else setReport(body)
    }).catch(() => active && setError("Capability status could not be loaded."))
    return () => { active = false }
  }, [])
  return <section className="admin-review-panel capability-status" aria-labelledby="capability-title"><div className="results-head"><div><p className="eyebrow">Server-side diagnostic</p><h2 id="capability-title">What can Miller currently do?</h2></div></div>{error ? <p role="status">{error}</p> : !report ? <p role="status">Checking configured capabilities…</p> : <div className="capability-grid">{report.capabilities.map((item) => <article key={item.id}><h3>{item.name}</h3><p><strong>{item.status.replaceAll("_", " ")}</strong> · {item.provider}</p>{item.detail ? <small>{item.detail}</small> : null}</article>)}</div>}</section>
}
