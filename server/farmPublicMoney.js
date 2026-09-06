import { assertResearchPrivacy, FARM_RESEARCH_DOMAINS } from "./farmResearchViews.js"

export const FUNDING_TRACE_LEVELS = new Set([
  "program_level_funding_confirmed",
  "recipient_level_funding_confirmed",
  "service_level_funding_confirmed",
  "operational_result_confirmed",
  "amount_not_service_attributable",
  "announced_not_verified",
  "partial_trace",
  "unclear",
  "owner_review_required",
])

export const FUNDING_TYPES = new Set(["budget_appropriation", "operating_grant", "capital_grant", "contribution_agreement", "transfer", "contract", "program_envelope", "unknown"])
export const RECIPIENT_TYPES = new Set(["ministry", "health_authority", "nonprofit", "first_nations_organization", "indigenous_government", "contractor", "research_institute", "multi_recipient_program", "unknown"])
export const MONEY_FINDING_TYPES = new Set(["major_funding_to_service_match", "funding_without_service_confirmation", "program_level_only", "recurring_public_investment", "audit_follow_up", "governance_funding_distinction", "new_resource_discovery", "implementation_gap", "useful_context"])
export const MONEY_EDGE_TYPES = new Set(["announced_by", "funded_by", "received_by", "funds", "linked_to_policy", "linked_to_commitment", "linked_to_resource", "implemented_by", "operationalized_as", "reported_by", "audited_by"])

const idPattern = /^fmoney_[a-z0-9_]{3,100}$/
const edgePattern = /^fmedge_[a-z0-9_]{3,120}$/

