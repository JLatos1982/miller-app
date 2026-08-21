import { createHash } from "node:crypto"
import { isCompleteNumberedAddress, isSensitiveOrNonFixed, normalizeAddress } from "./addressEvidence.js"
import { buildAddressResolutionReport } from "./addressResolution.js"

export const DIRECTORY_COVERAGE_VERSION = "miller-directory-address-coverage-v1.0.0"
const stableHash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const fixedService = /\b(clinic|counsell?ing|treatment|withdrawal|detox|health cent(?:re|er)|recovery|drop[ -]?in|community (?:agency|service|centre|center)|food|resource program|outpatient|oat|opioid agonist)\b/i
const headquarters = /\b(head office|headquarters|administrative office|corporate office)\b/i
const publicShelter = /\b(shelter|transition house|safe house|safe home)\b/i

function sourceFor(registry, aliases, tavilyById, curatedById) {
  const resourceAliases = aliases.get(registry.id) || []
  const curatedAlias = resourceAliases.find((item) => item.source_type === "curated_bundle")
  const tavilyAlias = resourceAliases.find((item) => item.source_type === "tavily_resource")
  const source = curatedAlias ? curatedById.get(String(curatedAlias.source_native_id)) : tavilyAlias ? tavilyById.get(String(tavilyAlias.source_native_id)) : null
  return { source: source || {}, aliases: resourceAliases, source_url: source?.website || curatedAlias?.source_url || tavilyAlias?.source_url || "", source_type: curatedAlias ? "curated_bundle" : tavilyAlias ? "tavily_resource" : "canonical_only" }
}

