import { useMemo, useState } from "react"

import registry from "../data/miller-shared-resource-registry-v1.json"
import { toMillerNorthSharedEmailResult } from "../millerNorthPublicSupportEmail.js"
import EmailResultsDialog from "./EmailResultsDialog.jsx"
import MillerNorthPublicNav, { MillerNorthHomeLink } from "./MillerNorthPublicNav.jsx"
import { categoryLabels, filterMillerNorthSupports } from "./millerNorthSupportFilters.js"
import "./MillerNorthFirstNationsSupports.css"

const categoryOptions = Object.entries(categoryLabels)
const provinceLabels = { "British Columbia": "B.C.", Alberta: "Alberta", Saskatchewan: "Saskatchewan", "Canada-wide": "Canada-wide", Federal: "Canada-wide" }
const fundingStatus = {
  open: "Open now",
  recurring: "Recurring intake",
  upcoming: "Opens soon",
  closed: "Closed",
  contact_to_confirm: "Contact to confirm",
  intake_unknown: "Intake unclear",
  paused: "Paused",
  archived: "Archived",
  verify_before_applying: "Verify before applying",
}

const northRecords = registry.records.filter(record => record.project_visibility.includes("miller_north"))

function ResourceCard({ record }) {
  return <article className="mn-support-card">
    <div className="mn-support-labels"><span>{record.funding ? "Funding or benefit" : "Service"}</span><span>{provinceLabels[record.province] || record.province}</span>{record.funding?.status ? <span>{fundingStatus[record.funding.status]}</span> : null}</div>
    <h3>{record.program_name}</h3>
    <p className="mn-support-operator">{record.organization}</p>
    <p>{record.description || record.access}</p>
    <div className="mn-support-categories">{record.categories.map(category => <span key={category}>{categoryLabels[category] || category.replaceAll("_", " ")}</span>)}</div>
    <dl>
      <dt>Who it serves</dt><dd>{record.population_served || record.eligibility || "See the official program page"}</dd>
      <dt>Area</dt><dd>{record.service_area || record.geography || provinceLabels[record.province]}</dd>
      {record.eligibility ? <><dt>Can I use this?</dt><dd>{record.eligibility}</dd></> : null}
      {record.referral_requirement ? <><dt>Referral</dt><dd>{record.referral_requirement}</dd></> : null}
      {record.housing?.availability ? <><dt>Availability</dt><dd>{record.housing.availability}</dd></> : null}
      {record.funding?.amount ? <><dt>Amount</dt><dd>{record.funding.amount}</dd></> : null}
      {record.funding?.deadline ? <><dt>Deadline</dt><dd>{record.funding.deadline}</dd></> : null}
      <dt>How to access</dt><dd>{record.access || "Use the official program page."}</dd>
    </dl>
    <footer>
      {record.phone ? <span><strong>Phone:</strong> {record.phone}</span> : null}
      <a href={record.website} target="_blank" rel="noreferrer">Official service or program page ↗</a>
      <small>Information checked {record.last_verified}</small>
    </footer>
  </article>
}

export default function MillerNorthFirstNationsSupports() {
  const [query, setQuery] = useState("")
  const [province, setProvince] = useState("all")
  const [category, setCategory] = useState("all")
  const [emailOpen, setEmailOpen] = useState(false)
  const visible = useMemo(() => {
    return filterMillerNorthSupports(northRecords, { query, province, category })
  }, [query, province, category])

  return <main className="mn-public-page mn-supports-page">
    <header className="mn-public-header"><MillerNorthHomeLink/><MillerNorthPublicNav current="supports" /></header>
    <section className="mn-public-hero"><p className="mn-public-eyebrow">Miller North · Supports &amp; Funding</p><h1>Practical help, with the source beside it</h1><p>Find health navigation, cultural and mental-health support, housing, rights assistance, transportation, benefits and funding across B.C., Alberta, Saskatchewan and Canada-wide programs.</p></section>
    <aside className="mn-public-note"><strong>Check before relying on a listing.</strong><br />Programs, intake and eligibility can change. Review the official page or contact the organization. Inclusion is not an endorsement or a guarantee of availability, eligibility or funding.</aside>
    <section className="mn-support-filters" aria-label="Supports and Funding filters">
      <label>Search<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Type here" /></label>
      <label>Location<select value={province} onChange={event => setProvince(event.target.value)}><option value="all">All locations</option><option>British Columbia</option><option>Alberta</option><option>Saskatchewan</option><option>Canada-wide</option></select></label>
      <label>Category<select value={category} onChange={event => setCategory(event.target.value)}><option value="all">All categories</option>{categoryOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <p aria-live="polite">{visible.length} resource{visible.length === 1 ? "" : "s"}</p><button type="button" onClick={() => setEmailOpen(true)} disabled={!visible.length}>Email these results</button>
    </section>
    <nav className="mn-support-quick" aria-label="Quick support categories">{categoryOptions.map(([value, label]) => <button type="button" key={value} aria-pressed={category === value} onClick={() => setCategory(category === value ? "all" : value)}>{label}</button>)}</nav>
    <section className="mn-support-grid" aria-label="Verified First Nations and Indigenous supports and funding">{visible.map(record => <ResourceCard key={record.canonical_resource_id} record={record} />)}</section>
    {!visible.length ? <p className="mn-support-empty">No verified public resources match these filters. Try another category or location.</p> : null}
    <footer className="mn-public-footer">Candidate notes, unresolved eligibility, internal review material and expired programs presented as current are not included.</footer>
    {emailOpen ? <EmailResultsDialog results={visible.map(toMillerNorthSharedEmailResult).filter(Boolean)} city="" onClose={() => setEmailOpen(false)} /> : null}
  </main>
}
