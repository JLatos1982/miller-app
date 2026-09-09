import { PALANTIR_DISPLAY_NAME, SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID, SAMWISE_PUBLIC_RECORD_DOMAINS } from "./samwisePublicRecordsIntelligence.js"
import { buildSamwiseResearchSourceCatalog, planSamwiseUniversalResearch } from "./samwiseResearchWorkflow.js"

const clean = (value, limit = 180) => String(value ?? "").normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
const sum = (items, field) => items.reduce((total, item) => total + Number(item?.[field] || 0), 0)
const jurisdictionKey = value => {
  const normalized = clean(value, 80).toLowerCase().replace(/[^a-z]/g, "")
  if (["bc", "britishcolumbia"].includes(normalized)) return "british_columbia"
  if (["ab", "alberta"].includes(normalized)) return "alberta"
  if (["sk", "saskatchewan"].includes(normalized)) return "saskatchewan"
  if (["ca", "canada", "federal", "national"].includes(normalized)) return "canada"
  return normalized
}

export function samwiseListenerOperationalState(listener = {}) {
  if (["failed", "deferred", "quarantined"].includes(listener.status)) return listener.status
  if (listener.status === "running") return "running"
  if (Number(listener.owner_review || 0) > 0) return "owner_review"
  if (Number(listener.material_changes || 0) + Number(listener.new_documents || 0) + Number(listener.updated_documents || 0) > 0) return "changed"
  if (["completed", "no_material_change"].includes(listener.status)) return "completed"
  return "scheduled"
}

