const readable = value => String(value || "unknown").replaceAll("_", " ")

export default function MillerAddictionsPolicyPreview({ chain = null, synthesis = null }) {
  if (!chain) return <section className="admin-review-panel"><p>Choose a private Miller addictions policy chain to inspect.</p></section>
  const instruments = chain.instruments || []
  const commitments = chain.commitments || []
  const resourceLinks = chain.resource_links || []
  const laterSignals = instruments.filter(item => item.recurrence_signal && item.recurrence_signal !== "no_recurrence_assessed")
  const serviceVerifications = synthesis?.service_verifications || []
  const patterns = synthesis?.patterns || []
  return <section className="admin-review-panel" aria-labelledby="miller-addictions-policy-preview">
    <p className="eyebrow">Administrator only · private addictions research lane</p>
    <h2 id="miller-addictions-policy-preview">{chain.title}</h2>
    <p>{chain.neutral_summary}</p>
    <h3>Policy &amp; law</h3>
    <ul>{instruments.map(item => <li key={item.policy_instrument_id}><strong>{item.title}</strong><br />{readable(item.instrument_type)} · {readable(item.binding_status)} · {readable(item.current_status)}</li>)}</ul>
    <h3>Recommendations &amp; commitments</h3>
    <ul>{commitments.map(item => <li key={item.commitment_id}><strong>{item.title}</strong><br />{readable(item.implementation_status)} · {readable(item.implementation_scope)}</li>)}</ul>
    <h3>Service impact candidates</h3>
    <ul>{resourceLinks.map(item => <li key={`${item.resource_candidate_name}:${item.relationship_type}`}><strong>{item.resource_candidate_name}</strong><br />{readable(item.relationship_type)} · {readable(item.resource_match_state)}{item.service_quantity != null ? ` · ${item.service_quantity} ${item.service_unit}` : ""}</li>)}</ul>
    {serviceVerifications.length > 0 && <><h3>Service verification</h3><ul>{serviceVerifications.map(item => <li key={item.verification_id}><strong>{item.service_name}</strong><br />{readable(item.verification_status)} · {readable(item.resource_match_outcome)}</li>)}</ul></>}
    {patterns.length > 0 && <><h3>Cross-chain review signals</h3><ul>{patterns.map(item => <li key={item.pattern_id}><strong>{item.title}</strong><br />{readable(item.pattern_type)} · {readable(item.confidence)} confidence</li>)}</ul></>}
    <h3>Later evidence</h3>
    <ul>{laterSignals.map(item => <li key={`${item.policy_instrument_id}:later`}>{readable(item.recurrence_signal)} — {item.recurrence_notes}</li>)}</ul>
    <p>Candidate relationships are not publication approval. Policy activity, implementation, service availability, utilization and outcomes remain distinct claims.</p>
  </section>
}
