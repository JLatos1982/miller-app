import { practicalHelpForCase } from "./millerNorthPracticalConnections.js"

export default function MillerNorthRelatedPracticalHelp({ caseSlug }) {
  const supports = practicalHelpForCase(caseSlug)
  if (!supports.length) return null
  return <section className="mnrp-related-help" aria-labelledby="mnrp-related-help-title"><p className="mnrp-kicker">Related practical help</p><h2 id="mnrp-related-help-title">Support you can explore</h2><p>These links are selected by an explicit practical connection to the case. Their inclusion does not show that the case caused, endorsed or evaluated the service.</p><div>{supports.map(support => <article key={support.id}><p className="mnrp-type">{support.category}</p><h3>{support.name}</h3><p><strong>{support.organization}</strong> · {support.area}</p><p>{support.description}</p><p><strong>Eligibility:</strong> {support.eligibility}</p>{support.phone ? <a href={`tel:${support.phone.replace(/[^+\d]/g, "")}`}>{support.phone}</a> : null}<a href={support.website} target="_blank" rel="noreferrer">Open service information ↗</a><a href={support.collectionHref}>Browse related supports →</a></article>)}</div></section>
}
