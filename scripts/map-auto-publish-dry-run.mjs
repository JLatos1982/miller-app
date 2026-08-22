import { createClient } from "@supabase/supabase-js"
import { MAP_AUTO_PUBLISH_MODES, assertMapAutoPublishProductionTarget, runMapAutoPublishDryRun } from "../server/mapAutoPublishWorker.js"

const args = new Set(process.argv.slice(2))
const mode = [...args].find((arg) => arg.startsWith("--mode="))?.split("=")[1] || MAP_AUTO_PUBLISH_MODES.CLASSIFICATION_ONLY
const limit = Math.max(1, Math.min(500, Number([...args].find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 100)))
assertMapAutoPublishProductionTarget({ supabaseUrl: process.env.SUPABASE_URL, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY, explicitProductionDryRun: args.has("--production-dry-run") })
if (!Object.values(MAP_AUTO_PUBLISH_MODES).includes(mode)) throw new Error("invalid --mode")
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const query = async (request) => { const { data, error } = await request; if (error) throw error; return data || [] }
const [resources, claims, evidence, qc, locations] = await Promise.all([
  query(db.from("resource_registry").select("id,display_name,lifecycle_state,editorial_status")),
  query(db.from("resource_fact_claims").select("id,resource_id,field_name,last_observed_at,updated_at" ).eq("field_name", "location_occupancy")),
  query(db.from("resource_fact_evidence").select("id,claim_id,source_url,source_authority,stale")),
  query(db.from("location_qc_reviews").select("canonical_resource_id,version,origin,review_snapshot")),
  query(db.from("resource_locations").select("resource_id,review_status,public_map"))
])
const report = await runMapAutoPublishDryRun({ db, data: { resources, claims, evidence, qc, locations }, mode, limit })
console.log(JSON.stringify({ ...report, results: undefined }, null, 2))
