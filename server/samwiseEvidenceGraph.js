import { createHash } from "node:crypto"

import { SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID } from "./samwisePublicRecordsIntelligence.js"

export const SAMWISE_GRAPH_NODE_TYPES = Object.freeze(["source", "document", "event", "organization", "person_pseudonym", "public_institution", "recommendation", "legal_decision", "investigation", "program_resource", "accountability_chain"])
export const SAMWISE_GRAPH_EDGE_TYPES = Object.freeze(["same_event_as", "issued_document", "concerns_event", "investigated_by", "corroborates", "contradicts", "judicial_review_of", "resulted_in", "recommended_to", "responsible_for", "responded_to_by", "implementation_evidence", "administered_by", "healthcare_overlap", "policing_overlap", "corrections_overlap", "child_welfare_overlap", "funding_overlap", "related_resource", "legal_pathway", "tracked_in"])

const NODE_TYPES = new Set(SAMWISE_GRAPH_NODE_TYPES)
const EDGE_TYPES = new Set(SAMWISE_GRAPH_EDGE_TYPES)
const CROSS_DOMAIN = new Set(["healthcare_overlap", "policing_overlap", "corrections_overlap", "child_welfare_overlap", "funding_overlap", "related_resource", "legal_pathway"])
const EVIDENCE_BASES = new Set(["explicit_source", "reviewed_citation", "deterministic_canonical_match"])
const clean = (value, limit = 240) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit)
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24)

export function createSamwiseGraphNode(input = {}) {
  if (!NODE_TYPES.has(input.node_type)) throw new Error("samwise_graph_node_type_invalid")
  const canonicalId = clean(input.canonical_id, 180)
  if (!canonicalId) throw new Error("samwise_graph_node_id_required")
  if (input.node_type === "person_pseudonym" && input.public_name === true && input.anonymized !== false) throw new Error("samwise_graph_person_privacy_invalid")
  return Object.freeze({
    node_id: `${input.node_type}:${canonicalId}`,
    node_type: input.node_type,
    canonical_id: canonicalId,
    label: clean(input.label, 180),
    privacy_class: clean(input.privacy_class, 60) || "owner_private_metadata",
    public_name: input.node_type === "person_pseudonym" ? input.public_name === true : undefined,
    mutation_authority: false,
  })
}

export function createSamwiseGraphEdge(input = {}) {
  if (!EDGE_TYPES.has(input.edge_type)) throw new Error("samwise_graph_edge_type_invalid")
  const from = clean(input.from, 220)
  const to = clean(input.to, 220)
  const sourceReference = clean(input.source_reference, 500)
  if (!from || !to || from === to) throw new Error("samwise_graph_edge_nodes_invalid")
  if (CROSS_DOMAIN.has(input.edge_type) && (!EVIDENCE_BASES.has(input.evidence_basis) || !sourceReference)) throw new Error("samwise_graph_reviewed_evidence_required")
  const edge = {
    edge_type: input.edge_type,
    from,
    to,
    evidence_basis: clean(input.evidence_basis, 80) || "owner_review",
    source_reference: sourceReference || null,
    owner_review_required: input.owner_review_required !== false,
    automatic_event_merge: false,
    mutation_authority: false,
  }
  return Object.freeze({ edge_id: digest(edge), ...edge })
}

export function buildSamwiseEvidenceGraph({ nodes = [], edges = [] } = {}) {
  const normalizedNodes = nodes.map(createSamwiseGraphNode)
  const nodeIds = new Set(normalizedNodes.map(node => node.node_id))
  if (nodeIds.size !== normalizedNodes.length) throw new Error("samwise_graph_duplicate_node")
  const normalizedEdges = edges.map(createSamwiseGraphEdge)
  for (const edge of normalizedEdges) if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) throw new Error("samwise_graph_edge_node_missing")
  const uniqueEdges = normalizedEdges.filter((edge, index, values) => values.findIndex(candidate => candidate.edge_id === edge.edge_id) === index)
  return Object.freeze({
    schema_version: "samwise-public-records-graph-v1",
    capability_id: SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID,
    storage: "deterministic_json_projection",
    nodes: normalizedNodes,
    edges: uniqueEdges,
    counts: { nodes: normalizedNodes.length, edges: uniqueEdges.length },
    mutation_authority: false,
    publication_authority: false,
  })
}

export function reconcileSamwiseGraphEdge(existingEdges = [], candidate) {
  const edge = createSamwiseGraphEdge(candidate)
  const reverseSameEvent = candidate.edge_type === "same_event_as" && existingEdges.some(item => item.edge_type === "same_event_as" && item.from === edge.to && item.to === edge.from)
  const duplicate = reverseSameEvent || existingEdges.some(item => item.edge_id === edge.edge_id)
  return Object.freeze({ ...edge, disposition: duplicate ? "duplicate_suppressed" : "owner_review_candidate", automatic_event_merge: false })
}
