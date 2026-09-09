import { createHash } from "node:crypto"

import { normalizePalantirRecommendation } from "./palantirRecommendationIntelligence.js"
import { assessSuggestedFollowUpPublicGate, buildSuggestedFollowUpRecord } from "./palantirStructuralInequality.js"

export const PALANTIR_QUESTION_STATES = Object.freeze([
  "open", "researching", "watching", "partially_answered", "answered", "contradicted", "superseded",
  "blocked_by_missing_data", "blocked_by_governance", "no_longer_priority",
])

export const PALANTIR_QUESTION_EVIDENCE_EFFECTS = Object.freeze([
  "irrelevant", "context_only", "strengthens_existing_evidence", "partially_answers", "answers",
  "contradicts", "supersedes", "creates_question",
])

export const PALANTIR_MATERIAL_CHANGE_TYPES = Object.freeze([
  "new_formal_finding", "new_evidence_role", "new_recommendation", "institutional_response",
  "implementation_evidence", "measured_outcome", "corrected_value", "superseding_document",
  "contradiction", "new_institution", "new_funding", "new_service", "closure_or_opening",
  "question_partially_answered", "question_resolved",
])

export const PALANTIR_RECOMMENDATION_OUTCOME_STATES = Object.freeze([
  "no_response", "acknowledged", "committed", "underway", "partially_implemented", "implemented",
  "outcome_unknown", "outcome_improved", "outcome_unchanged", "outcome_worsened", "superseded", "unable_to_measure",
])

const QUESTION_STATES = new Set(PALANTIR_QUESTION_STATES)
const EVIDENCE_EFFECTS = new Set(PALANTIR_QUESTION_EVIDENCE_EFFECTS)
const CHANGE_TYPES = new Set(PALANTIR_MATERIAL_CHANGE_TYPES)
const OUTCOME_STATES = new Set(PALANTIR_RECOMMENDATION_OUTCOME_STATES)
const PUBLIC_STATES = new Set(["private_research", "owner_review", "approved_public", "rejected_public", "needs_more_research"])
const PRIORITIES = new Set(["low", "normal", "high", "urgent"])
const clean = (value, limit = 900) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit)
const safeUrl = value => /^https:\/\//.test(String(value || "")) ? clean(value, 500) : null
const unique = (values, limit = 220) => [...new Set((values || []).map(value => clean(value, limit)).filter(Boolean))]
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24)
const date = value => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

function normalizeEvidence(item = {}) {
  const summary = clean(item.summary || item.evidence || item.text, 1000)
  const sourceUrl = safeUrl(item.source_url || item.url)
  if (!summary || !sourceUrl) throw new Error("palantir_question_evidence_requires_summary_and_source")
  return Object.freeze({
    evidence_id: clean(item.evidence_id, 180) || `question-evidence:${digest({ summary, sourceUrl, date: item.date || item.publication_date || null })}`,
    summary,
    source_url: sourceUrl,
    source_title: clean(item.source_title, 240) || null,
    source_organization: clean(item.source_organization, 220) || null,
    date: clean(item.date || item.publication_date, 40) || null,
    evidence_role: clean(item.evidence_role, 100) || null,
    public_source: item.public_source !== false,
  })
}

function normalizeWatchStrategy(input = {}) {
  const expectedSource = clean(input.expected_source, 500) || null
  const expectedMilestone = clean(input.expected_milestone, 500) || null
  return Object.freeze({
    watch_question: clean(input.watch_question, 800) || null,
    why_it_matters: clean(input.why_it_matters, 900) || null,
    what_would_change_the_answer: clean(input.what_would_change_the_answer, 900) || null,
    expected_source: expectedSource,
    expected_milestone: expectedMilestone,
    cadence_rationale: clean(input.cadence_rationale, 700) || null,
    strategy: ["milestone", "report_release", "citation_led", "manual", "none"].includes(input.strategy) ? input.strategy : "manual",
    automatic_schedule: false,
  })
}