export function buildSamwisePublicRecordsStatus({ listeners = [], history = [], reviewItems = [], researchMemories = [], researchExecutions = [], learningLedger = null, recommendationLedgers = [], claimLedgers = [], milestones = [], coverageMatrices = [], primitiveChanges = [], questionLedgers = [], questionChanges = [], now = new Date() } = {}) {
  const generatedAt = new Date(now).toISOString()
  const recentCutoff = new Date(generatedAt).getTime() - 7 * 86_400_000
  const recent = history.filter(item => new Date(item.completed_at || item.timestamp || 0).getTime() >= recentCutoff)
  const publicRecordListeners = listeners.filter(item => item.capability_id === SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID)
  const operationalStates = ["scheduled", "running", "completed", "changed", "owner_review", "failed", "deferred", "quarantined"]
  const domains = Object.fromEntries(SAMWISE_PUBLIC_RECORD_DOMAINS.map(domain => [domain, { checked: 0, changed: 0, findings: 0, cross_domain: 0 }]))
  for (const run of recent) {
    for (const [domain, metrics] of Object.entries(run.domain_counts || {})) {
      if (!domains[domain]) continue
      domains[domain].checked += Number(metrics.checked || 0)
      domains[domain].changed += Number(metrics.changed || 0)
      domains[domain].findings += Number(metrics.relevant || 0)
    }
    for (const discovery of run.cross_lane_discoveries || []) {
      const primary = clean(discovery.primary_domain, 80)
      if (domains[primary]) domains[primary].cross_domain += 1
    }
  }
  const next = publicRecordListeners.filter(item => item.enabled && item.next_run_at).sort((left, right) => String(left.next_run_at).localeCompare(String(right.next_run_at)))[0] || null
  return Object.freeze({
    schema_version: "samwise-public-records-status-v1",
    capability_id: SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID,
    display_name: PALANTIR_DISPLAY_NAME,
    generated_at: generatedAt,
    listeners: {
      registered: publicRecordListeners.length,
      enabled: publicRecordListeners.filter(item => item.enabled).length,
      disabled: publicRecordListeners.filter(item => !item.enabled).length,
      by_state: Object.fromEntries(operationalStates.map(state => [state, publicRecordListeners.filter(item => samwiseListenerOperationalState(item) === state).length])),
      failed_or_deferred: publicRecordListeners.filter(item => ["failed", "deferred", "quarantined"].includes(item.status)).map(item => clean(item.listener_id, 120)),
    },
    activity: {
      runs: recent.length,
      documents_checked: sum(recent, "checked"),
      new_documents: sum(recent, "new_documents"),
      changed_documents: sum(recent, "updated_documents"),
      new_events: sum(recent, "new_events"),
      evidence_upgrades: sum(recent, "existing_events_strengthened"),
      owner_review: reviewItems.filter(item => item.review_state === "pending").length,
    },
    domains,
    research: {
      requests_remembered: researchMemories.length,
      continuable: researchMemories.filter(item => item?.schema_version === "samwise-research-memory-v1" && !["owner_stopped", "sources_exhausted"].includes(item.stopping_reason)).length,
      live_or_milestone: researchMemories.filter(item => item?.stopping_reason === "milestone_pending").length,
      cross_domain_discoveries: researchMemories.reduce((sum, item) => sum + (item?.secondary_relevance || []).filter(review => review.domains?.length).length, 0),
      plans_running: researchExecutions.filter(item => item?.state === "running").length,
      plans_paused: researchExecutions.filter(item => item?.state === "paused").length,
      plans_completed: researchExecutions.filter(item => item?.state === "completed").length,
      source_checkpoints: researchExecutions.reduce((sum, item) => sum + (item?.source_checkpoints || []).filter(checkpoint => ["completed", "no_material_change"].includes(checkpoint.status)).length, 0),
      operational_lessons: learningLedger?.schema_version === "palantir-operational-learning-ledger-v1" ? learningLedger.lessons.length : 0,
    },
    intelligence_primitives: {
      claims: claimLedgers.reduce((total, ledger) => total + Number(ledger?.counts?.claims || ledger?.claims?.length || 0), 0),
      claim_relationships: claimLedgers.reduce((total, ledger) => total + Number(ledger?.counts?.relationships || 0), 0),
      claim_contradictions: claimLedgers.reduce((total, ledger) => total + Number(ledger?.counts?.contradictions || 0), 0),
      unresolved_claim_conflicts: claimLedgers.reduce((total, ledger) => total + Number(ledger?.counts?.unresolved_conflicts || 0), 0),
      unresolved_claim_gaps: claimLedgers.reduce((total, ledger) => total + (ledger?.claims || []).filter(claim => ["partially_supported", "disputed", "contradicted", "unresolved"].includes(claim.claim_status)).length, 0),
      institutional_claims_without_independent_evidence: claimLedgers.reduce((total, ledger) => {
        const independent = new Set((ledger?.claims || []).filter(claim => ["independent_follow_up", "formal_finding"].includes(claim.verification_state)).map(claim => claim.claim_id))
        return total + (ledger?.claims || []).filter(claim => claim.verification_state === "institution_self_report" && !(ledger.relationships || []).some(relation => relation.to_claim_id === claim.claim_id && independent.has(relation.from_claim_id) && relation.review_state === "confirmed")).length
      }, 0),
      recommendations: recommendationLedgers.reduce((total, ledger) => total + Number(ledger?.counts?.recommendations || ledger?.recommendations?.length || 0), 0),
      recommendation_changes: primitiveChanges.filter(item => item?.schema_version === "palantir-recommendation-change-v1").reduce((total, item) => total + Number(item.material_changes || 0), 0),
      milestones: milestones.length,
      upcoming_milestones: milestones.filter(item => !["document_found", "closed_public_trail", "cancelled"].includes(item.current_status)).length,
      coverage_matrices: coverageMatrices.length,
      coverage_gaps: coverageMatrices.reduce((total, matrix) => total + (matrix.cells || []).filter(cell => cell.gap_type !== "evidence_present").length, 0),
      acquisition_failures: coverageMatrices.reduce((total, matrix) => total + Number(matrix.counts?.source_acquisition_failure || 0), 0),
      research_questions: questionLedgers.reduce((total, ledger) => total + Number(ledger?.questions?.length || 0), 0),
      questions_open: questionLedgers.reduce((total, ledger) => total + (ledger?.questions || []).filter(question => ["open", "researching", "watching", "blocked_by_missing_data", "blocked_by_governance"].includes(question.resolution_state)).length, 0),
      questions_partially_answered: questionLedgers.reduce((total, ledger) => total + (ledger?.questions || []).filter(question => question.resolution_state === "partially_answered").length, 0),
      questions_answered: questionLedgers.reduce((total, ledger) => total + (ledger?.questions || []).filter(question => question.resolution_state === "answered").length, 0),
      question_material_changes: questionChanges.filter(item => item?.schema_version === "palantir-question-evidence-assessment-v1" && item.material).length,
    },
    next_scheduled: next ? { listener_id: clean(next.listener_id, 120), at: clean(next.next_run_at, 40), worker: clean(next.execution_target, 30) } : null,
    private_owner_interface: true,
    raw_sensitive_narratives_exposed: false,
    mutation_authority: false,
    publication_authority: false,
  })
}

