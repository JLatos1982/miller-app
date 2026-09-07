import data from "../data/miller-north-serious-harm-public-v1.json"
import MillerNorthPublicNav, { MillerNorthHomeLink } from "./MillerNorthPublicNav.jsx"
import "./MillerNorthPublicPages.css"
import "./MillerNorthSeriousHarm.css"

const roleLabel = value => String(value || "").replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase())

export default function MillerNorthSeriousHarm() {
  return <main className="mn-public-page mnsh-page">
    <header className="mn-public-header"><MillerNorthHomeLink/><MillerNorthPublicNav current="official"/></header>
    <section className="mn-public-hero"><p className="mn-public-eyebrow">Official records</p><h1>Serious harm and formal accountability</h1><p>Restrained summaries of incidents for which a coroner, regulator or institution has placed meaningful evidence on the public record.</p></section>
    <aside className="mn-public-note" aria-label="Content note"><strong>Content note</strong><br/>{data.content_note}</aside>
    <section className="mnsh-method"><h2>How to read the labels</h2><p>{data.interpretation_note}</p><p>A formal process can establish particular facts or professional findings without deciding every allegation, legal responsibility or systemic cause.</p></section>
    <section className="mnsh-grid" aria-label={`${data.incidents.length} reviewed serious-harm records`}>
      {data.incidents.map(incident => <article id={incident.public_incident_id} key={incident.public_incident_id}>
        <div className="mnsh-card-head"><p>{incident.province}{incident.location ? ` · ${incident.location}` : ""}</p><span>{incident.evidence_strength.label}</span></div>
        <h2>{incident.title}</h2>
        <p className="mnsh-summary">{incident.summary}</p>
        <dl>
          <div><dt>Date</dt><dd>{incident.event_date}</dd></div>
          <div><dt>Care setting</dt><dd>{incident.care_setting}</dd></div>
          <div><dt>Formal process</dt><dd>{incident.formal_process_status}</dd></div>
          <div><dt>Response on the public record</dt><dd>{incident.institutional_response}</dd></div>
          <div><dt>What the record establishes</dt><dd>{incident.formal_outcome}</dd></div>
        </dl>
        <div className="mnsh-unknown"><h3>What remains unresolved</h3><ul>{incident.unresolved_questions.map(question => <li key={question}>{question}</li>)}</ul></div>
        <details><summary>Sources and their roles</summary><ul>{incident.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><span>{roleLabel(source.role)}</span></li>)}</ul></details>
        <footer><span>Reviewed {incident.last_reviewed}</span><span>Official evidence added {incident.official_evidence_added_at}</span></footer>
      </article>)}
    </section>
    <footer className="mn-public-footer">Miller North preserves source roles and uncertainty. A missing public outcome means the outcome was not located in the reviewed sources—not that no action occurred.</footer>
  </main>
}
