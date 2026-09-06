import projection from "../data/miller-north-emerging-cases-public-v1.json"
import "./MillerNorthRecentlyChanged.css"

const provinceLabels = { "British Columbia": "B.C.", Alberta: "Alberta", Saskatchewan: "Saskatchewan" }

function reviewedMaterialChanges(limit = 3) {
  return projection.items
    .filter(item => item.last_material_change_at && item.display_state && item.description)
    .sort((left, right) => right.last_material_change_at.localeCompare(left.last_material_change_at))
    .slice(0, limit)
}

export default function MillerNorthRecentlyChanged() {
  const changes = reviewedMaterialChanges()
  return <section className="mn-recently-changed" aria-labelledby="mn-recently-changed-title"><div className="mn-recently-changed-heading"><div><p className="mn-public-eyebrow">Reviewed updates</p><h2 id="mn-recently-changed-title">Recently changed</h2></div><a href="/indigenous-healthcare-evidence/watching-now">See all Watching Now stories →</a></div><div>{changes.map(item => <article key={`${item.province}-${item.title}`}><p><span>{provinceLabels[item.province] || item.province}</span><time dateTime={item.last_material_change_at}>{item.last_material_change_at}</time></p><p className="mn-recently-changed-state">{item.display_state}</p><h3>{item.title}</h3><p>{item.description}</p><a href={item.related_href || "/indigenous-healthcare-evidence/watching-now"}>{item.related_href ? "Open related case" : "See what Miller North is watching"} →</a></article>)}</div></section>
}