export function normalizePalantirResearchQuestion(input = {}) {
  const title = clean(input.title, 220)
  const question = clean(input.question, 1300)
  const domain = clean(input.domain, 120)
  if (!title || !question || !domain) throw new Error("palantir_research_question_required_fields_missing")
  const signature = { title: title.toLowerCase(), question: question.toLowerCase(), domain: domain.toLowerCase(), jurisdiction: clean(input.jurisdiction, 120).toLowerCase(), subject: clean(input.subject, 220).toLowerCase() }
  const state = QUESTION_STATES.has(input.resolution_state) ? input.resolution_state : "open"
  const knownEvidence = (input.known_evidence || []).map(normalizeEvidence)
  const questionId = clean(input.question_id, 180) || `question:${digest(signature)}`
  const answerThreshold = unique(input.evidence_needed || input.answer_requires || [], 700)
  if (!answerThreshold.length) throw new Error("palantir_research_question_evidence_threshold_required")
  return Object.freeze({
    schema_version: "palantir-research-question-v1",
    question_id: questionId,
    title,
    question,
    domain,
    jurisdiction: clean(input.jurisdiction, 120) || null,
    geography: clean(input.geography, 220) || null,
    subject: clean(input.subject, 220) || null,
    related_institutions: unique(input.related_institutions || input.related_organization_ids || []),
    related_events: unique(input.related_events || input.related_event_ids || []),
    related_recommendations: unique(input.related_recommendations || input.related_recommendation_ids || []),
    related_interventions: unique(input.related_interventions || []),
    related_funding: unique(input.related_funding || []),
    related_structural_findings: unique(input.related_structural_findings || []),
    why_it_matters: clean(input.why_it_matters, 1200) || null,
    current_answer: clean(input.current_answer, 1200) || "Not yet answered.",
    answer_confidence: ["none", "low", "moderate", "high"].includes(input.answer_confidence) ? input.answer_confidence : "none",
    evidence_needed: answerThreshold,
    known_evidence: knownEvidence,
    missing_evidence: unique(input.missing_evidence || [], 700),
    likely_sources: unique(input.likely_sources || [], 500),
    expected_documents: unique(input.expected_documents || [], 500),
    milestones: unique(input.milestones || input.related_milestone_ids || []),
    watch_strategy: normalizeWatchStrategy(input.watch_strategy || {}),
    owner_priority: PRIORITIES.has(input.owner_priority) ? input.owner_priority : "normal",
    governance: clean(input.governance, 1200) || null,
    privacy: clean(input.privacy, 1000) || null,
    created_at: date(input.created_at) || new Date().toISOString(),
    last_reviewed: date(input.last_reviewed),
    last_material_change: date(input.last_material_change),
    resolution_state: state,
    resolution_reason: clean(input.resolution_reason, 1000) || null,
    public_state: PUBLIC_STATES.has(input.public_state) ? input.public_state : "private_research",
    linked_public_follow_up_id: clean(input.linked_public_follow_up_id, 180) || null,
    owner_review_required: input.owner_review_required !== false,
    automatic_publication: false,
    mutation_authority: false,
    publication_authority: false,
  })
}

export function buildPalantirResearchQuestionLedger(rows = [], { ledgerId = "palantir:research-questions", checkedAt = new Date().toISOString() } = {}) {
  const questions = rows.map(normalizePalantirResearchQuestion)
  if (new Set(questions.map(item => item.question_id)).size !== questions.length) throw new Error("palantir_research_question_duplicate_id")
  const signatures = new Set()
  for (const item of questions) {
    const signature = `${item.domain}|${item.jurisdiction || ""}|${item.subject || ""}|${item.question.toLowerCase()}`
    if (signatures.has(signature)) throw new Error("palantir_research_question_duplicate_scope")
    signatures.add(signature)
  }
  return Object.freeze({
    schema_version: "palantir-research-question-ledger-v1",
    ledger_id: clean(ledgerId, 180),
    checked_at: date(checkedAt) || new Date().toISOString(),
    questions,
    counts: Object.fromEntries(PALANTIR_QUESTION_STATES.map(state => [state, questions.filter(item => item.resolution_state === state).length])),
    priorities: Object.fromEntries([...PRIORITIES].map(priority => [priority, questions.filter(item => item.owner_priority === priority && !["answered", "superseded", "no_longer_priority"].includes(item.resolution_state)).length])),
    mutation_authority: false,
    publication_authority: false,
  })
}

