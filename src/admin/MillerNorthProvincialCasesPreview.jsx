import { useState } from "react"

const labels = {
  british_columbia: "British Columbia — In Plain Sight",
  saskatchewan: "Saskatchewan — Saskatoon",
  alberta: "Alberta — Indigenous primary care panel",
}

const bullets = values => <ul>{(values || []).map((value, index) => <li key={`${index}-${value.slice(0, 24)}`}>{value}</li>)}</ul>

export default function MillerNorthProvincialCasesPreview({ cases = [] }) {
  const [selectedId, setSelectedId] = useState(cases[0]?.case_id || "")
  const selected = cases.find(item => item.case_id === selectedId) || cases[0]

  return <section className="admin-review-panel" aria-labelledby="miller-north-provincial-preview">
    <p className="eyebrow">Administrator only · private provincial research cases</p>
    <h2 id="miller-north-provincial-preview">Miller North Research &amp; Policy</h2>
    <nav aria-label="Select provincial research case">
      {cases.map(item => <button type="button" key={item.case_id} aria-pressed={item.case_id === selected?.case_id} onClick={() => setSelectedId(item.case_id)}>{labels[item.province] || item.identity.canonical_name}</button>)}
    </nav>
    {selected ? <article>
      <h3>{selected.identity.canonical_name}</h3>
      <p><strong>What happened</strong><br />{selected.owner_view.what_happened}</p>
      <h4>Why it matters</h4>
      {bullets(selected.owner_view.why_this_matters)}
      <h4>Timeline</h4>
      <ol>{selected.timeline.map(item => <li key={item.timeline_id}><strong>{item.date_or_range} — {item.title}</strong><br />{item.short_description}</li>)}</ol>
      <h4>Accountability</h4>
      {bullets(selected.evidence_graph.edges.slice(0, 5).map(item => item.neutral_summary))}
      <h4>Government / policy / law</h4>
      {bullets((selected.policy_law_governance || selected.legal_policy_context || []).map(item => `${item.title}: ${item.summary}`))}
      <h4>Implementation</h4>
      {bullets(selected.implementation_evidence.map(item => `${item.depth.replaceAll("_", " ")}: ${item.summary}`))}
      <h4>What remains unknown</h4>
      {bullets(selected.owner_view.what_remains_uncertain)}
      <p><strong>One thing to remember:</strong> {selected.owner_view.one_thing_to_remember}</p>
    </article> : <p>No private case data supplied.</p>}
    <p>This unwired preview cannot publish records, change incidents or approve owner-review items.</p>
  </section>
}
