import { useMemo, useState } from "react"

import millerNorthFunding from "../data/miller-north-funding-assistance-public-v1.json"
import EmailResultsDialog from "./EmailResultsDialog.jsx"
import MillerNorthPublicNav, { MillerNorthHomeLink } from "./MillerNorthPublicNav.jsx"
import MillerUtilityCompanion from "./MillerUtilityCompanion.jsx"
import { isCanonicalFundingResource, millerCanonicalPublicResources } from "../millerCanonicalPublicCatalog.js"
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
  verified_active: "Verified public pathway",
  verify_before_applying: "Verify before applying",
}
const statusOrder = { open: 0, recurring: 1, upcoming: 2, contact_to_confirm: 3, intake_unknown: 4, verify_before_applying: 5, paused: 6, closed: 7, archived: 8 }

const emailRecord = record => ({
  id: record.id,
  kind: "funding",
  name: record.name,
  organization: record.funder || record.organization,
  description: record.purpose || record.description,
  region: record.geography || record.region,
  eligibility: record.who_can_apply || record.eligibility,
  access: [statusLabels[record.status] || "Verified public pathway", record.deadline ? `Deadline ${record.deadline}` : "", record.application_method || record.accessType].filter(Boolean).join(" · "),
  website: record.application_url || record.website,
  category: "Funding & assistance",
  source: record.source?.authority || record.sourceAuthority,
  last_verified_at: record.last_verified_at || record.location_last_verified,
})

function FundingCard({ record }) {
  const purpose = String(record.purpose || record.fundingType || record.description || "Funding and assistance").replaceAll("_", " ")
  const jurisdiction = record.jurisdiction || record.province || "Canada-wide"
  const status = record.status || "verified_active"
  return <article className="funding-card">
    <div className="funding-card-state"><span data-status={status}>{statusLabels[status] || "Verified public pathway"}</span><small>{jurisdiction}</small></div>
    <h2>{record.name}</h2><p className="funding-card-funder">{record.funder || record.organization}</p>
    <dl>
      {record.who_can_apply || record.eligibility ? <><dt>Who it may help</dt><dd>{record.who_can_apply || record.eligibility}</dd></> : null}
      <dt>What it supports</dt><dd>{purpose}</dd>
      {record.amount ? <><dt>Amount</dt><dd>{record.amount}</dd></> : null}
      {record.accessType || record.application_method || record.deadline ? <><dt>Access</dt><dd>{record.accessType || record.application_method || (record.deadline ? `Deadline: ${record.deadline}` : "Check the official page")}</dd></> : null}
    </dl>
    <footer>{record.application_url || record.website ? <a href={record.application_url || record.website} target="_blank" rel="noreferrer">Official program page ↗</a> : null}{record.last_verified_at || record.location_last_verified ? <small>Checked {record.last_verified_at || record.location_last_verified}{record.next_check_due ? ` · Next check ${record.next_check_due}` : ""}</small> : null}</footer>
  </article>
}

export default function MillerFundingAssistance({ millerNorth = false }) {
  const dataset = useMemo(() => millerNorth ? millerNorthFunding : { records: millerCanonicalPublicResources.filter(isCanonicalFundingResource), caution: "Funding, benefit and assistance pathways vary by jurisdiction, eligibility and current intake. Confirm details with the official source before applying." }, [millerNorth])
  const [province, setProvince] = useState("all")
  const [status, setStatus] = useState("all")
  const [applicant, setApplicant] = useState("all")
  const [emailOpen, setEmailOpen] = useState(false)
  const provinces = useMemo(() => [...new Set(dataset.records.map(record => record.jurisdiction || record.province).filter(Boolean))].sort(), [dataset])
  const applicants = useMemo(() => [...new Set(dataset.records.flatMap(record => record.applicant_types || []))].sort(), [dataset])
  const visible = dataset.records.filter(record => (province === "all" || (record.jurisdiction || record.province) === province) && (status === "all" || (record.status || "verified_active") === status) && (applicant === "all" || (record.applicant_types || []).includes(applicant))).sort((left, right) => (right.province === "Canada-wide") - (left.province === "Canada-wide") || (statusOrder[left.status || "verified_active"] || 0) - (statusOrder[right.status || "verified_active"] || 0) || left.name.localeCompare(right.name))

  return <main className={millerNorth ? "mn-public-page funding-page funding-page-north" : "funding-page"}>
    <header className={millerNorth ? "mn-public-header" : "practical-page-header"}>{millerNorth ? <MillerNorthHomeLink/> : <a href="/">← Miller Resources</a>}{millerNorth ? <MillerNorthPublicNav current="funding" /> : <nav aria-label="Miller practical navigation"><a href="/practical-supports">Practical Supports</a><a aria-current="page" href="/funding-assistance">Funding &amp; Assistance</a><a href="/navigator">Miller Navigator</a></nav>}</header>
    <section className={millerNorth ? "mn-public-hero" : "practical-page-hero has-utility-companion"}><div className={millerNorth ? "" : "practical-hero-copy"}><p className={millerNorth ? "mn-public-eyebrow" : "practical-eyebrow"}>{millerNorth ? "Miller North" : "Miller"} · Funding &amp; Assistance</p><h1>{millerNorth ? "First Nations and Indigenous funding navigation" : "Financial help for practical next steps"}</h1><p>{millerNorth ? "Current and recurring public opportunities for individuals, Nations, Indigenous organizations and Indigenous businesses." : "Verified funding, benefits and assistance pathways from Miller’s current public Canada-wide registry. Choose a province or territory to narrow the view."}</p></div>{millerNorth ? null : <MillerUtilityCompanion />}</section>
    <aside className="funding-caution"><strong>Check before applying.</strong> {dataset.caution}</aside>
    <section className="funding-filters" aria-label="Funding filters"><label>Province or jurisdiction<select value={province} onChange={event => setProvince(event.target.value)}><option value="all">All</option>{provinces.map(value => <option key={value}>{value}</option>)}</select></label><label>Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{applicants.length ? <label>Applicant type<select value={applicant} onChange={event => setApplicant(event.target.value)}><option value="all">Everyone</option>{applicants.map(value => <option key={value}>{value.replaceAll("_", " ")}</option>)}</select></label> : null}<p aria-live="polite">{visible.length} opportunit{visible.length === 1 ? "y" : "ies"}</p><button type="button" onClick={() => setEmailOpen(true)} disabled={!visible.length}>Email these results</button></section>
    <section className="funding-grid" aria-label="Funding opportunities">{visible.map(record => <FundingCard key={record.id} record={record} />)}</section>
    <footer className="practical-page-footer">This browse view uses the same public canonical registry as Miller search. It does not guarantee approval, eligibility or availability.</footer>
    {emailOpen ? <EmailResultsDialog results={visible.map(emailRecord)} city="" onClose={() => setEmailOpen(false)} /> : null}
  </main>
}