export function reconcilePalantirResearchQuestion(candidate = {}, knownQuestions = []) {
  const question = normalizePalantirResearchQuestion(candidate)
  const exact = knownQuestions.map(normalizePalantirResearchQuestion).find(item => item.question_id === question.question_id)
  if (exact) return Object.freeze({ disposition: "existing_question", question_id: exact.question_id, candidate: question, automatic_merge: false, owner_review_required: false })
  const sameScope = knownQuestions.map(normalizePalantirResearchQuestion).filter(item => item.domain === question.domain && item.jurisdiction === question.jurisdiction && item.subject === question.subject && item.question.toLowerCase() === question.question.toLowerCase())
  return Object.freeze({ disposition: sameScope.length ? "possible_duplicate_question" : "new_question_candidate", question_id: sameScope[0]?.question_id || question.question_id, candidate: question, automatic_merge: false, owner_review_required: true })
}

export function evaluatePalantirQuestionEvidence(question, input = {}) {
  const item = normalizePalantirResearchQuestion(question)
  const effect = EVIDENCE_EFFECTS.has(input.effect) ? input.effect : "context_only"
  const evidence = input.evidence ? normalizeEvidence(input.evidence) : null
  if (effect !== "irrelevant" && !evidence) throw new Error("palantir_question_effect_requires_evidence")
  const thresholdMet = input.threshold_met === true
  const requestedResolution = effect === "answers" && thresholdMet ? "answered" : effect === "partially_answers" ? "partially_answered" : effect === "contradicts" ? "contradicted" : effect === "supersedes" ? "superseded" : item.resolution_state
  const material = ["partially_answers", "answers", "contradicts", "supersedes"].includes(effect)
  const answerClaimBlocked = effect === "answers" && !thresholdMet
  return Object.freeze({
    schema_version: "palantir-question-evidence-assessment-v1",
    question_id: item.question_id,
    effect: answerClaimBlocked ? "partially_answers" : effect,
    evidence,
    threshold_met: thresholdMet,
    material,
    answer_claim_blocked: answerClaimBlocked,
    next_state: answerClaimBlocked ? "partially_answered" : requestedResolution,
    owner_review_required: material || effect === "creates_question",
    automatic_publication: false,
    mutation_authority: false,
  })
}

export function applyPalantirQuestionEvidence(question, assessment, { reviewedAt = new Date().toISOString() } = {}) {
  const item = normalizePalantirResearchQuestion(question)
  if (assessment?.schema_version !== "palantir-question-evidence-assessment-v1" || assessment.question_id !== item.question_id) throw new Error("palantir_question_evidence_assessment_invalid")
  const evidence = assessment.evidence && !item.known_evidence.some(existing => existing.evidence_id === assessment.evidence.evidence_id) ? [...item.known_evidence, assessment.evidence] : item.known_evidence
  const changed = assessment.effect !== "irrelevant" && assessment.effect !== "context_only"
  return normalizePalantirResearchQuestion({
    ...item,
    known_evidence: evidence,
    current_answer: clean(assessment.current_answer, 1200) || item.current_answer,
    answer_confidence: assessment.next_state === "answered" ? "high" : assessment.next_state === "partially_answered" ? "moderate" : item.answer_confidence,
    resolution_state: assessment.next_state,
    resolution_reason: assessment.resolution_reason || item.resolution_reason,
    last_reviewed: reviewedAt,
    last_material_change: changed ? reviewedAt : item.last_material_change,
  })
}

