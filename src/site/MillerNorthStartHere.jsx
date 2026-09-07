import "./MillerNorthStartHere.css"

const choices = [
  { title: "Search reviewed evidence", description: "Find reports, research, policy documents and related public evidence.", href: "/indigenous-healthcare-evidence", link: "Search Evidence" },
  { title: "Read incidents and records", description: "Review privacy-safe incidents supported by coroner, regulator, inquest or institutional records.", href: "/indigenous-healthcare-evidence/serious-harm", link: "See Incidents" },
  { title: "Follow accountability", description: "See what was recommended or promised, the response, and what remains unresolved.", href: "/indigenous-healthcare-evidence/accountability-watch", link: "Open Accountability" },
  { title: "See current developments", description: "Follow active public processes with a clear question or milestone still ahead.", href: "/indigenous-healthcare-evidence/watching-now", link: "See Watching" },
]

export default function MillerNorthStartHere({ compact = false }) {
  return <section className={`mn-start-here ${compact ? "is-compact" : ""}`} aria-labelledby="mn-start-title"><div><p>Start here</p><h2 id="mn-start-title">What would you like to understand?</h2></div><div className="mn-start-grid">{choices.map(choice => <a href={choice.href} key={choice.href}><strong>{choice.title}</strong><span>{choice.description}</span><small>{choice.link} →</small></a>)}</div><p className="mn-start-support">Looking for help now? <a href="/indigenous-healthcare-evidence/first-nations-supports">Find First Nations Supports</a> or <a href="/indigenous-healthcare-evidence/funding-assistance">Funding &amp; Assistance</a>.</p></section>
}
