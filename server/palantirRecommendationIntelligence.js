import { createHash } from "node:crypto"

import { diffPalantirRecord } from "./palantirChangeIntelligence.js"

const clean = (value, limit = 1200) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit)
const unique = values => [...new Set(values.map(value => clean(value, 220)).filter(Boolean))]
const id = value => createHash("sha256").update(String(value)).digest("hex").slice(0, 24)
const safeUrl = value => /^https:\/\//.test(String(value || "")) ? clean(value, 500) : null

function normalizeEvidence(item = {}, type) {
  const summary = clean(item.summary || item.evidence || item.text)
  const sourceUrl = safeUrl(item.source_url)
  if (!summary || !sourceUrl) throw new Error(`palantir_recommendation_${type}_requires_source`)
  return Object.freeze({ evidence_id: clean(item.evidence_id, 180) || `${type}:${id(`${summary}|${sourceUrl}`)}`, summary, source_url: sourceUrl, date: clean(item.date, 40) || null, independent: item.independent !== false })
}

function normalizeResponse(item = {}, recommendationId) {
  const responder = clean(item.responder_organization || item.organization, 220)
  const sourceUrl = safeUrl(item.source_url)
  if (!responder || !sourceUrl) throw new Error("palantir_recommendation_response_requires_source")
  return Object.freeze({
    response_id: clean(item.response_id, 180) || `response:${id(`${recommendationId}|${responder}|${sourceUrl}|${item.response_date || ""}`)}`,
    responder_organization: responder,
    response_date: clean(item.response_date, 40) || null,
    response_status: clean(item.response_status || item.status, 80) || "received_unassessed",
    response_text: clean(item.response_text || item.response) || null,
    claimed_action: clean(item.claimed_action) || null,
    source_url: sourceUrl,
    response_is_implementation: false,
    claimed_action_is_outcome: false,
  })
}

export function normalizePalantirRecommendation(input = {}) {
  const report = clean(input.source_report || input.report, 220)
  const text = clean(input.recommendation_text)
  const sourceUrl = safeUrl(input.source_url)
  if (!report || !text || !sourceUrl) throw new Error("palantir_recommendation_required_fields_missing")
  const recommendationId = clean(input.recommendation_id, 180) || `recommendation:${id(`${report}|${input.recommendation_number || ""}|${text}`)}`
  const rawResponses = input.responses || (input.response || input.claimed_action ? [{ responder_organization: input.responder_organization || input.responsible_organizations?.[0] || "Unspecified responder", response_date: input.response_date, response_status: input.status, response_text: input.response, claimed_action: input.claimed_action, source_url: input.response_source_url || sourceUrl }] : [])
  const responses = rawResponses.map(item => normalizeResponse(item, recommendationId)).filter((item, index, values) => values.findIndex(candidate => candidate.response_id === item.response_id) === index)
  const rawImplementation = input.implementation_evidence_items || (Array.isArray(input.implementation_evidence) ? input.implementation_evidence : input.implementation_evidence ? [{ evidence: input.implementation_evidence, source_url: input.implementation_source_url }] : [])
  const rawOutcomes = input.outcome_evidence_items || (Array.isArray(input.outcome_evidence) ? input.outcome_evidence : input.outcome_evidence ? [{ evidence: input.outcome_evidence, source_url: input.outcome_source_url }] : [])
  const implementation = rawImplementation.map(item => normalizeEvidence(item, "implementation"))
  const outcomes = rawOutcomes.map(item => normalizeEvidence(item, "outcome"))
  return Object.freeze({
    schema_version: "palantir-recommendation-v1",
    recommendation_id: recommendationId,
    source_report: report,
    source_url: sourceUrl,
    recommendation_number: clean(input.recommendation_number, 80) || null,
    recommendation_text: text,
    recommendation_date: clean(input.recommendation_date || input.report_date, 40) || null,
    responsible_organizations: unique(input.responsible_organizations || []),
    responder_organizations: unique(responses.map(item => item.responder_organization)),
    responses,
    implementation_evidence: implementation,
    outcome_evidence: outcomes,
    independent_verification: clean(input.independent_verification) || null,
    unresolved_gap: clean(input.unresolved_gap || input.unresolved_question) || null,
    current_status: clean(input.current_status || input.status, 80) || "issued",
    related_event_id: clean(input.related_event_id, 180) || null,
    primary_domain: clean(input.primary_domain, 80) || null,
    secondary_domains: unique(input.secondary_domains || []),
    last_reviewed: clean(input.last_reviewed, 40) || null,
    response_is_implementation: false,
    accepted_is_completed: false,
    policy_announced_is_outcome: false,
    mutation_authority: false,
    publication_authority: false,
  })
}

export function buildPalantirRecommendationLedger(rows = [], { ledgerId = "palantir:recommendations", title = "Palantír recommendation ledger", checkedAt = new Date().toISOString() } = {}) {
  const recommendations = rows.map(normalizePalantirRecommendation)
  if (new Set(recommendations.map(item => item.recommendation_id)).size !== recommendations.length) throw new Error("palantir_recommendation_duplicate_id")
  return Object.freeze({
    schema_version: "palantir-recommendation-ledger-v1",
    ledger_id: clean(ledgerId, 180),
    title: clean(title, 220),
    checked_at: new Date(checkedAt).toISOString(),
    recommendations,
    counts: {
      recommendations: recommendations.length,
      responders: new Set(recommendations.flatMap(item => item.responder_organizations)).size,
      responses: recommendations.reduce((sum, item) => sum + item.responses.length, 0),
      implementation_evidence: recommendations.reduce((sum, item) => sum + item.implementation_evidence.length, 0),
      measured_outcomes: recommendations.reduce((sum, item) => sum + item.outcome_evidence.length, 0),
      unresolved_gaps: recommendations.filter(item => item.unresolved_gap).length,
    },
    mutation_authority: false,
    publication_authority: false,
  })
}