// Farm/Igor adapters may supply a bounded, source-backed assessment for a
// known question. This executor does not classify racism, infer identity, or
// invent an answer: it validates the supplied effect against the question's
// explicit threshold and returns review candidates only.
export function applyPalantirQuestionEvidenceBatch(ledger, candidates = [], { reviewedAt = new Date().toISOString() } = {}) {
  if (ledger?.schema_version !== "palantir-research-question-ledger-v1") throw new Error("palantir_question_batch_ledger_required")
  const byId = new Map(ledger.questions.map(question => [question.question_id, question]))
  const assessments = []
  const materialChanges = []
  const newQuestionCandidates = []
  for (const candidate of candidates) {
    const question = byId.get(clean(candidate.question_id, 180))
    if (!question) throw new Error("palantir_question_batch_unknown_question")
    const assessment = evaluatePalantirQuestionEvidence(question, candidate)
    assessments.push(assessment)
    const updated = applyPalantirQuestionEvidence(question, assessment, { reviewedAt })
    byId.set(question.question_id, updated)
    if (assessment.effect === "creates_question" && candidate.new_question) newQuestionCandidates.push(reconcilePalantirResearchQuestion(candidate.new_question, [...byId.values()]))
    if (assessment.material) {
      const type = assessment.next_state === "answered" ? "question_resolved" : assessment.next_state === "partially_answered" ? "question_partially_answered" : assessment.next_state === "contradicted" ? "contradiction" : "superseding_document"
      materialChanges.push(explainPalantirMaterialChange({ change_type: type, source_url: assessment.evidence?.source_url, explanation: candidate.change_explanation }))
    }
  }
  const next = buildPalantirResearchQuestionLedger([...byId.values()], { ledgerId: ledger.ledger_id, checkedAt: reviewedAt })
  return Object.freeze({
    schema_version: "palantir-question-evidence-batch-v1",
    previous_ledger_id: ledger.ledger_id,
    ledger: next,
    assessments,
    material_changes: materialChanges,
    new_question_candidates: newQuestionCandidates,
    questions_advanced: assessments.filter(item => item.material).length,
    questions_answered: assessments.filter(item => item.next_state === "answered").length,
    no_change_documents: assessments.filter(item => ["irrelevant", "context_only", "strengthens_existing_evidence"].includes(item.effect)).length,
    owner_review_required: materialChanges.length > 0 || newQuestionCandidates.length > 0,
    automatic_schedule: false,
    automatic_publication: false,
    mutation_authority: false,
  })
}

// Publicly visible Recently Changed records retain their separate source and
// owner gate. This is only a candidate routed from a materially changed
// private question, never a direct projection.
export function routePalantirQuestionChangeToPublicReview(question, assessment) {
  const item = normalizePalantirResearchQuestion(question)
  if (assessment?.schema_version !== "palantir-question-evidence-assessment-v1" || assessment.question_id !== item.question_id) throw new Error("palantir_question_change_public_route_invalid")
  const material = assessment.material && ["partially_answered", "answered", "contradicted", "superseded"].includes(assessment.next_state)
  return Object.freeze({
    schema_version: "palantir-question-change-public-review-candidate-v1",
    question_id: item.question_id,
    linked_public_follow_up_id: item.linked_public_follow_up_id,
    disposition: material && item.public_state === "approved_public" && item.linked_public_follow_up_id ? "owner_review_candidate" : "private_only",
    proposed_material_change_type: assessment.next_state === "answered" ? "question_resolved" : assessment.next_state === "partially_answered" ? "question_partially_answered" : assessment.next_state === "contradicted" ? "contradiction" : "superseding_document",
    source_url: assessment.evidence?.source_url || null,
    requires_public_record_gate: true,
    automatic_publication: false,
    mutation_authority: false,
  })
}

export function buildPalantirQuestionResearchYield(input = {}) {
  const documentsChecked = Math.max(0, Number(input.documents_checked || 0))
  const questionAdvancements = Math.max(0, Number(input.questions_advanced || 0))
  const answered = Math.max(0, Number(input.questions_answered || 0))
  const duplicates = Math.max(0, Number(input.duplicates_suppressed || 0))
  const unchanged = Math.max(0, Number(input.unchanged_sources || 0))
  return Object.freeze({
    schema_version: "palantir-question-research-yield-v1",
    source_family: clean(input.source_family, 160) || "unspecified",
    documents_checked: documentsChecked,
    questions_advanced: questionAdvancements,
    questions_answered: answered,
    duplicates_suppressed: duplicates,
    unchanged_sources: unchanged,
    formal_findings: Math.max(0, Number(input.formal_findings || 0)),
    implementation_evidence: Math.max(0, Number(input.implementation_evidence || 0)),
    outcome_evidence: Math.max(0, Number(input.outcome_evidence || 0)),
    manual_review_burden: ["low", "moderate", "high"].includes(input.manual_review_burden) ? input.manual_review_burden : "moderate",
    questions_advanced_per_document: documentsChecked ? Number((questionAdvancements / documentsChecked).toFixed(3)) : 0,
    source_priority: questionAdvancements ? "retain_or_prioritize" : unchanged >= 3 ? "deprioritize_until_milestone" : "insufficient_history",
    automatic_schedule: false,
    mutation_authority: false,
  })
}

