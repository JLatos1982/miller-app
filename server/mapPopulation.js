import { coordinateKey } from "../src/map/geography.js"

export const MAP_POPULATION_POLICY_VERSION = "miller-map-population-v1.0.0"

const text = (value) => String(value ?? "").trim()
const byNewest = (a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))

export function isVirtualOrMobileResource(resource = {}) {
  const combined = `${resource.service_type || ""} ${resource.category || ""} ${resource.description || ""}`
  return /\b(mobile|outreach)\b/i.test(combined) || /\b(virtual|online|telephone)\b/i.test(String(resource.access_type || resource.accessType || ""))
}

function priorManualBlock(location, audits) {
  if (["rejected", "excluded", "confidential"].includes(location?.review_status)) return location.review_status
  const manual = [...(audits || [])].sort(byNewest).find((entry) => {
    if (!entry.actor_id) return false
    if (["rejected", "excluded", "marked_confidential"].includes(entry.action)) return true
    return entry.action === "publication_changed" && entry.new_values?.public_map === false
  })
  return manual ? `manual_${manual.action}` : ""
}

export function buildLocationReconciliation({ locations = [], registry = [], aliases = [], tavilyResources = [], audits = [], curatedIds = new Set() } = {}) {
  const registryById = new Map(registry.map((item) => [item.id, item]))
  const aliasesByResource = new Map()
  for (const alias of aliases) aliasesByResource.set(alias.resource_id, [...(aliasesByResource.get(alias.resource_id) || []), alias])
  const tavilyById = new Map(tavilyResources.map((item) => [String(item.id), item]))
  const auditsByLocation = new Map()
  for (const entry of audits) auditsByLocation.set(entry.location_id, [...(auditsByLocation.get(entry.location_id) || []), entry])
  const approved = locations.filter((item) => item.review_status === "approved")
  const publicCandidates = approved.filter((item) => item.location_type === "fixed" && item.public_map === true && item.geocode_status === "verified" && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)))
  const groups = new Map()
  for (const item of publicCandidates) {
    const key = coordinateKey({ ...item, mappable: true })
    groups.set(key, [...(groups.get(key) || []), item.id])
  }
  return approved.map((location) => {
    const resource = registryById.get(location.resource_id)
    const sourceAliases = aliasesByResource.get(location.resource_id) || []
    const tavilyAlias = sourceAliases.find((item) => item.source_type === "tavily_resource")
    const curatedAlias = sourceAliases.find((item) => item.source_type === "curated_bundle")
    const tavily = tavilyAlias ? tavilyById.get(String(tavilyAlias.source_native_id)) : null
    const registryEligible = resource?.lifecycle_state === "active" && resource?.editorial_status !== "hidden"
    const sourceEligible = Boolean((tavily && tavily.approved === true && tavily.hidden !== true) || (curatedAlias && curatedIds.has(String(curatedAlias.source_native_id))))
    const locationEligible = location.location_type === "fixed" && location.public_map === true && location.geocode_status === "verified" && Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))
    const appears = registryEligible && sourceEligible && locationEligible
    const latestEvidence = [...(auditsByLocation.get(location.id) || [])].sort(byNewest).find((item) => item.action === "geocoded")?.new_values || {}
    const group = locationEligible ? coordinateKey({ ...location, mappable: true }) : ""
    const exclusion = appears ? "" : !locationEligible ? "location_not_public_verified_fixed" : !registryEligible ? "registry_not_active_or_hidden" : "no_public_source_representation"
    return {
      resource_id: location.resource_id,
      location_id: location.id,
      resource_name: resource?.display_name || tavily?.name || "Resource",
      address: text(location.street_address || location.original_address_text),
      city: text(location.city),
      coordinates: { latitude: location.latitude, longitude: location.longitude },
      approval_state: location.review_status,
      publication_state: location.public_map ? "public" : "not_public",
      appears_in_public_map_query: appears,
      shared_address_group: group,
      shared_address_service_count: group ? groups.get(group)?.length || 1 : 0,
      exclusion_reason: exclusion,
      location_type: location.location_type,
      virtual_mobile_or_non_fixed: location.location_type !== "fixed" || isVirtualOrMobileResource(tavily || {}),
      source_type: curatedAlias ? "curated_bundle" : tavilyAlias ? "tavily_resource" : "unrepresented",
      evidence_tier: latestEvidence.source_evidence_tier || latestEvidence.tier || null,
      geocode_source: location.geocode_source,
      geocode_confidence: location.geocode_confidence,
    }
  })
}

export function buildAutoPublicationPreview({ automationRecords = [], locations = [], registry = [], audits = [] } = {}) {
  const registryById = new Map(registry.map((item) => [item.id, item]))
  const locationsByResource = new Map()
  for (const item of locations) locationsByResource.set(item.resource_id, [...(locationsByResource.get(item.resource_id) || []), item])
  const auditsByLocation = new Map()
  for (const entry of audits) auditsByLocation.set(entry.location_id, [...(auditsByLocation.get(entry.location_id) || []), entry])
  const items = automationRecords.map((record) => {
    const resource = registryById.get(record.canonical_uuid)
    const existing = locationsByResource.get(record.canonical_uuid) || []
    const published = existing.find((item) => item.review_status === "approved" && item.public_map === true)
    const block = existing.map((item) => priorManualBlock(item, auditsByLocation.get(item.id))).find(Boolean)
    let outcome = "needs_human_review", reasons = []
    if (published) { outcome = "skipped"; reasons = ["already_published"] }
    else if (block) { outcome = "excluded"; reasons = [block, "human_decision_is_authoritative"] }
    else if (!resource || resource.lifecycle_state !== "active" || resource.editorial_status === "hidden") { outcome = "excluded"; reasons = ["canonical_resource_not_active"] }
    else if (record.sensitivity_flags?.length) { outcome = "excluded"; reasons = ["sensitive_or_private_location", ...record.sensitivity_flags] }
    else if (record.tier === "C") { outcome = "failed"; reasons = ["failed_public_location_validation", ...(record.failed_hard_gates || []), ...(record.conflicts || [])] }
    else if (record.conflicts?.length) { outcome = "needs_human_review"; reasons = ["conflicting_evidence", ...record.conflicts] }
    else if (record.tier === "A" && record.score === 100 && record.program_occupancy_confidence === "supported" && record.coordinates && record.public_map === false) { outcome = "eligible"; reasons = ["all_deterministic_public_location_gates_passed"] }
    else { reasons = [...(record.failed_hard_gates || []), ...(record.warnings || [])]; if (!reasons.length) reasons = [`policy_tier_${record.tier || "unknown"}`] }
    return {
      canonical_resource_id: record.canonical_uuid,
      resource_name: record.resource_name,
      proposed_address: record.submitted_address,
      returned_address: record.returned_address,
      proposed_coordinates: record.coordinates,
      outcome,
      reasons,
      policy_version: record.policy_version || MAP_POPULATION_POLICY_VERSION,
      source_url: record.source_url,
      evidence_tier: record.source_evidence_tier,
      geocoder: { provider: record.provider, score: record.score, precision: record.precision, descriptor: record.location_descriptor },
      writes_performed: false,
    }
  })
  const counts = Object.fromEntries(["eligible", "needs_human_review", "excluded", "skipped", "failed"].map((key) => [key, items.filter((item) => item.outcome === key).length]))
  return { policy_version: MAP_POPULATION_POLICY_VERSION, dry_run: true, writes_performed: false, counts, items }
}
