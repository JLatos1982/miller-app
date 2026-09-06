import { useMemo, useState } from "react"

import millerFunding from "../data/miller-funding-assistance-public-v1.json"
import millerNorthFunding from "../data/miller-north-funding-assistance-public-v1.json"
import EmailResultsDialog from "./EmailResultsDialog.jsx"
import MillerNorthPublicNav from "./MillerNorthPublicNav.jsx"
import MillerUtilityCompanion from "./MillerUtilityCompanion.jsx"
import "./MillerFundingAssistance.css"

const statusLabels = {
  open: "Open now",
  recurring: "Recurring intake",
  upcoming: "Opens soon",
  closed: "Closed",
  contact_to_confirm: "Contact to confirm availability",
  intake_unknown: "Intake status unclear",
  paused: "Paused",
  archived: "Archived",
  verify_before_applying: "Verify before applying",
}
const statusOrder = { open: 0, recurring: 1, upcoming: 2, contact_to_confirm: 3, intake_unknown: 4, verify_before_applying: 5, paused: 6, closed: 7, archived: 8 }

const emailRecord = record => ({
  id: record.id,
  kind: "funding",
  name: record.name,
  organization: record.funder,
  description: record.purpose,
  region: record.geography,
  eligibility: record.who_can_apply,
  access: `${statusLabels[record.status]}${record.deadline ? ` · Deadline ${record.deadline}` : ""}. ${record.application_method}`,
  website: record.application_url,
  category: "Funding & assistance",
  source: record.source.authority,
  last_verified_at: record.last_verified_at,
})

function FundingCard({ record }) {
  return <article className="funding-card">
    <div className="funding-card-state"><span data-status={record.status}>{statusLabels[record.status]}</span><small>{record.jurisdiction}</small></div>
    <h2>{record.name}</h2><p className="funding-card-funder">{record.funder}</p>
    <dl>
      <dt>Who can apply</dt><dd>{record.who_can_apply}</dd>
      <dt>What it supports</dt><dd>{record.purpose}</dd>
      {record.amount ? <><dt>Amount</dt><dd>{record.amount}</dd></> : null}
      <dt>Intake</dt><dd>{record.deadline ? `Deadline: ${record.deadline}` : statusLabels[record.status]}</dd>
    </dl>
    <footer><a href={record.application_url} target="_blank" rel="noreferrer">Official program page ↗</a><small>Checked {record.last_verified_at} · Next check {record.next_check_due}</small></footer>
  </article>
}

export default function MillerFundingAssistance({ millerNorth = false }) {
  const dataset = millerNorth ? millerNorthFunding : millerFunding
  const [province, setProvince] = useState("all")
  const [status, setStatus] = useState("all")
  const [applicant, setApplicant] = useState("all")
  const [emailOpen, setEmailOpen] = useState(false)
  const provinces = useMemo(() => [...new Set(dataset.records.map(record => record.jurisdiction))].sort(), [dataset])
  const applicants = useMemo(() => [...new Set(dataset.records.flatMap(record => record.applicant_types))].sort(), [dataset])
  const visible = dataset.records.filter(record => (province === "all" || record.jurisdiction === province) && (status === "all" || record.status === status) && (applicant === "all" || record.applicant_types.includes(applicant))).sort((left, right) => statusOrder[left.status] - statusOrder[right.status] || left.name.localeCompare(right.name))

  return <main className={millerNorth ? "mn-public-page funding-page funding-page-north" : "funding-page"}>
    <header className={millerNorth ? "mn-public-header" : "practical-page-header"}><a href={millerNorth ? "/indigenous-healthcare-evidence" : "/"}>← {millerNorth ? "Evidence Library" : "Find treatment"}</a>{millerNorth ? <MillerNorthPublicNav current="funding" /> : <nav aria-label="Miller practical navigation"><a href="/practical-supports">Practical Supports</a><a aria-current="page" href="/funding-assistance">Funding &amp; Assistance</a></nav>}</header>
    <section className={millerNorth ? "mn-public-hero" : "practical-page-hero has-utility-companion"}><div className={millerNorth ? "" : "practical-hero-copy"}><p className={millerNorth ? "mn-public-eyebrow" : "practical-eyebrow"}>{millerNorth ? "Miller North" : "Miller"} · Funding &amp; Assistance</p><h1>{millerNorth ? "First Nations and Indigenous funding navigation" : "Financial help for practical next steps"}</h1><p>{millerNorth ? "Current and recurring public opportunities for individuals, Nations, Indigenous organizations and Indigenous businesses." : "Benefits, training, transportation and practical assistance relevant to stability and access to care."}</p></div>{millerNorth ? null : <MillerUtilityCompanion />}</section>
    <aside className="funding-caution"><strong>Check before applying.</strong> {dataset.caution}</aside>
    <section className="funding-filters" aria-label="Funding filters"><label>Province or jurisdiction<select value={province} onChange={event => setProvince(event.target.value)}><option value="all">All</option>{provinces.map(value => <option key={value}>{value}</option>)}</select></label><label>Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{applicants.length ? <label>Applicant type<select value={applicant} onChange={event => setApplicant(event.target.value)}><option value="all">Everyone</option>{applicants.map(value => <option key={value}>{value.replaceAll("_", " ")}</option>)}</select></label> : null}<p aria-live="polite">{visible.length} opportunit{visible.length === 1 ? "y" : "ies"}</p><button type="button" onClick={() => setEmailOpen(true)} disabled={!visible.length}>Email these results</button></section>
    <section className="funding-grid" aria-label="Funding opportunities">{visible.map(record => <FundingCard key={record.id} record={record} />)}</section>
    <footer className="practical-page-footer">Status reflects the authoritative public source checked on the date shown. It does not guarantee approval or eligibility.</footer>
    {emailOpen ? <EmailResultsDialog results={visible.map(emailRecord)} city="" onClose={() => setEmailOpen(false)} /> : null}
  </main>
}
