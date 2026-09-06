import { useMemo, useState } from "react"

import research from "../data/miller-north-research-policy-public-v1.json"
import fnho from "../data/miller-north-fnho-public-v1.json"
import albertaPatientSafety from "../data/miller-north-alberta-patient-safety-public-v1.json"
import accountabilityComparison from "../data/miller-north-accountability-comparison-public-v1.json"
import MillerNorthPublicNav from "./MillerNorthPublicNav.jsx"
import MillerNorthStartHere from "./MillerNorthStartHere.jsx"
import "./MillerNorthResearchPolicy.css"

const words = value => String(value || "").replaceAll("_", " ")
const cases = [...research.cases, fnho, albertaPatientSafety]
const statusOrder = ["implemented", "substantially_implemented", "partially_implemented", "implementation_underway", "implementation_evidence_fragmentary"]
const statusLabels = { implemented: "Implemented", substantially_implemented: "Substantially implemented", partially_implemented: "Partially implemented", implementation_underway: "Implementation underway", implementation_evidence_fragmentary: "Fragmentary evidence", public_evidence_fragmentary: "Fragmentary public evidence", partial_implementation_evidence: "Partial implementation evidence", no_formal_response_located: "No formal response located" }
function Sources({ sources = [], inline = false }) {
  return <span className={inline ? "mnrp-inline-sources" : "mnrp-source-links"}>{sources.map((source, index) => <span key={source.url}>{index ? " · " : ""}<a href={source.url} target="_blank" rel="noreferrer">{inline ? source.organization : source.title}</a></span>)}</span>
}

function AccountabilityComparison({ onOpen }) {
  const headlineFields = new Set(["complaint_entry_point", "investigator_reviewer", "institutional_home", "indigenous_specific_mechanism", "aggregate_outcome_reporting", "major_transparency_gap"])
  const resolveSources = ids => ids.map(id => accountabilityComparison.sources[id])
  return <section className="mnrp-comparison"><p className="mnrp-kicker">Across three provinces</p><h2>{accountabilityComparison.title}</h2><p>{accountabilityComparison.caution}</p><div>{accountabilityComparison.mechanisms.map(item => <article key={item.province}><h3>{item.province}</h3><p className="mnrp-comparison-mechanism">{item.mechanism}</p><dl>{item.fields.filter(field => headlineFields.has(field.field)).map(field => <span key={field.field}><dt>{field.label}</dt><dd>{field.value}<Sources sources={resolveSources(field.source_ids)} inline /></dd></span>)}</dl><details><summary>Compare all {item.fields.length} fields</summary><dl>{item.fields.filter(field => !headlineFields.has(field.field)).map(field => <span key={field.field}><dt>{field.label}</dt><dd>{field.value}<Sources sources={resolveSources(field.source_ids)} inline /></dd></span>)}</dl></details><button type="button" onClick={() => onOpen(item.case_slug)}>See the evidence in this case →</button></article>)}</div></section>
}

function MethodNote() {
  return <aside className="mnrp-method-note"><strong>How to read this</strong><p>{research.caution}</p><a href="/indigenous-healthcare-evidence/methodology">Full evidence and interpretation method →</a></aside>
}

function Landing({ onOpen }) {
  return <>
    <header className="mnrp-landing-hero"><p className="mnrp-kicker">Miller North · Research &amp; Policy</p><h1>What happened <em>after</em> the harm was documented?</h1><p>{research.introduction}</p></header>
    <MillerNorthStartHere compact />
    <section className="mnrp-path-section"><p className="mnrp-kicker">How the research works</p><h2>Following what happened next</h2><p>Each case follows only the stages supported by public evidence.</p><ol className="mnrp-path">{research.research_path.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}</ol></section>
    <section className="mnrp-case-section"><p className="mnrp-kicker">{cases.length} Research &amp; Policy cases</p><h2>Follow the public record</h2><div className="mnrp-case-grid">{cases.map(record => <article className={`mnrp-case-card mnrp-${record.slug}`} key={record.slug}><p className="mnrp-province">{record.province}</p><h2>{record.title}</h2><p className="mnrp-focus">{record.focus}</p><div className="mnrp-card-metrics">{record.metrics.slice(0, 4).map(metric => <span key={metric.label}><strong>{metric.value}</strong>{metric.label}</span>)}</div><button type="button" onClick={() => onOpen(record.slug)}>Explore this case <span aria-hidden="true">→</span></button></article>)}</div></section>
    <AccountabilityComparison onOpen={onOpen}/>
    <section className="mnrp-latest"><p className="mnrp-kicker">Latest source checks</p><h2>What changed in this review</h2><div>{Object.entries(research.bounded_discovery).map(([province, findings]) => <article key={province}><h3>{words(province)}</h3>{findings.map(item => <p key={item.text}>{item.text}<Sources sources={item.sources} inline /></p>)}</article>)}</div></section>
    <MethodNote />
  </>
}

