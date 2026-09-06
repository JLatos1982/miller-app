import comparison from "../data/miller-north-accountability-comparison-public-v1.json"
import MillerNorthPublicNav, { MillerNorthHomeLink } from "./MillerNorthPublicNav.jsx"
import "./MillerNorthAccountabilitySnapshot.css"

const primaryFields = [
  "complaint_entry_point",
  "investigator_reviewer",
  "indigenous_specific_mechanism",
  "authority",
  "institutional_home",
  "recommendations",
  "public_reporting",
  "aggregate_outcome_reporting",
  "implementation_follow_up",
]

const gapFields = ["major_transparency_gap", "appeal_reconsideration"]

function SourceReferences({ sourceIds }) {
  return <span className="mnas-source-references">{sourceIds.map((id, index) => {
    const source = comparison.sources[id]
    return <span key={id}>{index ? " · " : ""}<a href={source.url} target="_blank" rel="noreferrer">{source.organization}</a></span>
  })}</span>
}

function fieldFor(mechanism, field) {
  return mechanism.fields.find(item => item.field === field)
}

function ProvinceSnapshot({ mechanism }) {
  const usedSources = [...new Set(mechanism.fields.flatMap(field => field.source_ids))].map(id => comparison.sources[id])
  return <article className="mnas-province-card">
    <p className="mn-public-eyebrow">{mechanism.province}</p>
    <h2>{mechanism.mechanism}</h2>
    <dl>{primaryFields.map(field => {
      const item = fieldFor(mechanism, field)
      return <div key={field}><dt>{item.label}</dt><dd>{item.value}<SourceReferences sourceIds={item.source_ids}/></dd></div>
    })}</dl>
    <details><summary>Sources for this snapshot</summary><ul>{usedSources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><span>{source.organization}</span></li>)}</ul></details>
    <a className="mnas-case-link" href={`/indigenous-healthcare-evidence/research-policy?case=${mechanism.case_slug}`}>Read the related case →</a>
  </article>
}

export default function MillerNorthAccountabilitySnapshot() {
  return <main className="mn-public-page mnas-page">
    <header className="mn-public-header"><MillerNorthHomeLink/><MillerNorthPublicNav current="research" /></header>
    <section className="mn-public-hero mnas-hero"><p className="mn-public-eyebrow">Miller North · Accountability Snapshot</p><h1>How selected complaint and review routes work</h1><p>A small, source-backed comparison of selected healthcare accountability mechanisms in British Columbia, Alberta and Saskatchewan.</p></section>
    <aside className="mn-public-note"><strong>How to read this comparison</strong><br />{comparison.caution} Missing public reporting identifies an evidence gap; it does not show that no activity or outcome occurred.</aside>
    <section className="mnas-grid" aria-label="Provincial accountability mechanisms">{comparison.mechanisms.map(mechanism => <ProvinceSnapshot mechanism={mechanism} key={mechanism.province}/>)}</section>
    <section className="mnas-unknowns" aria-labelledby="mnas-unknowns-title"><p className="mn-public-eyebrow">Evidence limits</p><h2 id="mnas-unknowns-title">What we still don’t know</h2><p>These are gaps in the public record reviewed—not findings that the underlying work did not happen.</p><div>{comparison.mechanisms.map(mechanism => <article key={mechanism.province}><h3>{mechanism.province}</h3>{gapFields.map(field => { const item = fieldFor(mechanism, field); return <section key={field}><h4>{item.label}</h4><p>{item.value}</p><SourceReferences sourceIds={item.source_ids}/></section> })}</article>)}</div></section>
    <footer className="mn-public-footer">Every substantive comparison field links to reviewed public evidence. The snapshot describes documented structures and transparency; it does not rank provinces or measure effectiveness.</footer>
  </main>
}