export function adaptFarmRecommendationToPalantir(row = {}) {
  return normalizePalantirRecommendation({
    ...row,
    source_report: row.report,
    recommendation_date: row.report_date,
    responses: row.response || row.claimed_action ? [{ responder_organization: row.responsible_organizations?.[0] || "Unspecified responder", response_status: row.status, response_text: row.response, claimed_action: row.claimed_action, source_url: row.source_url }] : [],
    implementation_evidence_items: row.implementation_evidence ? [{ evidence: row.implementation_evidence, source_url: row.implementation_source_url }] : [],
    outcome_evidence_items: row.outcome_evidence ? [{ evidence: row.outcome_evidence, source_url: row.outcome_source_url }] : [],
    unresolved_gap: row.unresolved_question,
  })
}

export function adaptFarmRecommendationLedgerToPalantir(ledger = {}) {
  if (ledger?.schema_version !== "farm-recommendation-ledger-v1") throw new Error("palantir_farm_recommendation_ledger_invalid")
  return buildPalantirRecommendationLedger((ledger.recommendations || []).map(adaptFarmRecommendationToPalantir), { ledgerId: `palantir:${clean(ledger.title, 120).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "recommendations"}`, title: ledger.title, checkedAt: ledger.checked_at })
}

export function diffPalantirRecommendationLedgers(previous = {}, current = {}) {
  const before = new Map((previous.recommendations || []).map(item => [item.recommendation_id, normalizePalantirRecommendation(item)]))
  const after = new Map((current.recommendations || []).map(item => [item.recommendation_id, normalizePalantirRecommendation(item)]))
  const changes = []
  for (const [recommendationId, recommendation] of after) {
    const prior = before.get(recommendationId)
    if (!prior) { changes.push({ recommendation_id: recommendationId, change_type: "new_recommendation", owner_review_required: true }); continue }
    const priorResponders = new Set(prior.responses.map(item => item.response_id))
    for (const response of recommendation.responses) if (!priorResponders.has(response.response_id)) changes.push({ recommendation_id: recommendationId, change_type: "new_responder", response_id: response.response_id, owner_review_required: true })
    const priorImplementation = new Set(prior.implementation_evidence.map(item => item.evidence_id))
    for (const evidence of recommendation.implementation_evidence) if (!priorImplementation.has(evidence.evidence_id)) changes.push({ recommendation_id: recommendationId, change_type: "new_implementation_evidence", evidence_id: evidence.evidence_id, owner_review_required: true })
    const priorOutcomes = new Set(prior.outcome_evidence.map(item => item.evidence_id))
    for (const evidence of recommendation.outcome_evidence) if (!priorOutcomes.has(evidence.evidence_id)) changes.push({ recommendation_id: recommendationId, change_type: "new_outcome_evidence", evidence_id: evidence.evidence_id, owner_review_required: true })
    if (prior.current_status !== recommendation.current_status) changes.push({ recommendation_id: recommendationId, change_type: recommendation.current_status === "superseded" ? "recommendation_superseded" : "status_correction", owner_review_required: true })
    if (prior.unresolved_gap !== recommendation.unresolved_gap) changes.push({ recommendation_id: recommendationId, change_type: "unresolved_gap_changed", owner_review_required: true })
    const generic = diffPalantirRecord(prior, recommendation)
    if (generic.changed && !changes.some(item => item.recommendation_id === recommendationId)) changes.push({ recommendation_id: recommendationId, change_type: "changed_response_or_claimed_action", owner_review_required: true })
  }
  for (const recommendationId of before.keys()) if (!after.has(recommendationId)) changes.push({ recommendation_id: recommendationId, change_type: "missing_from_source", owner_review_required: true })
  return Object.freeze({ schema_version: "palantir-recommendation-change-v1", checked: after.size, changes, material_changes: changes.length, owner_review_items: changes.filter(item => item.owner_review_required).length, timestamp_only_changes_ignored: true, duplicate_responder_rows_ignored: true, retain_previous_state_on_failure: true, mutation_authority: false, publication_authority: false })
}

export function buildPalantirRecommendationChain(recommendation) {
  const item = normalizePalantirRecommendation(recommendation)
  return Object.freeze({
    schema_version: "palantir-recommendation-chain-v1",
    recommendation_id: item.recommendation_id,
    chain: [
      { role: "problem_or_finding", source_report: item.source_report },
      { role: "recommendation", text: item.recommendation_text },
      { role: "responsible_actor", organizations: item.responsible_organizations },
      { role: "response", items: item.responses },
      { role: "implementation", items: item.implementation_evidence },
      { role: "measured_outcome", items: item.outcome_evidence },
      { role: "unresolved_gap", text: item.unresolved_gap },
    ],
    complete_public_trail: Boolean(item.responses.length && item.implementation_evidence.length && item.outcome_evidence.length && !item.unresolved_gap),
    response_is_implementation: false,
    mutation_authority: false,
    publication_authority: false,
  })
}
