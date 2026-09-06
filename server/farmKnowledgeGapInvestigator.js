import { assertResearchPrivacy } from "./farmResearchViews.js"
import { validateResearchDossierSet } from "./farmResearchDossier.js"

export const KNOWLEDGE_GAP_STATUSES = new Set([
  "implemented",
  "substantially_implemented",
  "partially_implemented",
  "implementation_underway",
  "implementation_announced",
  "implementation_evidence_fragmentary",
  "not_currently_disaggregated_in_public_reporting",
  "no_clear_public_evidence_found",
  "implementation_status_unclear",
  "owner_review_required",
])

export const KNOWLEDGE_GAP_CATEGORIES = new Set([
  "further_web_research",
  "organization_specific_follow_up",
  "FOI_candidate",
  "owner_review",
  "likely_not_publicly_resolvable",
])

export const IMPLEMENTATION_DEPTHS = new Set([
  "acknowledgement",
  "commitment",
  "funding",
  "policy_adoption",
  "office_or_program_creation",
  "operational_implementation",
  "workforce_or_training_activity",
  "reporting",
  "evaluation",
  "measured_outcome",
])

const sourceIdPattern = /^ips_source_[a-z0-9_]{3,100}$/
const recommendationIdPattern = /^ips_recommendation_(0[1-9]|1[0-9]|2[0-4])$/

export function validateCanonicalDossierWorkflow({ dossiers, fixtures, sourceRegistry }) {
  const dossierValidation = validateResearchDossierSet(dossiers, sourceRegistry)
  const fixtureIds = new Set((fixtures.fixtures || []).map(item => item.fixture_id))
  const dossierFixtureIds = new Set(dossiers.map(item => item.canonical_fixture_id))
  if (fixtures.schema_version !== "farm-canonical-research-fixtures-v1" || fixtureIds.size !== 4) throw new Error("canonical_dossier_fixture_set_invalid")
  if (![...dossierFixtureIds].every(id => fixtureIds.has(id))) throw new Error("canonical_dossier_fixture_link_invalid")
  if (dossierValidation.dossiers !== 4 || dossierValidation.domains.miller_addictions !== 2 || dossierValidation.domains.miller_north_indigenous_healthcare !== 2) throw new Error("canonical_dossier_domain_separation_invalid")
  return {
    workflow_id: "farm-research-dossier-v1",
    status: "canonical_private_regression_workflow",
    fixtures: 4,
    domains: dossierValidation.domains,
    regression: dossierValidation,
  }
}

