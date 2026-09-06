import { createHash, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { classifyBcAddressResults, requestBcAddressGeocode } from "../server/bcAddressGeocoder.js"
import { exactBcPackage } from "../server/canonicalResearchPipeline.js"
import { reconcileSamePublicLocation } from "../server/locationClaimReconciliation.js"

const rawArgs = process.argv.slice(2), args = new Set(rawArgs), apply = args.has("--apply"), dryRun = args.has("--dry-run")
if (apply === dryRun) throw Error("owner_approved_recovery_requires_exactly_one_mode")
const approvalOption = rawArgs.indexOf("--approval"), approvalPath = approvalOption < 0 ? "reports/miller-owner-approved-location-recovery-2026-09-05.json" : rawArgs[approvalOption + 1]
if (!approvalPath || (approvalOption >= 0 && rawArgs.length !== 3)) throw Error("owner_approved_recovery_arguments_invalid")
const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
if (!url || !key || new URL(url).hostname !== "wccagykzugrahwugefqt.supabase.co") throw Error("owner_approved_recovery_refuses_unproven_target")
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const take = async request => { const { data, error } = await request; if (error) throw error; return data }
const ownerApprovedGeocoderPackage = (classified, address, municipality) => {
  const exact = exactBcPackage(classified, address, municipality)
  if (exact) return { ...exact, owner_approved_high_confidence_close: false }
  const best = classified?.best
  // This is not a relaxed coordinate check: it only accepts the BC
  // geocoder's civic-number/parcelpoint result in the same municipality when
  // its sole classification difference is address normalization (for example
  // “West” versus “W”). The database still compares canonical address keys.
  if (classified?.classification !== "high_confidence_close" || !best || best.score !== 100 || best.precision_points < 95 || best.location_descriptor !== "parcelpoint" || best.civic_number_match !== true || best.municipality_match !== true || best.province_match !== true || best.materially_faulted) return null
  return { standardized_address: best.normalized_address || best.returned_address, returned_address: best.returned_address, province: best.standardized_components?.province || "BC", locality: best.locality, municipality_match: true, score: best.score, precision_points: best.precision_points, location_descriptor: best.location_descriptor, site_id: best.site_id || null, coordinates: { latitude: best.latitude, longitude: best.longitude }, provider: best.provider, submitted_address: address, municipality, owner_approved_high_confidence_close: true }
}
// Existing-claim reconciliation is not a new-site publication decision.  When
// the independently staged proposal and the accepted claim resolve to the
// same normalized civic address, the BC geocoder's locality-consistent 99/block
// result is sufficient to confirm that normalization; a new address still
// needs the stricter owner-approved package above.
const sameLocationGeocoderPackage = (classified, address, municipality) => {
  const strict = ownerApprovedGeocoderPackage(classified, address, municipality)
  if (strict) return strict
  const best = classified?.best
  if (classified?.classification !== "high_confidence_close" || !best || best.score < 99 || best.precision_points < 99 || !["parcelpoint", "block", "accesspoint"].includes(best.location_descriptor) || best.civic_number_match !== true || best.municipality_match !== true || best.province_match !== true || best.materially_faulted) return null
  return { standardized_address: best.normalized_address || best.returned_address, returned_address: best.returned_address, province: best.standardized_components?.province || "BC", locality: best.locality, municipality_match: true, score: best.score, precision_points: best.precision_points, location_descriptor: best.location_descriptor, site_id: best.site_id || null, coordinates: { latitude: best.latitude, longitude: best.longitude }, provider: best.provider, submitted_address: address, municipality, owner_approved_high_confidence_close: true, reconciliation_only: true }
}
const approval = JSON.parse(readFileSync(approvalPath, "utf8")), automaticPolicy = approval.approval_contract === "miller-tier1-public-location-autopublish-v1", reconcilePolicy = approval.approval_contract === "miller-tier1-same-location-reconcile-v1", storePath = approval.proposal_store_path || "/Users/admin/samwise-private/data/miller-uuid-location-proposals-postfix-batch1-20260905-r1.sqlite", reportPath = approval.final_report_path || "/Users/admin/samwise-private/data/miller-uuid-location-report-postfix-batch1-20260905-r1.json", report = JSON.parse(readFileSync(reportPath, "utf8"))
if (!["miller-owner-approved-location-recovery-v1", "miller-tier1-public-location-autopublish-v1", "miller-tier1-same-location-reconcile-v1"].includes(approval.approval_contract) || !Array.isArray(approval.approved) || !approval.approved.length || report.batch_id !== approval.clean_batch_id || report.audit?.state !== "passed" || report.audit?.audit_hash !== approval.clean_audit_hash || report.status?.finalization !== "finalized") throw Error("owner_approved_recovery_audit_binding_invalid")
const { DatabaseSync } = await import("node:sqlite")
const store = new DatabaseSync(storePath, { readOnly: true })
const staged = store.prepare("select id,resource_id,evidence_hash,payload_json from miller_uuid_location_proposals order by id").all()
store.close()
const expected = new Map(approval.approved.map(item => [item.proposal_id, item]))
if (staged.length < expected.size || new Set(staged.map(item => item.id)).size !== staged.length || [...expected].some(([id]) => !staged.some(item => item.id === id))) throw Error("owner_approved_recovery_proposal_set_invalid")
const proposals = staged.filter(row => expected.has(row.id)).map(row => {
  const proposal = JSON.parse(row.payload_json), expectedItem = expected.get(row.id), recovery = proposal?.recovery, candidate = recovery?.candidate, geocode = recovery?.geocode
  const policyEligible = (automaticPolicy || reconcilePolicy) ? recovery?.location_decision === "auto_publish_location" : recovery?.identity_disposition === "program_location_confirmed" && ["verified_exact", "verified_public_location"].includes(recovery?.recovery_outcome)
  if (proposal?.resource_id !== expectedItem.resource_id || row.resource_id !== expectedItem.resource_id || row.evidence_hash !== expectedItem.evidence_hash || recovery?.name !== expectedItem.name || candidate?.address !== expectedItem.street_address || candidate?.locality !== expectedItem.city || candidate?.province !== "BC" || !policyEligible || !candidate?.source_url || !Array.isArray(recovery?.evidence) || !recovery.evidence.length || geocode?.provider !== "bc_address_geocoder") throw Error("owner_approved_recovery_proposal_mismatch")
  return { ...expectedItem, proposal_id: row.id, recovery, candidate, geocode }
})
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const [resources, locations, claims, qc, pinCountResult] = await Promise.all([
  take(db.from("resource_registry").select("id,display_name,lifecycle_state,editorial_status").in("id", proposals.map(item => item.resource_id))),
  take(db.from("resource_locations").select("*").in("resource_id", proposals.map(item => item.resource_id))),
  take(db.from("resource_fact_claims").select("id,resource_id,status,field_name,proposed_value").in("resource_id", proposals.map(item => item.resource_id)).eq("field_name", "location_occupancy")),
  take(db.from("location_qc_reviews").select("*").in("canonical_resource_id", proposals.map(item => item.resource_id))),
  db.from("resource_locations").select("id", { count: "exact", head: true }).eq("public_map", true),
])
if (pinCountResult.error) throw pinCountResult.error
const pinCountBefore = Number(pinCountResult.count || 0)
for (const item of proposals) {
  const resource = resources.find(row => row.id === item.resource_id), currentClaims = claims.filter(row => row.resource_id === item.resource_id && !["superseded", "rejected", "unknown"].includes(row.status)), currentLocations = locations.filter(row => row.resource_id === item.resource_id), currentQc = qc.find(row => row.canonical_resource_id === item.resource_id)
  if (!resource || resource.display_name !== item.name || resource.lifecycle_state !== "active" || resource.editorial_status === "hidden" || currentLocations.length || currentQc || (!reconcilePolicy && currentClaims.length) || (reconcilePolicy && currentClaims.length !== 1)) throw Error(`owner_approved_recovery_production_preflight_changed:${item.resource_id}:locations=${currentLocations.length}:claims=${currentClaims.length}:qc=${currentQc ? 1 : 0}`)
  const response = await requestBcAddressGeocode({ street_address: item.street_address, city: item.city })
  if (!response.ok) throw Error("owner_approved_recovery_geocoder_unavailable")
  const packageValue = (reconcilePolicy ? sameLocationGeocoderPackage : ownerApprovedGeocoderPackage)(classifyBcAddressResults(response.features, { street_address: item.street_address, city: item.city }), item.street_address, item.city)
  if (!packageValue) {
    const current = classifyBcAddressResults(response.features, { street_address: item.street_address, city: item.city })
    throw Error(`owner_approved_recovery_geocoder_not_exact:${current?.classification || "none"}:${current?.best?.score || "none"}:${current?.best?.precision_points || "none"}:${current?.best?.location_descriptor || "none"}`)
  }
  // The canonical persistence RPC independently requires an authoritative
  // source package. Refuse before any append-only claim/evidence write when
  // the proposal cannot meet that established route; never inflate a source
  // authority merely because a Tier-1 policy found it useful.
  if (!reconcilePolicy && !item.existing_claim && Number(item.candidate.authority || 0) < 85) throw Error(`owner_approved_recovery_canonical_source_insufficient:${item.resource_id}`)
  item.geocoder_package = packageValue
  if (reconcilePolicy) {
    const existingAddress = String(currentClaims[0].proposed_value || ""), existingStreet = existingAddress.split(",").map(value => value.trim()).find(value => /\d/.test(value)) || existingAddress
    const existingResponse = await requestBcAddressGeocode({ street_address: existingStreet, city: item.city })
    const existingPackage = existingResponse.ok ? sameLocationGeocoderPackage(classifyBcAddressResults(existingResponse.features, { street_address: existingStreet, city: item.city }), existingStreet, item.city) : null
    const relationship = reconcileSamePublicLocation({ existingAddress, existingGeocode: existingPackage, proposedAddress: item.street_address, proposedGeocode: packageValue })
    if (!['same_location_confirmation', 'same_location_normalization'].includes(relationship)) throw Error("owner_approved_recovery_reconciliation_not_same_location")
    item.existing_claim = currentClaims[0]; item.reconciliation = relationship
  }
}
if (dryRun) {
  console.log(JSON.stringify({ mode: "dry_run", batch_id: report.batch_id, audit_hash: report.audit.audit_hash, public_pin_count_before: pinCountBefore, proposals: proposals.map(item => ({ proposal_id: item.proposal_id, resource_id: item.resource_id, name: item.name, address: item.street_address, city: item.city, source_url: item.candidate.source_url, recovery_outcome: item.recovery.recovery_outcome, geocoder_package: item.geocoder_package })), production_mutations: 0, map_mutations: 0 }, null, 2))
  process.exit(0)
}
const actor = (await db.auth.admin.listUsers({ perPage: 1 })).data?.users?.[0]?.id
if (!actor) throw Error("owner_approved_recovery_actor_unavailable")
const results = []
for (const item of proposals) {
  const policy = reconcilePolicy ? "tier1_same_location_reconcile_v1" : automaticPolicy ? "tier1_public_location_autopublish_v1" : "owner_approved_uuid_location_recovery_v1", claimFingerprint = hash({ policy, resource_id: item.resource_id, proposal_id: item.proposal_id, evidence_hash: item.evidence_hash, address: item.street_address, city: item.city }), evidenceFingerprint = hash({ policy, claim_fingerprint: claimFingerprint, source_url: item.candidate.source_url, evidence_hash: item.evidence_hash }), runId = randomUUID()
  const claim = item.existing_claim || await take(db.from("resource_fact_claims").insert({ resource_id: item.resource_id, field_name: "location_occupancy", proposed_value: item.street_address, existing_value: null, risk: "medium", recommendation: "human_review", confidence: "high", reason_codes: [policy, "audited_clean_batch", "public_civic_address"], engine_version: policy, status: "observed", claim_fingerprint: claimFingerprint, decision_category: "location_occupancy", research_summary: automaticPolicy ? "Tier-1 public-location policy automatically accepted an audited civic proposal." : "Owner approved a clean audited UUID location-recovery proposal.", last_observed_at: item.candidate.retrieved_at }).select().single())
  await take(db.from("resource_fact_evidence").insert({ claim_id: claim.id, source_type: reconcilePolicy ? "tier1_same_location_public_source" : automaticPolicy ? "tier1_policy_public_source" : "owner_approved_public_source", source_record_id: item.proposal_id, source_url: item.candidate.source_url, extracted_value: { address: item.street_address, city: item.city, proposal_id: item.proposal_id, proposal_evidence_hash: item.evidence_hash, clean_batch_id: report.batch_id, clean_audit_hash: report.audit.audit_hash, source_title: item.candidate.source_title, source_excerpt: item.candidate.excerpt, program_location_confirmed: item.recovery.identity_disposition === "program_location_confirmed", policy_decision: item.recovery.location_decision || null, owner_approval: !automaticPolicy && !reconcilePolicy, automatic_policy: automaticPolicy, reconciliation: item.reconciliation || null }, extraction_method: reconcilePolicy ? "tier1_same_location_reconciliation" : automaticPolicy ? "tier1_public_location_autopublish" : "owner_approved_clean_audited_uuid_location_recovery", retrieved_at: item.candidate.retrieved_at, source_authority: Number(item.candidate.authority) || 85, independent_key: new URL(item.candidate.source_url).hostname, stale: false, evidence_fingerprint: evidenceFingerprint }).select("id").single())
  await take(db.from("resource_fact_change_audit").insert({ claim_id: claim.id, resource_id: item.resource_id, field_name: "location_occupancy", previous_value: reconcilePolicy ? item.existing_claim.proposed_value : null, new_value: item.street_address, action: "observe", reason_codes: [policy, "clean_audit_provenance_preserved", ...(reconcilePolicy ? [item.reconciliation] : [])], actor_type: "administrator", actor_id: actor }))
  try {
    await take(db.rpc("begin_canonical_authoritative_research_run", { p_run_id: runId, p_authorized_max_attempts: 1, p_actor_id: actor }))
    await take(db.rpc("reserve_canonical_authoritative_research_item", { p_run_id: runId, p_resource_id: item.resource_id, p_actor_id: actor }))
    const persisted = await take(db.rpc("persist_canonical_bc_geocoder_evidence_v1", { p_run_id: runId, p_resource_id: item.resource_id, p_occupancy_claim_id: claim.id, p_geocoder_package: item.geocoder_package, p_actor_id: actor }))
    const machineQc = await take(db.rpc("create_machine_initial_location_qc_from_evidence", { p_resource_id: item.resource_id, p_occupancy_claim_id: claim.id, p_geocoder_evidence_id: persisted.evidence_id, p_actor_id: actor }))
    const humanQc = await take(db.rpc("save_location_qc_review_decision", { p_canonical_resource_id: item.resource_id, p_policy_version: machineQc.policy_version, p_classification_fingerprint: machineQc.classification_fingerprint, p_decision: "pilot_eligible", p_decision_note: reconcilePolicy ? `Tier-1 policy reconciled same-location audited proposal ${item.proposal_id}; prior claim preserved.` : automaticPolicy ? `Tier-1 policy auto-published audited public civic proposal ${item.proposal_id}; evidence and geocoder retained.` : `Owner approved audited clean UUID location proposal ${item.proposal_id}; evidence and geocoder retained.`, p_review_snapshot: machineQc.review_snapshot, p_expected_version: machineQc.version, p_actor_id: actor }))
    const eligibility = await take(db.rpc("dry_run_map_auto_publish_v1", { p_resource_id: item.resource_id, p_expected_qc_version: humanQc.version, p_occupancy_claim_id: claim.id }))
    if (eligibility.decision !== "auto_publish_eligible") throw Error("owner_approved_recovery_map_eligibility_rejected")
    const location = await take(db.rpc("publish_verified_map_pin", { p_resource_id: item.resource_id, p_expected_qc_version: humanQc.version, p_actor_id: actor }))
    await take(db.rpc("finish_canonical_authoritative_research_item", { p_run_id: runId, p_resource_id: item.resource_id, p_outcome: "confirmed", p_reason_code: reconcilePolicy ? "tier1_same_location_reconciled" : automaticPolicy ? "tier1_policy_auto_published_location" : "owner_approved_clean_uuid_location", p_claim_id: claim.id, p_evidence_id: persisted.evidence_id, p_actor_id: actor }))
    await take(db.rpc("complete_canonical_authoritative_research_run", { p_run_id: runId, p_actor_id: actor }))
    results.push({ resource_id: item.resource_id, proposal_id: item.proposal_id, claim_id: claim.id, geocoder_evidence_id: persisted.evidence_id, qc_version: humanQc.version, map_eligibility: eligibility, location })
  } catch (error) {
    try { await db.rpc("finish_canonical_authoritative_research_item", { p_run_id: runId, p_resource_id: item.resource_id, p_outcome: "failed", p_reason_code: "owner_approved_apply_failed", p_claim_id: claim.id, p_evidence_id: null, p_actor_id: actor }); await db.rpc("complete_canonical_authoritative_research_run", { p_run_id: runId, p_actor_id: actor }) } catch {}
    throw error
  }
}
const { count: pinCountAfter, error: countError } = await db.from("resource_locations").select("id", { count: "exact", head: true }).eq("public_map", true)
if (countError) throw countError
console.log(JSON.stringify({ mode: "applied", public_pin_count_before: pinCountBefore, public_pin_count_after: pinCountAfter, results, production_mutations: results.length, map_mutations: results.length }, null, 2))