export function reconcileAddressEvidence({ registry = [], aliases = [], tavilyResources = [], curatedResources = [], locations = [], claims = [], evidence = [], inventory = {}, geocoded = {} } = {}) {
  const active = registry.filter((item) => item.lifecycle_state === "active"), activeIds = new Set(active.map((item) => item.id)), aliasMap = new Map(), tavilyById = new Map(tavilyResources.map((item) => [String(item.id), item])), curatedById = new Map(curatedResources.map((item) => [String(item.id), item]))
  for (const alias of aliases) aliasMap.set(alias.resource_id, [...(aliasMap.get(alias.resource_id) || []), alias])
  const claimsByResource = new Map(), evidenceByClaim = new Map()
  for (const item of claims) claimsByResource.set(item.resource_id, [...(claimsByResource.get(item.resource_id) || []), item])
  for (const item of evidence) evidenceByClaim.set(item.claim_id, [...(evidenceByClaim.get(item.claim_id) || []), item])
  const mapped = new Set(locations.filter((item) => item.location_type === "fixed" && item.public_map === true && item.geocode_status === "verified" && item.review_status === "approved").map((item) => item.resource_id))
  const oldById = new Map((inventory.records || []).map((item) => [item.canonical_uuid, item])), geocodeById = new Map((geocoded.records || []).map((item) => [item.canonical_uuid, item]))
  const previous = buildAddressResolutionReport({ inventory, geocoded }), previousStrongIds = new Set(previous.records.filter((item) => ["very_strong", "strong"].includes(item.confidence)).map((item) => item.canonical_uuid))
  const reconciled = active.map((canonical) => {
    const linked = sourceFor(canonical, aliasMap, tavilyById, curatedById), old = oldById.get(canonical.id) || null
    const occupancyClaims = (claimsByResource.get(canonical.id) || []).filter((item) => item.decision_category === "location_occupancy" || item.field_name === "location_occupancy")
    const occupancy = occupancyClaims.sort((a, b) => String(b.last_observed_at).localeCompare(String(a.last_observed_at)))[0] || null
    const occupancyEvidence = occupancy ? evidenceByClaim.get(occupancy.id) || [] : []
    const currentAddress = normalizeAddress(linked.source.address || occupancy?.proposed_value || old?.proposed_address || "")
    const currentUrl = linked.source_url
    const nameChanged = Boolean(old && canonical.display_name !== old.resource_name)
    const addressChanged = Boolean(old && currentAddress && normalizeAddress(old.proposed_address) !== currentAddress)
    const sourceChanged = Boolean(old && currentUrl && old.source_url && currentUrl !== old.source_url)
    const reusable = Boolean(old && !nameChanged && !addressChanged && !sourceChanged)
    const text = `${canonical.display_name} ${linked.source.organization || ""} ${linked.source.description || ""} ${linked.source.serviceType || linked.source.service_type || ""} ${linked.source.category || ""} ${linked.source.accessType || ""} ${currentAddress}`
    const nonFixed = isSensitiveOrNonFixed({ name: canonical.display_name, address: currentAddress, service_type: `${linked.source.serviceType || linked.source.service_type || ""} ${linked.source.category || ""}`, accessType: linked.source.accessType })
    const confidential = publicShelter.test(text) && !currentAddress
    const likelyFixed = fixedService.test(text) && !nonFixed
    const claimSupported = occupancy?.recommendation === "auto_accept" && occupancy?.confidence === "high" && occupancyEvidence.some((item) => item.source_authority >= 85 && item.stale !== true)
    const record = old ? { ...old, resource_name: canonical.display_name, proposed_address: currentAddress || old.proposed_address, source_url: currentUrl || old.source_url, program_relationship_verified: occupancy ? claimSupported : old.program_relationship_verified } : null
    const originalGeocode = geocodeById.get(canonical.id) || null, currentGeocode = originalGeocode ? { ...originalGeocode, program_occupancy_confidence: occupancy ? claimSupported ? "supported" : "unverified" : originalGeocode.program_occupancy_confidence } : null
    return { canonical_uuid: canonical.id, resource_name: canonical.display_name, lifecycle_state: canonical.lifecycle_state, editorial_status: canonical.editorial_status, source_type: linked.source_type, source_url: currentUrl, organization: linked.source.organization || "", community: linked.source.city || old?.municipality || "", service_type: linked.source.serviceType || linked.source.service_type || linked.source.category || old?.facility_type || "", description: linked.source.description || "", current_address: currentAddress, mapped: mapped.has(canonical.id), old_evidence: old, reconciled_record: record, geocode: currentGeocode, occupancy_claim: occupancy, occupancy_evidence: occupancyEvidence, occupancy_supported: claimSupported, prior_strong_candidate: previousStrongIds.has(canonical.id), evidence_reusable: reusable, changed: { name: nameChanged, address: addressChanged, source: sourceChanged }, needs_reevaluation: Boolean(old && !reusable), non_fixed: nonFixed, confidential_private: confidential, likely_fixed: likelyFixed, headquarters_warning: headquarters.test(text), evidence_fingerprint: stableHash({ id: canonical.id, name: canonical.display_name, address: currentAddress, source: currentUrl }) }
  })
  const retiredEvidence = (inventory.records || []).filter((item) => !activeIds.has(item.canonical_uuid)).map((item) => ({ canonical_uuid: item.canonical_uuid, resource_name: item.resource_name, evidence_preserved: true }))
  return { active: reconciled, retiredEvidence, mappedCount: mapped.size, oldEvidenceActive: reconciled.filter((item) => item.old_evidence).length, reused: reconciled.filter((item) => item.evidence_reusable).length, changed: reconciled.filter((item) => item.needs_reevaluation).length, newlyExamined: reconciled.filter((item) => !item.old_evidence && !item.mapped).length }
}

