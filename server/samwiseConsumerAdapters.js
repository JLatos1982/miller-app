import { isOriginalMillerPublicResource, routeFarmPublicationItem } from "./farmPublicationRouting.js"
import { SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID } from "./samwisePublicRecordsIntelligence.js"

const MILLER_NORTH_ROUTES = new Set(["miller_north_evidence_candidate", "miller_north_watch_candidate", "miller_north_live_candidate"])

function assertFinding(finding) {
  if (finding?.capability_id !== SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID) throw new Error("samwise_finding_required")
}

export function toMillerNorthCandidate(finding, route) {
  assertFinding(finding)
  if (!MILLER_NORTH_ROUTES.has(route)) throw new Error("samwise_miller_north_route_invalid")
  if (!/^explicit|^supported|^formal|^publicly_documented/.test(finding.relevance.indigenous)) throw new Error("samwise_miller_north_indigenous_relevance_required")
  return Object.freeze({
    schema_version: "miller-north-samwise-consumer-v1",
    consumer: "miller_north",
    candidate_type: route === "miller_north_watch_candidate" ? "accountability_watch_candidate" : route === "miller_north_live_candidate" ? "live_monitoring_candidate" : "evidence_candidate",
    samwise_finding_id: finding.canonical_finding_id,
    canonical_event_id: finding.event_id,
    title: finding.title,
    summary: finding.summary,
    source_url: finding.source.url,
    source_role: finding.source.role,
    evidence_role: finding.evidence_role,
    primary_domain: finding.primary_domain,
    secondary_domains: finding.secondary_domains.map(item => item.domain),
    actionability: finding.actionability,
    owner_review_required: true,
    automatic_publication: false,
    publication_authority: false,
    mutation_authority: false,
  })
}

export function toOriginalMillerResourceCandidate({ finding, resource }) {
  assertFinding(finding)
  const route = routeFarmPublicationItem({
    ...resource,
    record_kind: resource.record_kind || (resource.record_type === "funding" ? "funding_resource" : "service_resource"),
    source_url: resource.source_url || resource.source?.url || resource.website,
  })
  if (!route.original_miller_public || !isOriginalMillerPublicResource(resource)) throw new Error("samwise_original_miller_resource_gate_failed")
  return Object.freeze({
    schema_version: "miller-samwise-resource-consumer-v1",
    consumer: "miller",
    samwise_discovery_context_id: finding.canonical_finding_id,
    canonical_resource_id: resource.canonical_resource_id,
    publication_route: "miller_resource_candidate",
    public_record: resource,
    research_record_included: false,
    automatic_publication: false,
  })
}

export function projectSamwiseFinding({ finding, routing, resources = [] } = {}) {
  assertFinding(finding)
  const outputs = []
  for (const route of routing.routes || []) {
    if (MILLER_NORTH_ROUTES.has(route)) outputs.push(toMillerNorthCandidate(finding, route))
    if (route === "miller_resource_candidate") {
      for (const resource of resources) outputs.push(toOriginalMillerResourceCandidate({ finding, resource }))
    }
    if (["owner_intelligence", "research_context_only", "future_project_candidate", "shared_resource_candidate"].includes(route)) outputs.push({ consumer: route, samwise_finding_id: finding.canonical_finding_id, owner_review_required: true, automatic_publication: false })
  }
  return Object.freeze({ finding_id: finding.canonical_finding_id, outputs, source_record_duplicated: false, automatic_publication: false })
}

export function assertSamwiseCannotBypassMiller(resource) {
  if (!isOriginalMillerPublicResource(resource)) return { allowed: false, reason: "original_miller_publication_gate_rejected" }
  const forbidden = ["legal_record_id", "incident_id", "public_incident_id", "accountability_chain_id", "evidence_role", "procedural_stage", "findings", "allegations"].some(field => Object.hasOwn(resource, field))
  return { allowed: !forbidden, reason: forbidden ? "research_fields_forbidden" : "verified_practical_resource_only" }
}

export function consumerBoundarySummary() {
  return Object.freeze({
    samwise: "discovers, reconciles, connects and routes public-record intelligence",
    miller_north: "owns Indigenous accountability presentation and publication decisions",
    miller: "owns verified practical-resource presentation and guidance",
    source_record_ownership: "samwise",
    automatic_publication: false,
  })
}
