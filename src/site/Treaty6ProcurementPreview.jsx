import { useMemo, useState } from "react"

import "./Treaty6ProcurementPreview.css"

const actionabilityLabels = Object.freeze({
  OPEN_BID_READY: "Open bid",
  OPEN_REGISTRATION: "Supplier registration",
  PREQUALIFICATION: "Prequalification",
  RFI_ONLY: "Planning / RFI",
  UPCOMING_PLANNING: "Upcoming / planning",
  MONITOR: "Monitor",
})
const EMPTY_OPPORTUNITIES = Object.freeze([])

function OpportunityCard({ item }) {
  return <article className="t6p-card">
    <div className="t6p-card-tags"><span>{actionabilityLabels[item.actionability] || item.actionability}</span><span>{item.province}</span>{item.small_business_fit ? <span>{item.small_business_fit.replaceAll("_", " ").toLowerCase()}</span> : null}</div>
    <h3>{item.title}</h3><p className="t6p-buyer">{item.buyer}</p>
    {item.close_date ? <p><strong>Closes:</strong> {new Date(item.close_date).toLocaleDateString("en-CA", { dateStyle: "medium" })}</p> : <p><strong>Timing:</strong> Check the official source.</p>}
    <p><strong>Why it appears here:</strong> {item.treaty6_relevance.replaceAll("_", " ").toLowerCase()}.</p>
    {item.possible_fit_for?.length ? <p><strong>Who might care:</strong> {item.possible_fit_for.join(", ")}.</p> : null}
    <a href={item.source_url} target="_blank" rel="noreferrer">Check the official opportunity</a>
  </article>
}

export default function Treaty6ProcurementPreview({ model }) {
  const [province, setProvince] = useState("ALL")
  const [category, setCategory] = useState("ALL")
  const [sort, setSort] = useState("CLOSING_SOON")
  const opportunities = model?.sections?.open_opportunities || EMPTY_OPPORTUNITIES
  const categories = useMemo(() => [...new Set(opportunities.flatMap(item => item.categories || []))].sort(), [opportunities])
  const visible = useMemo(() => [...opportunities].filter(item => province === "ALL" || item.province === province).filter(item => category === "ALL" || item.categories?.includes(category)).sort((a, b) => sort === "NEWEST" ? Date.parse(b.posted_date || 0) - Date.parse(a.posted_date || 0) : Date.parse(a.close_date || "9999-12-31") - Date.parse(b.close_date || "9999-12-31")), [opportunities, province, category, sort])
  if (!model) return null
  return <main className="t6p-page">
    <header className="t6p-hero"><p className="t6p-eyebrow">Miller North · practical economic opportunity</p><h1>{model.title}</h1><p>{model.subtitle}</p><div className="t6p-notice">{model.disclosures.map(item => <p key={item}>{item}</p>)}</div></header>
    <section aria-labelledby="t6p-open"><div className="t6p-section-head"><div><p className="t6p-kicker">Act on public information</p><h2 id="t6p-open">Open opportunities</h2></div><div className="t6p-filters"><label>Province<select value={province} onChange={event => setProvince(event.target.value)}><option value="ALL">All</option><option value="Alberta">Alberta</option><option value="Saskatchewan">Saskatchewan</option><option value="Federal / Alberta / Saskatchewan">Federal</option></select></label><label>Category<select value={category} onChange={event => setCategory(event.target.value)}><option value="ALL">All</option>{categories.map(item => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label><label>Sort<select value={sort} onChange={event => setSort(event.target.value)}><option value="CLOSING_SOON">Closing soon</option><option value="NEWEST">Newest</option></select></label></div></div>
      {visible.length ? <div className="t6p-grid">{visible.map(item => <OpportunityCard key={item.opportunity_id} item={item}/>)}</div> : <p className="t6p-empty">No validated open opportunities match these filters. Check back after the next monitored update.</p>}
    </section>
    <section aria-labelledby="t6p-specific"><p className="t6p-kicker">Explicit source language only</p><h2 id="t6p-specific">Indigenous-specific and participation opportunities</h2>{model.sections.indigenous_specific_participation?.length ? <div className="t6p-grid">{model.sections.indigenous_specific_participation.map(item => <OpportunityCard key={`specific-${item.opportunity_id}`} item={item}/>)}</div> : <p className="t6p-empty">No current record passed this evidence gate.</p>}</section>
    <section aria-labelledby="t6p-supports"><p className="t6p-kicker">Prepare and register</p><h2 id="t6p-supports">Supplier registration and procurement supports</h2><div className="t6p-grid">{model.sections.procurement_supports?.map(item => <article className="t6p-card" key={item.support_id}><h3>{item.title}</h3><p>{item.summary}</p><a href={item.source_url} target="_blank" rel="noreferrer">Official program</a></article>)}</div></section>
    <section aria-labelledby="t6p-changes"><p className="t6p-kicker">Source-backed history</p><h2 id="t6p-changes">Recurring buyers and what changed</h2>{model.sections.recurring_buyers_categories?.length ? <ul>{model.sections.recurring_buyers_categories.map(item => <li key={item.signal_id}><strong>{item.label.replaceAll("_", " ")}</strong>: {item.reason}</li>)}</ul> : <p className="t6p-empty">The monitor has not yet accumulated enough public history for a recurring-buyer signal.</p>}</section>
  </main>
}
