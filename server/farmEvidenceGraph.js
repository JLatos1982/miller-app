import { createHash } from "node:crypto"

export const FARM_GRAPH_EDGE_TYPES = Object.freeze(["concerns_event", "investigated_by", "resulted_in", "recommended_to", "responded_to_by", "implementation_evidence", "judicial_review_of", "corroborates", "contradicts", "related_support", "same_event_as", "tracked_in"])
const EDGE_TYPES = new Set(FARM_GRAPH_EDGE_TYPES)
const clean = value => String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim()
const provinceKey = value => {
  const text = clean(value).toLowerCase().replace(/[^a-z]/g, "")
  if (["bc", "britishcolumbia"].includes(text)) return "british_columbia"
  if (["ab", "alberta"].includes(text)) return "alberta"
  if (["sk", "saskatchewan"].includes(text)) return "saskatchewan"
  if (["canada", "canadawide", "national"].includes(text)) return "canada_wide"
  return text || null
}
const id = (type, value) => `${type}:${clean(value)}`
const edgeId = edge => createHash("sha256").update([edge.type, edge.from, edge.to, edge.source || ""].join("|")).digest("hex").slice(0, 24)

export function buildFarmEvidenceGraph({ incidents = [], watchChains = [], legalRecords = [], resources = [] } = {}) {
  const nodes = []
  const edges = []
  const addNode = node => { if (!nodes.some(item => item.id === node.id)) nodes.push(node) }
  const addEdge = edge => { if (!EDGE_TYPES.has(edge.type)) throw new Error("farm_graph_edge_type_invalid"); const value = { edge_id: edgeId(edge), owner_review: edge.owner_review === true, ...edge }; if (!edges.some(item => item.edge_id === value.edge_id)) edges.push(value) }
  const watchById = new Map(watchChains.map(chain => [chain.chain_id, chain]))
  const watchByTitle = new Map(watchChains.map(chain => [clean(chain.title).toLowerCase(), chain]))
  const resourceById = new Map(resources.map(resource => [resource.canonical_resource_id, resource]))

  for (const incident of incidents) {
    const nodeId = id("incident", incident.public_incident_id)
    addNode({ id: nodeId, type: "incident", canonical_id: incident.public_incident_id, title: incident.title, public: true })
    if (incident.related_watch_chain_id && watchById.has(incident.related_watch_chain_id)) addEdge({ type: "tracked_in", from: nodeId, to: id("watch", incident.related_watch_chain_id), source: "canonical_related_watch_chain_id" })
  }
  for (const chain of watchChains) addNode({ id: id("watch", chain.chain_id), type: "accountability_watch", canonical_id: chain.chain_id, title: chain.title, public: true })
  for (const record of legalRecords) {
    const nodeId = id("legal", record.legal_record_id)
    addNode({ id: nodeId, type: "legal_record", canonical_id: record.legal_record_id, title: record.anonymized_title || record.case_name, public: record.public_disposition === "publication_safe", process_role: record.process_role })
    if (record.related_event_id && incidents.some(item => item.public_incident_id === record.related_event_id)) addEdge({ type: record.process_role === "judicial_review" ? "judicial_review_of" : "concerns_event", from: nodeId, to: id("incident", record.related_event_id), source: "reviewed_related_event_id", owner_review: true })
    const chain = watchById.get(record.related_accountability_chain) || watchByTitle.get(clean(record.related_accountability_chain).toLowerCase()) || watchChains.find(item => clean(item.title).toLowerCase().includes(clean(record.related_accountability_chain).toLowerCase()))
    if (chain) addEdge({ type: record.process_role === "judicial_review" ? "judicial_review_of" : "corroborates", from: nodeId, to: id("watch", chain.chain_id), source: "reviewed_accountability_link", owner_review: true })
    if (record.related_miller_resource && resourceById.has(record.related_miller_resource)) addEdge({ type: "related_support", from: nodeId, to: id("resource", record.related_miller_resource), source: "reviewed_resource_link", owner_review: true })
  }
  for (const resource of resources) addNode({ id: id("resource", resource.canonical_resource_id), type: "support_resource", canonical_id: resource.canonical_resource_id, title: resource.program_name || resource.name, public: true, project_visibility: resource.project_visibility })
  return { schema_version: "farm-evidence-graph-v1", nodes, edges, counts: { nodes: nodes.length, edges: edges.length, incidents: nodes.filter(item => item.type === "incident").length, watch_chains: nodes.filter(item => item.type === "accountability_watch").length, legal_records: nodes.filter(item => item.type === "legal_record").length, support_resources: nodes.filter(item => item.type === "support_resource").length }, mutation_authority: false, publication_authority: false }
}

