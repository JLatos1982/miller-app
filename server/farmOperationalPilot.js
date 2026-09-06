import {
  FARM_RESEARCH_DOMAINS,
  LEGAL_GOVERNMENT_RELATIONSHIP_TYPES,
  assertResearchPrivacy,
  rankOwnerFindings,
  validateOfficialSourceRegistry,
} from "./farmResearchViews.js"

export const PILOT_CAPABILITY_STATES = new Set(["working", "working_with_limits", "prototype", "needs_more_design"])
export const SOURCE_ACCESS_STATES = new Set(["reliable", "reliable_pdf", "working_with_limits", "unavailable"])
export const TREATY_CONTEXT_STATES = new Set(["direct_governance_source", "territorial_context_only", "not_established", "not_applicable"])

function validateEdges(edges, registryIds, objectId) {
  if (!Array.isArray(edges) || edges.length < 2) throw new Error(`farm_pilot_edges_missing:${objectId}`)
  const ids = new Set()
  for (const edge of edges) {
    if (!/^fedge_[a-z0-9_]{3,120}$/.test(edge.edge_id || "") || ids.has(edge.edge_id)) throw new Error("farm_pilot_edge_id_invalid")
    ids.add(edge.edge_id)
    if (!LEGAL_GOVERNMENT_RELATIONSHIP_TYPES.has(edge.relationship_type)) throw new Error("farm_pilot_relationship_invalid")
    if (!edge.from_object_id || !edge.to_object_id || !edge.neutral_summary || !["high", "medium", "low"].includes(edge.confidence)) throw new Error("farm_pilot_edge_invalid")
    if (!Array.isArray(edge.source_references) || !edge.source_references.length) throw new Error("farm_pilot_edge_source_missing")
    for (const source of edge.source_references) {
      if (!registryIds.has(source.source_family_id) || !/^https:\/\//.test(source.source_url || "") || !source.document_class || !source.source_role) throw new Error("farm_pilot_edge_source_invalid")
    }
    if (edge.owner_review_flag && !edge.owner_review_reason) throw new Error("farm_pilot_edge_owner_review_gate")
  }
}

export function validateFarmOperationalPilot(dataset, registry) {
  assertResearchPrivacy(dataset)
  const registrySummary = validateOfficialSourceRegistry(registry)
  if (dataset.schema_version !== "farm-cross-domain-operational-pilot-v1" || dataset.publication_scope !== "private_owner_review") throw new Error("farm_pilot_scope_invalid")
  if (dataset.production_mutations !== 0 || dataset.publication_mutations !== 0) throw new Error("farm_pilot_mutation_gate")
  const registryIds = new Set(registry.sources.map(item => item.source_family_id))
  const tracks = dataset.tracks || {}
  const miller = tracks.miller?.resources || []
  const north = tracks.miller_north?.chains || []
  if (miller.length < 5 || miller.length > 8 || north.length < 5 || north.length > 8) throw new Error("farm_pilot_track_size_invalid")
  if (tracks.miller.research_domain !== "miller_addictions" || tracks.miller_north.research_domain !== "miller_north_indigenous_healthcare") throw new Error("farm_pilot_domain_invalid")
  if (![tracks.miller.research_domain, tracks.miller_north.research_domain].every(domain => FARM_RESEARCH_DOMAINS.has(domain))) throw new Error("farm_pilot_domain_unknown")
  const objectIds = new Set()
  for (const item of [...miller, ...north]) {
    const objectId = item.backstory_id || item.context_id
    if (!objectId || objectIds.has(objectId)) throw new Error("farm_pilot_object_id_invalid")
    objectIds.add(objectId)
    if (item.publication_state !== "private_owner_review") throw new Error("farm_pilot_publication_gate")
    validateEdges(item.evidence_edges, registryIds, objectId)
  }
  for (const item of north) if (!TREATY_CONTEXT_STATES.has(item.treaty_context?.status)) throw new Error("farm_pilot_treaty_context_invalid")
  const performanceIds = new Set()
  for (const item of dataset.source_registry_performance || []) {
    if (!registryIds.has(item.source_family_id) || performanceIds.has(item.source_family_id) || !SOURCE_ACCESS_STATES.has(item.access_reliability)) throw new Error("farm_pilot_source_performance_invalid")
    performanceIds.add(item.source_family_id)
  }
  const ranked = rankOwnerFindings(dataset.findings || [])
  return {
    miller_resources: miller.length,
    miller_north_chains: north.length,
    evidence_edges: [...miller, ...north].reduce((sum, item) => sum + item.evidence_edges.length, 0),
    source_families_used: performanceIds.size,
    source_registry_size: registrySummary.sources,
    meaningful_source_families: (dataset.source_registry_performance || []).filter(item => item.meaningful_evidence).length,
    owner_review_items: [...miller, ...north].filter(item => item.owner_review_flag).length,
    finding_bands: Object.fromEntries(["review_first", "review_next", "reference", "low_priority"].map(band => [band, ranked.filter(item => item.significance.priority_band === band).length])),
    top_findings: ranked.slice(0, 5),
  }
}

export function validateBranchMaturity(records = []) {
  const expected = new Set(["statute_regulation_discovery", "policy_discovery", "funding_traceability", "supersession_amendment_tracking", "tribunal_court_sourcing", "coroner_audit_recommendation_tracking", "governance_context_research", "commitment_tracking", "implementation_verification", "policy_to_service_linkage"])
  const seen = new Set()
  for (const record of records) {
    if (!expected.has(record.capability) || seen.has(record.capability) || !PILOT_CAPABILITY_STATES.has(record.state) || !record.evidence || !record.limitation) throw new Error("farm_pilot_maturity_invalid")
    seen.add(record.capability)
  }
  if (seen.size !== expected.size) throw new Error("farm_pilot_maturity_incomplete")
  return Object.fromEntries([...PILOT_CAPABILITY_STATES].map(state => [state, records.filter(item => item.state === state).length]))
}
