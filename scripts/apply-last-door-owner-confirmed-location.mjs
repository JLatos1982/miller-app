import { createClient } from "@supabase/supabase-js"
import { privateLocationAuditValues, privateLocationEligibility, privateLocationValues, sameFixedAddress } from "../server/privateLocation.js"

const RESOURCE_ID = "2739fba4-51d8-5c57-b433-9e31cd99a01d"
const EVIDENCE_ID = "a39cd1b9-7942-4c7e-b5c0-101e4c2e702b"
const IDENTITY = "5105e0a5bea4ec814a46a5ccecf90d90c7533cbd2ff1756cd545962f5dca8c3f"
const args = process.argv.slice(2), apply = args.includes("--apply"), dryRun = args.includes("--dry-run")
if (apply === dryRun) throw new Error("last_door_location_apply_requires_exactly_one_mode")
const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
if (!url || !key || new URL(url).hostname !== "wccagykzugrahwugefqt.supabase.co") throw new Error("last_door_location_apply_refuses_unproven_target")
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const take = async (request) => { const { data, error } = await request; if (error) throw error; return data }
const actor = (await db.auth.admin.listUsers({ perPage: 1 })).data?.users?.[0]?.id
if (!actor) throw new Error("last_door_location_apply_actor_unavailable")
const resource = await take(db.from("resource_registry").select("id,display_name,lifecycle_state,editorial_status").eq("id", RESOURCE_ID).single())
const qc = await take(db.from("location_qc_reviews").select("*").eq("canonical_resource_id", RESOURCE_ID).single())
const claims = await take(db.from("resource_fact_claims").select("id").eq("resource_id", RESOURCE_ID).eq("field_name", "location_occupancy"))
const evidence = claims.length ? await take(db.from("resource_fact_evidence").select("id,claim_id,source_url,source_authority,stale,extracted_value").in("claim_id", claims.map((x) => x.id))) : []
const geocoder = evidence.find((item) => item.id === EVIDENCE_ID)
const locations = await take(db.from("resource_locations").select("*").eq("resource_id", RESOURCE_ID))
if (!geocoder || geocoder.extracted_value?.address_identity?.fingerprint !== IDENTITY || qc.origin !== "machine_initial" || !["manual_review", "pilot_eligible"].includes(qc.decision)) throw new Error("last_door_location_apply_evidence_changed")
const context = { resource, qc, evidence, existingLocations: locations }
const proposed = privateLocationValues({ resourceId: RESOURCE_ID, qc: { ...qc, decision: "pilot_eligible" }, actorId: actor })
const existing = locations.find((item) => item.location_type === "fixed" && sameFixedAddress(item, proposed))
const eligibility = privateLocationEligibility({ ...context, qc: { ...qc, decision: "pilot_eligible" } })
const dryMap = async (version) => take(db.rpc("dry_run_map_auto_publish_v1", { p_resource_id: RESOURCE_ID, p_expected_qc_version: version, p_occupancy_claim_id: claims[0]?.id }))
if (dryRun) {
  console.log(JSON.stringify({ mode: "dry_run", resource: resource.display_name, owner_confirmation: qc.decision === "pilot_eligible" ? "already_consumed" : "required", eligible: eligibility.eligible, reason_codes: eligibility.reasons, existing_location: Boolean(existing), proposed: { street_address: proposed.street_address, city: proposed.city, coordinates: { latitude: proposed.latitude, longitude: proposed.longitude }, public_map: false }, canonical_mutations: 0, map_mutations: 0 }, null, 2))
  process.exit(eligibility.eligible && !existing && qc.decision === "manual_review" ? 0 : 2)
}
if (existing) { console.log(JSON.stringify({ outcome: "already_applied", location_id: existing.id, confirmation: "consumed", canonical_mutations: 0, map_mutations: 0 }, null, 2)); process.exit(0) }
if (qc.decision !== "manual_review" || !eligibility.eligible) throw new Error("last_door_location_apply_confirmation_or_eligibility_required")
const confirmed = await take(db.rpc("save_location_qc_review_decision", { p_canonical_resource_id: RESOURCE_ID, p_policy_version: qc.policy_version, p_classification_fingerprint: qc.classification_fingerprint, p_decision: "pilot_eligible", p_decision_note: "Owner-confirmed Last Door mapping proposal; single bounded canonical location apply authorized.", p_review_snapshot: qc.review_snapshot, p_expected_version: qc.version, p_actor_id: actor }))
const values = privateLocationValues({ resourceId: RESOURCE_ID, qc: confirmed, actorId: actor })
const inserted = await take(db.from("resource_locations").insert(values).select().single())
try {
  const audit = await take(db.from("resource_location_audit").insert({ location_id: inserted.id, action: "created", previous_values: null, new_values: privateLocationAuditValues({ location: inserted, qc: confirmed }), actor_id: actor, reason: "Owner-confirmed Last Door mapping proposal. Public map publication remains disabled." }).select("id").single())
  const mapEligibility = await dryMap(confirmed.version)
  console.log(JSON.stringify({ outcome: "applied", confirmation: "consumed", location: { id: inserted.id, street_address: inserted.street_address, city: inserted.city, latitude: inserted.latitude, longitude: inserted.longitude, review_status: inserted.review_status, public_map: inserted.public_map }, audit_id: audit.id, map_eligibility: mapEligibility, canonical_mutations: 1, location_mutations: 1, map_mutations: 0 }, null, 2))
} catch (error) {
  await db.from("resource_locations").delete().eq("id", inserted.id).eq("public_map", false).eq("review_status", "pending")
  throw error
}
