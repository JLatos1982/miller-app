import "./MillerNavigatorLanding.css"

const steps = [
  ["1", "Describe the need", "Talk or type naturally."],
  ["2", "Check what Miller understood", "Review the location, service needs, and practical barriers."],
  ["3", "Review relevant resources", "See why each resource may fit, with broader options kept separate."],
  ["4", "Show or share", "Give the person a clean resource package after worker review."],
]

export default function MillerNavigatorLanding() {
  return <main className="navigator-landing-page">
    <header className="navigator-landing-header"><a href="/">← Miller Resources</a><span>Prototype in development</span></header>
    <section className="navigator-landing-hero">
      <p className="navigator-landing-eyebrow">Miller Navigator</p>
      <h1>Find and share the right resources quickly.</h1>
      <p className="navigator-landing-positioning">The pocket service-navigation tool for Canadian frontline workers.</p>
      <p>Miller Navigator helps social workers, counsellors, nurses, shelter and outreach workers, case managers, discharge planners, and other frontline professionals turn a plain-language description of what someone needs into a small set of relevant public resources they can review, show, or share.</p>
      <p>Strongest coverage is currently in British Columbia. Coverage is expanding, so Miller shows the verified pathways it has without claiming a complete national directory.</p>
      <p className="navigator-landing-note">Service navigation, not formal clinical referral. Miller supports worker judgment; it is not a substitute for clinical judgment or emergency services.</p>
    </section>
    <section className="navigator-landing-steps" aria-labelledby="navigator-steps-title"><h2 id="navigator-steps-title">A focused worker workflow</h2><div>{steps.map(([number, title, description]) => <article key={number}><span aria-hidden="true">{number}</span><h3>{title}</h3><p>{description}</p></article>)}</div></section>
    <section className="navigator-landing-demo" aria-labelledby="navigator-demo-title"><div><p className="navigator-landing-eyebrow">Synthetic example</p><h2 id="navigator-demo-title">“Helping someone in Surrey who needs detox and transportation.”</h2></div><div className="navigator-demo-flow"><article><strong>Miller understood</strong><ul><li>Withdrawal support</li><li>Surrey</li><li>Transportation</li></ul></article><span aria-hidden="true">→</span><article><strong>Relevant resources</strong><p>Review recommended resources, why they may fit, and clearly marked broader options.</p></article><span aria-hidden="true">→</span><article><strong>Worker review</strong><p>Select public resource information to show, share, email, or print.</p></article></div><p className="navigator-landing-note">This is a fictional demonstration. The iPhone prototype is currently being tested and is not yet available in the App Store.</p></section>
    <footer className="navigator-landing-footer"><a className="navigator-landing-action" href="/">Open Miller Resources</a><a href="/practical-supports">Browse Practical Supports</a><a href="/funding-assistance">Browse Funding &amp; Assistance</a></footer>
  </main>
}
