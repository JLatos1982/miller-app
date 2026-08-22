import { createHash } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import curatedRows from "../src/vancouver_resources_merged_updated.json" with { type: "json" }
import { normalizedResourceRows } from "../src/resourceData.js"
import { stableCuratedResourceId } from "../src/map/mapChat.js"
import { buildMapAutoPublishContexts } from "../server/mapAutoPublishWorker.js"
import { classifyBcAddressResults, requestBcAddressGeocode } from "../server/bcAddressGeocoder.js"

const args = new Set(process.argv.slice(2))
const production = args.has("--production-bootstrap")
const apply = args.has("--apply")
const withGeocoder = args.has("--with-geocoder")
const limit = Math.max(1, Math.min(50, Number([...args].find((arg) => arg.startsWith("--limit="))?.slice(8) || 50)))
const runId = [...args].find((arg) => arg.startsWith("--run-id="))?.slice(9) || ""
const authorizedMax = Math.max(1, Math.min(50, Number([...args].find((arg) => arg.startsWith("--authorized-max="))?.slice(17) || limit)))
const url = process.env.SUPABASE_URL || ""
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const host = url ? new URL(url).hostname : ""
const productionHost = "wccagykzugrahwugefqt.supabase.co"
if (!url || !key) throw new Error("trusted_master_bootstrap_requires_server_configuration")
if (production ? host !== productionHost : !/^127\.0\.0\.1$|^localhost$/i.test(host)) throw new Error("trusted_master_bootstrap_refuses_unproven_target")
if (apply && !args.has("--confirm-nonpublic-evidence")) throw new Error("trusted_master_bootstrap_requires_explicit_nonpublic_evidence_confirmation")
if (withGeocoder && !apply) throw new Error("trusted_master_geocoder_requires_apply")
if (apply && !runId) throw new Error("trusted_master_bootstrap_requires_durable_run_id")

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim()
const normalized = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, "")
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const physical = (address) => /^\s*\d+[a-z]?(?:[-/]\d+)?\s+/i.test(address) && !/\bp\.?\s*o\.?\s*(?:box)?\b|mailing|service area|intake only/i.test(address)
const protectedText = (row) => /safe home|transition house|domestic violence|trafficking|confidential|undisclosed|intake only/i.test([row.name, row.address, row.notes, row.accessType, row.serviceType, row.category].join(" "))
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const query = async (request) => { const { data, error } = await request; if (error) throw error; return data || [] }