function StatusSummary({ record }) {
  const total = Object.values(record.status_counts).reduce((sum, value) => sum + value, 0)
  return <section className="mnrp-status-summary"><div><p className="mnrp-kicker">Public-evidence overview</p><h2>Twenty-four recommendations, five evidence states</h2><p>{research.status_notice}</p></div><div className="mnrp-status-bars" role="img" aria-label="2 implemented, 3 substantially implemented, 12 partially implemented, 4 underway, and 3 with fragmentary evidence">{statusOrder.map(status => <div key={status}><span className={`mnrp-status-swatch is-${status}`} style={{ "--status-width": `${record.status_counts[status] / total * 100}%` }} /><strong>{record.status_counts[status]}</strong><span>{statusLabels[status]}</span></div>)}</div></section>
}

function RecommendationTracker({ record }) {
  const [theme, setTheme] = useState("all")
  const [status, setStatus] = useState("all")
  const shown = record.recommendations.filter(item => (theme === "all" || item.theme === theme) && (status === "all" || item.status === status))
  const availableStatuses = [...new Set(record.recommendations.map(item => item.status))]
  return <section className="mnrp-recommendations"><div className="mnrp-section-heading"><div><p className="mnrp-kicker">Recommendation tracker</p><h2>What was recommended—and what followed</h2></div><p>{shown.length} of {record.recommendations.length} shown</p></div><div className="mnrp-recommendation-filters"><label>Theme<select value={theme} onChange={event => setTheme(event.target.value)}><option value="all">All themes</option>{record.themes.map(item => <option key={item.title}>{item.title}</option>)}</select></label><label>Evidence status<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{availableStatuses.map(value => <option key={value} value={value}>{statusLabels[value] || words(value)}</option>)}</select></label></div><div className="mnrp-recommendation-list">{shown.map(item => <details className="mnrp-recommendation" key={item.number}><summary><span className="mnrp-rec-number">{String(item.number).padStart(2, "0")}</span><span><strong>{item.summary}</strong><small>{item.theme}</small></span><span className={`mnrp-status-pill is-${item.status}`}>{item.status_label}</span></summary><div className="mnrp-rec-detail"><section><h3>Responsible organizations</h3><ul>{item.responsible_organizations.map(value => <li key={value}>{value}</li>)}</ul></section><section><h3>What followed</h3>{item.what_followed.length ? <ol>{item.what_followed.map((action, index) => <li key={index}><strong>{action.date}</strong><p>{action.description}</p><small>{action.depth}</small><Sources sources={action.sources} inline /></li>)}</ol> : <p>No discrete action was identified in the sources reviewed.</p>}</section><section><h3>Current public-evidence status</h3><p><span className={`mnrp-status-pill is-${item.status}`}>{item.status_label}</span> · latest evidence {item.latest_evidence_date}</p>{item.evidence_summary.map(value => <p key={value}>{value}</p>)}</section><section className="mnrp-reporting-limit"><h3>Reporting limitation</h3><p>{item.reporting_limitation}</p>{item.source_note && <p><strong>Source note:</strong> {item.source_note}</p>}</section><section><h3>Sources</h3><Sources sources={item.sources} /></section></div></details>)}</div></section>
}

function Themes({ record }) {
  return <section className="mnrp-theme-section"><p className="mnrp-kicker">Thematic view</p><h2>{record.themes.length} connected areas of change</h2><div className="mnrp-theme-grid">{record.themes.map(theme => <article key={theme.title}><h3>{theme.title}</h3><p><strong>Recommendations:</strong> {theme.recommendation_numbers.join(", ")}</p><div className="mnrp-theme-statuses">{Object.entries(theme.status_distribution).map(([status, count]) => <span className={`is-${status}`} key={status}>{count} {(statusLabels[status] || words(status)).toLowerCase()}</span>)}</div><p><strong>Evidence:</strong> {theme.strongest_evidence}</p><p><strong>Open question:</strong> {theme.reporting_gap}</p></article>)}</div></section>
}

function Timeline({ record }) {
  return <section className="mnrp-timeline-section"><p className="mnrp-kicker">Timeline</p><h2>How the record developed</h2><ol className="mnrp-timeline">{record.timeline.map((item, index) => <li key={`${item.date}-${index}`}><span className="mnrp-timeline-dot"/><div className="mnrp-timeline-date">{item.date}</div><article><p className="mnrp-type">{item.type}</p><h3>{item.title}</h3><p>{item.description}</p><footer>{item.organization}<Sources sources={item.sources} inline /></footer></article></li>)}</ol></section>
}

function EvidencePath({ record }) {
  return <section className="mnrp-evidence-path-section"><p className="mnrp-kicker">Accountability path</p><h2>How the evidence connects</h2><ol className="mnrp-case-path">{record.evidence_path.map((item, index) => <li key={index}><span>{item.from}</span><strong>{item.relationship}</strong><span>{item.to}</span><Sources sources={item.sources} inline /></li>)}</ol></section>
}

