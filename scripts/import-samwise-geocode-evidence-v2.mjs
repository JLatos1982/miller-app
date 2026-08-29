import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { addressComponents } from "../server/addressEvidence.js"
import { canonicalSamwiseMillerAddressIdentity, importSamwiseGeocodeEvidenceV2, validateSamwiseGeocodeEvidenceV2 } from "../server/samwiseGeocodeEvidenceHandoff.js"

const args = process.argv.slice(2)
const option = (name) => args[args.indexOf(name) + 1] || ""
const artifactPath = option("--file")
const resumeRunId = option("--resume-run")
if (!args.includes("--apply") || !artifactPath.startsWith("/private/tmp/")) throw new Error("samwise_geocode_import_requires_apply_and_private_tmp_file")
if (resumeRunId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resumeRunId)) throw new Error("samwise_geocode_import_invalid_resume_run")

const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const expectedHost = "wccagykzugrahwugefqt.supabase.co"
if (!url || !key || new URL(url).hostname !== expectedHost) throw new Error("samwise_geocode_import_refuses_unproven_target")

const handoff = validateSamwiseGeocodeEvidenceV2(JSON.parse(readFileSync(artifactPath, "utf8")))
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const fail = (result) => { if (result.error) throw result.error; return result.data }
const claims = fail(await db.from("resource_fact_claims").select("id,proposed_value,status").eq("resource_id", handoff.miller_resource_id).eq("field_name", "location_occupancy"))
const current = claims.filter((claim) => !["superseded", "rejected", "unknown"].includes(claim.status))
if (current.length !== 1) throw new Error("samwise_geocode_import_requires_one_current_occupancy_claim")
const parts = addressComponents(typeof current[0].proposed_value === "string" ? current[0].proposed_value : current[0].proposed_value?.address || current[0].proposed_value?.value || "")
const currentAddressIdentity = canonicalSamwiseMillerAddressIdentity({ miller_resource_id: handoff.miller_resource_id, submitted_address: parts.street_address, municipality: parts.municipality, province: parts.province })
const users = await db.auth.admin.listUsers({ perPage: 1 })
const actorId = users.data?.users?.[0]?.id
if (!actorId) throw new Error("samwise_geocode_import_audit_actor_unavailable")

const runId = resumeRunId || randomUUID(), claimId = current[0].id
let reserved = false
try {
  fail(await db.rpc("begin_canonical_authoritative_research_run", { p_run_id: runId, p_authorized_max_attempts: 1, p_actor_id: actorId }))
  fail(await db.rpc("reserve_canonical_authoritative_research_item", { p_run_id: runId, p_resource_id: handoff.miller_resource_id, p_actor_id: actorId }))
  reserved = true
  const result = await importSamwiseGeocodeEvidenceV2({ db, handoff, runId, occupancyClaimId: claimId, actorId, currentAddressIdentity })
  if (!result.persisted) throw new Error(`samwise_geocode_import_${result.outcome}`)
  fail(await db.rpc("finish_canonical_authoritative_research_item", { p_run_id: runId, p_resource_id: handoff.miller_resource_id, p_outcome: "confirmed", p_reason_code: "samwise_v2_exact_civic_evidence", p_claim_id: claimId, p_evidence_id: result.evidence_id, p_actor_id: actorId }))
  fail(await db.rpc("complete_canonical_authoritative_research_run", { p_run_id: runId, p_actor_id: actorId }))
  console.log(JSON.stringify({ outcome: result.outcome, persisted: true, qc_version: result.qc_version, provider_requests: 0, publication_attempted: false, canonical_mutations: 0, location_mutations: 0 }))
} catch (error) {
  if (reserved) { try { await db.rpc("finish_canonical_authoritative_research_item", { p_run_id: runId, p_resource_id: handoff.miller_resource_id, p_outcome: "failed", p_reason_code: "samwise_v2_import_failed", p_claim_id: claimId, p_evidence_id: null, p_actor_id: actorId }) } catch {} }
  try { await db.rpc("complete_canonical_authoritative_research_run", { p_run_id: runId, p_actor_id: actorId }) } catch {}
  throw error
}
