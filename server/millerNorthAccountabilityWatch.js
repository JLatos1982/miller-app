const CHAIN_STATUSES = new Set(["implementation_underway", "partial_implementation_evidence", "operating_with_outcome_gap", "response_under_review", "procedural_outcome_with_gaps"])
const CONFIDENCE = new Set(["high", "medium", "bounded"])
const VERIFICATION_STATUSES = new Set(["lead", "verification_in_progress", "corroborated_public_report", "formal_finding", "held"])
const SOURCE_TYPES = new Set(["indigenous_journalism", "regional_journalism", "news_report", "official_investigation", "institutional_response", "human_rights_or_legal", "professional_regulator", "coroner_or_inquest", "academic_research", "commentary", "first_person_public_report"])
const FORBIDDEN_INCIDENT_FIELDS = ["patient_name", "private_notes", "medical_records", "date_of_birth", "private_contact", "ordinary_username"]
const text = value => typeof value === "string" && value.trim().length > 0

export function validateAccountabilityWatch(watch) {
  if (!watch || watch.schema_version !== "miller-north-accountability-watch-v1" || !Array.isArray(watch.chains) || watch.chains.length < 1) throw new Error("miller_north_watch_invalid")
  const ids = new Set()
  for (const chain of watch.chains) {
    if (!/^mnaw_[a-z0-9_]+$/.test(chain.chain_id || "") || ids.has(chain.chain_id) || !text(chain.title) || !text(chain.province) || !text(chain.originating_concern) || !text(chain.key_finding) || !text(chain.recommendation_or_commitment) || !Array.isArray(chain.responsible_organizations) || !chain.responsible_organizations.length || !Array.isArray(chain.accountable_actors) || !chain.accountable_actors.length || !text(chain.implementation_action_claimed) || !text(chain.implementation_evidence) || !CHAIN_STATUSES.has(chain.current_status) || !text(chain.unresolved_gap) || !text(chain.contradictions_or_limitations) || !/^\d{4}-\d\d-\d\d$/.test(chain.last_reviewed || "") || !text(chain.best_next_document) || !CONFIDENCE.has(chain.confidence) || !text(chain.evidence_quality) || !Array.isArray(chain.sources) || !chain.sources.length || !chain.sources.every(source => text(source.title) && text(source.role) && /^https:\/\//.test(source.url || ""))) throw new Error("miller_north_watch_chain_invalid")
    ids.add(chain.chain_id)
  }
  return { valid: true, chains: watch.chains.length }
}

const sourceKey = chain => new Set(chain.sources.map(source => source.url))
const addedValues = (before = [], after = []) => after.filter(value => !new Set(before).has(value))

export function compareAccountabilityWatch(previous, current) {
  validateAccountabilityWatch(previous); validateAccountabilityWatch(current)
  const before = new Map(previous.chains.map(chain => [chain.chain_id, chain]))
  const changes = []
  for (const chain of current.chains) {
    const old = before.get(chain.chain_id)
    if (!old) { changes.push({ chain_id: chain.chain_id, kind: "new_chain", severity: "material", summary: "A new, source-backed accountability chain was added." }); continue }
    if (old.current_status !== chain.current_status) changes.push({ chain_id: chain.chain_id, kind: "status_changed", severity: "material", from: old.current_status, to: chain.current_status, summary: "Public evidence changed the chain’s implementation status." })
    if (old.confidence !== chain.confidence) changes.push({ chain_id: chain.chain_id, kind: "confidence_changed", severity: "material", from: old.confidence, to: chain.confidence, summary: "New or contradictory source evidence changed confidence." })
    if (old.implementation_evidence !== chain.implementation_evidence) changes.push({ chain_id: chain.chain_id, kind: "implementation_evidence_changed", severity: "material", summary: "The reviewed public evidence of implementation changed." })
    if (old.recommendation_or_commitment !== chain.recommendation_or_commitment) changes.push({ chain_id: chain.chain_id, kind: "commitment_changed", severity: "material", summary: "The documented recommendation or commitment changed." })
    if (old.contradictions_or_limitations !== chain.contradictions_or_limitations) changes.push({ chain_id: chain.chain_id, kind: "limitation_or_contradiction_changed", severity: "material", summary: "A material limitation or contradiction changed." })
    if (old.province !== chain.province) changes.push({ chain_id: chain.chain_id, kind: "geography_corrected", severity: "material", from: old.province, to: chain.province, summary: "The source-supported accountability geography was corrected." })
    if (JSON.stringify(old.responsible_organizations) !== JSON.stringify(chain.responsible_organizations)) changes.push({ chain_id: chain.chain_id, kind: "responsibility_changed", severity: "material", summary: "The documented responsible organizations changed." })
    const oldSources = sourceKey(old), newSources = sourceKey(chain)
    const added = [...newSources].filter(url => !oldSources.has(url))
    if (added.length) changes.push({ chain_id: chain.chain_id, kind: "new_accountability_document", severity: "material", source_urls: added, summary: "A new source was added to the accountability chain." })
    const removed = [...oldSources].filter(url => !newSources.has(url))
    if (removed.length) changes.push({ chain_id: chain.chain_id, kind: "accountability_document_removed", severity: "material", source_urls: removed, summary: "A previously reviewed source was removed and requires an evidence review." })
    const relatedIncidents = addedValues(old.related_incident_refs, chain.related_incident_refs)
    if (relatedIncidents.length) changes.push({ chain_id: chain.chain_id, kind: "new_related_incident", severity: "material", related_incident_refs: relatedIncidents, summary: "A reviewed incident was associated with this accountability chain." })
    if (old.legal_or_regulatory_outcome !== chain.legal_or_regulatory_outcome && chain.legal_or_regulatory_outcome) changes.push({ chain_id: chain.chain_id, kind: "legal_or_regulatory_outcome_changed", severity: "material", summary: "A reviewed legal or regulatory outcome changed." })
    if (old.classification !== chain.classification && chain.classification) changes.push({ chain_id: chain.chain_id, kind: "classification_corrected", severity: "material", summary: "The source-supported chain classification was corrected." })
  }
  return { schema_version: "miller-north-accountability-watch-change-v1", meaningful_changes: changes, suppressed_review_only_changes: current.chains.filter(chain => before.has(chain.chain_id)).length - new Set(changes.map(change => change.chain_id)).size }
}

export function validateLiveIncidentCandidate(candidate) {
  if (!candidate || !text(candidate.candidate_id) || !text(candidate.title) || !/^\d{4}-\d\d-\d\d$/.test(candidate.last_reviewed || "") || !SOURCE_TYPES.has(candidate.source_type) || !VERIFICATION_STATUSES.has(candidate.verification_status) || !text(candidate.primary_source_url) || !/^https:\/\//.test(candidate.primary_source_url)) throw new Error("miller_north_live_incident_candidate_invalid")
  if (FORBIDDEN_INCIDENT_FIELDS.some(field => candidate[field] != null && candidate[field] !== "")) throw new Error("miller_north_live_incident_private_field")
  if (candidate.incident_date && !/^\d{4}(-\d\d(-\d\d)?)?$/.test(candidate.incident_date)) throw new Error("miller_north_live_incident_date_invalid")
  if (candidate.publication_date && !/^\d{4}-\d\d-\d\d$/.test(candidate.publication_date)) throw new Error("miller_north_live_incident_publication_date_invalid")
  if (candidate.corroborating_sources && !candidate.corroborating_sources.every(source => /^https:\/\//.test(source.url || "") && text(source.role))) throw new Error("miller_north_live_incident_source_invalid")
  if (candidate.affected_person_description && candidate.affected_person_description.length > 160) throw new Error("miller_north_live_incident_person_detail_too_long")
  return { valid: true }
}

export function assessLiveIncidentCandidate(candidate, { knownEventKeys = [] } = {}) {
  const flags = []
  if (candidate.organization_jurisdiction && candidate.province && candidate.organization_jurisdiction !== "canada" && candidate.organization_jurisdiction !== candidate.province) flags.push("organization_jurisdiction_inconsistent_with_province")
  if (candidate.source_scope === "canada" && candidate.province && candidate.province !== "canada") flags.push("national_source_assigned_to_province")
  if (candidate.source_type === "academic_research" && candidate.evidence_status === "official_investigation") flags.push("academic_research_labeled_investigation")
  if (candidate.source_type === "institutional_response" && ["reported_account", "corroborated_account"].includes(candidate.evidence_status)) flags.push("institutional_response_labeled_incident")
  if (candidate.source_type === "news_report" && candidate.evidence_status === "formal_finding") flags.push("news_report_labeled_finding")
  if (candidate.source_type === "commentary" && candidate.primary_evidence === true) flags.push("commentary_labeled_primary_evidence")
  if (candidate.event_key && knownEventKeys.includes(candidate.event_key)) flags.push("possible_duplicate_event")
  if (candidate.incident_location_basis === "publisher_location" || candidate.source_publication_location_used_as_incident_location === true) flags.push("publication_location_may_be_incident_location")
  return { safe_to_stage: flags.length === 0 && candidate.verification_status === "corroborated_public_report", flags, required_review: flags.length > 0 || candidate.verification_status !== "corroborated_public_report" }
}
