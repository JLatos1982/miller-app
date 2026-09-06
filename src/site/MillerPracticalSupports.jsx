import { useMemo, useState } from "react"

import supports from "../data/miller-practical-supports-public-v1.json"
import EmailResultsDialog from "./EmailResultsDialog.jsx"
import MillerUtilityCompanion from "./MillerUtilityCompanion.jsx"
import "./MillerPracticalSupports.css"

const categoryLabels = {
  housing: "Housing",
  employment: "Employment",
  training: "Training",
  identification: "ID",
  income_benefits: "Income / benefits",
  transportation: "Transportation",
  advocacy_navigation: "Advocacy / navigation",
  basic_needs: "Basic needs",
}

const emailRecord = record => ({
  id: record.id,
  kind: "service",
  name: record.name,
  organization: record.organization,
  description: record.description,
  region: record.area_served,
  eligibility: record.eligibility,
  access: record.access,
  phone: record.phone,
  website: record.website,
  category: categoryLabels[record.category],
  source: "Miller practical supports",
  last_verified_at: record.last_verified_at,
})

function PracticalSupportCard({ record }) {
  return <article className="practical-support-card">
    <div className="practical-support-card-top"><span>{categoryLabels[record.category]}</span><small>{record.area_served}</small></div>
    <h2>{record.name}</h2>
    <p className="practical-support-org">{record.organization}</p>
    <p>{record.description}</p>
    <dl>
      <dt>Who it may help</dt><dd>{record.eligibility}</dd>
      <dt>How to access it</dt><dd>{record.access}</dd>
    </dl>
    <footer>
      {record.phone ? <a href={`tel:${record.phone.replace(/[^+\d]/g, "")}`}>{record.phone}</a> : null}
      <a href={record.website} target="_blank" rel="noreferrer">Official information ↗</a>
      <small>Checked {record.last_verified_at}</small>
    </footer>
  </article>
}

export default function MillerPracticalSupports() {
  const [category, setCategory] = useState("all")
  const [emailOpen, setEmailOpen] = useState(false)
  const categories = useMemo(() => [...new Set(supports.records.map(record => record.category))], [])
  const visible = category === "all" ? supports.records : supports.records.filter(record => record.category === category)

  return <main className="practical-supports-page">
    <header className="practical-page-header"><a href="/">← Find treatment</a><nav aria-label="Miller practical navigation"><a aria-current="page" href="/practical-supports">Practical Supports</a><a href="/funding-assistance">Funding &amp; Assistance</a></nav></header>
    <section className="practical-page-hero has-utility-companion"><div className="practical-hero-copy"><p className="practical-eyebrow">Miller · Practical Supports</p><h1>Practical help for the next step</h1><p>Housing, employment, training, identification, income, transportation and advocacy options for Fraser North and nearby Lower Mainland communities.</p></div><MillerUtilityCompanion /></section>
    <section className="practical-pathways" aria-labelledby="pathways-title"><h2 id="pathways-title">Start with what you need</h2><p>These are navigation links, not a prescribed care plan. A treatment search can lead naturally to housing, ID, income or work support.</p><div>{categories.map(value => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(category === value ? "all" : value)}>{categoryLabels[value]}</button>)}</div></section>
    <section className="practical-controls" aria-label="Practical support filters"><label>Support type<select value={category} onChange={event => setCategory(event.target.value)}><option value="all">All support types</option>{categories.map(value => <option value={value} key={value}>{categoryLabels[value]}</option>)}</select></label><p aria-live="polite">{visible.length} support{visible.length === 1 ? "" : "s"}</p><button type="button" onClick={() => setEmailOpen(true)}>Email these supports</button></section>
    <aside className="practical-caution">{supports.caution}</aside>
    <section className="practical-support-grid" aria-label="Verified practical supports">{visible.map(record => <PracticalSupportCard key={record.id} record={record} />)}</section>
    <footer className="practical-page-footer">This page uses a publication-safe projection. Candidate notes and internal review fields are not included.</footer>
    {emailOpen ? <EmailResultsDialog results={visible.map(emailRecord)} city="" onClose={() => setEmailOpen(false)} /> : null}
  </main>
}
