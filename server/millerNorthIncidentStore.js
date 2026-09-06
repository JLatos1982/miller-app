import { createHash } from "node:crypto"

const sourceRole = (role = "") => {
  const value = String(role).toLowerCase()
  if (value.includes("institutional")) return "institutional_response"
  if (value.includes("government")) return "government_review"
  if (value.includes("human_rights")) return "human_rights_complaint"
  if (value.includes("litigation") || value.includes("legal") || value.includes("adjudicative")) return "regulatory_or_legal"
  if (value.includes("finding")) return "finding_or_determination"
  if (value.includes("context")) return "context"
  return "corroborating_report"
}

const timingFields = (timing = {}) => {
  if (timing.event_date) return { timing_semantic: "exact_event_date", timing_confidence: "strongly_supported" }
  if (timing.event_year) return { timing_semantic: "event_year", timing_confidence: "strongly_supported" }
  if (timing.approximate_event_year) return { timing_semantic: "approximate_event_year", timing_confidence: "approximate" }
  if (timing.publication_date) return { timing_semantic: "publication_only", timing_confidence: "publication_only" }
  return { timing_semantic: "unknown", timing_confidence: "unresolved" }
}

const fingerprint = (source = {}) => createHash("sha256").update([source.url, source.title, source.evidence].map(value => String(value || "").trim().toLowerCase()).join("\u001f")).digest("hex")
const compact = value => String(value || "").replace(/\s+/g, " ").trim()
const titleFor = ({ candidate, incident, identity }) => {
  if (identity.incident_identity_class === "unnamed_but_specific_incident") {
    const facility = compact(incident.facility_or_location || candidate.facility || "healthcare facility")
    const year = incident.timing?.event_year || incident.timing?.approximate_event_year || "timing unresolved"
    return `Patient not publicly named — ${facility} — ${year}`.slice(0, 240)
  }
  return compact(incident.working_title || identity.public_case_name || candidate.source_title || incident.facility_or_location || "Miller North incident proposal").slice(0, 240)
}

function identityFor({ candidate, incident }) {
  const incident_identity_class = incident.incident_identity_class || candidate.incident_identity_class || null
  const public_case_name = compact(incident.public_case_name || candidate.public_case_name || "") || null
  const event_identity_facts = incident.event_identity_facts || candidate.event_identity_facts || {}
  if (incident_identity_class === "named_incident" && !public_case_name) throw new Error("miller_north_named_incident_missing_public_case_name")
  if (incident_identity_class === "unnamed_but_specific_incident") {
    const timing = incident.timing || {}
    const distinctive = compact(event_identity_facts.distinctive_encounter_facts)
    if (public_case_name || !compact(incident.facility_or_location || candidate.facility) || !compact(candidate.municipality || incident.municipality) || !(timing.event_date || timing.event_year || timing.approximate_event_year) || distinctive.length < 12) {
      throw new Error("miller_north_unnamed_incident_identity_incomplete")
    }
  }
  return { incident_identity_class, public_case_name, event_identity_facts }
}
const sourceFor = (candidate, supporting, incidentId) => ({
  incident_id: incidentId,
  source_organization: supporting?.organization || candidate.source_organization,
  source_title: supporting?.title || candidate.source_title || null,
  source_url: supporting?.url || candidate.source_url,
  source_type: supporting?.source_type || candidate.source_type || null,
  publication_date: supporting?.publication_date || candidate.publication_date || null,
  source_role: supporting ? sourceRole(supporting.role) : "primary_report",
  relevant_evidence: supporting ? null : candidate.evidence_excerpt || null,
  evidence_confidence: supporting?.evidence_confidence || (supporting ? "supporting_source" : candidate.evidence_status),
  retrieval_fingerprint: supporting ? fingerprint(supporting) : candidate.source_fingerprint || fingerprint({ url: candidate.source_url, title: candidate.source_title, evidence: candidate.evidence_excerpt }),
  retrieval_state: "current",
  is_independent: supporting?.is_independent ?? true,
  provenance: { candidate_id: candidate.candidate_id, source_role_original: supporting?.role || "primary_report" },
})

