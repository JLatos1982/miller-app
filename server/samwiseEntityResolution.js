import aliases from "../src/data/samwise-entity-aliases-v1.json" with { type: "json" }

const clean = value => String(value ?? "").normalize("NFKC").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()

const byAlias = new Map()
for (const entity of aliases.entities) {
  for (const alias of [entity.canonical_name, ...(entity.aliases || [])]) {
    const key = clean(alias)
    if (byAlias.has(key) && byAlias.get(key).entity_id !== entity.entity_id) throw new Error("samwise_entity_alias_collision")
    byAlias.set(key, entity)
  }
}

export function validateSamwiseEntityRegistry(registry = aliases) {
  if (registry.schema_version !== "samwise-entity-aliases-v1" || !Array.isArray(registry.entities)) throw new Error("samwise_entity_registry_invalid")
  const ids = new Set()
  for (const entity of registry.entities) {
    if (!entity.entity_id || ids.has(entity.entity_id) || !entity.canonical_name || !entity.entity_type) throw new Error("samwise_entity_registry_invalid")
    if (entity.entity_type === "nation" && entity.identity_inference_allowed !== false) throw new Error("samwise_nation_identity_inference_must_be_false")
    ids.add(entity.entity_id)
  }
  return { valid: true, entities: ids.size, aliases: registry.entities.reduce((sum, entity) => sum + 1 + (entity.aliases || []).length, 0) }
}

export function resolveSamwiseEntity(value) {
  const entity = byAlias.get(clean(value))
  if (!entity) return { input: String(value ?? ""), resolution: "unresolved", automatic_match: false, owner_review_required: false }
  return { input: String(value ?? ""), entity_id: entity.entity_id, canonical_name: entity.canonical_name, entity_type: entity.entity_type, jurisdiction: entity.jurisdiction || null, resolution: "deterministic_alias", automatic_match: true, owner_review_required: false, identity_inference: false }
}

export function proposeSamwiseEntityMatch({ value, candidate } = {}) {
  const resolved = resolveSamwiseEntity(value)
  if (resolved.automatic_match) return resolved
  return { input: String(value ?? ""), candidate_entity_id: candidate?.entity_id || null, resolution: "owner_review_candidate", automatic_match: false, owner_review_required: true, identity_inference: false }
}

export function buildSamwiseInstitutionHistory({ entityId, findings = [], graphEdges = [] } = {}) {
  const entity = aliases.entities.find(item => item.entity_id === entityId)
  if (!entity) throw new Error("samwise_institution_unknown")
  const records = findings.filter(finding => (finding.relevant_entities || []).some(item => item.entity_id === entityId || resolveSamwiseEntity(item.name).entity_id === entityId)).map(finding => ({
    canonical_finding_id: finding.canonical_finding_id,
    title: finding.title,
    intelligence_state: finding.intelligence_state,
    evidence_role: finding.evidence_role,
    source_reference: finding.source?.url || finding.source_url || null,
    primary_domain: finding.primary_domain,
  }))
  const relatedEdges = graphEdges.filter(edge => String(edge.from).includes(entityId) || String(edge.to).includes(entityId)).map(edge => ({ edge_id: edge.edge_id, edge_type: edge.edge_type, source_reference: edge.source_reference }))
  return Object.freeze({
    schema_version: "samwise-institution-history-v1",
    entity: { entity_id: entity.entity_id, canonical_name: entity.canonical_name, entity_type: entity.entity_type, jurisdiction: entity.jurisdiction || null, aliases: entity.aliases || [] },
    public_record_history: records,
    reviewed_relationships: relatedEdges,
    reputational_score: null,
    factual_continuity_only: true,
    mutation_authority: false,
  })
}

export function buildSamwiseInstitutionRelationshipChain({ organization, documents = [], events = [], recommendations = [], responses = [] } = {}) {
  const resolved = resolveSamwiseEntity(organization)
  if (!resolved.automatic_match) throw new Error("samwise_institution_chain_requires_canonical_entity")
  return Object.freeze({
    schema_version: "samwise-institution-relationship-chain-v1",
    organization: resolved,
    documents: documents.map(item => ({ document_id: item.document_id, source_reference: item.source_reference, concerns_event: item.event_id || null })),
    events: events.map(item => ({ event_id: item.event_id, investigated_by: item.investigated_by || [] })),
    recommendations: recommendations.map(item => ({ recommendation_id: item.recommendation_id, responsible_organization: item.responsible_organization || resolved.entity_id })),
    responses: responses.map(item => ({ response_id: item.response_id, recommendation_id: item.recommendation_id, implementation_evidence: item.implementation_evidence || null })),
    automatic_event_merge: false,
    mutation_authority: false,
    publication_authority: false,
  })
}
