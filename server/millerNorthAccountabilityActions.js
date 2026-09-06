import { createHash } from "node:crypto"

export const ACCOUNTABILITY_ACTION_TYPES = new Set([
  "formal_review", "final_report_recommendations", "apology", "governance_change", "policy_practice_change", "training_standard", "regulatory_legislative_change", "progress_report", "oversight_complaint_mechanism", "legal_human_rights_process",
])
export const ACCOUNTABILITY_STAGES = new Set([
  "allegation", "investigation_started", "investigation_completed", "finding", "recommendation", "commitment", "implementation_started", "implementation_partial", "implementation_completed", "implementation_unclear", "follow_up_review",
])
export const ACTION_SOURCE_ROLES = new Set(["underlying_incident", "investigation", "finding", "recommendation", "commitment", "implementation", "follow_up"])
export const PRIVATE_PUBLICATION_STATES = new Set(["staged_private_review", "owner_review_required", "approved_for_publication", "publication_blocked"])

const actionTypeMap = {
  formal_investigation_or_review: "formal_review",
  final_report_and_recommendations: "final_report_recommendations",
  apology_or_acknowledgement: "apology",
  governance_or_leadership_change: "governance_change",
  policy_or_practice_change: "policy_practice_change",
  training_or_standard: "training_standard",
  regulatory_or_legislative_change: "regulatory_legislative_change",
  progress_or_implementation_report: "progress_report",
  oversight_or_complaint_mechanism: "oversight_complaint_mechanism",
  legal_or_human_rights_process: "legal_human_rights_process",
}
const evidenceClasses = new Set(["official_primary_source", "official_plus_independent_corroboration", "independent_corroboration", "reported_unconfirmed", "owner_review_required"])
const clean = value => String(value || "").replace(/\s+/g, " ").trim()
const digest = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")
const sourceOrganization = url => {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "")
    if (host.endsWith("gov.bc.ca")) return "Government of British Columbia"
    if (host.endsWith("alberta.ca")) return "Government of Alberta"
    if (host.endsWith("saskhealthauthority.ca")) return "Saskatchewan Health Authority"
    if (host.endsWith("saskhrc.ca")) return "Saskatchewan Human Rights Commission"
    if (host.endsWith("canada.ca")) return "Government of Canada"
    if (host.endsWith("cpsa.ca")) return "College of Physicians and Surgeons of Alberta"
    if (host.endsWith("fnhoo.ca")) return "First Nations Health Ombudsperson Office"
    if (host.endsWith("aptnnews.ca")) return "APTN News"
    if (host.endsWith("globalnews.ca")) return "Global News"
    return host
  } catch { return "Source organization not captured in benchmark" }
}
const independent = url => !/(gov\.bc\.ca|alberta\.ca|saskhealthauthority\.ca|saskhrc\.ca|canada\.ca|cpsa\.ca|fnhoo\.ca|fnha\.ca|bccdc\.ca|iportal\.usask\.ca|senatorboyer\.ca)/i.test(url || "")
const actionDateFields = value => {
  const text = clean(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return { action_date: text, action_year: Number(text.slice(0, 4)), approximate_action_year: null, action_date_text: text, action_timing_semantic: "exact_action_date" }
  if (/^\d{4}$/.test(text)) return { action_date: null, action_year: Number(text), approximate_action_year: null, action_date_text: text, action_timing_semantic: "action_year" }
  if (/\d{4}/.test(text)) return { action_date: null, action_year: null, approximate_action_year: null, action_date_text: text, action_timing_semantic: "date_range_or_month" }
  return { action_date: null, action_year: null, approximate_action_year: null, action_date_text: null, action_timing_semantic: "unknown" }
}
const implementationStatus = value => {
  const text = clean(value).toLowerCase()
  if (/complaint outcome|outcome.*not|legal and complaint|current certification|not publicly|not located|not established|need.*verification|cannot be inferred/.test(text)) return "outcome_not_public"
  if (/partial|partly|81%|some actions|further.*ongoing/.test(text)) return "partial"
  if (/operational/.test(text)) return "operational"
  if (/implemented|created|appointed|released; organization-level adoption/.test(text)) return "implemented"
  if (/completed/.test(text)) return "completed"
  if (/underway|in progress|under review|results under review|phased/.test(text)) return "underway"
  if (/announced|planned|plan published|recommendations accepted|commitments/.test(text)) return "announced_or_planned"
  if (/apology/.test(text)) return "not_applicable"
  return "unclear"
}
const stageFor = record => {
  if (record.proposed_record_id === "iha_sk_007") return "finding"
  if (record.accountability_action_type === "legal_or_human_rights_process") return "allegation"
  if (record.accountability_action_type === "formal_investigation_or_review") return "investigation_started"
  if (record.accountability_action_type === "final_report_and_recommendations") return "recommendation"
  if (record.accountability_action_type === "apology_or_acknowledgement") return "commitment"
  if (record.accountability_action_type === "progress_or_implementation_report") return "follow_up_review"
  const status = implementationStatus(record.implementation_status)
  if (["implemented", "completed", "operational"].includes(status)) return "implementation_completed"
  if (status === "partial") return "implementation_partial"
  if (status === "underway") return "implementation_started"
  if (status === "outcome_not_public" || status === "unclear") return "implementation_unclear"
  return "commitment"
}
const sourceRoleFor = stage => ({
  allegation: "investigation", investigation_started: "investigation", investigation_completed: "finding", finding: "finding", recommendation: "recommendation", commitment: "commitment", implementation_started: "implementation", implementation_partial: "implementation", implementation_completed: "implementation", implementation_unclear: "implementation", follow_up_review: "follow_up",
}[stage])

export function normalizeBenchmarkAccountabilityRecord(record) {
  const action_type = actionTypeMap[record?.accountability_action_type]
  if (!record?.proposed_record_id || !action_type || !ACCOUNTABILITY_ACTION_TYPES.has(action_type)) throw new Error("miller_north_accountability_action_type_invalid")
  if (!record.accountability_chain_id || !/^[a-z0-9][a-z0-9_]{2,119}$/.test(record.accountability_chain_id)) throw new Error("miller_north_accountability_chain_invalid")
  if (!evidenceClasses.has(record.evidence_strength)) throw new Error("miller_north_accountability_evidence_class_invalid")
  const accountability_stage = stageFor(record)
  const implementation_status = implementationStatus(record.implementation_status)
  const owner_review_flag = Boolean(record.owner_review_flag)
  const owner_review_reason = owner_review_flag ? clean(record.owner_review_reason) || "Benchmark source or outcome requires owner review." : null
  const actionDate = actionDateFields(record.accountability_action_date)
  const core = {
    benchmark_candidate_id: record.proposed_record_id,
    accountability_chain_id: record.accountability_chain_id,
    working_title: clean(record.factual_title),
    province: record.province,
    community_location: clean(record.community_location) || null,
    healthcare_organization: clean(record.healthcare_organization) || null,
    relevant_indigenous_community: clean(record.relevant_indigenous_community) || null,
    action_type,
    accountability_stage,
    ...actionDate,
    triggering_incident_summary: clean(record.triggering_incident_or_problem),
    action_summary: clean(record.summary),
    recommendations: clean(record.recommendations_or_commitments) || null,
    implementation_status,
    implementation_status_detail: clean(record.implementation_status) || null,
    implementation_evidence_date: null,
    implementation_evidence_date_text: clean(record.follow_up_date_or_progress_report) || null,
    evidence_classification: record.evidence_strength,
    confidence: record.confidence_level,
    owner_review_flag,
    owner_review_reason,
    publication_state: owner_review_flag ? "owner_review_required" : "staged_private_review",
    research_version: "miller-north-accountability-benchmark-v1",
    provenance: { benchmark_record_id: record.proposed_record_id, source_type_original: record.source_type, no_production_import: true },
  }
  const accountability_action_id = `maa_${digest(`miller-north-accountability-v1\u001f${record.proposed_record_id}`).slice(0, 24)}`
  const action_fingerprint = digest([core.accountability_chain_id, core.working_title.toLowerCase(), core.action_type, core.action_date_text || ""])
  const urls = [record.primary_source_url, ...(record.corroborating_source_urls || [])].filter(Boolean)
  if (!urls.length) throw new Error("miller_north_accountability_source_missing")
  const primary = record.primary_source_url || urls[0]
  const sources = urls.map((source_url, index) => ({
    source_organization: sourceOrganization(source_url), source_title: index === 0 ? clean(record.factual_title) : null, source_url,
    source_type: record.source_type || null, publication_date: null, source_role: sourceRoleFor(accountability_stage), relevant_evidence: index === 0 ? clean(record.summary) : null,
    evidence_classification: record.evidence_strength, retrieval_fingerprint: digest(source_url), retrieval_state: "current", is_independent: independent(source_url),
    provenance: { benchmark_record_id: record.proposed_record_id, source_position: source_url === primary ? "primary" : "corroborating", publication_date_status: "not_captured_in_benchmark" },
  }))
  return { action: { ...core, accountability_action_id, action_fingerprint }, sources }
}

export function buildAccountabilityFixtureBatch({ records = [] } = {}) {
  if (!Array.isArray(records) || !records.length) throw new Error("miller_north_accountability_fixture_empty")
  const seenIds = new Set(), seenFingerprints = new Set(), batch = []
  for (const record of records) {
    const item = normalizeBenchmarkAccountabilityRecord(record)
    if (seenIds.has(item.action.accountability_action_id) || seenFingerprints.has(item.action.action_fingerprint)) throw new Error("miller_north_accountability_duplicate_action")
    seenIds.add(item.action.accountability_action_id); seenFingerprints.add(item.action.action_fingerprint)
    batch.push(item)
  }
  return batch
}

export function validateAccountabilityFixtureBatch({ records = [] } = {}) {
  const batch = buildAccountabilityFixtureBatch({ records })
  const chains = new Map(), byStatus = { fully_model_compatible: 0, compatible_after_normalization: 0, ambiguous: 0, rejected: 0, requiring_owner_review: 0 }
  for (const item of batch) {
    const source = records.find(record => record.proposed_record_id === item.action.benchmark_candidate_id)
    chains.set(item.action.accountability_chain_id, (chains.get(item.action.accountability_chain_id) || 0) + 1)
    if (item.action.owner_review_flag) byStatus.requiring_owner_review += 1
    if (source?.accountability_action_type !== item.action.action_type || item.action.action_date_text !== source?.accountability_action_date || item.action.implementation_status_detail !== source?.implementation_status) byStatus.compatible_after_normalization += 1
    else byStatus.fully_model_compatible += 1
  }
  return { batch, counts: byStatus, chain_count: chains.size, multi_stage_chain_count: [...chains.values()].filter(count => count > 1).length, unrepresented_benchmark_fields: ["source publication date is not captured per URL", "named organizations remain in record provenance rather than a separate organization table", "implementation evidence dates are sometimes only free text"] }
}

export function assertPrivateAccountabilityPayload(action) {
  if (!action || !ACCOUNTABILITY_ACTION_TYPES.has(action.action_type) || !ACCOUNTABILITY_STAGES.has(action.accountability_stage) || !PRIVATE_PUBLICATION_STATES.has(action.publication_state)) throw new Error("miller_north_accountability_payload_invalid")
  if (action.owner_review_flag && (!action.owner_review_reason || action.publication_state === "approved_for_publication")) throw new Error("miller_north_accountability_owner_review_gate")
  if (!/^maa_[a-f0-9]{24}$/.test(action.accountability_action_id)) throw new Error("miller_north_accountability_id_invalid")
  return true
}
