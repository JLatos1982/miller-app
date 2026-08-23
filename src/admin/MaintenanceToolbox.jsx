import { useEffect, useState } from "react"
import { adminFetch } from "../adminApi.js"

const readable = (value) => String(value || "unknown").replaceAll("_", " ")

export default function MaintenanceToolbox() {
  const [data, setData] = useState(null), [error, setError] = useState("")
  useEffect(() => { let active = true; adminFetch("/api/admin/maintenance-toolbox").then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); if (active) setData(body) }).catch((reason) => { if (active) setError(reason.message || "Maintenance state is unavailable.") }); return () => { active = false } }, [])
  return <section className="admin-review-panel" aria-labelledby="maintenance-toolbox-title">
    <p className="eyebrow">Administrator only · manual and bounded</p><h2 id="maintenance-toolbox-title">Maintenance &amp; Growth</h2>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Loading maintenance state…</p> : <>
      <p>Safe repair uses complete trusted evidence. Missing evidence becomes a research recommendation, never a guessed change.</p>
      <dl className="planner-summary"><dt>Safe repairs available</dt><dd>{data.safe_repairs_available}</dd><dt>Almost map-ready</dt><dd>{data.almost_map_ready}</dd><dt>Needs location research</dt><dd>{data.location_research}</dd><dt>Stale information</dt><dd>{data.stale_resource_information}</dd><dt>Scheduling</dt><dd>{readable(data.scheduling)}</dd></dl>
      <h3>What I repaired</h3>{data.verified_outcomes.length ? <div className="evidence-cards">{data.verified_outcomes.map((item) => <article className="evidence-card" key={item.id}><strong>{readable(item.action_id)}</strong><p>{readable(item.classification)} · independently verified</p></article>)}</div> : <p>No verified maintenance repair has been persisted yet.</p>}
      <h3>Growth opportunities</h3>{data.opportunities.length ? <div className="evidence-cards">{data.opportunities.map((item) => <article className="evidence-card" key={item.id}><strong>{readable(item.gap_type)}</strong><p>{item.reason}</p></article>)}</div> : <p>No persisted growth opportunity is currently waiting.</p>}
      <h3>Capabilities worth building</h3>{data.capability_gaps.length ? <div className="evidence-cards">{data.capability_gaps.map((item) => <article className="evidence-card" key={item.id}><strong>{readable(item.problem_class)}</strong><p>{item.suggested_direction}</p><p>Observed {item.observation_count} time(s) · {readable(item.safety_category)}</p></article>)}</div> : <p>No recurring capability gap is currently persisted.</p>}
      <h3>Security attention</h3>{data.security_attention.length ? <div className="evidence-cards">{data.security_attention.map((item) => <article className="evidence-card" key={item.id}><strong>{readable(item.finding_type)}</strong><p>{item.recommended_action}</p></article>)}</div> : <p>No active private security finding is currently waiting.</p>}
      <details><summary>Learning and ineffective work</summary><p>Learning can rank an already eligible repair, but it cannot authorize one.</p><pre>{JSON.stringify({ lessons: data.lessons, ineffective_outcomes: data.ineffective_outcomes }, null, 2)}</pre></details>
    </>}
  </section>
}
