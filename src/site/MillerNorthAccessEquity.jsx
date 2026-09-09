import MillerNorthPublicNav, { MillerNorthHomeLink } from "./MillerNorthPublicNav.jsx"
import "./MillerNorthAccessEquity.css"
import { ACCESS_EQUITY_PUBLIC_PROJECTION } from "./accessEquityPublicProjection.js"

const measureAreas = [
  ["Access and services", "Primary care, facilities, navigation, travel and workforce availability can shape whether care is reachable."],
  ["Institutional responses", "Reports, recommendations, commitments and implementation are different kinds of evidence. A program announcement is not an outcome."],
  ["Outcomes", "When a method, denominator, comparison and time period are aligned, later measures can help assess whether access or outcomes changed."],
]

const gaps = [
  "Indigenous-disaggregated primary-care attachment and continuity are not consistently public across provinces.",
  "Public intervention reports often show funding or activity without a comparable outcome measure.",
  "Travel, service stability, patient experience and complaint outcomes can be important but are not always available in privacy-safe public form.",
]

const roleLabels = Object.freeze({
  measured_disparity: "Measured disparity",
  documented_structural_barrier: "Documented barrier",
  institutional_response: "Institutional response",
  implementation: "Implementation",
  measured_outcome: "Measured outcome",
  data_measurement_gap: "Data gap",
  suggested_follow_up: "Suggested follow-up",
})

function FindingCard({ finding }) {
  return <article className="mn-access-card" id={finding.public_id}>
    <p className="mn-public-eyebrow">{roleLabels[finding.role] || "Access & Equity"}</p>
    <h3>{finding.title}</h3>
    <p>{finding.public_summary}</p>
    <dl>
      <div><dt>Measured</dt><dd>{finding.what_was_measured}</dd></div>
      <div><dt>Compared with</dt><dd>{finding.compared_with}</dd></div>
      <div><dt>What this does not establish</dt><dd>{finding.what_it_does_not_establish}</dd></div>
    </dl>
    {finding.documented_context && <p className="mn-access-context">{finding.documented_context}</p>}
    <p className="mn-access-source"><a href={finding.source.url} target="_blank" rel="noreferrer">{finding.source.organization} — {finding.source.title}</a>{finding.period ? ` · ${finding.period}` : ""}</p>
    {finding.additional_sources?.length > 0 && <p className="mn-access-source">{finding.additional_sources.map((source, index) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{index ? "Additional source" : "Additional source"}: {source.organization} — {source.title}</a>)}</p>}
    <p className="mn-access-caveat">{finding.caveat}</p>
  </article>
}

function FollowUpCard({ followUp }) {
  return <article className="mn-access-card mn-access-follow-up-card" id={followUp.public_id}>
    <p className="mn-public-eyebrow">Suggested follow-up · {followUp.jurisdiction}</p>
    <h3>{followUp.title}</h3>
    <dl>
      <div><dt>Question</dt><dd>{followUp.research_question}</dd></div>
      <div><dt>Why it matters</dt><dd>{followUp.why_it_matters}</dd></div>
      <div><dt>What we know</dt><dd>{followUp.what_we_currently_know}</dd></div>
      <div><dt>What is missing</dt><dd>{followUp.what_is_missing}</dd></div>
      <div><dt>Evidence that would help</dt><dd>{followUp.evidence_needed}</dd></div>
      {followUp.governance_considerations && <div><dt>Governance / methodology</dt><dd>{followUp.governance_considerations}</dd></div>}
    </dl>
    <p className="mn-access-source">{followUp.sources.map((source, index) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{index ? "Additional source" : "Source"}: {source.organization} — {source.title}</a>)}</p>
  </article>
}

