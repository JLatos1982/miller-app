import { assertResearchPrivacy, FARM_RESEARCH_DOMAINS, LEGAL_GOVERNMENT_RELATIONSHIP_TYPES } from "./farmResearchViews.js"
import { MONEY_EDGE_TYPES } from "./farmPublicMoney.js"

const compact = value => String(value ?? "").replace(/\s+/g, " ").trim()
const bullets = values => values.map(value => `- ${value}`).join("\n")

export const DOSSIER_QUALITY_BANDS = new Set(["strong", "moderate", "incomplete"])
export const DOSSIER_GAP_TYPES = new Set(["web_research", "official_source_follow_up", "FOI_candidate", "owner_review", "likely_unresolvable_publicly"])
export const DOSSIER_CONTEXT_SCOPES = new Set(["directly_applicable", "response_context", "governance_context", "territorial_context_only"])
export const DOSSIER_FUNDING_SCOPES = new Set(["program_level", "recipient_level", "project_level", "service_level", "not_applicable"])
export const DOSSIER_IMPLEMENTATION_STATES = new Set(["announced", "funded", "operational", "partially_implemented", "implemented", "reporting_unclear"])
export const DOSSIER_PRIORITY_BANDS = new Set(["review_first", "review_next", "reference", "low_priority"])
export const DOSSIER_RELATIONSHIP_TYPES = new Set([
  ...LEGAL_GOVERNMENT_RELATIONSHIP_TYPES,
  ...MONEY_EDGE_TYPES,
  "documents",
  "operated_by",
  "reports_on",
  "recommends",
  "limits_reporting_for",
  "has_context",
])

const dossierIdPattern = /^farm_dossier_[a-z0-9_]{3,120}_v1$/
const edgeIdPattern = /^fdedge_[a-z0-9_]{3,140}$/
const timelineIdPattern = /^fdtimeline_[a-z0-9_]{3,140}$/
const gapIdPattern = /^fdgap_[a-z0-9_]{3,140}$/

const section = (title, content) => `## ${title}\n\n${content || "None documented in this dossier."}\n`
const sourceLine = source => `[${source.title}](${source.url}) — ${source.source_organization}; ${source.role}`

export function assessDossierCompleteness(dossier = {}) {
  assertResearchPrivacy(dossier)
  const edges = dossier.evidence_graph?.edges || []
  const officialSources = (dossier.source_set || []).filter(source => source.authority_class === "official_primary" || source.authority_class === "indigenous_government_or_organization")
  const unresolved = dossier.unresolved_questions || []
  const dimensions = {
    identity_confidence: dossier.identity?.canonical_name && dossier.identity?.identifiers?.length ? 2 : dossier.identity?.canonical_name ? 1 : 0,
    primary_source_coverage: officialSources.length >= 3 && edges.every(edge => edge.source_references?.length) ? 2 : officialSources.length ? 1 : 0,
    timeline_completeness: (dossier.timeline || []).length >= 4 ? 2 : (dossier.timeline || []).length >= 2 ? 1 : 0,
    policy_legal_coverage: (dossier.policy_law_governance || []).length >= 2 ? 2 : (dossier.policy_law_governance || []).length ? 1 : 0,
    funding_traceability: (dossier.funding_public_money || []).some(item => ["project_level", "service_level"].includes(item.attribution_scope)) ? 2 : (dossier.funding_public_money || []).length ? 1 : 0,
    implementation_evidence: (dossier.implementation_evidence || []).some(item => ["operational", "implemented"].includes(item.state)) ? 2 : (dossier.implementation_evidence || []).length ? 1 : 0,
    follow_up_evidence: (dossier.audits_follow_up || []).length >= 2 ? 2 : (dossier.audits_follow_up || []).length ? 1 : 0,
    unresolved_question_burden: unresolved.length <= 2 ? 2 : unresolved.length <= 4 ? 1 : 0,
  }
  const score = Object.values(dimensions).reduce((sum, value) => sum + value, 0)
  const band = score >= 13 ? "strong" : score >= 8 ? "moderate" : "incomplete"
  return {
    band,
    score,
    maximum_score: 16,
    dimensions,
    notice: "Research completeness only; this is not a moral, effectiveness, compliance, or reputational score.",
  }
}