export function validateInPlainSightLedger(ledger) {
  assertResearchPrivacy(ledger)
  if (ledger.schema_version !== "farm-knowledge-gap-recommendation-ledger-v1" || ledger.publication_scope !== "private_owner_review") throw new Error("ips_ledger_scope_invalid")
  if (ledger.production_mutations !== 0 || ledger.publication_mutations !== 0 || ledger.foi_requests_sent !== 0) throw new Error("ips_ledger_mutation_gate")
  if (ledger.investigation?.target_dossier_id !== "farm_dossier_miller_north_in_plain_sight_reporting_v1") throw new Error("ips_ledger_target_invalid")

  const sources = new Set()
  for (const source of ledger.source_catalog || []) {
    if (!sourceIdPattern.test(source.source_id || "") || sources.has(source.source_id)) throw new Error("ips_ledger_source_id_invalid")
    if (!/^https:\/\//.test(source.url || "") || !source.title || !source.source_organization || !source.source_family_id || !source.source_type) throw new Error("ips_ledger_source_invalid")
    sources.add(source.source_id)
  }
  if (sources.size < 3) throw new Error("ips_ledger_sources_missing")

  const records = ledger.recommendations || []
  if (records.length !== 24) throw new Error("ips_ledger_exactly_24_required")
  const numbers = new Set()
  for (const record of records) {
    if (!recommendationIdPattern.test(record.recommendation_id || "") || record.recommendation_id !== `ips_recommendation_${String(record.recommendation_number).padStart(2, "0")}`) throw new Error("ips_ledger_recommendation_id_invalid")
    if (!Number.isInteger(record.recommendation_number) || record.recommendation_number < 1 || record.recommendation_number > 24 || numbers.has(record.recommendation_number)) throw new Error("ips_ledger_recommendation_number_invalid")
    numbers.add(record.recommendation_number)
    if (!record.neutral_recommendation_summary || !record.original_responsible_parties?.length || !record.relevant_organizations?.length || record.original_recommendation_date !== "2020-11-30") throw new Error("ips_ledger_recommendation_incomplete")
    if (!KNOWLEDGE_GAP_STATUSES.has(record.current_defensible_status) || !["high", "medium", "low"].includes(record.confidence)) throw new Error("ips_ledger_status_invalid")
    if (!record.latest_evidence_date || !record.reporting_limitation || !record.evidence_classification) throw new Error("ips_ledger_evidence_summary_missing")
    if (!record.source_references?.length || !record.source_references.every(id => sources.has(id))) throw new Error("ips_ledger_source_reference_invalid")
    for (const action of record.implementation_actions || []) {
      if (!action.date || !action.summary || !IMPLEMENTATION_DEPTHS.has(action.depth) || !action.source_references?.length || !action.source_references.every(id => sources.has(id))) throw new Error("ips_ledger_action_invalid")
    }
    for (const evidence of record.implementation_evidence || []) {
      if (!evidence.summary || !evidence.source_references?.length || !evidence.source_references.every(id => sources.has(id))) throw new Error("ips_ledger_evidence_invalid")
    }
    if (record.owner_review_flag && !record.owner_review_reason) throw new Error("ips_ledger_owner_review_reason_missing")
    if (!KNOWLEDGE_GAP_CATEGORIES.has(record.remaining_gap_category) || !record.stopping_reason) throw new Error("ips_ledger_gap_invalid")
    if (["implemented", "substantially_implemented"].includes(record.current_defensible_status) && !(record.implementation_actions || []).some(action => ["policy_adoption", "office_or_program_creation", "operational_implementation"].includes(action.depth))) throw new Error("ips_ledger_completion_evidence_too_weak")
  }
  if (![...numbers].every(number => number >= 1 && number <= 24)) throw new Error("ips_ledger_sequence_invalid")

  const statusCounts = Object.fromEntries([...KNOWLEDGE_GAP_STATUSES].map(status => [status, records.filter(item => item.current_defensible_status === status).length]).filter(([, count]) => count))
  const coverageCounts = records.reduce((counts, record) => {
    counts[record.public_evidence_coverage] = (counts[record.public_evidence_coverage] || 0) + 1
    return counts
  }, {})
  return {
    recommendations: records.length,
    sources: sources.size,
    status_counts: statusCounts,
    coverage_counts: coverageCounts,
    owner_review: records.filter(item => item.owner_review_flag).length,
    recommendations_with_post_2023_evidence: records.filter(item => item.latest_evidence_date > "2023-12-31").length,
    recommendations_with_follow_up_signals: records.filter(item => item.follow_up_signals?.length).length,
  }
}

export function validateKnowledgeUpdateProjection(projection, ledgerValidation) {
  assertResearchPrivacy(projection)
  if (projection.schema_version !== "farm-research-dossier-knowledge-update-v1" || projection.projection_id !== "farm_dossier_miller_north_in_plain_sight_reporting_v2") throw new Error("knowledge_update_projection_invalid")
  if (projection.base_dossier_id !== "farm_dossier_miller_north_in_plain_sight_reporting_v1" || projection.ledger_id !== "ips_24_recommendation_public_evidence_ledger_v1") throw new Error("knowledge_update_lineage_invalid")
  if (projection.production_mutations !== 0 || projection.publication_mutations !== 0 || projection.foi_requests_sent !== 0) throw new Error("knowledge_update_mutation_gate")
  if (projection.updated_knowledge_state.recommendations_assessed !== ledgerValidation.recommendations || projection.updated_knowledge_state.status_counts.implemented !== ledgerValidation.status_counts.implemented) throw new Error("knowledge_update_counts_invalid")
  if (projection.public_reporting_finding.comprehensive_current_24_row_ledger_located !== false || !projection.public_reporting_finding.official_limitation_statement) throw new Error("knowledge_update_reporting_finding_invalid")
  return {
    projection_id: projection.projection_id,
    recommendations_assessed: ledgerValidation.recommendations,
    reporting_gap_preserved: true,
    production_mutations: 0,
    publication_mutations: 0,
  }
}
