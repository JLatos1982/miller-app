import { useMemo, useState } from "react"

import listening from "../data/miller-north-live-listening-public-v1.json"
import MillerNorthPublicNav, { MillerNorthHomeLink } from "./MillerNorthPublicNav.jsx"
import "./MillerNorthLiveListening.css"

const provinceLabels = { british_columbia: "British Columbia", alberta: "Alberta", saskatchewan: "Saskatchewan" }
const stateLabels = { public_report: "Reported", corroborated_public_report: "Corroborated", linked_existing_incident: "Linked to existing record", verification_in_progress: "Reviewing", systemic_context: "Context only", insufficient_for_incident: "Insufficient for incident" }

export default function MillerNorthLiveListening() {
  const [province, setProvince] = useState("all")
  const [state, setState] = useState("all")
  const [year, setYear] = useState("all")
  const years = useMemo(() => [...new Set(listening.items.map(item => item.event_year || Number(item.source_publication_date?.slice(0, 4))).filter(Boolean))].sort((a, b) => b - a), [])
  const items = useMemo(() => listening.items.filter(item => (province === "all" || item.province === province) && (state === "all" || item.evidence_state === state) && (year === "all" || String(item.event_year || item.source_publication_date?.slice(0, 4)) === year)), [province, state, year])
  return <main className="mn-public-page mn-listening-page">
    <header className="mn-public-header"><MillerNorthHomeLink/><MillerNorthPublicNav current="watching" /></header>
    <section className="mn-public-hero"><p className="mn-public-eyebrow">Miller North · Recent public reports</p><h1>Reports under review</h1><p>Publication-safe summaries of recent public reports. They should not be read as findings simply because they appear here.</p></section>
    <aside className="mn-public-note"><strong>Following a clear public milestone?</strong> <a href="/indigenous-healthcare-evidence/watching-now">Watching</a> follows active inquiries, promised reviews and unresolved institutional follow-up.</aside>
    <aside className="mn-public-note"><strong>Important:</strong> A reported account is not the same as a formal finding. Missing follow-up does not prove an event did or did not occur.</aside>
    <section className="mn-listening-filters" aria-label="Recent public report filters"><label>Province<select value={province} onChange={event => setProvince(event.target.value)}><option value="all">All provinces</option>{Object.entries(provinceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Evidence state<select value={state} onChange={event => setState(event.target.value)}><option value="all">All evidence states</option>{Object.entries(stateLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Year shown<select value={year} onChange={event => setYear(event.target.value)}><option value="all">All years</option>{years.map(value => <option value={String(value)} key={value}>{value}</option>)}</select></label><p aria-live="polite"><strong>{items.length}</strong> public-source report{items.length === 1 ? "" : "s"}</p></section>
    <section className="mn-listening-grid" aria-label="Recent public-source signals">{items.map(item => <article className="mn-listening-card" key={item.listening_item_id}><div className="mn-listening-card-head"><span className={`mn-listening-state is-${item.evidence_state}`}>{stateLabels[item.evidence_state]}</span><span>{provinceLabels[item.province]}</span></div><h2>{item.title}</h2><p>{item.summary}</p><dl><dt>When</dt><dd>{item.date_label}</dd><dt>Where</dt><dd>{[item.facility, item.municipality].filter(Boolean).join(" · ")}</dd><dt>Last checked</dt><dd>{item.last_checked_date}</dd></dl>{item.linked_evidence_href ? <a className="mn-listening-related" href={item.linked_evidence_href}>Related Evidence Library record →</a> : null}<details><summary>Sources and evidence</summary><ul>{item.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><span>{source.organization}{source.publication_date ? ` · ${source.publication_date}` : ""}{source.role === "corroborating_public_report" ? " · corroborating source" : ""}</span></li>)}</ul></details></article>)}</section>
    <section className="mn-public-section mn-listening-boundary"><p className="mn-public-eyebrow">Why some leads are absent</p><h2>Publication is a separate decision</h2><p>Signals are withheld when identity is unclear, a direct source cannot be inspected, a repost adds no independent evidence, or anonymization would remove the information needed to understand the report.</p></section>
    <footer className="mn-public-footer">Miller North uses public-source evidence. These are publication-safe summaries, not a live social-media feed or a finding of wrongdoing.</footer>
  </main>
}
