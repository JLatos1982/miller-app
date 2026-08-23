import { useCallback, useEffect, useState } from "react"
import { adminFetch } from "../adminApi.js"

const readable = (value) => String(value || "unknown").replaceAll("_", " ")

export default function ControlRoom() {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState("")
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [asking, setAsking] = useState(false)
  const load = useCallback(async () => { try { const response = await adminFetch("/api/admin/control-room"), body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body) } catch (error) { setMessage(error.message || "Control Room is unavailable.") } }, [])
  useEffect(() => { load() }, [load])
  const ask = async (event) => {
    event.preventDefault()
    if (!question.trim() || asking) return
    setAsking(true); setAnswer("")
    try {
      const response = await adminFetch("/api/admin/miller-guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) }), body = await response.json()
      if (!response.ok) throw new Error(body.error)
      if (body.action_required === "run_security_pulse") {
        if (!window.confirm("Run the fixed local-only Security Pulse?")) return setAnswer(body.text)
        const run = await adminFetch("/api/admin/security-pulse/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) }), result = await run.json()
        setAnswer(run.ok ? "Security Pulse completed. I refreshed the current state." : result.error)
        if (run.ok) await load()
      } else setAnswer(body.text)
    } catch (error) { setAnswer(error.message || "Miller could not answer that safely.") } finally { setAsking(false) }
  }
  if (!data) return <section className="admin-review-panel"><h2>Miller Control Room</h2><p role="status">{message || "Loading protected system state…"}</p></section>
  const guidance = data.operational_guidance || {}, overview = data.overview || {}
  return <section className="admin-review-panel" aria-labelledby="control-room-title">
    <p className="eyebrow">Administrator only · inspectable system state</p><h2 id="control-room-title">Miller Control Room</h2>
    <section className="miller-guidance" aria-label="Ask Miller about operations"><h3>Miller</h3><p>{guidance.summary}</p><form className="map-chat-form" onSubmit={ask}><label htmlFor="miller-guide-question">Ask Miller</label><textarea id="miller-guide-question" rows="2" maxLength="500" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="How are you doing? What changed? How is security?"/><button type="submit" disabled={!question.trim() || asking}>{asking ? "Thinking…" : "Ask Miller"}</button></form>{answer ? <p role="status">{answer}</p> : null}</section>
    {message ? <p role="status">{message}</p> : null}
    <dl className="planner-summary"><dt>System state</dt><dd>{readable(guidance.system_state)}</dd><dt>Security</dt><dd>{readable(guidance.domains?.security)}</dd><dt>Public health</dt><dd>{readable(guidance.domains?.public_health)}</dd><dt>Security Pulse</dt><dd>{readable(guidance.pulse?.freshness)}</dd><dt>Scheduling</dt><dd>{readable(overview.nightly_scheduling)}</dd><dt>Active attention</dt><dd>{overview.active_attention}</dd></dl>
    {guidance.uncertainty ? <p>{guidance.uncertainty}</p> : null}
    <h3>What needs attention</h3><div className="evidence-cards">{(guidance.attention || []).length ? guidance.attention.map((item) => <article className="evidence-card" key={`${item.domain}-${item.id}`}><strong>{item.title}</strong><p>{item.detail}</p></article>) : <p>Nothing currently stands out for attention.</p>}</div>
    <h3>Daily review</h3><p>{data.daily_review?.summary}</p><h3>Deep review</h3><p>{data.deep_review?.summary}</p>
    <details><summary>Technical details</summary><p>Security and public-health evidence remain separate. Pulse is manual; Daily and Deep Reviews are previews, not scheduled jobs.</p><pre>{JSON.stringify({ pulse: guidance.pulse, changes: guidance.changes }, null, 2)}</pre></details>
  </section>
}