export function triageDirectory(reconciliation) {
  const oldRecords = reconciliation.active.filter((item) => item.reconciled_record).map((item) => item.reconciled_record)
  const oldGeocodes = reconciliation.active.filter((item) => item.geocode).map((item) => item.geocode)
  const oldReport = buildAddressResolutionReport({ inventory: { records: oldRecords, shared_buildings: [] }, geocoded: { records: oldGeocodes } })
  const assessed = new Map(oldReport.records.map((item) => [item.canonical_uuid, item]))
  const records = reconciliation.active.map((item) => {
    let category, recommendation = "insufficient", reason_codes = []
    const existing = assessed.get(item.canonical_uuid)
    if (item.mapped) { category = "already_public_mapped"; recommendation = "already_public"; reason_codes = ["existing_reviewed_public_location"] }
    else if (item.confidential_private) { category = "confidential_private"; recommendation = "excluded"; reason_codes = ["public_address_not_disclosed"] }
    else if (item.non_fixed) { category = "virtual_mobile_service_area"; recommendation = "excluded"; reason_codes = ["non_fixed_or_sensitive_service"] }
    else if (item.headquarters_warning) { category = "human_review"; recommendation = "research_service_location"; reason_codes = ["headquarters_not_service_location"] }
    else if (existing) { category = existing.category; recommendation = existing.recommendation; reason_codes = existing.reason_codes || [] }
    else if (item.current_address && isCompleteNumberedAddress(item.current_address) && item.occupancy_supported) { category = "probable_fixed_address_candidate"; recommendation = "geocode_then_review"; reason_codes = ["authoritative_occupancy_shadow_evidence", "not_yet_geocoded"] }
    else if (item.current_address && isCompleteNumberedAddress(item.current_address)) { category = "exact_address_occupancy_unverified"; recommendation = "occupancy_research"; reason_codes = ["complete_numbered_address", "program_occupancy_unverified"] }
    else if (item.current_address) { category = "partial_address"; recommendation = "address_research"; reason_codes = ["incomplete_civic_address"] }
    else if (item.likely_fixed) { category = "probable_fixed_address_candidate"; recommendation = "address_research"; reason_codes = ["public_in_person_service_likely", "no_civic_address_yet"] }
    else { category = "insufficient_information"; recommendation = "defer"; reason_codes = ["no_fixed_location_signal"] }
    return { ...item, category, recommendation, reason_codes, confidence: existing?.confidence || (recommendation === "excluded" ? "excluded" : category === "probable_fixed_address_candidate" ? "needs_review" : "insufficient"), proposed_address: item.current_address || existing?.proposed_address || "", standardized_address: existing?.standardized_address || null, geocoder: existing?.geocoder || null, concerns: [...reason_codes, ...(item.needs_reevaluation ? ["canonical_evidence_changed"] : [])], public_map: item.mapped }
  })
  const counts = {}; for (const item of records) counts[item.category] = (counts[item.category] || 0) + 1
  return { records, counts }
}

export function rankAdministratorQueue(records, limit = 20) {
  return records.filter((item) => !item.mapped && !["excluded", "insufficient"].includes(item.recommendation)).map((item) => {
    const factors = { occupancy: item.occupancy_supported ? 40 : 0, exact_geocode: ["civic_number", "unit", "site", "occupant"].includes(item.geocoder?.precision) ? 25 : 0, exact_score: Number(item.geocoder?.score) === 100 ? 15 : 0, authoritative_source: item.occupancy_evidence.some((evidence) => evidence.source_authority >= 85 && !evidence.stale) ? 10 : 0, current: item.needs_reevaluation ? 0 : 5, conflict_free: item.old_evidence?.conflicts?.length ? 0 : 5, shared_penalty: Number(item.geocode?.shared_address_count || 1) > 1 ? -12 : 0, headquarters_penalty: item.headquarters_warning ? -30 : 0 }
    return { ...item, rank_score: Object.values(factors).reduce((sum, value) => sum + value, 0), rank_factors: factors }
  }).sort((a, b) => b.rank_score - a.rank_score || a.resource_name.localeCompare(b.resource_name) || a.canonical_uuid.localeCompare(b.canonical_uuid)).slice(0, limit)
}

export function buildDirectoryCoverageReport(input) {
  const reconciliation = reconcileAddressEvidence(input), triage = triageDirectory(reconciliation), ranked = rankAdministratorQueue(triage.records), meaningful = triage.records.filter((item) => item.category !== "insufficient_information").length
  const realisticallyMappable = triage.records.filter((item) => ["high_confidence_candidate", "likely_candidate_needing_review"].includes(item.category)).length
  return { version: DIRECTORY_COVERAGE_VERSION, generated_at: new Date().toISOString(), total_active: reconciliation.active.length, reconciliation: { old_evidence_active: reconciliation.oldEvidenceActive, evidence_reused: reconciliation.reused, evidence_changed_requires_reevaluation: reconciliation.changed, retired_or_replaced_evidence_preserved: reconciliation.retiredEvidence.length, newly_examined_deterministically: reconciliation.newlyExamined }, counts: triage.counts, meaningfully_evaluated: meaningful, coverage_percentage: reconciliation.active.length ? Number((meaningful / reconciliation.active.length * 100).toFixed(1)) : 0, realistically_mappable_if_approved: realisticallyMappable, fixed_location_research_leads: triage.records.filter((item) => item.category === "probable_fixed_address_candidate").length, ranked_queue: ranked, seven_candidate_reevaluation: triage.records.filter((item) => item.prior_strong_candidate), records: triage.records, retired_evidence: reconciliation.retiredEvidence, shadow_writes: 0, public_location_changes: 0 }
}
