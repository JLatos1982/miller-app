const number = value => Number.isFinite(Number(value)) ? Number(value) : 0

export function normalizeSourceYieldRow(row = {}) {
  const documentsChecked = number(row.documents_checked ?? row.pages_checked)
  const publishable = number(row.new_verified_incidents ?? row.new_verified_records ?? row.new_public_records)
  const strengthened = number(row.existing_incidents_strengthened ?? row.existing_public_events_strengthened)
  const accountabilityUpdates = number(row.accountability_updates ?? row.new_accountability_chains)
  const implementationEvidence = number(row.implementation_evidence_found ?? row.implementation_outcomes)
  const materialEvidence = publishable + strengthened + accountabilityUpdates + implementationEvidence
  return {
    source_family: String(row.source_family || "unknown"),
    documents_checked: documentsChecked,
    useful_qualifying_records: number(row.useful_qualifying_records ?? row.candidate_notices ?? row.unique_review_events ?? row.private_review_events),
    new_verified_incidents: publishable,
    provisional_leads: number(row.provisional_leads ?? row.private_owner_review_leads ?? row.private_review_events),
    existing_incidents_strengthened: strengthened,
    accountability_watch_chains_created: number(row.accountability_watch_chains_created ?? row.new_accountability_chains),
    accountability_updates: accountabilityUpdates,
    implementation_evidence_found: implementationEvidence,
    duplicates_suppressed: number(row.duplicates_suppressed ?? row.duplicate_documents_suppressed),
    rejected_or_noise: number(row.rejected_or_noise ?? row.rejected_events ?? row.rejected_false_positive_notices),
    technical_failures: number(row.technical_failures ?? row.source_inaccessible),
    external_cost_usd: number(row.external_cost_usd),
    manual_review_burden: String(row.manual_review_burden || "not_measured"),
    technical_reliability: String(row.technical_reliability || "not_measured"),
    publishable_records_per_100_documents: documentsChecked ? Number(((publishable / documentsChecked) * 100).toFixed(2)) : 0,
    material_evidence_per_100_documents: documentsChecked ? Number(((materialEvidence / documentsChecked) * 100).toFixed(2)) : 0,
  }
}

export function buildSourceYieldDashboard(rows = [], { generatedAt = new Date().toISOString() } = {}) {
  const sources = rows.map(normalizeSourceYieldRow).sort((a, b) =>
    b.material_evidence_per_100_documents - a.material_evidence_per_100_documents ||
    b.new_verified_incidents - a.new_verified_incidents ||
    a.source_family.localeCompare(b.source_family),
  )
  const totals = sources.reduce((sum, row) => {
    for (const key of ["documents_checked", "useful_qualifying_records", "new_verified_incidents", "provisional_leads", "existing_incidents_strengthened", "accountability_watch_chains_created", "accountability_updates", "implementation_evidence_found", "duplicates_suppressed", "rejected_or_noise", "technical_failures", "external_cost_usd"]) sum[key] += row[key]
    return sum
  }, { documents_checked: 0, useful_qualifying_records: 0, new_verified_incidents: 0, provisional_leads: 0, existing_incidents_strengthened: 0, accountability_watch_chains_created: 0, accountability_updates: 0, implementation_evidence_found: 0, duplicates_suppressed: 0, rejected_or_noise: 0, technical_failures: 0, external_cost_usd: 0 })
  return {
    schema_version: "miller-north-source-yield-dashboard-v1",
    generated_at: generatedAt,
    publication_status: "private_owner_review_only",
    interpretation_note: "Rates are transparent workload indicators, not quality grades. Small denominators can make rates unstable and should be read with the underlying document count.",
    totals,
    sources,
  }
}
