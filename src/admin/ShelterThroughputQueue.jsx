import { useCallback, useEffect, useState } from "react"
import { adminFetch } from "../adminApi.js"

const labels = { tier_a_bulk_confirmable: "Ready to approve", tier_b_one_click_review: "Ready to approve", tier_c_reconciliation: "Possible duplicates", tier_d_research: "Needs research", tier_e_safety_sensitive: "Safety-sensitive" }
const tabs = ["tier_a_bulk_confirmable", "tier_b_one_click_review", "tier_c_reconciliation", "tier_e_safety_sensitive", "tier_d_research"]

export default function ShelterThroughputQueue() {
  const [report, setReport] = useState(null), [status, setStatus] = useState("Loading shelter action queue…"), [tier, setTier] = useState("tier_a_bulk_confirmable"), [busy, setBusy] = useState("")
  const load = useCallback(async () => { const response = await adminFetch("/api/admin/shelter-throughput"), body = await response.json().catch(() => ({})); if (!response.ok) return setStatus(body.error || "Shelter action queue is unavailable."); setReport(body); const next = tabs.find((key) => body.counts?.[key]) || "tier_d_research"; setTier((current) => body.counts?.[current] ? current : next); setStatus(`${Object.values(body.counts || {}).reduce((sum, value) => sum + value, 0)} pending candidates. Directory decisions never create a map location or pin.`) }, [])
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer) }, [load])
  async function decide(item, action) {
    if (busy) return
    const copy = action === "approve" ? `Approve ${item.name} as a directory resource? No map location or pin will be created.` : `${action.replaceAll("_", " ")} ${item.name}?`
    if (!window.confirm(copy)) return
    setBusy(String(item.id)); setStatus(action === "approve" ? "Approving directory resource…" : "Saving shelter decision…")
    try {
      const response = await adminFetch(`/api/admin/discovery-candidates/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(action === "approve" ? { confirmed_duplicate_review: true } : {}) }) })
      const body = await response.json().catch(() => ({}))
      setStatus(response.ok ? (action === "approve" ? "Directory resource approved. No map location was created." : "Shelter decision saved.") : body.error || "The shelter decision was not saved.")
      if (response.ok) await load()
    } catch { setStatus("The shelter decision could not reach the server. Reload and try again.") } finally { setBusy("") }
  }
  function reviewDuplicate(item) {
    const match = (item.possible_matches || []).find((value) => String(value.discovery_candidate_id || "").replace(/^candidate:/, "") !== "")
    const relatedId = String(match?.discovery_candidate_id || "").replace(/^candidate:/, "")
    window.dispatchEvent(new CustomEvent("miller:shelter-reconciliation", { detail: { candidateId: String(item.id), relatedId } }))
    document.getElementById("shelter-reconciliation-title")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const cards = report?.[tier] || []
  return <section className="address-evidence" aria-labelledby="shelter-throughput-title"><header><p className="eyebrow">Administrator only · human decisions</p><h2 id="shelter-throughput-title">Shelter review queue</h2><p role="status">{status}</p></header>{report ? <><div className="resolution-summary">{tabs.map((key) => <button type="button" key={key} aria-pressed={tier === key} onClick={() => setTier(key)}><strong>{report.counts?.[key] || 0}</strong><span>{labels[key]}</span></button>)}</div><h3>{labels[tier]} ({cards.length})</h3><div className="evidence-cards">{cards.slice(0, 20).map((item) => <article className="evidence-card" key={`${tier}:${item.id}`}><h3>{item.name}</h3><p>{[item.operator, item.shelter_type, item.community].filter(Boolean).join(" · ")}</p><p><strong>Why:</strong> {item.reason_codes.join(", ").replaceAll("_", " ")}</p>{item.machine_research ? <p><strong>Machine research:</strong> {item.machine_research.recommendation.replaceAll("_", " ")} · {item.machine_research.research_summary}</p> : null}{item.source_url ? <a href={item.source_url} target="_blank" rel="noreferrer">Open strongest evidence</a> : null}{tier === "tier_c_reconciliation" ? <button type="button" onClick={() => reviewDuplicate(item)}>Review possible duplicate</button> : tier === "tier_d_research" ? <p><strong>Machine research queue.</strong> This candidate is not ready for a human directory decision.</p> : <div className="pending-actions"><button disabled={Boolean(busy)} onClick={() => decide(item, "approve")}>{tier === "tier_e_safety_sensitive" ? "Approve directory resource — keep location private" : "Approve directory resource"}</button><button disabled={Boolean(busy)} onClick={() => decide(item, "defer")}>Needs more research</button><button disabled={Boolean(busy)} onClick={() => decide(item, "reject")}>Reject</button><button disabled={Boolean(busy)} onClick={() => decide(item, "exclude")}>Exclude</button></div>}</article>)}</div></> : null}</section>
}
