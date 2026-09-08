import { createHash } from "node:crypto"

const clean = (value, limit = 1200) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit)
const STATUSES = new Set(["issued", "response_received", "action_claimed", "advocate_reports_complete", "advocate_reports_progress", "no_progress", "closed_unmet", "unknown"])
const hash = value => createHash("sha256").update(value).digest("hex").slice(0, 24)
const materialFingerprint = row => hash(JSON.stringify({
  recommendation_text: row.recommendation_text,
  responsible_organizations: row.responsible_organizations,
  response: row.response,
  status: row.status,
  claimed_action: row.claimed_action,
  implementation_evidence: row.implementation_evidence,
  outcome_evidence: row.outcome_evidence,
  unresolved_question: row.unresolved_question,
}))

export function normalizeRecommendationRow(input = {}) {
  const report = clean(input.report, 220)
  const number = clean(input.recommendation_number, 60)
  const text = clean(input.recommendation_text)
  const sourceUrl = /^https:\/\//.test(String(input.source_url || "")) ? clean(input.source_url, 500) : null
  if (!(report && number && text && sourceUrl)) throw new Error("farm_recommendation_required_fields_missing")
  const status = STATUSES.has(input.status) ? input.status : "unknown"
  const claimedAction = clean(input.claimed_action) || null
  const implementationEvidence = clean(input.implementation_evidence) || null
  const outcomeEvidence = clean(input.outcome_evidence) || null
  if (implementationEvidence && !clean(input.implementation_source_url, 500)) throw new Error("farm_recommendation_implementation_requires_source")
  if (outcomeEvidence && !clean(input.outcome_source_url, 500)) throw new Error("farm_recommendation_outcome_requires_source")
  return {
    schema_version: "farm-recommendation-ledger-row-v1",
    recommendation_id: clean(input.recommendation_id, 180) || `recommendation:${hash(`${report}|${number}|${text}`)}`,
    jurisdiction: clean(input.jurisdiction, 80),
    source_family: clean(input.source_family, 100),
    report,
    report_date: clean(input.report_date, 40) || null,
    recommendation_number: number,
    recommendation_text: text,
    responsible_organizations: [...new Set((input.responsible_organizations || []).map(item => clean(item, 180)).filter(Boolean))],
    response: clean(input.response) || null,
    status,
    claimed_action: claimedAction,
    implementation_evidence: implementationEvidence,
    implementation_source_url: implementationEvidence ? clean(input.implementation_source_url, 500) : null,
    outcome_evidence: outcomeEvidence,
    outcome_source_url: outcomeEvidence ? clean(input.outcome_source_url, 500) : null,
    independent_verification: clean(input.independent_verification) || null,
    unresolved_question: clean(input.unresolved_question) || null,
    indigenous_relevance: input.indigenous_relevance === true,
    healthcare_relevance: input.healthcare_relevance === true,
    mental_health_relevance: input.mental_health_relevance === true,
    funding_service_relevance: input.funding_service_relevance === true,
    primary_domain: clean(input.primary_domain, 80) || null,
    secondary_domains: [...new Set((input.secondary_domains || []).map(item => clean(item, 80)).filter(Boolean))],
    source_url: sourceUrl,
    last_reviewed: clean(input.last_reviewed, 40) || null,
    response_is_implementation: false,
    claimed_action_is_outcome: false,
    publication_authority: false,
    mutation_authority: false,
  }
}

export function buildRecommendationLedger(rows = [], { title = "Recommendation ledger", checkedAt = new Date().toISOString() } = {}) {
  const recommendations = rows.map(normalizeRecommendationRow)
  const ids = new Set()
  for (const row of recommendations) {
    if (ids.has(row.recommendation_id)) throw new Error("farm_recommendation_duplicate_id")
    ids.add(row.recommendation_id)
  }
  return {
    schema_version: "farm-recommendation-ledger-v1",
    title: clean(title, 220),
    checked_at: new Date(checkedAt).toISOString(),
    recommendations,
    counts: {
      recommendations: recommendations.length,
      responses: recommendations.filter(row => row.response).length,
      claimed_actions: recommendations.filter(row => row.claimed_action).length,
      implementation_evidence: recommendations.filter(row => row.implementation_evidence).length,
      outcome_evidence: recommendations.filter(row => row.outcome_evidence).length,
      indigenous_relevant: recommendations.filter(row => row.indigenous_relevance).length,
      healthcare_overlap: recommendations.filter(row => row.healthcare_relevance).length,
      mental_health_overlap: recommendations.filter(row => row.mental_health_relevance).length,
      funding_service_overlap: recommendations.filter(row => row.funding_service_relevance).length,
    },
    safeguards: { response_is_implementation: false, claimed_action_is_outcome: false, publication_authority: false, mutation_authority: false },
  }
}

export function diffRecommendationLedgers(previous = {}, current = {}) {
  const before = new Map((previous.recommendations || []).map(row => [row.recommendation_id, row]))
  const after = new Map((current.recommendations || []).map(row => [row.recommendation_id, row]))
  const newRows = []
  const updatedRows = []
  const unchangedRows = []
  for (const [recommendationId, row] of after) {
    const prior = before.get(recommendationId)
    if (!prior) newRows.push(recommendationId)
    else if (materialFingerprint(prior) !== materialFingerprint(row)) updatedRows.push(recommendationId)
    else unchangedRows.push(recommendationId)
  }
  const removedRows = [...before.keys()].filter(recommendationId => !after.has(recommendationId))
  const baseline = Math.max(before.size, 1)
  const anomaly = before.size > 0 && (newRows.length + removedRows.length) / baseline > 0.35
  return {
    schema_version: "farm-recommendation-ledger-diff-v1",
    checked: after.size,
    new_recommendations: newRows,
    updated_recommendations: updatedRows,
    unchanged_recommendations: unchangedRows,
    removed_recommendations: removedRows,
    anomaly_quarantine: anomaly,
    retain_previous_state_on_failure: true,
    publication_authority: false,
    mutation_authority: false,
  }
}