function PolicyContext({ record }) {
  return <section className="mnrp-policy-section"><p className="mnrp-kicker">Government, policy and law</p><h2>The most important formal context</h2><div className="mnrp-policy-grid">{record.policy_and_government.map(item => <article key={item.title}><p className="mnrp-type">{item.label}</p><h3>{item.title}</h3><p>{item.description}</p><Sources sources={item.sources} inline /></article>)}</div>{record.legal_note && <aside className="mnrp-legal-note"><strong>Legal context</strong><p>{record.legal_note}</p></aside>}</section>
}

function DossierSections({ record }) {
  if (!record.dossier_sections?.length) return null
  return <section className="mnrp-dossier-sections" aria-label="Case details">{record.dossier_sections.map(section => <article key={section.title}><p className="mnrp-kicker">{section.eyebrow}</p><h2>{section.title}</h2><div>{section.items.map(item => <section key={item.title}><h3>{item.title}</h3><p>{item.text}</p><Sources sources={item.sources} inline /></section>)}</div></article>)}</section>
}

function Findings({ record }) {
  return <section className="mnrp-findings"><article><p className="mnrp-kicker">What public evidence shows</p><h2>What we know</h2><ul>{record.what_public_evidence_shows.map(item => <li key={item.text}>{item.text}<Sources sources={item.sources} inline /></li>)}</ul></article><article><p className="mnrp-kicker">Reporting limits</p><h2>What remains unclear</h2><ul>{record.what_remains_unclear.map(item => <li key={item.text}>{item.text}<Sources sources={item.sources} inline /></li>)}</ul></article></section>
}

function SourceLibrary({ record }) {
  const groups = useMemo(() => Object.entries(record.sources.reduce((all, source) => ({ ...all, [source.category]: [...(all[source.category] || []), source] }), {})), [record.sources])
  return <section className="mnrp-sources"><p className="mnrp-kicker">Sources and evidence</p><h2>Read the public record</h2><p>Primary and authoritative sources are grouped by their role in this case.</p>{groups.map(([category, sources]) => <details key={category}><summary>{category}<span>{sources.length}</span></summary><ul>{sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><span>{source.organization}{source.publication_date ? ` · ${source.publication_date}` : ""}</span></li>)}</ul></details>)}</section>
}

function CaseView({ record, onBack }) {
  return <><button type="button" className="mnrp-back-cases" onClick={onBack}>← All provincial cases</button><header className="mnrp-case-hero"><p className="mnrp-province">{record.province}</p><h1>{record.title}</h1><p>{record.focus}</p><div className="mnrp-hero-metrics">{record.metrics.map(metric => <span key={metric.label}><strong>{metric.value}</strong>{metric.label}</span>)}</div></header><section className="mnrp-opening-summary" aria-label="Case at a glance"><article><p className="mnrp-kicker">What is this?</p><p>{record.what_happened}</p></article><article><p className="mnrp-kicker">Why this matters</p><p>{record.why_this_matters[0]}</p></article><article><p className="mnrp-kicker">What changed afterward?</p><p>{record.what_public_evidence_shows[1]?.text || record.what_public_evidence_shows[0].text}</p></article><article><p className="mnrp-kicker">What remains unclear?</p><p>{record.what_remains_unclear[0].text}</p></article></section>{record.selection_note && <aside className="mnrp-selection-note"><strong>Why this Alberta case?</strong><p>{record.selection_note}</p></aside>}{record.status_counts && <StatusSummary record={record}/>}<EvidencePath record={record}/>{record.recommendations && <><Themes record={record}/><RecommendationTracker record={record}/></>}<DossierSections record={record}/><Timeline record={record}/><PolicyContext record={record}/><Findings record={record}/><section className="mnrp-next-question"><p className="mnrp-kicker">Next research question</p><h2>{record.recommended_next_question}</h2><p><strong>The one thing to remember:</strong> {record.one_thing_to_remember}</p></section><SourceLibrary record={record}/><MethodNote/></>
}

export default function MillerNorthResearchPolicy() {
  const queryCase = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("case") || ""
  const [selectedSlug, setSelectedSlug] = useState(() => cases.some(item => item.slug === queryCase) ? queryCase : "")
  const selected = cases.find(item => item.slug === selectedSlug)
  const select = slug => { setSelectedSlug(slug); window.history.replaceState({}, "", `${window.location.pathname}?case=${slug}`); window.scrollTo({ top: 0, behavior: "smooth" }) }
  const close = () => { setSelectedSlug(""); window.history.replaceState({}, "", window.location.pathname); window.scrollTo({ top: 0, behavior: "smooth" }) }
  return <main className="mnrp-page"><header className="mnrp-site-header"><a href="/" className="mnrp-home">← Miller resource finder</a><div className="mnrp-brand"><span>M</span><div><strong>Miller North</strong><small>First Nations Healthcare Evidence</small></div></div><MillerNorthPublicNav current="research"/></header>{selected ? <CaseView record={selected} onBack={close}/> : <Landing onOpen={select}/>}</main>
}
