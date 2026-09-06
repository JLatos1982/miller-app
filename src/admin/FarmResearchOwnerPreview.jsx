const readable = value => String(value || "unknown").replaceAll("_", " ")

export default function FarmResearchOwnerPreview({
  title = "Private research synthesis",
  findings = [],
  servicePaths = [],
  needsReview = [],
  recommendedNextMove = "No next action has been selected.",
}) {
  const topFindings = findings.slice(0, 5)
  return <section className="admin-review-panel" aria-labelledby="farm-research-owner-preview">
    <p className="eyebrow">Administrator only · private research synthesis</p>
    <h2 id="farm-research-owner-preview">{title}</h2>
    <h3>Top findings</h3>
    <ol>{topFindings.map(item => <li key={item.finding_id}><strong>{item.title}</strong><br />{readable(item.finding_type)} · priority {item.significance?.priority_score ?? "unscored"} · {readable(item.significance?.priority_band)}</li>)}</ol>
    <h3>What changed</h3>
    <p>{servicePaths.length} policy-to-service evidence path{servicePaths.length === 1 ? "" : "s"} available for review.</p>
    <h3>Policy → service</h3>
    <ul>{servicePaths.slice(0, 5).map(item => <li key={item.verification_id}><strong>{item.service_name}</strong><br />{readable(item.verification_status)} · {item.steps?.length || 0} evidenced stages</li>)}</ul>
    <h3>Needs review</h3>
    <ul>{needsReview.slice(0, 5).map(item => <li key={item.id || item.finding_id || item.source_record_id}>{item.title || item.name}<br />{item.reason || item.owner_review_reason}</li>)}</ul>
    <h3>Recommended next move</h3>
    <p>{recommendedNextMove}</p>
    <p>Priority is for owner attention only. It is not an evidence, effectiveness, compliance, or reputational score, and nothing in this view is publication approval.</p>
  </section>
}
