const words = value => String(value || "unknown").replaceAll("_", " ")

export default function FarmOperationalPilotPreview({
  millerFindings = [],
  millerNorthFindings = [],
  evidencePaths = [],
  sourceFamilies = [],
  briefs = [],
  recommendedNextMove = "No next action selected.",
}) {
  const top = items => items.filter(item => ["review_first", "review_next"].includes(item.significance?.priority_band)).slice(0, 3)
  return <section className="admin-review-panel" aria-labelledby="farm-operational-pilot-preview">
    <p className="eyebrow">Administrator only · cross-domain operational pilot</p>
    <h2 id="farm-operational-pilot-preview">Shared research foundation</h2>
    <div className="admin-review-grid">
      <section><h3>Miller</h3><ol>{top(millerFindings).map(item => <li key={item.finding_id}><strong>{item.title}</strong><br />{words(item.significance.priority_band)} · {item.significance.priority_score}</li>)}</ol></section>
      <section><h3>Miller North</h3><ol>{top(millerNorthFindings).map(item => <li key={item.finding_id}><strong>{item.title}</strong><br />{words(item.significance.priority_band)} · {item.significance.priority_score}</li>)}</ol></section>
    </div>
    <h3>Evidence paths</h3>
    <ul>{evidencePaths.slice(0, 4).map(path => <li key={path.id}><strong>{path.title}</strong><br />{path.edge_count} sourced edges</li>)}</ul>
    <h3>Source families used</h3>
    <p>{sourceFamilies.length} registered families exercised in this pilot.</p>
    <h3>Private research briefs</h3>
    <ul>{briefs.slice(0, 2).map(brief => <li key={brief.id}>{brief.title}</li>)}</ul>
    <h3>Recommended next move</h3>
    <p>{recommendedNextMove}</p>
    <p>Review priority is not evidence strength, effectiveness, compliance or reputation. This view cannot publish records.</p>
  </section>
}