export default function MillerNorthAccessEquity() {
  const { findings, suggested_follow_ups: followUps } = ACCESS_EQUITY_PUBLIC_PROJECTION
  const whatWeKnow = findings.filter(finding => ["measured_disparity", "documented_structural_barrier"].includes(finding.role))
  const institutionalResponses = findings.filter(finding => ["institutional_response", "implementation"].includes(finding.role))
  return <main className="mn-public-page mn-access-equity-page">
    <header className="mn-public-header"><MillerNorthHomeLink/><MillerNorthPublicNav current="access_equity" /></header>
    <section className="mn-public-hero">
      <p className="mn-public-eyebrow">Miller North · Access &amp; Equity</p>
      <h1>Looking beyond one incident</h1>
      <p>Individual incidents help show what happened to particular people. Structural evidence asks different questions: who can reach care, where services are located, who must travel, what institutions identified, what changed, and whether outcomes improved.</p>
    </section>

    <section className="mn-access-note" aria-label="Publication status">
      <strong>Public evidence standard</strong>
      <p>No structural-healthcare finding is displayed here until it has passed source, method, privacy and owner-publication review. This page explains the research area and the limits of the public record; it does not expose private research or data-request planning.</p>
    </section>

    <section className="mn-access-grid" aria-label="What structural evidence examines">
      {measureAreas.map(([title, text]) => <article key={title}><h2>{title}</h2><p>{text}</p></article>)}
    </section>

    {whatWeKnow.length > 0 && <section className="mn-public-section" aria-labelledby="access-equity-findings-title">
      <p className="mn-public-eyebrow">What we know</p><h2 id="access-equity-findings-title">Publicly reviewed structural evidence</h2>
      <div className="mn-access-card-grid">{whatWeKnow.map(finding => <FindingCard key={finding.public_id} finding={finding} />)}</div>
    </section>}

    {institutionalResponses.length > 0 && <section className="mn-public-section" aria-labelledby="access-equity-response-title">
      <p className="mn-public-eyebrow">What institutions did</p><h2 id="access-equity-response-title">Responses and implementation</h2>
      <p>These records document a response or its implementation. They are not evidence, by themselves, that conditions or outcomes improved.</p>
      <div className="mn-access-card-grid">{institutionalResponses.map(finding => <FindingCard key={finding.public_id} finding={finding} />)}</div>
    </section>}

    <section className="mn-public-section" aria-labelledby="access-equity-change-title">
      <p className="mn-public-eyebrow">Did it change?</p><h2 id="access-equity-change-title">Implementation and effectiveness are different questions</h2>
      <p>The public records below document important work, but they do not yet supply comparable outcome measures capable of showing whether the B.C. centres or Alberta investments changed attachment, continuity or patient experience. That is an evidence limit, not a conclusion about whether a program succeeded or failed.</p>
    </section>

    <section className="mn-public-section" aria-labelledby="access-equity-method-title">
      <p className="mn-public-eyebrow">Method</p><h2 id="access-equity-method-title">What a careful finding needs</h2>
      <p>A public finding must say what was measured, compared with what, for which period and denominator, and how the population was identified. It must link to a source and state what the finding does not prove.</p>
      <div className="mn-access-steps" role="list" aria-label="Evidence interpretation sequence"><span role="listitem">Disparity</span><span role="listitem">Documented mechanism</span><span role="listitem">Institutional response</span><span role="listitem">Implementation</span><span role="listitem">Measured outcome</span></div>
      <p className="mn-access-caveat">A measurable disparity does not by itself establish discrimination or its cause. Miller North keeps these evidence categories separate.</p>
    </section>

    <section className="mn-public-section" aria-labelledby="access-equity-gaps-title">
      <p className="mn-public-eyebrow">Important limits</p><h2 id="access-equity-gaps-title">What we still cannot measure consistently</h2>
      <ul className="mn-access-gaps">{gaps.map(gap => <li key={gap}>{gap}</li>)}</ul>
      <p>Missing public evidence does not mean that care was equal, that a program failed, or that the underlying data do not exist. It means the public record cannot safely answer that question yet.</p>
    </section>

    <section className="mn-public-section mn-access-follow-up" aria-labelledby="access-equity-follow-up-title">
      <p className="mn-public-eyebrow">Suggested follow-up</p><h2 id="access-equity-follow-up-title">Important unanswered questions</h2>
      <p>When an important question cannot be answered from the public record, Miller North may describe the question, why it matters, what is known and what additional evidence would help. A suggested follow-up is not an accusation, a request for personal information, or a claim about what missing data would show.</p>
      {followUps.length === 0
        ? <p className="mn-access-caveat">Any public suggested follow-up must be source-backed, privacy-conscious and separately approved for publication. None are displayed until that review is complete.</p>
        : <p className="mn-access-caveat">Each question below is source-backed, privacy-conscious and separately approved for publication. It identifies an uncertainty; it does not claim what future evidence will show.</p>}
      {followUps.length > 0 && <div className="mn-access-card-grid">{followUps.map(followUp => <FollowUpCard key={followUp.public_id} followUp={followUp} />)}</div>}
    </section>

    <section className="mn-public-section mn-access-links" aria-labelledby="access-equity-links-title">
      <p className="mn-public-eyebrow">Related Miller North work</p><h2 id="access-equity-links-title">Evidence, accountability and practical help</h2>
      <p>Structural questions sit alongside—not instead of—individual records, public accountability tracking and practical supports.</p>
      <div><a href="/indigenous-healthcare-evidence">Evidence</a><a href="/indigenous-healthcare-evidence/accountability-watch">Accountability</a><a href="/indigenous-healthcare-evidence/watching-now">Watching</a><a href="/indigenous-healthcare-evidence/first-nations-supports">Supports &amp; Funding</a></div>
    </section>
    <footer className="mn-public-footer">Miller North distinguishes public evidence from private research and owner review.</footer>
  </main>
}
