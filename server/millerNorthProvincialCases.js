import { assertResearchPrivacy, FARM_FINDING_TYPES } from "./farmResearchViews.js"
import { DOSSIER_RELATIONSHIP_TYPES } from "./farmResearchDossier.js"

export const PROVINCIAL_CASE_SCHEMA = "miller-north-provincial-research-case-v1"
export const PROVINCES = new Set(["british_columbia", "saskatchewan", "alberta"])
export const CASE_PRIORITY_BANDS = new Set(["review_first", "review_next", "reference"])
export const GAP_OUTCOMES = new Set(["answered", "partially_answered", "information_request_candidate", "owner_review", "unresolved_publicly"])
export const CONTEXT_SCOPES = new Set(["directly_applicable", "response_context", "governance_context", "territorial_context_only"])
export const IMPLEMENTATION_DEPTHS = new Set(["acknowledgement", "commitment", "funding", "policy_adoption", "office_or_program_creation", "operational_implementation", "workforce_or_training_activity", "reporting", "evaluation", "measured_outcome"])

const caseIdPattern = /^mnrpc_[a-z0-9_]{3,120}$/
const sourceIdPattern = /^mnpcs_[a-z0-9_]{3,140}$/
const edgeIdPattern = /^mnpce_[a-z0-9_]{3,140}$/
const timelineIdPattern = /^mnpct_[a-z0-9_]{3,140}$/

const unique = values => new Set(values).size === values.length

