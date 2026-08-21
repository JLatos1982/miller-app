import { createClient } from "@supabase/supabase-js"
import { createHash } from "node:crypto"
const apply = process.argv.includes("--apply")
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Server-side Supabase configuration is absent.")
if (new URL(process.env.SUPABASE_URL).hostname.split(".")[0] !== "wccagykzugrahwugefqt") throw new Error("Unexpected Supabase project.")
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const reviews = await db.from("location_qc_reviews").select("*").eq("decision", "pilot_eligible").order("canonical_resource_id")
if (reviews.error || reviews.data.length !== 14) throw new Error("Expected exactly 14 legacy pilot-eligible QC records.")
const users = await db.auth.admin.listUsers({ perPage: 1000 }); const actor = users.data.users.find((user) => user.email)
if (!actor) throw new Error("No administrator account is available.")
const ids = reviews.data.map((item) => item.canonical_resource_id)
const claims = await db.from("resource_fact_claims").select("id,resource_id,recommendation,confidence,last_observed_at").in("resource_id", ids)
const evidence = claims.data?.length ? await db.from("resource_fact_evidence").select("claim_id,source_url,source_authority,stale").in("claim_id", claims.data.map((item) => item.id)) : { data: [] }
const results=[]
for (const review of reviews.data) {
  const linked = (claims.data || []).filter((item) => item.resource_id === review.canonical_resource_id), sources = (evidence.data || []).filter((item) => linked.some((claim) => claim.id === item.claim_id))
  const snapshot = { ...review.review_snapshot, refreshed_at: new Date().toISOString(), refresh_evidence: { durable_claim_count: linked.length, authoritative_current_source_count: sources.filter((item) => item.source_url && Number(item.source_authority || 0) >= 85 && item.stale !== true).length } }
  const fingerprint = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")
  if (apply) { const saved = await db.rpc("refresh_location_qc_evidence", { p_canonical_resource_id: review.canonical_resource_id, p_policy_version: `${review.policy_version}-evidence-refresh-v1`, p_classification_fingerprint: fingerprint, p_refreshed_snapshot: snapshot, p_reason: "Bounded legacy QC refresh using current durable evidence; new human QC confirmation required.", p_expected_version: review.version, p_actor_id: actor.id }); if (saved.error) throw saved.error }
  results.push({ resource_id: review.canonical_resource_id, prior_version: review.version, authoritative_sources: snapshot.refresh_evidence.authoritative_current_source_count })
}
console.log(JSON.stringify({ mode: apply ? "production_audited_refresh" : "dry_run", processed: results.length, results }))
