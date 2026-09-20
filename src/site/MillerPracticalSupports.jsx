import { useMemo, useState } from "react"

import EmailResultsDialog from "./EmailResultsDialog.jsx"
import MillerUtilityCompanion from "./MillerUtilityCompanion.jsx"
import {
  displayCategory,
  isCanonicalPracticalResource,
  millerCanonicalPublicResources,
} from "../millerCanonicalPublicCatalog.js"
import "./MillerPracticalSupports.css"

const emailRecord = record => ({
  id: record.id, kind: "service", name: record.name, organization: record.organization,
  description: record.description, region: record.region, eligibility: record.eligibility,
  access: record.accessType, phone: record.phone, website: record.website,
  category: displayCategory(record.category || record.serviceType),
  source: record.sourceAuthority, last_verified_at: record.location_last_verified,
})

function PracticalSupportCard({ record }) {
  return <article className="practical-support-card">
    <div className="practical-support-card-top"><span>{displayCategory(record.category || record.serviceType)}</span><small>{record.province || record.region || "Canada-wide"}</small></div>
    <h2>{record.name}</h2><p className="practical-support-org">{record.organization}</p>
    <p>{record.description}</p>
    <dl>
      {record.population ? <><dt>Who it may help</dt><dd>{record.population}</dd></> : null}
      {record.eligibility ? <><dt>Eligibility</dt><dd>{record.eligibility}</dd></> : null}
      {record.accessType ? <><dt>How to access it</dt><dd>{record.accessType}</dd></> : null}
    </dl>
    <footer>{record.phone ? <a href={`tel:${record.phone.replace(/[^+\d]/g, "")}`}>{record.phone}</a> : null}{record.website ? <a href={record.website} target="_blank" rel="noreferrer">Official information ↗</a> : null}{record.location_last_verified ? <small>Checked {record.location_last_verified}</small> : null}</footer>
  </article>
}

export default function MillerPracticalSupports() {
  const [category, setCategory] = useState("all")
  const [province, setProvince] = useState("all")
  const [emailOpen, setEmailOpen] = useState(false)
  const practicalResources = useMemo(() => millerCanonicalPublicResources.filter(isCanonicalPracticalResource), [])
  const categories = useMemo(() => [...new Set(practicalResources.map(record => record.category || record.serviceType).filter(Boolean))].sort(), [practicalResources])
  const provinces = useMemo(() => [...new Set(practicalResources.map(record => record.province).filter(Boolean))].sort(), [practicalResources])
  const visible = practicalResources.filter(record => (category === "all" || (record.category || record.serviceType) === category) && (province === "all" || record.province === province)).sort((left, right) => (right.province === "Canada-wide") - (left.province === "Canada-wide") || left.name.localeCompare(right.name))

  return <main className="practical-supports-page">
    <header className="practical-page-header"><a href="/">← Miller Resources</a><nav aria-label="Miller practical navigation"><a aria-current="page" href="/practical-supports">Practical Supports</a><a href="/funding-assistance">Funding &amp; Assistance</a><a href="/navigator">Miller Navigator</a></nav></header>
    <section className="practical-page-hero has-utility-companion"><div className="practical-hero-copy"><p className="practical-eyebrow">Miller · Practical Supports</p><h1>Practical help for the next step</h1><p>Verified housing, food, ID, legal, transportation, outreach, employment and other practical pathways from Miller’s current public Canada-wide registry. Choose a province to narrow the view.</p></div><MillerUtilityCompanion /></section>
    <section className="practical-pathways" aria-labelledby="pathways-title"><h2 id="pathways-title">Start with what you need</h2><p>These are public navigation options, not a prescribed care plan. Search Miller directly when you need city-level matching or a combination of needs.</p><div>{categories.map(value => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(category === value ? "all" : value)}>{displayCategory(value)}</button>)}</div></section>
    <section className="practical-controls" aria-label="Practical support filters"><label>Support type<select value={category} onChange={event => setCategory(event.target.value)}><option value="all">All support types</option>{categories.map(value => <option value={value} key={value}>{displayCategory(value)}</option>)}</select></label><label>Province or territory<select value={province} onChange={event => setProvince(event.target.value)}><option value="all">Canada-wide and all jurisdictions</option>{provinces.map(value => <option value={value} key={value}>{value}</option>)}</select></label><p aria-live="polite">{visible.length} support{visible.length === 1 ? "" : "s"}</p><button type="button" onClick={() => setEmailOpen(true)} disabled={!visible.length}>Email these supports</button></section>
    <aside className="practical-caution">Availability, eligibility and local service areas vary. Miller shows only verified public pathways in this browse view; confirm current access directly with each service.</aside>
    <section className="practical-support-grid" aria-label="Verified practical supports">{visible.map(record => <PracticalSupportCard key={record.id} record={record} />)}</section>
    <footer className="practical-page-footer">This page is derived from the same public canonical registry as Miller search. It does not claim that every category is available in every jurisdiction.</footer>
    {emailOpen ? <EmailResultsDialog results={visible.map(emailRecord)} city={province === "all" ? "" : province} onClose={() => setEmailOpen(false)} /> : null}
  </main>
}