const [registry, aliases, locations, claims, evidence, qc] = await Promise.all([
  query(db.from("resource_registry").select("id,display_name,lifecycle_state,editorial_status")),
  query(db.from("resource_source_aliases").select("resource_id,source_type,source_native_id" ).eq("source_type", "curated_bundle")),
  query(db.from("resource_locations").select("resource_id,public_map,review_status,location_type")),
  query(db.from("resource_fact_claims").select("id,resource_id,field_name,proposed_value,status,last_observed_at,updated_at").eq("field_name", "location_occupancy")),
  query(db.from("resource_fact_evidence").select("id,claim_id,source_type,source_record_id,source_url,source_authority,stale,extracted_value")),
  query(db.from("location_qc_reviews").select("canonical_resource_id,version,origin,review_snapshot")),
])
const aliasesByNative = new Map(aliases.map((alias) => [String(alias.source_native_id), alias.resource_id]))
const sourceRowsRaw = normalizedResourceRows(curatedRows).map((row) => {
  const source_native_id = stableCuratedResourceId(row), resource_id = aliasesByNative.get(source_native_id)
  const address = clean(row.address), city = clean(row.city)
  const payload = { source_native_id, name: clean(row.name), organization: clean(row.organization), address, city, service_type: clean(row.serviceType), category: clean(row.category), source: clean(row.source || "curated_bundle") }
  return { resource_id, source_type: "curated_bundle", source_native_id, source_class: "trusted_curated_master_v1", source_version: "curated_bundle_20260832", source_record_hash: hash(payload), original_address: address, normalized_address: [address, city, "BC"].filter(Boolean).join(", "), municipality: city, province: "BC", public_service_location: !protectedText(row), physical_address: physical(address), source_url: /^https:\/\//i.test(clean(row.website)) ? clean(row.website) : null, source_payload: payload, active: true }
}).filter((row) => row.resource_id)
const sourceRows = [...new Map(sourceRowsRaw.map((row) => [`${row.source_type}:${row.source_native_id}:${row.source_record_hash}`, row])).values()]
const sourceByResource = new Map()
for (const row of sourceRows) sourceByResource.set(row.resource_id, [...(sourceByResource.get(row.resource_id) || []), row])
const activeMaster = registry.filter((item) => item.lifecycle_state === "active" && item.editorial_status !== "hidden" && sourceByResource.has(item.id))
const contexts = buildMapAutoPublishContexts({ resources: registry, claims, evidence, qc, locations })
const contextById = new Map(contexts.map((item) => [item.resource.id, item]))
const candidates = activeMaster.map((resource) => {
  const rows = sourceByResource.get(resource.id) || [], usable = rows.filter((row) => row.physical_address && row.public_service_location && row.municipality && !protectedText(row.source_payload))
  const distinct = new Set(usable.map((row) => normalized(row.normalized_address)))
  const context = contextById.get(resource.id)
  return { resource, rows, usable, conflicting_source_addresses: distinct.size > 1, has_existing_occupancy_claim: claims.some((claim) => claim.resource_id === resource.id), context }
})
const count = (predicate) => candidates.filter(predicate).length
const geocoderState = (candidate) => candidate.context?.geocoderEvidence ? "valid_matching" : candidate.context?.occupancyClaim ? "missing_or_invalid" : "not_yet_bound"
const preflight = {
  target: production ? "production" : "local",
  active_canonical_master_resources: activeMaster.length,
  existing_approved_public_pins: locations.filter((item) => item.public_map && item.review_status === "approved" && sourceByResource.has(item.resource_id)).length,
  existing_qc: count((item) => Boolean(item.context?.qc)),
  complete_numbered_civic_address: count((item) => item.usable.length > 0),
  incomplete_address: count((item) => item.rows.some((row) => row.original_address) && !item.usable.length),
  no_address: count((item) => !item.rows.some((row) => row.original_address)),
  sensitive_or_protected: count((item) => item.rows.some((row) => !row.public_service_location)),
  already_has_occupancy_claim: count((item) => Boolean(item.context?.occupancyClaim)),
  missing_occupancy_claim: count((item) => !item.context?.occupancyClaim),
  claim_lacks_authoritative_evidence: count((item) => item.context?.occupancy_binding === "missing_authoritative_occupancy_evidence"),
  valid_matching_bc_geocoder: count((item) => geocoderState(item) === "valid_matching"),
  missing_or_invalid_bc_geocoder: count((item) => geocoderState(item) === "missing_or_invalid"),
  duplicate_or_conflicting_master_linkage: count((item) => item.conflicting_source_addresses),
  eligible_for_trusted_occupancy_bootstrap: count((item) => item.usable.length === 1 && !item.conflicting_source_addresses && !item.has_existing_occupancy_claim && !item.context?.qc),
  eligible_with_valid_geocoder: count((item) => item.usable.length === 1 && !item.conflicting_source_addresses && !item.has_existing_occupancy_claim && !item.context?.qc && geocoderState(item) === "valid_matching"),
}
if (!apply) {
  console.log(JSON.stringify({ mode: "read_only_preflight", ...preflight, source_class: "trusted_curated_master_v1", source_rows: sourceRows.length, non_bc_resources: 0 }, null, 2))
  process.exit(0)
}

const currentRows = await query(db.from("trusted_master_resource_records").select("id,source_type,source_native_id,source_record_hash"))
const known = new Map(currentRows.map((row) => [`${row.source_type}:${row.source_native_id}:${row.source_record_hash}`, row.id]))
const insertRows = sourceRows.filter((row) => !known.has(`${row.source_type}:${row.source_native_id}:${row.source_record_hash}`))
for (let index = 0; index < insertRows.length; index += 100) {
  const { error } = await db.from("trusted_master_resource_records").insert(insertRows.slice(index, index + 100))
  if (error) throw error
}
const sourceRecords = await query(db.from("trusted_master_resource_records").select("id,resource_id,source_type,source_native_id,source_record_hash,physical_address,public_service_location,active").eq("active", true).eq("source_class", "trusted_curated_master_v1"))
const sourceRecordByKey = new Map(sourceRecords.map((row) => [`${row.source_type}:${row.source_native_id}:${row.source_record_hash}`, row]))
// A fresh bootstrap normally has no geocoder evidence yet.  Select the safe
// trusted-address package first, then let the bounded deterministic geocoder
// stage decide whether it may proceed to machine QC.
const selected = candidates.filter((item) => item.usable.length === 1 && !item.conflicting_source_addresses && !item.has_existing_occupancy_claim && !item.context?.qc).slice(0, limit)
const users = await db.auth.admin.listUsers({ perPage: 1 })
const actor = users.data?.users?.[0]
if (!actor) throw new Error("trusted_master_bootstrap_audit_actor_unavailable")
const started = await db.rpc("begin_trusted_master_occupancy_bootstrap_run", { p_run_id: runId, p_authorized_max_successes: authorizedMax, p_actor_id: actor.id })
if (started.error) throw started.error
const created = []
for (const item of selected) {
  const source = item.usable[0], record = sourceRecordByKey.get(`${source.source_type}:${source.source_native_id}:${source.source_record_hash}`)
  if (!record) throw new Error("trusted_master_source_record_missing_after_sync")
  const { data, error } = await db.rpc("create_occupancy_claim_from_trusted_master_run", { p_run_id: runId, p_resource_id: item.resource.id, p_source_record_id: record.id, p_actor_id: actor.id })
  if (error) { created.push({ resource_id: item.resource.id, outcome: "blocked", reason_code: error.code || "server_blocked" }); continue }
  if (data?.outcome === "refused") { created.push({ resource_id: item.resource.id, outcome: "refused", reason_code: data.reason_code }); break }
  created.push({ resource_id: item.resource.id, outcome: data?.outcome || "unknown", claim_id: data?.claim_id || null })
}
const geocoded = [], machineQc = [], classified = []
if (withGeocoder) {
  for (const item of selected) {
    const claim = created.find((entry) => entry.resource_id === item.resource.id)
    if (!claim?.claim_id) continue
    const source = item.usable[0], response = await requestBcAddressGeocode({ street_address: source.original_address, city: source.municipality })
    if (!response.ok) { geocoded.push({ resource_id: item.resource.id, outcome: response.status }); continue }
    const result = classifyBcAddressResults(response.features, { street_address: source.original_address, city: source.municipality })
    if (result.classification !== "exact_civic") { geocoded.push({ resource_id: item.resource.id, outcome: result.classification }); continue }
    const value = { ...result.best, standardized_address: result.best.normalized_address, province: result.best.standardized_components?.province || "BC", coordinates: { latitude: result.best.latitude, longitude: result.best.longitude } }
    const evidence_fingerprint = hash({ policy: "trusted_master_bc_geocoder_v1", claim_id: claim.claim_id, value })
    const { error } = await db.from("resource_fact_evidence").insert({ claim_id: claim.claim_id, source_type: "bc_geocoder", source_url: "https://geocoder.api.gov.bc.ca", extracted_value: value, extraction_method: "official_bc_geocoder_exact_civic", retrieved_at: new Date().toISOString(), source_authority: 100, independent_key: `bc_geocoder:${value.site_id || value.normalized_address}`, stale: false, evidence_fingerprint })
    if (error && error.code !== "23505") throw error
    geocoded.push({ resource_id: item.resource.id, outcome: "exact_civic" })
    const { data: review, error: qcError } = await db.rpc("create_machine_initial_location_qc_from_evidence", { p_resource_id: item.resource.id, p_occupancy_claim_id: claim.claim_id, p_geocoder_evidence_id: (await query(db.from("resource_fact_evidence").select("id").eq("evidence_fingerprint", evidence_fingerprint))).at(0)?.id || null, p_actor_id: actor.id })
    if (qcError) { machineQc.push({ resource_id: item.resource.id, outcome: qcError.code || "blocked" }); continue }
    machineQc.push({ resource_id: item.resource.id, outcome: "created", version: review.version })
    const { data: decision, error: decisionError } = await db.rpc("dry_run_map_auto_publish_v1", { p_resource_id: item.resource.id, p_expected_qc_version: review.version, p_occupancy_claim_id: claim.claim_id })
    if (decisionError) throw decisionError
    classified.push({ resource_id: item.resource.id, decision: decision.decision, reason_code: decision.reason_code })
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}
console.log(JSON.stringify({ mode: "bounded_nonpublic_bootstrap", run: { id: started.data.id, authorized_max_successes: started.data.authorized_max_successes, successful_count: started.data.successful_count }, ...preflight, source_records_created: insertRows.length, batch_limit: limit, occupancy_results: { attempted: selected.length, created: created.filter((item) => item.outcome === "created").length, idempotent: created.filter((item) => item.outcome === "idempotent").length, blocked: created.filter((item) => item.outcome === "blocked").length, refused: created.filter((item) => item.outcome === "refused").length }, geocoder_results: { attempted: geocoded.length, exact_civic: geocoded.filter((item) => item.outcome === "exact_civic").length, blocked: geocoded.filter((item) => item.outcome !== "exact_civic").length }, machine_qc_results: { created: machineQc.filter((item) => item.outcome === "created").length, blocked: machineQc.filter((item) => item.outcome !== "created").length }, map_auto_publish_dry_run: { eligible: classified.filter((item) => item.decision === "auto_publish_eligible").length, manual_review: classified.filter((item) => item.decision !== "auto_publish_eligible").length }, publication_changes: 0, locations_created: 0 }, null, 2))