export function validateResearchDossier(dossier, sourceRegistry) {
  assertResearchPrivacy(dossier)
  if (dossier.schema_version !== "farm-research-dossier-v1" || dossier.publication_scope !== "private_owner_review") throw new Error("farm_dossier_scope_invalid")
  if (dossier.production_mutations !== 0 || dossier.publication_mutations !== 0) throw new Error("farm_dossier_mutation_gate")
  if (!dossierIdPattern.test(dossier.dossier_id || "") || !FARM_RESEARCH_DOMAINS.has(dossier.identity?.domain)) throw new Error("farm_dossier_identity_invalid")
  if (!dossier.canonical_fixture_id || !dossier.identity?.canonical_name || !dossier.identity?.subject_type || !dossier.identity?.identifiers?.length) throw new Error("farm_dossier_subject_invalid")

  const synthesis = dossier.owner_synthesis || {}
  if (!synthesis.what_this_is || !synthesis.why_it_matters || !synthesis.recommended_next_move) throw new Error("farm_dossier_synthesis_missing")
  if (!Array.isArray(synthesis.what_we_learned) || synthesis.what_we_learned.length > 5 || !Array.isArray(synthesis.what_remains_unclear) || synthesis.what_remains_unclear.length > 5) throw new Error("farm_dossier_synthesis_limit")

  const registryIds = new Set((sourceRegistry.sources || []).map(source => source.source_family_id))
  const sourceIds = new Set()
  for (const source of dossier.source_set || []) {
    if (!/^fdsource_[a-z0-9_]{3,140}$/.test(source.source_id || "") || sourceIds.has(source.source_id)) throw new Error("farm_dossier_source_id_invalid")
    sourceIds.add(source.source_id)
    if (!registryIds.has(source.source_family_id) || !/^https:\/\//.test(source.url || "") || !source.title || !source.source_organization || !source.role) throw new Error("farm_dossier_source_invalid")
  }
  if (!sourceIds.size) throw new Error("farm_dossier_sources_missing")

  const edgeIds = new Set()
  for (const edge of dossier.evidence_graph?.edges || []) {
    if (!edgeIdPattern.test(edge.edge_id || "") || edgeIds.has(edge.edge_id) || !DOSSIER_RELATIONSHIP_TYPES.has(edge.relationship_type)) throw new Error("farm_dossier_edge_invalid")
    edgeIds.add(edge.edge_id)
    if (!edge.from_object_id || !edge.to_object_id || !edge.neutral_summary || !["high", "medium", "low"].includes(edge.confidence)) throw new Error("farm_dossier_edge_incomplete")
    if (!edge.source_references?.length || !edge.source_references.every(sourceId => sourceIds.has(sourceId))) throw new Error("farm_dossier_edge_source_missing")
    if (edge.funding_scope && !DOSSIER_FUNDING_SCOPES.has(edge.funding_scope)) throw new Error("farm_dossier_funding_scope_invalid")
    if (edge.context_scope && !DOSSIER_CONTEXT_SCOPES.has(edge.context_scope)) throw new Error("farm_dossier_context_scope_invalid")
    if (edge.implementation_state && !DOSSIER_IMPLEMENTATION_STATES.has(edge.implementation_state)) throw new Error("farm_dossier_implementation_state_invalid")
  }
  if (!edgeIds.size) throw new Error("farm_dossier_edges_missing")

  const timelineIds = new Set()
  for (const event of dossier.timeline || []) {
    if (!timelineIdPattern.test(event.timeline_id || "") || timelineIds.has(event.timeline_id) || !event.date_or_range || !event.event_type || !event.title || !event.short_description || !event.organization || !["high", "medium", "low"].includes(event.confidence)) throw new Error("farm_dossier_timeline_invalid")
    timelineIds.add(event.timeline_id)
    if (!event.source_references?.length || !event.source_references.every(sourceId => sourceIds.has(sourceId))) throw new Error("farm_dossier_timeline_source_missing")
  }

  const gapIds = new Set()
  for (const gap of dossier.unresolved_questions || []) {
    if (!gapIdPattern.test(gap.gap_id || "") || gapIds.has(gap.gap_id) || !DOSSIER_GAP_TYPES.has(gap.gap_type) || !gap.question || !gap.rationale || !DOSSIER_PRIORITY_BANDS.has(gap.priority)) throw new Error("farm_dossier_gap_invalid")
    gapIds.add(gap.gap_id)
  }

  for (const candidate of dossier.foi_candidates || []) {
    if (candidate.status !== "draft_not_sent" || !candidate.organization || !candidate.exact_missing_information || !candidate.bounded_date_range || !candidate.why_it_matters || !candidate.suggested_record_category) throw new Error("farm_dossier_foi_invalid")
    if (!candidate.public_sources_checked?.length || !candidate.exclusions?.includes("private_patient_information")) throw new Error("farm_dossier_foi_safeguard_missing")
  }

  if (!DOSSIER_PRIORITY_BANDS.has(dossier.owner_assessment?.significance) || !["high", "medium", "low"].includes(dossier.owner_assessment?.confidence)) throw new Error("farm_dossier_owner_assessment_invalid")
  if (dossier.owner_assessment.owner_review && !dossier.owner_assessment.owner_review_reason) throw new Error("farm_dossier_owner_review_gate")
  const calculated = assessDossierCompleteness(dossier)
  if (!DOSSIER_QUALITY_BANDS.has(dossier.quality_assessment?.band) || JSON.stringify(dossier.quality_assessment) !== JSON.stringify(calculated)) throw new Error("farm_dossier_quality_invalid")

  return {
    dossier_id: dossier.dossier_id,
    domain: dossier.identity.domain,
    sources: sourceIds.size,
    edges: edgeIds.size,
    timeline_events: timelineIds.size,
    gaps: gapIds.size,
    foi_candidates: (dossier.foi_candidates || []).length,
    quality_band: calculated.band,
    owner_review: Boolean(dossier.owner_assessment.owner_review),
  }
}

export function validateResearchDossierSet(dossiers, sourceRegistry) {
  const ids = new Set()
  const results = dossiers.map(dossier => {
    const result = validateResearchDossier(dossier, sourceRegistry)
    if (ids.has(result.dossier_id)) throw new Error("farm_dossier_duplicate_id")
    ids.add(result.dossier_id)
    return result
  })
  return {
    dossiers: results.length,
    domains: Object.fromEntries([...FARM_RESEARCH_DOMAINS].map(domain => [domain, results.filter(item => item.domain === domain).length])),
    sources: results.reduce((sum, item) => sum + item.sources, 0),
    edges: results.reduce((sum, item) => sum + item.edges, 0),
    timeline_events: results.reduce((sum, item) => sum + item.timeline_events, 0),
    gaps: results.reduce((sum, item) => sum + item.gaps, 0),
    foi_candidates: results.reduce((sum, item) => sum + item.foi_candidates, 0),
    quality_bands: Object.fromEntries([...DOSSIER_QUALITY_BANDS].map(band => [band, results.filter(item => item.quality_band === band).length])),
    owner_review: results.filter(item => item.owner_review).length,
  }
}

export function generateDossierOwnerReport(dossier) {
  const synthesis = dossier.owner_synthesis
  const quality = dossier.quality_assessment
  return `# Private Research Dossier — ${dossier.identity.canonical_name}\n\n> Private owner-review artifact. Not a publication decision.\n\n## Owner synthesis\n\n### What this is\n\n${compact(synthesis.what_this_is)}\n\n### What we learned\n\n${bullets(synthesis.what_we_learned)}\n\n### Why it matters\n\n${compact(synthesis.why_it_matters)}\n\n### What remains unclear\n\n${bullets(synthesis.what_remains_unclear)}\n\n### Recommended next move\n\n${compact(synthesis.recommended_next_move)}\n\n${section("Identity", `${dossier.identity.subject_type}; ${dossier.identity.location_jurisdiction}; ${dossier.identity.status}.`)}\n${section("Timeline", bullets(dossier.timeline.map(event => `${event.date_or_range} — ${event.title}: ${event.short_description}`)))}\n${section("Organizations", bullets(dossier.organizations.map(item => `${item.name} — ${item.role}`)))}\n${section("Policy / law / governance", bullets(dossier.policy_law_governance.map(item => `${item.title} (${item.context_scope}): ${item.summary}`)))}\n${section("Accountability", bullets(dossier.accountability.map(item => `${item.title}: ${item.summary}`)))}\n${section("Funding / public money", bullets(dossier.funding_public_money.map(item => `${item.title} (${item.attribution_scope}): ${item.summary}`)))}\n${section("Service / real-world implementation", bullets(dossier.service_real_world_implementation.map(item => `${item.title}: ${item.summary}`)))}\n${section("Implementation evidence", bullets(dossier.implementation_evidence.map(item => `${item.state} — ${item.summary}`)))}\n${section("Audits / follow-up", bullets(dossier.audits_follow_up.map(item => `${item.title}: ${item.summary}`)))}\n${section("Unresolved questions", bullets(dossier.unresolved_questions.map(item => `${item.question} [${item.gap_type}; ${item.priority}]`)))}\n${section("Evidence graph", bullets(dossier.evidence_graph.edges.map(edge => `${edge.from_object_id} → ${edge.relationship_type} → ${edge.to_object_id} (${edge.confidence}): ${edge.neutral_summary}`)))}\n${section("Owner assessment", `Significance: ${dossier.owner_assessment.significance}. Confidence: ${dossier.owner_assessment.confidence}. Owner review: ${dossier.owner_assessment.owner_review ? "required" : "not currently required"}. ${dossier.owner_assessment.recommended_next_action}`)}\n${section("Research completeness", `${quality.band} (${quality.score}/${quality.maximum_score}). ${quality.notice}`)}\n${section("Sources", bullets(dossier.source_set.map(sourceLine)))}\n`.trimEnd() + "\n"
}

export function generateDossierResearchBrief(dossier) {
  const uniqueSources = dossier.source_set.map(sourceLine)
  return `# Research Brief — ${dossier.identity.canonical_name}\n\n> Private draft for owner review.\n\n## Executive summary\n\n${compact(dossier.owner_synthesis.what_this_is)} ${compact(dossier.owner_synthesis.why_it_matters)}\n\n## Scope\n\nThis brief assembles existing private ${dossier.identity.domain === "miller_addictions" ? "Miller addictions" : "Miller North Indigenous healthcare accountability"} evidence for ${dossier.identity.canonical_name}. It does not make a publication decision, legal conclusion, funding-performance judgment or causal claim.\n\n## Timeline\n\n${bullets(dossier.timeline.map(event => `${event.date_or_range}: ${event.title} — ${event.short_description}`))}\n\n## Findings\n\n${bullets(dossier.owner_synthesis.what_we_learned)}\n\n## Evidence\n\n${bullets(dossier.evidence_graph.edges.map(edge => `${edge.neutral_summary} [${edge.source_references.join(", ")}]`))}\n\n## Limitations\n\n${compact(dossier.limitations)}\n\n## Unresolved questions\n\n${bullets(dossier.unresolved_questions.map(gap => gap.question))}\n\n## Sources\n\n${bullets(uniqueSources)}\n`.trimEnd() + "\n"
}
