import { useMemo, useState } from "react"

import supports from "../data/miller-north-first-nations-supports-public-v1.json"
import { toMillerNorthSupportEmailResult } from "../millerNorthPublicSupportEmail.js"
import EmailResultsDialog from "./EmailResultsDialog.jsx"
import MillerNorthPublicNav, { MillerNorthHomeLink } from "./MillerNorthPublicNav.jsx"
import "./MillerNorthFirstNationsSupports.css"

const readable = value => String(value || "").replaceAll("_", " ")
const governanceLabels = {
  first_nations_governed_nation_health_program: "Nation-operated",
  first_nations_governed_health_authority: "First Nations-governed",
  first_nations_governed_accountability_office: "First Nations-governed",
  first_nations_governed_tribal_council_program: "First Nations-governed",
  indigenous_community_organization_health_authority_partnership: "Indigenous community / health-authority partnership",
  indigenous_organization_service_coordination_with_federal_decision_authority: "Indigenous service coordination · federal decision authority",
  indigenous_nonprofit_service_operator: "Indigenous nonprofit",
  indigenous_led_team_within_provincial_health_system: "Indigenous-led health-system team",
  provincial_health_authority_indigenous_support_role: "Provincial health-system service",
  provincial_health_system_indigenous_support_role: "Provincial health-system service",
  provincial_health_system_indigenous_service: "Provincial health-system service",
}
const scopeLabels = { first_nations_specific: "First Nations-specific", broader_indigenous: "Broader Indigenous service" }

function SupportCard({ record }) {
  return <article className="mn-support-card">
    <div className="mn-support-labels"><span>{governanceLabels[record.governance_type] || readable(record.governance_type)}</span><span>{scopeLabels[record.scope] || readable(record.scope)}</span></div>
    <h3>{record.name}</h3>
    <p className="mn-support-operator">{record.organization}</p>
    <p>{record.community} · {record.delivery_modes.map(readable).join(" · ")}</p>
    <div className="mn-support-categories">{record.categories.map(category => <span key={category}>{readable(category)}</span>)}</div>
    <dl>
      <dt>Who it serves</dt><dd>{record.population_served}</dd>
      <dt>Eligibility</dt><dd>{record.eligibility}</dd>
      {record.referral_requirements && <><dt>Referral</dt><dd>{record.referral_requirements}</dd></>}
      {record.cost && <><dt>Cost</dt><dd>{record.cost}</dd></>}
      {record.hours && <><dt>Hours</dt><dd>{record.hours}</dd></>}
    </dl>
    <footer>
      {record.phone && <span><strong>Phone:</strong> {record.phone}</span>}
      {record.email && <a href={`mailto:${record.email}`}>Email the service</a>}
      <a href={record.website} target="_blank" rel="noreferrer">Service details and source ↗</a>
      <small>Information checked {record.last_verified_date}</small>
    </footer>
  </article>
}

export default function MillerNorthFirstNationsSupports() {
  const [province, setProvince] = useState("all")
  const [category, setCategory] = useState("all")
  const [fraserNorthOnly, setFraserNorthOnly] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const categories = useMemo(() => [...new Set(supports.records.flatMap(record => record.categories))].sort(), [])
  const visible = supports.records.filter(record => (province === "all" || record.province === province) && (category === "all" || record.categories.includes(category)) && (!fraserNorthOnly || record.fraser_north))

  return <main className="mn-public-page mn-supports-page">
    <header className="mn-public-header"><MillerNorthHomeLink/><MillerNorthPublicNav current="supports" /></header>
    <section className="mn-public-hero"><p className="mn-public-eyebrow">Miller North · First Nations Supports</p><h1>Practical support, with the source beside it</h1><p>Publicly documented health, navigation, advocacy, cultural, mental-health and substance-use supports across British Columbia, Alberta and Saskatchewan. This first quiet-sharing edition emphasizes Fraser North.</p></section>
    <aside className="mn-public-note"><strong>Before relying on a listing</strong><br />{supports.caution} A service being listed here is not an endorsement, a guarantee of availability or a statement about service quality.</aside>
    <section className="mn-supports-fraser" aria-labelledby="fraser-north-title"><p className="mn-public-eyebrow">Fraser North starting point</p><h2 id="fraser-north-title">Nine verified supports</h2><p>Nation-operated programs from Katzie and kʷikʷəƛ̓əm are kept distinct from Fraser Health programs and province-wide FNHA services.</p><button type="button" aria-pressed={fraserNorthOnly} onClick={() => setFraserNorthOnly(value => !value)}>{fraserNorthOnly ? "Show all supports" : "Show Fraser North supports"}</button></section>
    <section className="mn-support-filters" aria-label="First Nations Supports filters">
      <label>Province<select value={province} onChange={event => setProvince(event.target.value)}><option value="all">All provinces</option><option>British Columbia</option><option>Alberta</option><option>Saskatchewan</option></select></label>
      <label>Support type<select value={category} onChange={event => setCategory(event.target.value)}><option value="all">All support types</option>{categories.map(value => <option value={value} key={value}>{readable(value)}</option>)}</select></label>
      <p aria-live="polite">{visible.length} support{visible.length === 1 ? "" : "s"} shown</p><button type="button" onClick={() => setEmailOpen(true)}>Email these supports</button>
    </section>
    <section className="mn-support-grid" aria-label="Verified First Nations and Indigenous supports">{visible.map(record => <SupportCard key={record.public_support_id} record={record} />)}</section>
    <section className="mn-public-section"><p className="mn-public-eyebrow">How to read governance labels</p><h2>Funding, governance and service delivery are different</h2><p>“First Nations-governed” or “Nation-operated” is used only where an authoritative source supports that description. A provincial health-system service with an Indigenous support role is labelled separately. Public funding does not by itself establish who governs or controls a service.</p></section>
    <footer className="mn-public-footer">This page is a publication-safe service projection. Candidate notes, unresolved governance classifications and internal review material are not included.</footer>
    {emailOpen ? <EmailResultsDialog results={visible.map(toMillerNorthSupportEmailResult).filter(Boolean)} city="" onClose={() => setEmailOpen(false)} /> : null}
  </main>
}