export function validateFundingRecord(record, sourceFamilyIds = new Set()) {
  assertResearchPrivacy(record)
  if (!idPattern.test(record.funding_record_id || "")) throw new Error("farm_money_id_invalid")
  if (!FARM_RESEARCH_DOMAINS.has(record.domain)) throw new Error("farm_money_domain_invalid")
  if (record.publication_state !== "private_owner_review") throw new Error("farm_money_publication_gate")
  if (!FUNDING_TRACE_LEVELS.has(record.trace_level) || !FUNDING_TYPES.has(record.funding_type) || !RECIPIENT_TYPES.has(record.recipient_type)) throw new Error("farm_money_classification_invalid")
  if (record.currency !== "CAD") throw new Error("farm_money_currency_invalid")
  if (record.amount != null && (!Number.isFinite(record.amount) || record.amount < 0)) throw new Error("farm_money_amount_invalid")
  if (record.amount == null && !record.amount_note) throw new Error("farm_money_missing_amount_note")
  if (record.owner_review && !record.owner_review_reason) throw new Error("farm_money_owner_review_gate")
  if (["service_level_funding_confirmed", "operational_result_confirmed"].includes(record.trace_level) && !record.linked_services?.length) throw new Error("farm_money_service_link_missing")
  if (record.attribution_scope === "program" && record.amount != null && record.linked_services?.length && !/not.*attribut|program.level|cannot.*allocat/i.test(record.amount_note || "")) throw new Error("farm_money_program_attribution_caution_missing")
  const edgeIds = new Set()
  for (const edge of record.evidence_edges || []) {
    if (!edgePattern.test(edge.edge_id || "") || edgeIds.has(edge.edge_id) || !MONEY_EDGE_TYPES.has(edge.relationship_type)) throw new Error("farm_money_edge_invalid")
    edgeIds.add(edge.edge_id)
    if (!edge.from_object_id || !edge.to_object_id || !edge.neutral_summary || !["high", "medium", "low"].includes(edge.confidence)) throw new Error("farm_money_edge_incomplete")
    if (!edge.source_references?.length) throw new Error("farm_money_edge_source_missing")
    for (const source of edge.source_references) if (!sourceFamilyIds.has(source.source_family_id) || !/^https:\/\//.test(source.source_url || "") || !source.source_role) throw new Error("farm_money_edge_source_invalid")
  }
  if ((record.evidence_edges || []).length < 2) throw new Error("farm_money_edges_missing")
  return true
}

export function validatePublicMoneyDataset(dataset, sourceRegistry) {
  assertResearchPrivacy(dataset)
  if (dataset.schema_version !== "farm-public-money-pilot-v1" || dataset.publication_scope !== "private_owner_review") throw new Error("farm_money_dataset_scope_invalid")
  if (dataset.production_mutations !== 0 || dataset.publication_mutations !== 0) throw new Error("farm_money_dataset_mutation_gate")
  const sourceFamilyIds = new Set(sourceRegistry.sources.map(source => source.source_family_id))
  const ids = new Set()
  for (const record of dataset.records || []) {
    validateFundingRecord(record, sourceFamilyIds)
    if (ids.has(record.funding_record_id)) throw new Error("farm_money_duplicate_id")
    ids.add(record.funding_record_id)
  }
  const domains = Object.fromEntries([...FARM_RESEARCH_DOMAINS].map(domain => [domain, dataset.records.filter(record => record.domain === domain).length]))
  const traces = Object.fromEntries([...FUNDING_TRACE_LEVELS].map(level => [level, dataset.records.filter(record => record.trace_level === level).length]).filter(([, count]) => count))
  return { records: ids.size, domains, traces, evidence_edges: dataset.records.reduce((sum, record) => sum + record.evidence_edges.length, 0), owner_review: dataset.records.filter(record => record.owner_review).length }
}

export function scoreMoneyFinding(finding) {
  assertResearchPrivacy(finding)
  if (!MONEY_FINDING_TYPES.has(finding.finding_type)) throw new Error("farm_money_finding_type_invalid")
  const score = Math.min(100,
    (finding.official_primary_source ? 25 : 0) +
    (finding.recipient_confirmed ? 15 : 0) +
    (finding.service_link_confirmed ? 20 : 0) +
    (finding.operational_evidence ? 20 : 0) +
    (finding.audit_follow_up ? 8 : 0) +
    (finding.governance_distinction ? 6 : 0) +
    (finding.owner_review ? 6 : 0))
  return { priority_score: score, priority_band: score >= 75 ? "review_first" : score >= 50 ? "review_next" : score >= 25 ? "reference" : "low_priority", notice: "Review priority only; not a judgment of adequacy, efficiency, compliance, or value for money." }
}

export function rankMoneyFindings(findings = []) {
  const ids = new Set()
  return findings.map(finding => {
    if (!/^fmfind_[a-z0-9_]{3,100}$/.test(finding.finding_id || "") || ids.has(finding.finding_id)) throw new Error("farm_money_finding_id_invalid")
    ids.add(finding.finding_id)
    return { ...finding, significance: scoreMoneyFinding(finding) }
  }).sort((a, b) => b.significance.priority_score - a.significance.priority_score || a.finding_id.localeCompare(b.finding_id))
}

export function validateCanonicalResearchFixtures(dataset, sourceRegistry) {
  assertResearchPrivacy(dataset)
  if (dataset.schema_version !== "farm-canonical-research-fixtures-v1" || dataset.publication_scope !== "private_validation_only" || dataset.publication_decision !== "none") throw new Error("farm_fixture_scope_invalid")
  const sourceFamilyIds = new Set(sourceRegistry.sources.map(source => source.source_family_id))
  const ids = new Set()
  for (const fixture of dataset.fixtures || []) {
    if (!/^farm_fixture_[a-z0-9_]{3,120}$/.test(fixture.fixture_id || "") || ids.has(fixture.fixture_id)) throw new Error("farm_fixture_id_invalid")
    ids.add(fixture.fixture_id)
    if (!FARM_RESEARCH_DOMAINS.has(fixture.domain) || !fixture.subject?.id || fixture.confidence !== "high" || !fixture.validation_value) throw new Error("farm_fixture_record_invalid")
    if (!fixture.source_set?.length || !fixture.evidence_edges?.length || !fixture.relationship_types?.length) throw new Error("farm_fixture_evidence_missing")
    for (const source of fixture.source_set) if (!sourceFamilyIds.has(source.source_family_id) || !/^https:\/\//.test(source.url || "") || !source.role) throw new Error("farm_fixture_source_invalid")
  }
  return { fixtures: ids.size, miller: dataset.fixtures.filter(item => item.domain === "miller_addictions").length, miller_north: dataset.fixtures.filter(item => item.domain === "miller_north_indigenous_healthcare").length }
}
