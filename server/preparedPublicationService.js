import { createChatPublicationConveyor } from "./chatPublicationConveyor.js"
import { publicationCoordinateFingerprint } from "./chatPublicationAction.js"

const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""))

async function one(query) { const { data, error } = await query; if (error) throw error; return data }

export function createPreparedPublicationService({ supabase, databasePath, actorId } = {}) {
  if (!supabase || !databasePath || !uuid(actorId)) throw new Error("prepared_publication_service_dependencies_required")
  const loadCurrent = async (action) => {
    const [resource, qc, locations, claims] = await Promise.all([
      one(supabase.from("resource_registry").select("id,lifecycle_state,editorial_status").eq("id", action.resource_id).maybeSingle()),
      one(supabase.from("location_qc_reviews").select("version,classification_fingerprint,decision,review_snapshot").eq("canonical_resource_id", action.resource_id).maybeSingle()),
      one(supabase.from("resource_locations").select("id,public_map").eq("resource_id", action.resource_id)),
      one(supabase.from("resource_fact_claims").select("id,field_name").eq("resource_id", action.resource_id)),
    ])
    const location = (locations || []).find((item) => item.id === action.location_id)
    const occupancy = (claims || []).find((item) => item.field_name === "location_occupancy")
    const evidence = occupancy ? await one(supabase.from("resource_fact_evidence").select("extracted_value").eq("claim_id", occupancy.id).eq("source_type", "bc_geocoder").neq("stale", true)) : []
    const identity = (evidence || []).map((item) => item.extracted_value?.address_identity?.fingerprint).find((item) => item === action.address_identity_fingerprint)
    const coords = qc?.review_snapshot?.coordinates || {}
    const mapEvaluation = occupancy && qc ? await one(supabase.rpc("classify_map_auto_publish_v1", { p_resource_id: action.resource_id, p_expected_qc_version: Number(qc.version), p_occupancy_claim_id: occupancy.id })) : null
    return {
      resource_id: resource?.id || null,
      location_id: location?.id || null,
      qc_version: Number(qc?.version),
      qc_fingerprint: qc?.classification_fingerprint || null,
      address_identity_fingerprint: identity || null,
      coordinate_fingerprint: publicationCoordinateFingerprint(coords),
      public_eligible: mapEvaluation?.decision === "auto_publish_eligible",
      public_map: location?.public_map === true,
    }
  }
  const publish = async (action) => {
    const { data, error } = await supabase.rpc("publish_verified_map_pin", { p_resource_id: action.resource_id, p_expected_qc_version: action.qc_version, p_actor_id: actorId })
    if (error || !data?.id || data.public_map !== true) throw new Error("prepared_publication_failed")
    return { outcome: "published" }
  }
  return createChatPublicationConveyor({ databasePath, loadCurrent, publish })
}
