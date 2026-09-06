import { useMemo, useState } from "react"

import projection from "../data/miller-north-emerging-cases-public-v1.json"
import MillerNorthPublicNav from "./MillerNorthPublicNav.jsx"
import "./MillerNorthEmergingCases.css"

const provinceLabels = { "British Columbia": "B.C.", Alberta: "Alberta", Saskatchewan: "Saskatchewan" }
const stageLabels = { lead: "Lead", emerging_case: "Emerging case", dossier_candidate: "Dossier candidate", research_policy_case: "Research & Policy case" }

function SourceLinks({ sources }) {
  return <ul className="mne-source-list">{sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><span>{source.organization} · {source.date}</span></li>)}</ul>
}

export default function MillerNorthEmergingCases() {
  const [province, setProvince] = useState("all")
  const filtered = useMemo(() => province === "all" ? projection.items : projection.items.filter(item => item.province === province), [province])
  const visible = filtered.filter(item => item.stage !== "research_policy_case")
  const matureTransitions = filtered.filter(item => item.stage === "research_policy_case")
  return <main className="mn-public-page mne-page">
    <header className="mn-public-header"><a href="/indigenous-healthcare-evidence">← Evidence Library</a><MillerNorthPublicNav current="emerging" /></header>
    <section className="mn-public-hero mne-hero"><p className="mn-public-eyebrow">Miller North · Watching Now</p><h1>Developing stories worth following</h1><p>{projection.introduction}</p></section>
    <section className="mne-lifecycle" aria-labelledby="mne-lifecycle-title"><div><p className="mn-public-eyebrow">Evidence matures carefully</p><h2 id="mne-lifecycle-title">From a signal to a researched case</h2></div><ol>{projection.lifecycle.map((item, index) => <li key={item.stage} className={item.stage === "emerging_case" ? "is-current" : ""}><span>{index + 1}</span><div><strong>{item.label}</strong><p>{item.description}</p></div></li>)}</ol><p>No case advances automatically. Each stage requires stronger evidence, reconciliation and publication review.</p></section>
    <section className="mne-controls" aria-label="Watching Now filters"><label>Province<select value={province} onChange={event => setProvince(event.target.value)}><option value="all">All provinces</option>{Object.keys(provinceLabels).map(value => <option value={value} key={value}>{provinceLabels[value]}</option>)}</select></label><p aria-live="polite">{visible.length} developing stor{visible.length === 1 ? "y" : "ies"}</p></section>
    <section className="mne-grid" aria-label="Developing Research and Policy cases">{visible.map(item => <article className="mne-card" key={item.emerging_case_id}><div className="mne-card-meta"><span>{provinceLabels[item.province]}</span><span>{item.display_state}</span></div><h2>{item.title}</h2><p>{item.description}</p><h3>Why Miller North is watching</h3><p>{item.why_watching}</p><dl><dt>Research stage</dt><dd>{stageLabels[item.stage]}</dd><dt>Last checked</dt><dd>{item.last_verified_at}</dd><dt>Last material change</dt><dd>{item.last_material_change_at}</dd><dt>Next check</dt><dd>{item.next_check_due}</dd></dl><aside><strong>What we are waiting to learn</strong><p>{item.current_question}</p></aside>{item.related_href ? <a className="mne-related" href={item.related_href}>Related mature case →</a> : null}<details><summary>Sources ({item.sources.length})</summary><SourceLinks sources={item.sources}/></details></article>)}</section>
    {matureTransitions.length ? <section className="mne-promoted" aria-labelledby="mne-promoted-title"><p className="mn-public-eyebrow">Moved forward</p><h2 id="mne-promoted-title">Now a full Research &amp; Policy case</h2>{matureTransitions.map(item => <article key={item.emerging_case_id}><div><strong>{item.title}</strong><p>{item.description}</p></div><a href={item.related_href}>Read the full case →</a></article>)}</section> : null}
    <aside className="mne-caution"><strong>How to read this page</strong><p>{projection.caution}</p><p>Recent incident-like public reports remain in <a href="/indigenous-healthcare-evidence/live-listening">Live Listening</a>. Reconciled evidence is in the <a href="/indigenous-healthcare-evidence">Evidence Library</a>.</p></aside>
  </main>
}