export function buildPalantirQuestionWatch(question, input = {}) {
  const item = normalizePalantirResearchQuestion(question)
  const strategy = normalizeWatchStrategy({ ...item.watch_strategy, ...input })
  if (!strategy.watch_question || !strategy.what_would_change_the_answer || !(strategy.expected_source || strategy.expected_milestone)) throw new Error("palantir_question_watch_requires_purpose_and_expected_evidence")
  if (["answered", "superseded", "no_longer_priority"].includes(item.resolution_state)) return Object.freeze({ schema_version: "palantir-question-watch-v1", question_id: item.question_id, disposition: "retire_watch", reason: "The linked question is no longer open.", automatic_schedule: false, automatic_publication: false })
  return Object.freeze({
    schema_version: "palantir-question-watch-v1",
    watch_id: clean(input.watch_id, 180) || `question-watch:${digest({ question: item.question_id, source: strategy.expected_source, milestone: strategy.expected_milestone })}`,
    question_id: item.question_id,
    watch_question: strategy.watch_question,
    why_it_matters: strategy.why_it_matters || item.why_it_matters,
    what_would_change_the_answer: strategy.what_would_change_the_answer,
    expected_source: strategy.expected_source,
    expected_milestone: strategy.expected_milestone,
    cadence_rationale: strategy.cadence_rationale,
    strategy: strategy.strategy,
    state: "private_watch_candidate",
    automatic_schedule: false,
    automatic_publication: false,
    mutation_authority: false,
  })
}

// A public Suggested Follow-up is a deliberately smaller projection of this
// private object. The link is one-way: no private research fields are copied
// into the card and linkage never changes publication state.
export function linkPalantirQuestionToPublicFollowUp(question, followUp = {}) {
  const item = normalizePalantirResearchQuestion(question)
  const record = followUp?.schema_version === "palantir-suggested-follow-up-v1" ? followUp : buildSuggestedFollowUpRecord(followUp)
  const gate = assessSuggestedFollowUpPublicGate(record)
  if (!gate.publishable || !record.follow_up_id) throw new Error("palantir_question_public_follow_up_requires_approved_public_gate")
  return normalizePalantirResearchQuestion({ ...item, linked_public_follow_up_id: record.follow_up_id })
}

export function explainPalantirMaterialChange(input = {}) {
  const type = clean(input.change_type, 80)
  if (!CHANGE_TYPES.has(type)) throw new Error("palantir_material_change_type_invalid")
  const labels = {
    new_formal_finding: "New formal finding added.", new_evidence_role: "New evidence role added.", new_recommendation: "New recommendation added.",
    institutional_response: "New institutional response added.", implementation_evidence: "New implementation evidence added.", measured_outcome: "Updated with a measured outcome.",
    corrected_value: "A reported value was corrected.", superseding_document: "A later document supersedes earlier reporting.", contradiction: "Sources require review because they materially conflict.",
    new_institution: "A newly relevant institution was identified.", new_funding: "New funding evidence added.", new_service: "New service evidence added.",
    closure_or_opening: "Service availability changed.", question_partially_answered: "New evidence partially answers an open question.", question_resolved: "New evidence resolves an open question.",
  }
  return Object.freeze({ schema_version: "palantir-material-change-explanation-v1", change_type: type, explanation: clean(input.explanation, 500) || labels[type], source_url: safeUrl(input.source_url), owner_review_required: ["contradiction", "question_resolved", "corrected_value", "superseding_document"].includes(type), public_safe: !/private|owner note|foi|contact/i.test(clean(input.explanation || "")), automatic_publication: false })
}