export function validateProvincialCase(record, sourceRegistry) {
  assertResearchPrivacy(record)
  if (record.schema_version !== PROVINCIAL_CASE_SCHEMA || record.publication_scope !== "private_owner_review") throw new Error("provincial_case_scope_invalid")
  if (record.production_mutations !== 0 || record.publication_mutations !== 0) throw new Error("provincial_case_mutation_gate")
  if (!caseIdPattern.test(record.case_id || "") || !PROVINCES.has(record.province)) throw new Error("provincial_case_identity_invalid")
  if (!record.identity?.canonical_name || !record.identity?.subject_type || !record.identity?.location || !record.identity?.jurisdiction) throw new Error("provincial_case_subject_invalid")

  const owner = record.owner_view || {}
  if (!owner.what_happened || !owner.one_thing_to_remember || !owner.recommended_next_move) throw new Error("provincial_case_owner_view_missing")
  if (!Array.isArray(owner.why_this_matters) || owner.why_this_matters.length > 3 || !Array.isArray(owner.review_first) || owner.review_first.length > 3 || !Array.isArray(owner.review_next) || owner.review_next.length > 5 || !Array.isArray(owner.what_remains_uncertain) || owner.what_remains_uncertain.length > 5 || !Array.isArray(owner.next_questions) || owner.next_questions.length > 2) throw new Error("provincial_case_owner_view_limit")

  const registryIds = new Set(sourceRegistry.sources.map(source => source.source_family_id))
  const sources = record.sources || []
  if (!sources.length || !unique(sources.map(source => source.source_id))) throw new Error("provincial_case_source_duplicate")
  const sourceIds = new Set(sources.map(source => source.source_id))
  for (const source of sources) {
    if (!sourceIdPattern.test(source.source_id || "") || !registryIds.has(source.source_family_id) || !/^https:\/\//.test(source.url || "") || !source.title || !source.source_organization || !source.source_type || !source.evidence_role) throw new Error("provincial_case_source_invalid")
  }

  const edges = record.evidence_graph?.edges || []
  if (!edges.length || !unique(edges.map(edge => edge.edge_id))) throw new Error("provincial_case_edge_missing")
  for (const edge of edges) {
    if (!edgeIdPattern.test(edge.edge_id || "") || !edge.from_object_id || !edge.to_object_id || !DOSSIER_RELATIONSHIP_TYPES.has(edge.relationship_type) || !edge.neutral_summary || !["high", "medium", "low"].includes(edge.confidence)) throw new Error("provincial_case_edge_invalid")
    if (!edge.source_references?.length || !edge.source_references.every(id => sourceIds.has(id))) throw new Error("provincial_case_edge_source_missing")
    if (edge.context_scope && !CONTEXT_SCOPES.has(edge.context_scope)) throw new Error("provincial_case_context_scope_invalid")
  }

  const timeline = record.timeline || []
  if (!timeline.length || !unique(timeline.map(event => event.timeline_id))) throw new Error("provincial_case_timeline_missing")
  for (const event of timeline) {
    if (!timelineIdPattern.test(event.timeline_id || "") || !event.date_or_range || !event.event_type || !event.title || !event.short_description || !event.organization || !["high", "medium", "low"].includes(event.confidence)) throw new Error("provincial_case_timeline_invalid")
    if (!event.source_references?.length || !event.source_references.every(id => sourceIds.has(id))) throw new Error("provincial_case_timeline_source_missing")
  }

  for (const item of record.implementation_evidence || []) {
    if (!IMPLEMENTATION_DEPTHS.has(item.depth) || !item.summary || !item.source_references?.length || !item.source_references.every(id => sourceIds.has(id))) throw new Error("provincial_case_implementation_invalid")
  }

  const findings = record.findings || []
  if (!findings.every(finding => FARM_FINDING_TYPES.has(finding.finding_type) && CASE_PRIORITY_BANDS.has(finding.priority_band))) throw new Error("provincial_case_finding_invalid")
  if (findings.filter(finding => finding.priority_band === "review_first").length > 3 || findings.filter(finding => finding.priority_band === "review_next").length > 5) throw new Error("provincial_case_finding_limit")

  const followUps = record.knowledge_gap_follow_ups || []
  if (followUps.length > 1) throw new Error("provincial_case_gap_limit")
  for (const gap of followUps) {
    if (!gap.question || !GAP_OUTCOMES.has(gap.outcome) || !gap.stopping_reason || !gap.source_references?.every(id => sourceIds.has(id))) throw new Error("provincial_case_gap_invalid")
  }

  if (record.province === "british_columbia" && record.recommendation_tracker?.length !== 24) throw new Error("provincial_case_bc_tracker_invalid")
  if (record.province === "saskatchewan" && (record.identity.subject_type !== "cohort_systemic_pattern" || record.privacy?.anonymized_patients_preserved !== true)) throw new Error("provincial_case_sask_privacy_invalid")
  if (record.province === "alberta" && record.alberta_selection?.ordered_geographic_search_completed !== true) throw new Error("provincial_case_alberta_selection_invalid")

  return {
    case_id: record.case_id,
    province: record.province,
    sources: sources.length,
    edges: edges.length,
    timeline_events: timeline.length,
    findings: findings.length,
    owner_review: Boolean(record.owner_assessment?.owner_review),
  }
}

export function validateProvincialCaseSet(records, sourceRegistry) {
  if (!Array.isArray(records) || records.length !== 3) throw new Error("provincial_case_set_size_invalid")
  const results = records.map(record => validateProvincialCase(record, sourceRegistry))
  if (!unique(results.map(result => result.case_id)) || !unique(results.map(result => result.province))) throw new Error("provincial_case_set_duplicate")
  return {
    cases: results.length,
    provinces: Object.fromEntries([...PROVINCES].map(province => [province, results.filter(result => result.province === province).length])),
    sources: results.reduce((sum, result) => sum + result.sources, 0),
    evidence_edges: results.reduce((sum, result) => sum + result.edges, 0),
    timeline_events: results.reduce((sum, result) => sum + result.timeline_events, 0),
    findings: results.reduce((sum, result) => sum + result.findings, 0),
    owner_review_cases: results.filter(result => result.owner_review).length,
  }
}

export function buildRecommendationThemeSummary(recommendations, themes) {
  const byNumber = new Map(recommendations.map(item => [item.recommendation_number, item]))
  return themes.map(theme => {
    const items = theme.recommendation_numbers.map(number => byNumber.get(number)).filter(Boolean)
    return {
      theme_id: theme.theme_id,
      title: theme.title,
      recommendation_numbers: theme.recommendation_numbers,
      status_distribution: Object.fromEntries([...new Set(items.map(item => item.current_defensible_status))].sort().map(status => [status, items.filter(item => item.current_defensible_status === status).length])),
      strongest_implementation_evidence: theme.strongest_implementation_evidence,
      major_reporting_gap: theme.major_reporting_gap,
    }
  })
}
