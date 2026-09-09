import MillerNorthPublicNav, { MillerNorthHomeLink } from "./MillerNorthPublicNav.jsx"
import "./MillerNorthAccessEquity.css"

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

export default function MillerNorthAccessEquity() {
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
      <p className="mn-access-caveat">Any public suggested follow-up must be source-backed, privacy-conscious and separately approved for publication. None are displayed until that review is complete.</p>
    </section>

    <section className="mn-public-section mn-access-links" aria-labelledby="access-equity-links-title">
      <p className="mn-public-eyebrow">Related Miller North work</p><h2 id="access-equity-links-title">Evidence, accountability and practical help</h2>
      <p>Structural questions sit alongside—not instead of—individual records, public accountability tracking and practical supports.</p>
      <div><a href="/indigenous-healthcare-evidence">Evidence</a><a href="/indigenous-healthcare-evidence/accountability-watch">Accountability</a><a href="/indigenous-healthcare-evidence/watching-now">Watching</a><a href="/indigenous-healthcare-evidence/first-nations-supports">Supports &amp; Funding</a></div>
    </section>
    <footer className="mn-public-footer">Miller North distinguishes public evidence from private research and owner review.</footer>
  </main>
}
