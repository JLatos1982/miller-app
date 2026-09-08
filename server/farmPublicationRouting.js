export const FARM_PUBLICATION_ROUTES = Object.freeze([
  "research_context_only",
  "miller_resource_candidate",
  "miller_north_evidence_candidate",
  "shared_resource_candidate",
])

export const ORIGINAL_MILLER_PUBLIC_RECORD_TYPES = Object.freeze([
  "service_resource",
  "funding_resource",
  "navigation_resource",
])

const RESOURCE_KINDS = new Set(ORIGINAL_MILLER_PUBLIC_RECORD_TYPES)
const RESEARCH_KINDS = new Set([
  "legal_decision",
  "legal_finding",
  "incident",
  "police_investigation",
  "coroner_inquest",
  "accountability_research",
  "accountability_watch_chain",
  "child_welfare_investigation",
  "government_misconduct_research",
  "owner_review_research",
  "systemic_evidence",
])
const VERIFIED = new Set(["verified_active", "verified", "externally_verified", "imported_from_trusted_source"])
const FORBIDDEN_MILLER_FIELDS = new Set([
  "legal_record_id",
  "incident_id",
  "public_incident_id",
  "accountability_chain_id",
  "evidence_role",
  "procedural_stage",
  "allegations",
  "findings",
  "private_research",
  "owner_review_required",
])

const list = value => Array.isArray(value) ? value : value ? [value] : []
const clean = value => String(value ?? "").trim()
const secureUrl = value => {
  try { return new URL(clean(value)).protocol === "https:" }
  catch { return false }
}

export function routeFarmPublicationItem(input = {}) {
  const recordKind = clean(input.record_kind)
  const visibility = new Set(list(input.project_visibility).map(clean))
  const privateResearch = input.private_research === true || input.owner_review_required === true

  if (RESEARCH_KINDS.has(recordKind) || privateResearch) {
    return Object.freeze({
      routing_disposition: visibility.has("miller_north") ? "miller_north_evidence_candidate" : "research_context_only",
      original_miller_public: false,
      miller_north_public: false,
      owner_review_required: true,
      reason: "research_and_evidence_records_never_project_to_original_miller",
    })
  }

  if (!RESOURCE_KINDS.has(recordKind)) {
    return Object.freeze({
      routing_disposition: "research_context_only",
      original_miller_public: false,
      miller_north_public: false,
      owner_review_required: true,
      reason: "record_type_not_approved_for_public_resource_projection",
    })
  }

  const verified = VERIFIED.has(clean(input.verification_status))
  const sourceBacked = secureUrl(input.source_url || input.website)
  if (!verified || !sourceBacked) {
    return Object.freeze({
      routing_disposition: "shared_resource_candidate",
      original_miller_public: false,
      miller_north_public: false,
      owner_review_required: true,
      reason: !verified ? "resource_not_verified_active" : "authoritative_https_source_required",
    })
  }

  return Object.freeze({
    routing_disposition: visibility.has("miller") ? "miller_resource_candidate" : "shared_resource_candidate",
    original_miller_public: visibility.has("miller"),
    miller_north_public: false,
    owner_review_required: false,
    reason: visibility.has("miller") ? "verified_practical_resource_allowed" : "resource_not_visible_in_original_miller",
  })
}

export function isOriginalMillerPublicResource(record = {}) {
  if (!list(record.project_visibility).includes("miller")) return false
  if (!["service", "funding", "service_and_funding"].includes(clean(record.record_type))) return false
  if (!VERIFIED.has(clean(record.verification_status))) return false
  if (!secureUrl(record.website) || !secureUrl(record.source?.url)) return false
  if (!clean(record.canonical_resource_id) || !clean(record.program_name) || !clean(record.organization)) return false
  if ([...FORBIDDEN_MILLER_FIELDS].some(field => Object.hasOwn(record, field))) return false
  if (record.publication_route && record.publication_route !== "miller_resource_candidate") return false
  return true
}
