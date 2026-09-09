import projection from "../data/miller-north-recently-changed-public-v1.json"
import { materialChangeLabel } from "../../server/millerNorthRecentlyChanged.js"
import "./MillerNorthRecentlyChanged.css"

const provinceLabels = { "British Columbia": "B.C.", Alberta: "Alberta", Saskatchewan: "Saskatchewan" }

function reviewedMaterialChanges(limit = 4) {
  return projection.items
    .filter(item => item.material_change_date && item.material_change_type && item.what_changed)
    .sort((left, right) => right.material_change_date.localeCompare(left.material_change_date) || left.change_id.localeCompare(right.change_id))
    .slice(0, limit)
}

export default function MillerNorthRecentlyChanged() {
  const changes = reviewedMaterialChanges()
  if (!changes.length) return null
  return <section className="mn-recently-changed" aria-labelledby="mn-recently-changed-title"><div className="mn-recently-changed-heading"><div><p className="mn-public-eyebrow">Material evidence updates</p><h2 id="mn-recently-changed-title">Recently changed</h2><p>Only meaningful changes to reviewed public evidence appear here—not routine checks, formatting or site updates.</p></div><a href="/indigenous-healthcare-evidence/access-equity">Explore Access &amp; Equity →</a></div><div>{changes.map(item => <article key={item.change_id}><p><span>{provinceLabels[item.province] || item.province}</span><time dateTime={item.material_change_date}>Added to Miller North · {item.material_change_date}</time></p><p className="mn-recently-changed-state">{materialChangeLabel(item.material_change_type)}</p><h3>{item.title}</h3><p><strong>What changed:</strong> {item.what_changed}</p><p className="mn-recently-changed-source">Source: <a href={item.source.url} target="_blank" rel="noreferrer">{item.source.organization}</a> · {item.source.period}</p><a href={item.record_href}>Open reviewed record →</a></article>)}</div></section>
}
