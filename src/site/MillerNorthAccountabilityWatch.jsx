import watch from "../data/miller-north-accountability-watch-v1.json"
import MillerNorthPublicNav, { MillerNorthHomeLink } from "./MillerNorthPublicNav.jsx"
import "./MillerNorthAccountabilityWatch.css"
import "./MillerNorthCrossLinks.css"

const label = value => String(value || "").replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase())

function SourceLinks({ sources }) {
  return <ul className="mnaw-sources">{sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>
}

export default function MillerNorthAccountabilityWatch() {
  return <main className="mnaw-page">
    <header className="mnaw-header"><MillerNorthHomeLink className="mnaw-home"/><div className="mnaw-brand"><span>M</span><div><strong>Miller North</strong><small>First Nations Healthcare Evidence</small></div></div><MillerNorthPublicNav current="accountability"/></header>
    <section className="mnaw-hero"><p>Accountability Watch · public evidence only</p><h1>What public evidence shows <em>after</em> a concern is documented.</h1><p>{watch.caution}</p><a href="/indigenous-healthcare-evidence/research-policy">← Research &amp; Policy cases</a></section>
    <section className="mnaw-method"><strong>How to read this watch</strong><p>Each chain separates the originating concern, a documented response or action, and the public evidence of implementation. It does not rank provinces, decide individual allegations, or convert activity into a measured outcome.</p><p><a href="/indigenous-healthcare-evidence/serious-harm">See reviewed serious-harm and formal-accountability records →</a></p></section>
    <section className="mnaw-grid" aria-label={`${watch.chains.length} public accountability chains`}>{watch.chains.map(chain => <article id={chain.chain_id} key={chain.chain_id}>
      <p className="mnaw-province">{chain.province}</p><h2>{chain.title}</h2><p className={`mnaw-status is-${chain.current_status}`}>{label(chain.current_status)}</p>
      <dl><div><dt>Originating concern</dt><dd>{chain.originating_concern}</dd></div><div><dt>Finding / commitment</dt><dd>{chain.key_finding} {chain.recommendation_or_commitment}</dd></div><div><dt>Who is responsible</dt><dd>{chain.responsible_organizations.join(", ")}</dd></div><div><dt>Accountable actors named in this chain</dt><dd>{chain.accountable_actors.join(", ")}</dd></div><div><dt>Action claimed</dt><dd>{chain.implementation_action_claimed}</dd></div><div><dt>Public evidence now</dt><dd>{chain.implementation_evidence}</dd></div><div><dt>What is unresolved</dt><dd>{chain.unresolved_gap}</dd></div><div><dt>Limit</dt><dd>{chain.contradictions_or_limitations}</dd></div><div><dt>Best next document</dt><dd>{chain.best_next_document}</dd></div></dl>
      {chain.related_incident_refs?.length ? <a className="mnaw-related" href={`/indigenous-healthcare-evidence/serious-harm#${chain.related_incident_refs[0]}`}>Related incident →</a> : null}
      <footer><span>Reviewed {chain.last_reviewed}</span><span>Confidence: {label(chain.confidence)}</span></footer><p className="mnaw-quality"><strong>Evidence quality:</strong> {chain.evidence_quality}</p><details><summary>Public sources ({chain.sources.length})</summary><SourceLinks sources={chain.sources}/></details>
    </article>)}</section>
  </main>
}
