import { createHash, randomUUID } from "node:crypto"
export const CHAT_PUBLICATION_ACTION_V1 = "miller-chat-publication-action-v1"
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex")

export function preparePublicationAction({ resource, location, qc, geocoderEvidence, now = Date.now(), ttlMs = 5 * 60_000 } = {}) {
  const coordinates = qc?.review_snapshot?.coordinates || {}
  if (!resource?.id || !location?.id || !qc?.classification_fingerprint || qc.decision !== "pilot_eligible" || location.public_map || geocoderEvidence?.extracted_value?.address_identity?.fingerprint == null) throw new Error("chat_publication_not_prepared")
  const body={contract:CHAT_PUBLICATION_ACTION_V1,action_id:`publish_${randomUUID()}`,action:"publish_verified_map_pin",resource_id:resource.id,location_id:location.id,qc_version:Number(qc.version),qc_fingerprint:qc.classification_fingerprint,address_identity_fingerprint:geocoderEvidence.extracted_value.address_identity.fingerprint,coordinate_fingerprint:hash({latitude:Number(coordinates.latitude),longitude:Number(coordinates.longitude)}),expires_at:new Date(now+ttlMs).toISOString()}
  return Object.freeze({...body,proposal_fingerprint:hash(body)})
}
export function confirmPublicationAction({ action, confirmedActionId, now = Date.now(), current = {} } = {}) {
  if (!action || action.contract!==CHAT_PUBLICATION_ACTION_V1 || confirmedActionId!==action.action_id || action.action!=="publish_verified_map_pin") return {allowed:false,code:"unsupported_or_unconfirmed_action"}
  if (Date.parse(action.expires_at)<=now) return {allowed:false,code:"publication_action_expired"}
  if (current.resource_id!==action.resource_id||current.location_id!==action.location_id||Number(current.qc_version)!==action.qc_version||current.qc_fingerprint!==action.qc_fingerprint||current.address_identity_fingerprint!==action.address_identity_fingerprint||current.coordinate_fingerprint!==action.coordinate_fingerprint) return {allowed:false,code:"publication_action_stale"}
  if (current.public_map===true) return {allowed:true,code:"already_published",idempotent:true}
  if (current.public_eligible!==true) return {allowed:false,code:"publication_ineligible"}
  return {allowed:true,code:"ready_to_publish",idempotent:false}
}