export function buildPalantirInstitutionDossier(input = {}) {
  const institutionId = clean(input.institution_id || input.canonical_institution_id, 180)
  const name = clean(input.name || input.institution_name, 220)
  if (!institutionId || !name) throw new Error("palantir_institution_dossier_identity_required")
  const timeline = (input.timeline || []).map(item => ({
    date: clean(item.date, 40) || null,
    stage: clean(item.stage, 80),
    summary: clean(item.summary, 900),
    source_url: safeUrl(item.source_url),
    evidence_kind: clean(item.evidence_kind, 100) || null,
  })).filter(item => item.stage && item.summary && item.source_url).sort((left, right) => String(left.date || "9999").localeCompare(String(right.date || "9999")))
  return Object.freeze({
    schema_version: "palantir-institution-dossier-v1",
    institution_id: institutionId,
    current_name: name,
    historical_names: unique(input.historical_names || input.aliases || []),
    successor_institution_ids: unique(input.successor_institution_ids || []),
    predecessor_institution_ids: unique(input.predecessor_institution_ids || []),
    formal_findings: unique(input.formal_findings || []), incidents: unique(input.incidents || []), recommendations: unique(input.recommendations || []),
    responses: unique(input.responses || []), commitments: unique(input.commitments || []), implementation_evidence: unique(input.implementation_evidence || []),
    measured_outcomes: unique(input.measured_outcomes || []), funding: unique(input.funding || []), programs: unique(input.programs || []),
    unresolved_questions: unique(input.unresolved_questions || []), watches: unique(input.watches || []), structural_findings: unique(input.structural_findings || []), relevant_resources: unique(input.relevant_resources || []),
    timeline,
    reputation_score: null,
    institutional_ranking: null,
    public_state: "private_research",
    mutation_authority: false,
    publication_authority: false,
  })
}

export function assessPalantirRecommendationOutcome(recommendation, input = {}) {
  const item = normalizePalantirRecommendation(recommendation)
  const requested = clean(input.outcome_state, 80)
  if (requested && !OUTCOME_STATES.has(requested)) throw new Error("palantir_recommendation_outcome_state_invalid")
  const independentImplementation = item.implementation_evidence.some(evidence => evidence.independent !== false)
  const outcomeState = requested || (item.outcome_evidence.length ? "outcome_unknown" : independentImplementation ? "implemented" : item.responses.length ? "acknowledged" : "no_response")
  if (["outcome_improved", "outcome_unchanged", "outcome_worsened"].includes(outcomeState) && !item.outcome_evidence.length) throw new Error("palantir_recommendation_outcome_requires_measured_evidence")
  return Object.freeze({
    schema_version: "palantir-recommendation-outcome-resolution-v1",
    recommendation_id: item.recommendation_id,
    resolution_state: outcomeState,
    responses: item.responses.length,
    independent_implementation_evidence: item.implementation_evidence.length,
    measured_outcomes: item.outcome_evidence.length,
    implementation_only: Boolean((item.responses.length || item.implementation_evidence.length) && !item.outcome_evidence.length),
    claimed_implementation_is_independent_evidence: false,
    owner_review_required: ["outcome_improved", "outcome_unchanged", "outcome_worsened", "implemented"].includes(outcomeState),
    mutation_authority: false,
    publication_authority: false,
  })
}

export function buildPalantirFundingServiceOutcomeChain(input = {}) {
  const problem = clean(input.documented_problem, 1000)
  const fundingSource = safeUrl(input.funding_source_url)
  if (!problem || !fundingSource) throw new Error("palantir_funding_outcome_chain_requires_problem_and_source")
  const outcome = input.measured_outcome ? normalizeEvidence(input.measured_outcome) : null
  return Object.freeze({
    schema_version: "palantir-funding-service-outcome-chain-v1",
    chain_id: clean(input.chain_id, 180) || `funding-chain:${digest({ problem, fundingSource, recipient: input.recipient })}`,
    documented_problem: problem,
    funding: Object.freeze({ announced_amount: clean(input.announced_amount, 120) || null, approved_amount: clean(input.approved_amount, 120) || null, contribution_amount: clean(input.contribution_amount, 120) || null, period: clean(input.period, 100) || null, source_url: fundingSource }),
    recipient: clean(input.recipient, 220) || null,
    service_or_intervention: clean(input.service_or_intervention, 900) || null,
    implementation_output: input.implementation_output ? normalizeEvidence(input.implementation_output) : null,
    intended_outcome: clean(input.intended_outcome, 900) || null,
    reporting_requirement: clean(input.reporting_requirement, 900) || null,
    evaluation_requirement: clean(input.evaluation_requirement, 900) || null,
    measured_outcome: outcome,
    current_state: outcome ? "outcome_measured" : input.implementation_output ? "implementation_observed_outcome_unknown" : "funding_documented_service_unknown",
    funding_is_spending: false,
    service_is_outcome: false,
    automatic_publication: false,
    mutation_authority: false,
  })
}

