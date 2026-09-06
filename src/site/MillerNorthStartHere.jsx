import "./MillerNorthStartHere.css"

const choices = [
  { title: "Understand documented evidence", description: "Browse reconciled public records and their sources.", href: "/indigenous-healthcare-evidence", link: "Open the Evidence Library" },
  { title: "See what is developing", description: "Follow accountability and policy stories that are still taking shape.", href: "/indigenous-healthcare-evidence/watching-now", link: "See Watching Now" },
  { title: "Understand what happened afterward", description: "Explore investigations, recommendations, responses and implementation.", href: "/indigenous-healthcare-evidence/research-policy", link: "Open Research & Policy" },
  { title: "Find practical help", description: "Find First Nations supports and current funding navigation.", href: "/indigenous-healthcare-evidence/first-nations-supports", link: "Find First Nations Supports" },
]

export default function MillerNorthStartHere({ compact = false }) {
  return <section className={`mn-start-here ${compact ? "is-compact" : ""}`} aria-labelledby="mn-start-title"><div><p>Start here</p><h2 id="mn-start-title">What would you like to understand?</h2></div><div className="mn-start-grid">{choices.map(choice => <a href={choice.href} key={choice.href}><strong>{choice.title}</strong><span>{choice.description}</span><small>{choice.link} →</small></a>)}</div></section>
}