export function buildMillerNorthIncidentSyncBatch({ incidents = [], candidates = [], expectedCount = null, expectedMultiSourceCount = null } = {}) {
  if (!Array.isArray(incidents) || !Array.isArray(candidates) || !incidents.length || incidents.length !== candidates.length || (expectedCount !== null && incidents.length !== expectedCount)) throw new Error("miller_north_invalid_proposal_batch")
  const candidatesById = new Map(candidates.map(candidate => [candidate.candidate_id, candidate]))
  const seenProposalIds = new Set(), seenFingerprints = new Set()
  const batch = incidents.map(incident => {
    const candidate = candidatesById.get(incident.created_from_candidate_id)
    if (!candidate || !/^mni_[a-f0-9]{24}$/.test(incident.proposed_incident_id) || !incident.province || !incident.summary || !incident.incident_fingerprint) throw new Error("miller_north_invalid_proposal")
    if (seenProposalIds.has(incident.proposed_incident_id) || seenFingerprints.has(incident.incident_fingerprint)) throw new Error("miller_north_duplicate_proposal")
    seenProposalIds.add(incident.proposed_incident_id); seenFingerprints.add(incident.incident_fingerprint)
    const timing = incident.timing || {}, semantics = timingFields(timing), identity = identityFor({ candidate, incident })
    const sources = [sourceFor(candidate, null, null), ...(candidate.supporting_sources || []).map(source => sourceFor(candidate, source, null))]
    return {
      incident: {
        legacy_proposal_id: incident.proposed_incident_id,
        corpus_id: incident.corpus_id,
        working_title: titleFor({ candidate, incident, identity }),
        public_case_name: identity.public_case_name,
        incident_identity_class: identity.incident_identity_class,
        identity_fingerprint_version: incident.identity_fingerprint_version || "miller-north-event-identity-v1",
        province: incident.province,
        municipality: candidate.municipality || null,
        facility: incident.facility_or_location || null,
        care_setting: candidate.care_setting || null,
        event_date: timing.event_date || null,
        event_year: timing.event_year || null,
        approximate_event_year: timing.approximate_event_year || null,
        publication_date: timing.publication_date || null,
        ...semantics,
        timing_derivation: { method: "miller_north_private_proposal", source_publication_date: timing.publication_date || null },
        incident_summary: incident.summary,
        reported_issue: candidate.reported_issue || null,
        evidence_status: incident.evidence_status,
        incident_fingerprint: incident.incident_fingerprint,
        event_identity_facts: identity.event_identity_facts,
        reconciliation_confidence: incident.reconciliation_confidence,
        duplicate_review_state: candidate.duplicate_reconciliation_state || "new_incident_candidate",
        proposal_state: "private_reconciliation_review",
        last_researched_at: new Date().toISOString(),
        change_revisit_state: "current",
        research_version: "miller-north-reconstructed-corpus-v2",
        provenance: {
          corpus_id: incident.corpus_id,
          candidate_id: candidate.candidate_id,
          stable_proposal_id: candidate.stable_proposal_id || null,
          source_evidence_record_ids: incident.source_evidence_record_ids || [],
          source_provenance: [candidate.source_url, ...(candidate.supporting_sources || []).map(source => source.url)].filter(Boolean),
          caution: candidate.caution || null,
        },
      },
      sources,
    }
  })
  if (expectedMultiSourceCount !== null && batch.filter(item => item.sources.length > 1).length !== expectedMultiSourceCount) throw new Error("miller_north_unexpected_multisource_count")
  return batch
}

export async function syncMillerNorthIncidentBatch({ supabase, batch }) {
  const incidents = batch.map(item => item.incident)
  const { data: rows, error } = await supabase.from("miller_north_incidents").upsert(incidents, { onConflict: "legacy_proposal_id" }).select("id,legacy_proposal_id")
  if (error) throw error
  const ids = new Map((rows || []).map(row => [row.legacy_proposal_id, row.id]))
  if (ids.size !== batch.length) throw new Error("miller_north_incident_upsert_incomplete")
  const sources = batch.flatMap(item => item.sources.map(source => ({ ...source, incident_id: ids.get(item.incident.legacy_proposal_id) })))
  const result = await supabase.from("miller_north_incident_sources").upsert(sources, { onConflict: "incident_id,source_url" }).select("id")
  if (result.error) throw result.error
  return { incident_count: rows.length, source_count: result.data?.length || 0 }
}

