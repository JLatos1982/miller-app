import { useMemo, useState } from "react"

import projection from "../data/miller-north-emerging-cases-public-v1.json"
import MillerNorthPublicNav, { MillerNorthHomeLink } from "./MillerNorthPublicNav.jsx"
import "./MillerNorthEmergingCases.css"

const provinceLabels = { "British Columbia": "B.C.", Alberta: "Alberta", Saskatchewan: "Saskatchewan" }
function SourceLinks({ sources }) {
  return <ul className="mne-source-list">{sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><span>{source.organization} · {source.date}</span></li>)}</ul>
}

export default function MillerNorthEmergingCases() {
  const [province, setProvince] = useState("all")
  const filtered = useMemo(() => province === "all" ? projection.items : projection.items.filter(item => item.province === province), [province])
  const visible = filtered.filter(item => item.stage !== "research_policy_case")
  const matureTransitions = filtered.filter(item => item.stage === "research_policy_case")
  return <main className="mn-public-page mne-page">
    <header className="mn-public-header"><MillerNorthHomeLink/><MillerNorthPublicNav current="watching" /></header>
    <section className="mn-public-hero mne-hero"><p className="mn-public-eyebrow">Miller North · Watching</p><h1>Current public developments</h1><p>Active inquiries, promised reviews and unresolved institutional follow-up with an identifiable question or milestone still ahead.</p></section>
    <section className="mne-controls" aria-label="Watching Now filters"><label>Province<select value={province} onChange={event => setProvince(event.target.value)}><option value="all">All provinces</option>{Object.keys(provinceLabels).map(value => <option value={value} key={value}>{provinceLabels[value]}</option>)}</select></label><p aria-live="polite">{visible.length} developing stor{visible.length === 1 ? "y" : "ies"}</p></section>
    <section className="mne-grid" aria-label="Current public developments">{visible.map(item => <article className="mne-card" key={item.emerging_case_id}><div className="mne-card-meta"><span>{provinceLabels[item.province]}</span><span>{item.display_state}</span></div><h2>{item.title}</h2><p>{item.description}</p><h3>Why Miller North is watching</h3><p>{item.why_watching}</p><dl><dt>Last checked</dt><dd>{item.last_verified_at}</dd><dt>Last material change</dt><dd>{item.last_material_change_at}</dd><dt>Next check</dt><dd>{item.next_check_due}</dd></dl><aside><strong>What we are waiting to learn</strong><p>{item.current_question}</p></aside>{item.related_href ? <a className="mne-related" href={item.related_href}>Related researched case →</a> : null}<details><summary>Sources ({item.sources.length})</summary><SourceLinks sources={item.sources}/></details></article>)}</section>
    {matureTransitions.length ? <section className="mne-promoted" aria-labelledby="mne-promoted-title"><p className="mn-public-eyebrow">Moved forward</p><h2 id="mne-promoted-title">Now a full Research &amp; Policy case</h2>{matureTransitions.map(item => <article key={item.emerging_case_id}><div><strong>{item.title}</strong><p>{item.description}</p></div><a href={item.related_href}>Read the full case →</a></article>)}</section> : null}
    <aside className="mne-caution"><strong>How to read this page</strong><p>{projection.caution}</p><p>Reviewed individual events are in <a href="/indigenous-healthcare-evidence/serious-harm">Incidents</a>. Broader reports and research are in <a href="/indigenous-healthcare-evidence">Evidence</a>.</p></aside>
  </main>
}
