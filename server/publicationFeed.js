import { randomUUID } from "node:crypto"
import { isCompleteNumberedAddress, isSensitiveOrNonFixed } from "./addressEvidence.js"
import { classifyBcAddressResults } from "./bcAddressGeocoder.js"
import { privateLocationEligibility } from "./privateLocation.js"

const text = (value) => String(value ?? "").trim()
const newest = (items, field = "updated_at") => [...items].sort((a, b) => String(b[field] || "").localeCompare(String(a[field] || "")))[0] || null

export function publicationFeedAssessment({ resource, claims = [], evidence = [], qc = null, locations = [] }) {
  if (locations.some((item) => item.location_type === "fixed" && item.public_map === true)) return { outcome: "already_published", distance: 99, reasons: ["already_published"] }
  const latestClaim = newest(claims, "last_observed_at"), address = text(latestClaim?.proposed_value)
  const sensitive = isSensitiveOrNonFixed({ name: resource?.display_name, address, service_type: resource?.service_type })
  if (sensitive || resource?.lifecycle_state !== "active" || resource?.editorial_status === "hidden") return { outcome: "not_map_eligible", distance: 99, reasons: ["not_map_eligible"] }
  const authoritative = evidence.some((item) => item.source_url && Number(item.source_authority) >= 85 && item.stale !== true)
  const occupancy = latestClaim?.recommendation === "auto_accept" && latestClaim?.confidence === "high" && authoritative
  const completeAddress = isCompleteNumberedAddress(address)
  const snapshot = qc?.review_snapshot || {}, geocoder = Number(snapshot.score) >= 90 && snapshot.coordinates?.latitude && snapshot.coordinates?.longitude
  const blockers = [...(!occupancy ? ["authoritative_occupancy_required"] : []), ...(!completeAddress ? ["complete_address_required"] : []), ...(!geocoder ? ["bc_geocoder_package_required"] : []), ...(!qc ? ["machine_qc_required"] : [])]
  if (!blockers.length && qc?.decision === "pilot_eligible") return { outcome: "ready_to_publish", distance: 0, reasons: [], latestClaim, address }
  if (!blockers.length && qc?.decision === "manual_review") return { outcome: "one_confirmation_away", distance: 0, reasons: ["human_qc_required"], latestClaim, address }
  return { outcome: "pending", distance: blockers.length, reasons: blockers, latestClaim, address, occupancy, completeAddress, geocoder }
}

export function rankPublicationFeedCandidates(contexts, limit = 10) {
  return contexts.map((context) => ({ context, assessment: publicationFeedAssessment(context) }))
    .filter((item) => !["already_published", "not_map_eligible"].includes(item.assessment.outcome))
    .sort((a, b) => a.assessment.distance - b.assessment.distance || String(a.context.resource.display_name).localeCompare(String(b.context.resource.display_name)))
    .slice(0, limit)
}

export async function processPublicationFeedItem({ runId, context, db, geocode, research, actorId, now = () => new Date().toISOString() }) {
  const resourceId = context.resource.id, leaseToken = randomUUID()
  const claimed = await db.rpc("claim_publication_feed_item", { p_run_id: runId, p_resource_id: resourceId, p_lease_token: leaseToken, p_lease_seconds: 300 })
  if (claimed.error) return { skipped: true, reason: "already_claimed_or_complete" }
  let assessment = publicationFeedAssessment(context)
  try {
    if (assessment.outcome !== "pending") return await finish(db, runId, resourceId, assessment.outcome, assessment.reasons, context.qc?.version)
    if ((!assessment.occupancy || !assessment.completeAddress) && research) {
      await db.from("publication_feed_run_items").update({ stage: "evidence", updated_at: now() }).eq("run_id", runId).eq("resource_id", resourceId)
      const researched = await research(context, assessment)
      if (researched) context = { ...context, ...researched }
      assessment = publicationFeedAssessment(context)
    }
    if (!assessment.occupancy || !assessment.completeAddress) return await finish(db, runId, resourceId, "machine_blocked", assessment.reasons, context.qc?.version)
    let snapshot = context.qc?.review_snapshot || null
    if (!assessment.geocoder) {
      const city = context.community || assessment.address.split(",").map((item) => item.trim()).filter(Boolean).at(-2) || ""
      const response = await geocode({ street_address: assessment.address, city })
      if (!response.ok) throw new Error(`geocoder_${response.status}`)
      const classified = classifyBcAddressResults(response.features, { street_address: assessment.address, city })
      if (classified.classification !== "exact_civic") return await finish(db, runId, resourceId, "machine_blocked", [`geocoder_${classified.classification}`], context.qc?.version)
      const best = classified.best
      snapshot = { submitted_address: assessment.address, returned_address: best.returned_address, locality: best.locality, score: best.score, precision: best.precision, precision_points: best.precision_points, faults: best.faults, location_descriptor: best.location_descriptor, site_id: best.site_id, coordinates: { latitude: best.latitude, longitude: best.longitude }, provider: best.provider, retrieved_at: now(), program_occupancy_confidence: "supported", source_url: context.evidence.find((item) => Number(item.source_authority) >= 85)?.source_url, source_evidence_tier: "E1", sensitivity_flags: [], conflicts: [] }
    }
    if (!context.qc) {
      const fingerprint = await digest(snapshot), saved = await db.rpc("create_location_qc_machine_review", { p_canonical_resource_id: resourceId, p_policy_version: "miller-publication-feed-v1", p_classification_fingerprint: fingerprint, p_review_snapshot: snapshot, p_reason: "Publication-feed machine package complete; human confirmation required.", p_actor_id: actorId })
      if (saved.error) throw saved.error
      context.qc = saved.data
    }
    const eligibility = privateLocationEligibility({ resource: context.resource, qc: context.qc, evidence: context.evidence, existingLocations: context.locations })
    const outcome = eligibility.eligible ? "ready_to_publish" : context.qc.decision === "manual_review" && privateLocationEligibility({ resource: context.resource, qc: { ...context.qc, decision: "pilot_eligible" }, evidence: context.evidence, existingLocations: context.locations }).eligible ? "one_confirmation_away" : "human_review"
    return await finish(db, runId, resourceId, outcome, eligibility.reasons, context.qc.version)
  } catch (error) {
    await db.from("publication_feed_run_items").update({ stage: "blocked", outcome: "pending", last_error: String(error.message || error).slice(0, 500), lease_token: null, lease_expires_at: null, updated_at: now() }).eq("run_id", runId).eq("resource_id", resourceId)
    return { outcome: "retryable_error", error: String(error.message || error) }
  }
}

async function digest(value) { const { createHash } = await import("node:crypto"); return createHash("sha256").update(JSON.stringify(value)).digest("hex") }
async function finish(db, runId, resourceId, outcome, reasons, qcVersion) { const stage = ["machine_blocked", "human_review"].includes(outcome) ? "blocked" : ["not_map_eligible"].includes(outcome) ? "excluded" : "routed"; const result = await db.from("publication_feed_run_items").update({ stage, outcome, reason_codes: reasons, qc_version: qcVersion || null, completed_at: new Date().toISOString(), lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString() }).eq("run_id", runId).eq("resource_id", resourceId).select().single(); if (result.error) throw result.error; return result.data }