export function planSamwisePublicRecordsRequest(request, sourceRegistry, { maxSources = 8 } = {}) {
  if (request?.schema_version !== "farm-owner-request-v1" || request.request_type !== "research_public_records" || request.target_id !== SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID) throw new Error("samwise_public_records_request_invalid")
  if (sourceRegistry?.schema_version !== "samwise-public-record-source-registry-v1") throw new Error("samwise_source_registry_invalid")
  const requestedDomains = new Set(request.parameters?.domains || [])
  const jurisdiction = jurisdictionKey(request.parameters?.jurisdiction)
  const sources = sourceRegistry.sources.filter(source => {
    const domainMatch = !requestedDomains.size || source.supported_domains.some(domain => requestedDomains.has(domain))
    const sourceJurisdiction = jurisdictionKey(source.jurisdiction)
    const jurisdictionMatch = !jurisdiction || sourceJurisdiction === jurisdiction || sourceJurisdiction === "multijurisdiction"
    return source.enabled && domainMatch && jurisdictionMatch
  }).slice(0, Math.max(1, Math.min(8, maxSources)))
  return Object.freeze({
    schema_version: "samwise-public-records-request-plan-v1",
    request_fingerprint: request.request_fingerprint,
    capability_id: SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID,
    operation: "bounded_listener_selection",
    source_ids: sources.map(source => source.source_id),
    listener_ids: sources.map(source => source.legacy_listener_id),
    parameters: request.parameters,
    state: sources.length ? "owner_review" : "deferred",
    defer_reason: sources.length ? null : "no_enabled_matching_source",
    arbitrary_url_allowed: false,
    arbitrary_command_allowed: false,
    automatic_execution: false,
    mutation_authority: false,
    publication_authority: false,
  })
}

export function planConversationalSamwiseResearch(request, listenerSourceRegistry, options = {}) {
  const sourceCatalog = buildSamwiseResearchSourceCatalog({ listenerRegistry: listenerSourceRegistry })
  return planSamwiseUniversalResearch(request, sourceCatalog, options)
}

export const samwisePublicRecordsConversationalQueries = Object.freeze([
  "What did Palantír find today?",
  "Any new public-record findings?",
  "What changed in Alberta?",
  "What legal decisions are awaiting review?",
  "Did the police listener uncover healthcare evidence?",
  "Which child and youth findings strengthen existing chains?",
  "What resources did the intelligence engine discover?",
  "What needs my review?",
  "What did Palantír find outside Miller North?",
  "What research jobs are active?",
  "Continue my public-benefits research.",
  "Pause this research.",
  "Cancel this research but keep what it already found.",
  "What did Palantír learn operationally?",
  "Did workplace-safety research find anything relevant to Miller?",
  "Which institution has new material?",
  "What new funding programs appeared?",
  "Did an unrelated listener discover anything useful for Miller?",
  "Did anything strengthen an existing Miller North chain?",
  "What recommendations changed?",
  "What milestones are coming up?",
  "Where are the biggest coverage gaps?",
  "Which institutions need follow-up?",
  "Who is claiming this recommendation is implemented?",
  "What source supports that claim?",
  "Is there independent implementation evidence?",
  "Which claims contradict or qualify each other?",
  "Which institutional claims remain unverified?",
  "What claim and provenance changes need my review?",
  "What are our highest-priority unanswered questions?",
  "What changed this week?",
  "Which recommendations still lack outcomes?",
  "Which institutions have unresolved follow-ups?",
  "What funding has no measured outcome?",
  "What watches are closest to resolution?",
  "Which questions became answered?",
  "Where are the biggest measurement gaps?",
])
