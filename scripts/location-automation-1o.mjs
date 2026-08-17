import fs from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"
import { normalizeAddress, isCompleteNumberedAddress } from "../server/addressEvidence.js"
import { bcGeocoderConfiguration, normalizeBcAddressResult, requestBcAddressGeocode } from "../server/bcAddressGeocoder.js"
import { evaluateAutomaticLocation, LOCATION_OGL_ATTRIBUTION, LOCATION_OGL_URL, LOCATION_POLICY_VERSION, selectQualityControlSample } from "../server/locationAutomationPolicy.js"

const INPUT = path.resolve("data/address-evidence-inventory.json")
const CACHE = path.resolve("data/bc-geocoder-phase-1p-cache.json")
const OUTPUT = path.resolve("data/location-automation-v1.2.1-review.json")
const CANDIDATE_MAX = 69, REQUEST_MAX = 69, RETRY_MAX = 2
if (process.argv.includes("--apply")) throw new Error("Phase 1P is review-only. Supabase writes and publication are prohibited.")
const inventory = JSON.parse(await fs.readFile(INPUT, "utf8"))
const config = bcGeocoderConfiguration(process.env)
if (!config.usable) throw new Error("BC production geocoder access is not configured.")
if (new URL(config.baseUrl).origin !== "https://geocoder.api.gov.bc.ca") throw new Error("BC geocoder base URL is not the official production environment.")
const readJson = async (file, fallback) => { try { return JSON.parse(await fs.readFile(file, "utf8")) } catch { return fallback } }
const atomicWrite = async (file, value) => { const temporary = `${file}.tmp`; await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); await fs.rename(temporary, file) }
const cache = await readJson(CACHE, { version: 1, provider: "bc_address_geocoder", environment: "production", entries: {} })
const candidates = inventory.records.filter((item) => isCompleteNumberedAddress(item.proposed_address) && item.fixed_public_facility === true && !item.sensitivity_flags?.length).sort((a, b) => a.canonical_uuid.localeCompare(b.canonical_uuid)).slice(0, CANDIDATE_MAX)
if (candidates.length !== 69) throw new Error(`Prepared candidate count changed: expected 69, found ${candidates.length}.`)
const queryKey = (item) => `${normalizeAddress(item.proposed_address).toLowerCase()}|${String(item.municipality || "").trim().toLowerCase()}|bc`
const sharedById = new Map(inventory.shared_buildings.flatMap((group) => group.resources.map((item) => [item.canonical_uuid, group])))
const metrics = { bc_requests: 0, bc_cache_hits: 0, retries: 0, failures: 0 }

for (const item of candidates) {
  const key = queryKey(item)
  if (cache.entries[key]) { metrics.bc_cache_hits++; continue }
  let response
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    response = await requestBcAddressGeocode({ street_address: item.proposed_address, city: item.municipality, province: "BC" })
    metrics.bc_requests++
    if (response.http_status === 401 || response.http_status === 403) throw new Error(`BC production authentication rejected with HTTP ${response.http_status}.`)
    if (response.http_status === 200) break
    if (attempt < RETRY_MAX && [null, 429, 500, 502, 503, 504].includes(response.http_status)) { metrics.retries++; await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt))); continue }
    break
  }
  if (response.http_status !== 200) metrics.failures++
  cache.entries[key] = { retrieved_at: new Date().toISOString(), http_status: response.http_status, provider_status: response.status, features: response.features }
  await atomicWrite(CACHE, cache)
  if (metrics.failures >= 5) throw new Error("Stopped after an unusual provider failure rate.")
  await new Promise((resolve) => setTimeout(resolve, 25))
}