export function classifyPalantirClaimReconciliation(input = {}) {
  const sameSubject = input.same_subject === true, sameScope = input.same_scope === true, samePeriod = input.same_period === true, sameDenominator = input.same_denominator === true, sameMethodology = input.same_methodology === true
  const laterOfficial = input.later_official_revision === true
  const materialDifference = input.material_difference === true
  let classification = "compatible"
  if (laterOfficial && sameSubject && sameScope && samePeriod && sameDenominator && sameMethodology) classification = "revised_value"
  else if (!samePeriod) classification = "temporal_difference"
  else if (!sameDenominator || !sameMethodology || !sameScope) classification = "methodological_difference"
  else if (sameSubject && materialDifference) classification = "genuine_conflict"
  else if (input.supersedes === true) classification = "supersedes"
  else if (input.unresolved === true) classification = "unresolved"
  return Object.freeze({ schema_version: "palantir-claim-reconciliation-v1", classification, prior_claim_id: clean(input.prior_claim_id, 180) || null, later_claim_id: clean(input.later_claim_id, 180) || null, historical_claims_preserved: true, owner_review_required: ["genuine_conflict", "unresolved", "revised_value", "supersedes"].includes(classification), automatic_publication: false, mutation_authority: false })
}

export function buildPalantirQuestionBrief(ledger, { changes = [], now = new Date().toISOString() } = {}) {
  if (ledger?.schema_version !== "palantir-research-question-ledger-v1") throw new Error("palantir_question_brief_ledger_required")
  const questions = ledger.questions
  const material = changes.filter(item => item?.schema_version === "palantir-material-change-explanation-v1")
  return Object.freeze({
    schema_version: "palantir-question-brief-v1",
    generated_at: date(now) || new Date().toISOString(),
    material_changes: material.map(item => ({ change_type: item.change_type, explanation: item.explanation })),
    answered: questions.filter(item => item.resolution_state === "answered").map(item => item.question_id),
    partially_answered: questions.filter(item => item.resolution_state === "partially_answered").map(item => item.question_id),
    high_priority_open: questions.filter(item => ["high", "urgent"].includes(item.owner_priority) && ["open", "researching", "watching", "blocked_by_missing_data", "blocked_by_governance"].includes(item.resolution_state)).map(item => item.question_id),
    upcoming_milestones: questions.flatMap(item => item.milestones.map(milestone => ({ question_id: item.question_id, milestone }))),
    owner_attention: questions.filter(item => item.owner_review_required && ["answered", "contradicted", "superseded"].includes(item.resolution_state)).map(item => item.question_id),
    private_owner_interface: true,
    automatic_publication: false,
  })
}

export function buildPalantirCrossDomainQuestionPilot(rows = []) {
  const questions = buildPalantirResearchQuestionLedger(rows, { ledgerId: "palantir:cross-domain-pilot" }).questions
  if (questions.length < 5 || questions.length > 10) throw new Error("palantir_cross_domain_pilot_requires_five_to_ten_questions")
  return Object.freeze({ schema_version: "palantir-cross-domain-question-pilot-v1", domain: "public_workplace_safety_regulatory", questions, public_state: "private_research", publication_authority: false, individual_identification_required: false, transferable_primitives: ["question", "provenance", "institution", "recommendation", "funding_intervention", "milestone", "contradiction", "change", "resolution"], domain_adapters: ["workplace_harm_indicator_definitions", "regulator_enforcement_taxonomy"], mutation_authority: false })
}
