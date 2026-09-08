import { SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID } from "./samwisePublicRecordsIntelligence.js"

const STATES = new Set(["new_lead", "corroborated", "formal_process", "milestone_scheduled", "finding_issued", "response_pending", "implementation_monitoring", "resolved_public_trail"])
const clean = (value, limit = 400) => String(value ?? "").normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)

export function createSamwiseLiveIntelligence(input = {}) {
  if (!input.canonical_live_id || !input.event_id || !input.institution || !/^https:\/\//.test(String(input.source_url || ""))) throw new Error("samwise_live_required_field_missing")
  if (!STATES.has(input.current_status)) throw new Error("samwise_live_status_invalid")
  if (["formal_process", "milestone_scheduled", "response_pending", "implementation_monitoring"].includes(input.current_status) && (!input.monitoring_source || (!input.next_public_milestone && !input.expected_document))) throw new Error("samwise_live_milestone_required")
  return Object.freeze({
    schema_version: "samwise-live-public-record-intelligence-v1",
    capability_id: SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID,
    canonical_live_id: clean(input.canonical_live_id, 180),
    event_id: clean(input.event_id, 180),
    institution: clean(input.institution, 180),
    source_url: clean(input.source_url, 500),
    evidence_status: clean(input.evidence_status, 100) || "public_report",
    current_status: input.current_status,
    primary_domain: clean(input.primary_domain, 80),
    secondary_domains: Array.isArray(input.secondary_domains) ? input.secondary_domains.map(value => clean(value, 80)).filter(Boolean).slice(0, 8) : [],
    next_public_milestone: clean(input.next_public_milestone, 300) || null,
    expected_document: clean(input.expected_document, 180) || null,
    monitoring_source: clean(input.monitoring_source, 500) || null,
    next_research_action: clean(input.next_research_action, 400) || null,
    downstream_destinations: Array.isArray(input.downstream_destinations) ? input.downstream_destinations.map(value => clean(value, 100)).filter(Boolean).slice(0, 8) : ["owner_intelligence"],
    material_change: input.material_change === true,
    automatic_publication: false,
    mutation_authority: false,
    publication_authority: false,
  })
}

export function diffSamwiseLiveIntelligence(previous, current) {
  if (previous?.canonical_live_id !== current?.canonical_live_id) throw new Error("samwise_live_identity_mismatch")
  const fields = ["current_status", "next_public_milestone", "expected_document", "monitoring_source", "evidence_status"]
  const changed_fields = fields.filter(field => previous[field] !== current[field])
  return Object.freeze({ canonical_live_id: current.canonical_live_id, changed: changed_fields.length > 0, changed_fields, owner_review_required: changed_fields.length > 0, automatic_publication: false })
}