export function reconcileFarmGraphEdge(edges = [], candidate) {
  if (!EDGE_TYPES.has(candidate.type)) throw new Error("farm_graph_edge_type_invalid")
  const fingerprint = edgeId(candidate)
  const duplicate = edges.some(edge => edge.edge_id === fingerprint || (candidate.type === "same_event_as" && edge.type === "same_event_as" && edge.from === candidate.to && edge.to === candidate.from))
  return { ...candidate, edge_id: fingerprint, disposition: duplicate ? "duplicate_suppressed" : "owner_review_candidate", automatic_merge: false }
}

const PATHWAY_RULES = Object.freeze([
  { id: "discrimination", terms: /discriminat|racis|stereotyp|cultural safety/i, categories: ["human_rights", "indigenous_legal_services", "complaint_navigation"] },
  { id: "professional_conduct", terms: /regulator|professional conduct|consent agreement|nurs|physician/i, categories: ["complaint_navigation", "patient_rights", "indigenous_legal_services"] },
  { id: "hospital_complaint", terms: /hospital|emergency department|patient quality|health authority/i, categories: ["healthcare_complaints", "complaint_navigation", "patient_rights"] },
  { id: "consent", terms: /consent|capacity|involuntary/i, categories: ["patient_rights", "mental_health", "legal"] },
  { id: "housing", terms: /housing|tenan|evict|shelter/i, categories: ["tenancy", "housing", "human_rights"] },
  { id: "addiction_discrimination", terms: /addiction|substance use|methadone|opioid/i, categories: ["human_rights", "legal_aid", "legal"] },
])

export function suggestLegalSupportPathways({ record, resources = [], limit = 4, projectScope = null } = {}) {
  const text = [record?.title, record?.summary, record?.care_setting, ...(record?.mechanism_tags || [])].filter(Boolean).join(" ")
  const rules = PATHWAY_RULES.filter(rule => rule.terms.test(text))
  const categories = new Set(rules.flatMap(rule => rule.categories))
  const recordProvince = provinceKey(record?.province || record?.jurisdiction)
  const scope = projectScope || (record?.public_incident_id ? "miller_north" : null)
  const tags = resource => [...(resource.categories || []), ...(resource.subcategories || [])].map(value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""))
  const eligible = resource => {
    const resourceProvince = provinceKey(resource.province || resource.geography)
    const geographyMatches = !recordProvince || !resourceProvince || resourceProvince === recordProvince || resourceProvince === "canada_wide"
    const visibilityMatches = !scope || (resource.project_visibility || []).includes(scope)
    return geographyMatches && visibilityMatches
  }
  const suggestions = resources.filter(resource => eligible(resource) && tags(resource).some(category => categories.has(category))).map(resource => ({ canonical_resource_id: resource.canonical_resource_id, name: resource.program_name || resource.name, organization: resource.organization, reason_rules: rules.filter(rule => tags(resource).some(category => rule.categories.includes(category))).map(rule => rule.id), project_visibility: resource.project_visibility, owner_review_required: true })).slice(0, limit)
  return { label: "Related legal and advocacy resources", disclaimer: "These resources may help people understand complaint, human-rights or legal-support options. Miller does not determine whether a person has a legal claim.", suggestions, automatic_publication: false }
}