export async function readMillerNorthIncidentReview({ supabase }) {
  const { data: incidents, error } = await supabase.from("miller_north_incidents").select("*").order("last_researched_at", { ascending: false })
  if (error) throw error
  const ids = (incidents || []).map(item => item.id)
  if (!ids.length) return []
  const sourcesResult = await supabase.from("miller_north_incident_sources").select("*").in("incident_id", ids).order("created_at", { ascending: true })
  if (sourcesResult.error) throw sourcesResult.error
  const sourcesByIncident = new Map()
  for (const source of sourcesResult.data || []) sourcesByIncident.set(source.incident_id, [...(sourcesByIncident.get(source.incident_id) || []), source])
  // This remains backward-compatible until the prepared accountability migration
  // is applied. A missing private table must not make the existing incident
  // review unavailable, and no public route ever reads this data.
  const linksResult = await supabase.from("miller_north_accountability_action_incident_links").select("incident_id,relationship_type,relationship_confidence,relationship_summary,owner_review_flag,accountability_action:miller_north_accountability_actions(id,accountability_action_id,working_title,action_type,accountability_stage,action_date,action_date_text,implementation_status,publication_state)").in("incident_id", ids).order("created_at", { ascending: true })
  if (linksResult.error && !["42P01", "PGRST205"].includes(linksResult.error.code)) throw linksResult.error
  const actionDbIds = (linksResult.data || []).map(link => link.accountability_action?.id).filter(Boolean)
  const commitmentsResult = actionDbIds.length
    ? await supabase.from("miller_north_accountability_commitments").select("accountability_action_id,accountability_commitment_id,working_title,commitment_type,implementation_status,implementation_status_date,implementation_status_date_text,implementation_scope,repeat_recommendation_flag,owner_review_flag,publication_state").in("accountability_action_id", actionDbIds).order("date_issued", { ascending: true })
    : { data: [], error: null }
  if (commitmentsResult.error && !["42P01", "PGRST205"].includes(commitmentsResult.error.code)) throw commitmentsResult.error
  const policyLinksResult = await supabase.from("miller_north_policy_legal_instrument_incident_links").select("incident_id,relationship_type,relationship_confidence,relationship_summary,owner_review_flag,policy_legal_instrument:miller_north_policy_legal_instruments(policy_legal_instrument_id,working_title,instrument_type,current_status,binding_status,effective_date,effective_date_text,recurrence_signal,publication_state)").in("incident_id", ids).order("created_at", { ascending: true })
  if (policyLinksResult.error && !["42P01", "PGRST205"].includes(policyLinksResult.error.code)) throw policyLinksResult.error
  const commitmentsByAction = new Map()
  for (const commitment of commitmentsResult.data || []) commitmentsByAction.set(commitment.accountability_action_id, [...(commitmentsByAction.get(commitment.accountability_action_id) || []), commitment])
  const actionsByIncident = new Map()
  for (const link of linksResult.data || []) {
    if (!link.accountability_action) continue
    const { id: actionDbId, ...action } = link.accountability_action
    actionsByIncident.set(link.incident_id, [...(actionsByIncident.get(link.incident_id) || []), { ...action, commitments: commitmentsByAction.get(actionDbId) || [], relationship_type: link.relationship_type, relationship_confidence: link.relationship_confidence, relationship_summary: link.relationship_summary, owner_review_flag: link.owner_review_flag }])
  }
  const policiesByIncident = new Map()
  for (const link of policyLinksResult.data || []) {
    if (!link.policy_legal_instrument) continue
    policiesByIncident.set(link.incident_id, [...(policiesByIncident.get(link.incident_id) || []), { ...link.policy_legal_instrument, relationship_type: link.relationship_type, relationship_confidence: link.relationship_confidence, relationship_summary: link.relationship_summary, owner_review_flag: link.owner_review_flag }])
  }
  return incidents.map(item => ({
    proposed_incident_id: item.legacy_proposal_id,
    corpus_id: item.corpus_id,
    proposal_state: item.proposal_state,
    public_case_name: item.public_case_name,
    incident_identity_class: item.incident_identity_class,
    event_identity_facts: item.event_identity_facts,
    province: item.province,
    facility_or_location: item.facility,
    timing: { event_date: item.event_date, event_year: item.event_year, approximate_event_year: item.approximate_event_year, publication_date: item.publication_date },
    summary: item.incident_summary,
    evidence_status: item.evidence_status,
    source_evidence_record_ids: item.provenance?.source_evidence_record_ids || [],
    source_urls: (sourcesByIncident.get(item.id) || []).map(source => source.source_url),
    supporting_sources: (sourcesByIncident.get(item.id) || []).filter(source => source.source_role !== "primary_report").map(source => ({ role: source.source_role, organization: source.source_organization, url: source.source_url, publication_date: source.publication_date })),
    accountability_actions: actionsByIncident.get(item.id) || [],
    policy_legal_instruments: policiesByIncident.get(item.id) || [],
    reconciliation_confidence: item.reconciliation_confidence,
    incident_fingerprint: item.incident_fingerprint,
  }))
}
