import { createClient } from "@supabase/supabase-js"
import { MAP_AUTO_PUBLISH_MODES, assertMapAutoPublishProductionTarget, createMachineQcForCandidate, mapAutoPublishPreflight, preflightCategory, runMapAutoPublishDryRun } from "../server/mapAutoPublishWorker.js"

const args = new Set(process.argv.slice(2))
const mode = [...args].find((arg) => arg.startsWith("--mode="))?.split("=")[1] || MAP_AUTO_PUBLISH_MODES.CLASSIFICATION_ONLY
const limit = Math.max(1, Math.min(500, Number([...args].find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 100)))
assertMapAutoPublishProductionTarget({ supabaseUrl: process.env.SUPABASE_URL, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY, explicitProductionDryRun: args.has("--production-dry-run") })
if (!Object.values(MAP_AUTO_PUBLISH_MODES).includes(mode)) throw new Error("invalid --mode")
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const query = async (request) => { const { data, error } = await request; if (error) throw error; return data || [] }
const [resources, claims, evidence, qc, locations] = await Promise.all([
  query(db.from("resource_registry").select("id,display_name,lifecycle_state,editorial_status")),
  query(db.from("resource_fact_claims").select("id,resource_id,field_name,proposed_value,status,last_observed_at,updated_at" ).eq("field_name", "location_occupancy")),
  query(db.from("resource_fact_evidence").select("id,claim_id,source_url,source_authority,stale,source_type,extracted_value")),
  query(db.from("location_qc_reviews").select("canonical_resource_id,version,origin,review_snapshot")),
  query(db.from("resource_locations").select("resource_id,review_status,public_map,location_type"))
])
const data = { resources, claims, evidence, qc, locations }
if (mode === MAP_AUTO_PUBLISH_MODES.MACHINE_QC_CREATE_DRY_RUN) {
  const preflight = mapAutoPublishPreflight(data, limit), users = await db.auth.admin.listUsers({ perPage: 1000 }), actor = users.data.users.find((user) => user.email)
  if (!actor) throw new Error("machine_qc_audit_actor_unavailable")
  const selected = preflight.contexts.filter((item) => preflightCategory(item) === "ready_for_machine_qc").slice(0, 10), created = []
  for (const item of selected) created.push({ item, created: await createMachineQcForCandidate({ db, item, actorId: actor.id }) })
  const refreshed = { ...data, qc: [...qc, ...created.filter((item) => item.created.qc).map((item) => item.created.qc)] }
  const report = await runMapAutoPublishDryRun({ db, data: refreshed, mode: MAP_AUTO_PUBLISH_MODES.CLASSIFICATION_ONLY, limit: 10 })
  console.log(JSON.stringify({ mode, preflight: { total_considered: preflight.total_considered, counts: preflight.counts }, created: created.map(({ item, created: result }) => ({ resource_id: item.resource.id, resource_name: item.resource.display_name, ...result })), classification: { reason_counts: report.reason_counts, shelter_reason_counts: report.shelter_reason_counts, samples: report.samples } }, null, 2))
} else if (args.has("--preflight")) {
  const preflight = mapAutoPublishPreflight(data, limit)
  console.log(JSON.stringify({ mode: "machine_qc_preflight", total_considered: preflight.total_considered, counts: preflight.counts, ready: preflight.contexts.filter((item) => preflightCategory(item) === "ready_for_machine_qc").slice(0, 10).map((item) => ({ resource_id: item.resource.id, resource_name: item.resource.display_name, occupancy_claim_id: item.occupancyClaim.id, geocoder_evidence_id: item.geocoderEvidence.id, preflight_status: "ready_for_machine_qc" })) }, null, 2))
} else {
  const report = await runMapAutoPublishDryRun({ db, data, mode, limit })
  console.log(JSON.stringify({ ...report, results: undefined }, null, 2))
}