const hasUnit = (value) => { const text = String(value || ""); if (/\b(?:unit|suite|office|apt)\s*[#-]?\s*[a-z0-9-]+\b/i.test(text)) return true; const pair = text.match(/^\s*(\d+)\s*[-–—]\s*(\d+)\b/); return Boolean(pair && Number(pair[1]) <= 999 && Number(pair[2]) > Number(pair[1])) }
const records = candidates.map((item) => {
  const cached = cache.entries[queryKey(item)], features = cached?.features || []
  const bc = features[0] ? normalizeBcAddressResult(features[0], { street_address: item.proposed_address, city: item.municipality, result_count: features.length }) : null
  const group = sharedById.get(item.canonical_uuid)
  const submittedHasUnit = Boolean(item.unit_or_suite) || hasUnit(item.proposed_address), returnedHasUnit = hasUnit(bc?.returned_address)
  const conflictText = (item.conflicts || []).join(" ")
  const evidence = { source_identity_stable: true, public_fixed_facility: item.fixed_public_facility === true, program_specific_address: item.program_relationship_verified === true, parent_office: /parent|head.office|branch/i.test(conflictText), public_client_facing: item.program_relationship_verified === true, conflicting_address: Boolean(item.conflicts?.length), evidence_urls: [item.source_url].filter(Boolean), bc_result: bc, submitted_has_unit: submittedHasUnit, returned_has_unit: returnedHasUnit, address_peer_count: group?.resources.length || 1, shared_occupancy_verified: Boolean(group && item.program_relationship_verified === true), large_campus: /hospital|campus/i.test(`${item.resource_name} ${item.facility_type}`), interpolated_access_acceptable: false }
  const outcome = evaluateAutomaticLocation({ resource: { display_name: item.resource_name, lifecycle_state: "active", editorial_status: "approved", service_type: item.facility_type }, location: { location_type: "fixed", street_address: item.proposed_address, city: item.municipality, latitude: bc?.latitude, longitude: bc?.longitude }, evidence })
  return { canonical_uuid: item.canonical_uuid, resource_name: item.resource_name, specific_program_name: item.specific_program_name || item.resource_name, submitted_address: item.proposed_address, municipality: item.municipality, facility_type: item.facility_type, returned_address: bc?.returned_address || null, score: Number.isFinite(bc?.score) ? bc.score : null, precision: bc?.precision || null, precision_points: Number.isFinite(bc?.precision_points) ? bc.precision_points : null, faults: bc?.faults || [], location_descriptor: bc?.location_descriptor || null, locality: bc?.locality || null, coordinates: bc?.valid_coordinate ? { latitude: bc.latitude, longitude: bc.longitude } : null, site_id: bc?.site_id || null, source_url: item.source_url || null, source_evidence_tier: item.tier, evidence_review_status: item.evidence_review_status, occupancy_evidence_excerpt: item.address_evidence_excerpt || "", occupancy_evidence_rationale: item.public_client_facing_rationale || "", program_occupancy_confidence: item.program_relationship_verified ? "supported" : "unverified", sensitivity_flags: item.sensitivity_flags || [], conflicts: item.conflicts || [], shared_address_group: group || null, submitted_has_unit: submittedHasUnit, returned_has_unit: returnedHasUnit, shared_address_count: group?.resources.length || 1, tier: outcome.tier, reason: outcome.decision_reason, passed_hard_gates: outcome.passed_hard_gates, failed_hard_gates: outcome.failed_hard_gates, warnings: outcome.warnings, policy_version: outcome.policy_version, provider: "bc_address_geocoder", retrieved_at: cached?.retrieved_at || null, attribution: LOCATION_OGL_ATTRIBUTION, attribution_url: LOCATION_OGL_URL, public_map: false }
})
const tiers = Object.fromEntries(["A", "B", "C"].map((tier) => [tier, records.filter((item) => item.tier === tier).length]))
const proposed = records.filter((item) => item.tier === "A"), quality = selectQualityControlSample(proposed)
const sharedAddressGroups = inventory.shared_buildings.map((group) => ({ ...group, batch_records: records.filter((item) => group.resources.some((resource) => resource.canonical_uuid === item.canonical_uuid)).map((item) => ({ canonical_uuid: item.canonical_uuid, resource_name: item.resource_name, tier: item.tier, coordinates: item.coordinates })) })).filter((group) => group.batch_records.length)
const falsePositives = { sensitive_tier_a: records.filter((item) => item.tier === "A" && item.sensitivity_flags.length).length, broad_fallback_tier_a: records.filter((item) => item.tier === "A" && ["province", "locality", "neighbourhood", "postal", "street"].includes(item.precision)).length, known_conflict_tier_a: records.filter((item) => item.tier === "A" && item.conflicts.length).length, human_decisions_overwritten: 0 }
const coordinateGroups = new Set(proposed.filter((item) => item.coordinates).map((item) => `${item.coordinates.latitude.toFixed(6)},${item.coordinates.longitude.toFixed(6)}`))
const uniqueQueryCount = new Set(candidates.map(queryKey)).size
const classificationFingerprint = crypto.createHash("sha256").update(JSON.stringify(records)).digest("hex")
const output = { policy_version: LOCATION_POLICY_VERSION, mode: "licensed_bc_geocoder_non_public_review", generated_at: new Date().toISOString(), baseline: { canonical: 430, approved_public_locations: 18, public_marker_groups: 18, unmapped: 412, pending: 0 }, candidate_count: records.length, request_max: REQUEST_MAX, bc_requests: uniqueQueryCount, bc_cache_hits: records.length - uniqueQueryCount, verification_run: metrics, classification_fingerprint: classificationFingerprint, productive_batch_started: true, bc_access: { enabled: config.enabled, key_configured: config.keyConfigured, usable: config.usable, environment: "production", authentication: "apikey_header_only", client_id_transmitted: false }, licence: { persistent_storage_permitted: true, persistent_map_display_permitted: true, descriptors_licensed: ["parcelPoint", "accessPoint", "routingPoint", "frontDoorPoint", "rooftopPoint"], attribution: LOCATION_OGL_ATTRIBUTION, attribution_url: LOCATION_OGL_URL }, existing_human_approvals: { count: 18, altered: 0 }, counts: tiers, false_positives: falsePositives, proposed_public_totals_if_approved: { locations: 18 + proposed.length, marker_groups_upper_bound: 18 + coordinateGroups.size }, quality_control_sample: quality, shared_address_groups: sharedAddressGroups, records }
if (Object.values(falsePositives).some(Boolean)) throw new Error(`Safety simulation failed: ${JSON.stringify(falsePositives)}`)
await atomicWrite(OUTPUT, output)
console.log(JSON.stringify({ policy_version: output.policy_version, candidate_count: output.candidate_count, bc_requests: output.bc_requests, bc_cache_hits: output.bc_cache_hits, verification_run: metrics, classification_fingerprint: classificationFingerprint, counts: tiers, false_positives: falsePositives, quality_control_count: quality.length, shared_address_group_count: sharedAddressGroups.length, proposed_public_totals_if_approved: output.proposed_public_totals_if_approved }, null, 2))
