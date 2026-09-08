import { createHash } from "node:crypto"

import exploratorySources from "../src/data/samwise-research-source-catalog-v1.json" with { type: "json" }
import { SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID, SAMWISE_PUBLIC_RECORD_DOMAINS } from "./samwisePublicRecordsIntelligence.js"

const DOMAIN_SET = new Set(SAMWISE_PUBLIC_RECORD_DOMAINS)
const DEPTH_LIMITS = Object.freeze({ single: 12, bounded: 50, standard: 100 })
const STOP_REASONS = new Set(["depth_limit", "document_limit", "sources_exhausted", "no_material_novelty", "milestone_pending", "source_unavailable", "owner_stopped"])
const REVIEW_STATES = new Set(["pending", "approved", "rejected", "needs_more_research", "deferred", "false_positive"])
const clean = (value, limit = 300) => String(value ?? "").normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const list = value => Array.isArray(value) ? value : value ? [value] : []
const jurisdictionKey = value => {
  const normalized = clean(value, 80).toLowerCase().replace(/[^a-z]/g, "")
  if (["bc", "britishcolumbia"].includes(normalized)) return "british_columbia"
  if (["ab", "alberta"].includes(normalized)) return "alberta"
  if (["sk", "saskatchewan"].includes(normalized)) return "saskatchewan"
  if (["ca", "canada", "federal", "national", "canadawide"].includes(normalized)) return "canada_wide"
  if (["multi", "multijurisdiction", "multijurisdictional"].includes(normalized)) return "multijurisdiction"
  return normalized
}

const normalizedSource = source => ({
  source_id: clean(source.source_id, 180),
  name: clean(source.name || source.source_id, 180),
  jurisdiction: clean(source.jurisdiction, 80),
  source_family: clean(source.source_family, 100),
  public_index: clean(source.public_index, 500),
  supported_domains: list(source.supported_domains).map(value => clean(value, 80)).filter(value => DOMAIN_SET.has(value)),
  selection_terms: list(source.selection_terms).map(value => clean(value, 80).toLowerCase()).filter(Boolean),
  operations: list(source.operations || ["registered_listener"]).map(value => clean(value, 80)).filter(Boolean),
  enabled: source.enabled === true,
  recent_capable: source.recent_capable !== false,
  historical_capable: source.historical_capable !== false,
  scheduled_listener_id: clean(source.legacy_listener_id, 180) || null,
  provenance: source.source_id?.startsWith("samwise:") ? "listener_registry" : "research_catalog",
})

export function validateSamwiseResearchSourceCatalog(catalog = exploratorySources) {
  if (catalog?.schema_version !== "samwise-research-source-catalog-v1" || !Array.isArray(catalog.sources)) throw new Error("samwise_research_source_catalog_invalid")
  const ids = new Set()
  for (const source of catalog.sources) {
    const normalized = normalizedSource(source)
    if (!normalized.source_id || ids.has(normalized.source_id) || !normalized.name || !normalized.source_family || !normalized.supported_domains.length || !normalized.operations.length) throw new Error("samwise_research_source_invalid")
    if (!/^https:\/\//.test(normalized.public_index)) throw new Error("samwise_research_source_https_required")
    ids.add(normalized.source_id)
  }
  return { valid: true, sources: ids.size, enabled: catalog.sources.filter(source => source.enabled).length }
}

export function buildSamwiseResearchSourceCatalog({ listenerRegistry, researchCatalog = exploratorySources } = {}) {
  validateSamwiseResearchSourceCatalog(researchCatalog)
  const listenerSources = list(listenerRegistry?.sources).map(normalizedSource)
  const researchSources = researchCatalog.sources.map(normalizedSource)
  const sources = [...listenerSources, ...researchSources].filter((source, index, values) => values.findIndex(candidate => candidate.source_id === source.source_id) === index)
  return Object.freeze({
    schema_version: "samwise-universal-source-catalog-v1",
    capability_id: SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID,
    sources,
    counts: {
      total: sources.length,
      enabled: sources.filter(source => source.enabled).length,
      scheduled: sources.filter(source => source.scheduled_listener_id).length,
      research_only: sources.filter(source => !source.scheduled_listener_id).length,
      families: new Set(sources.map(source => source.source_family)).size,
    },
    arbitrary_urls: false,
    unrestricted_crawling: false,
    mutation_authority: false,
    publication_authority: false,
  })
}

function requestTerms(parameters) {
  return [parameters.topic, parameters.known_organization, parameters.known_entity, parameters.known_case_citation, parameters.known_person_pseudonym]
    .map(value => clean(value, 300).toLowerCase())
    .filter(Boolean)
    .join(" ")
}

function scoreSource(source, parameters) {
  const requestedDomains = new Set(list(parameters.domains))
  const requestJurisdiction = jurisdictionKey(parameters.jurisdiction)
  const sourceJurisdiction = jurisdictionKey(source.jurisdiction)
  const reasons = []
  let score = 0
  const domainMatches = source.supported_domains.filter(domain => requestedDomains.has(domain))
  if (domainMatches.length) {
    score += domainMatches.length * 5
    reasons.push(`domain:${domainMatches.join(",")}`)
  }
  if (!requestedDomains.size) {
    score += 1
    reasons.push("domain:topic_led")
  }
  if (requestJurisdiction && sourceJurisdiction === requestJurisdiction) {
    score += 6
    reasons.push("jurisdiction:exact")
  } else if (!requestJurisdiction || ["canada_wide", "multijurisdiction"].includes(sourceJurisdiction)) {
    score += 2
    reasons.push("jurisdiction:applicable")
  } else return null
  const terms = requestTerms(parameters)
  const matchedTerms = source.selection_terms.filter(term => terms.includes(term)).slice(0, 4)
  if (matchedTerms.length) {
    score += matchedTerms.length * 2
    reasons.push(`topic:${matchedTerms.join(",")}`)
  }
  if (parameters.known_case_citation && ["courts", "judicial_reviews", "human_rights_tribunals", "administrative_appeals"].includes(source.source_family)) {
    score += 5
    reasons.push("known_citation")
  }
  if (parameters.recent_only === "true" && !source.recent_capable) return null
  if (parameters.historical === "true" && !source.historical_capable) return null
  if (source.scheduled_listener_id) {
    score += 1
    reasons.push("operational_adapter")
  }
  return { source, score, reasons }
}

export function planSamwiseUniversalResearch(request, sourceCatalog, { maxSources = 8 } = {}) {
  if (request?.schema_version !== "farm-owner-request-v1" || request.target_id !== SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID || !["research_public_records", "continue_research"].includes(request.request_type)) throw new Error("samwise_universal_research_request_invalid")
  if (sourceCatalog?.schema_version !== "samwise-universal-source-catalog-v1") throw new Error("samwise_universal_source_catalog_invalid")
  if (request.request_type === "continue_research" && !request.parameters?.research_request_id) throw new Error("samwise_continuation_id_required")
  const limit = Math.max(1, Math.min(8, Number(maxSources) || 8))
  const ranked = sourceCatalog.sources
    .filter(source => source.enabled)
    .map(source => scoreSource(source, request.parameters || {}))
    .filter(Boolean)
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || left.source.source_id.localeCompare(right.source.source_id))
    .slice(0, limit)
  const depth = request.parameters?.depth || "bounded"
  const requestedMax = Number(request.parameters?.max_documents || 0)
  const documentLimit = Math.min(DEPTH_LIMITS[depth] || DEPTH_LIMITS.bounded, requestedMax > 0 ? requestedMax : Number.POSITIVE_INFINITY)
  return Object.freeze({
    schema_version: "samwise-universal-research-plan-v1",
    research_request_id: request.parameters?.research_request_id || `research:${request.request_fingerprint.slice(0, 24)}`,
    request_fingerprint: request.request_fingerprint,
    request_type: request.request_type,
    capability_id: SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID,
    parameters: request.parameters,
    source_plan: ranked.map(({ source, score, reasons }) => ({ source_id: source.source_id, source_family: source.source_family, jurisdiction: source.jurisdiction, operations: source.operations, scheduled_listener_id: source.scheduled_listener_id, selection_score: score, selection_reasons: reasons })),
    limits: { sources: limit, documents: Number.isFinite(documentLimit) ? documentLimit : DEPTH_LIMITS[depth], branch_depth: 2 },
    state: ranked.length ? "planned" : "deferred",
    defer_reason: ranked.length ? null : "no_registered_source_match",
    explainable_selection: true,
    arbitrary_url_allowed: false,
    arbitrary_command_allowed: false,
    automatic_execution: false,
    mutation_authority: false,
    publication_authority: false,
  })
}

export function reviewSamwiseSecondaryRelevance({ findingId, primaryDomain, candidates = [], sourceReference, assessedDomains = SAMWISE_PUBLIC_RECORD_DOMAINS } = {}) {
  if (!findingId || !DOMAIN_SET.has(primaryDomain) || !/^https:\/\//.test(String(sourceReference || ""))) throw new Error("samwise_secondary_review_invalid")
  const relationships = candidates.map(candidate => {
    const domain = clean(typeof candidate === "string" ? candidate : candidate.domain, 80)
    const basis = clean(typeof candidate === "object" ? candidate.evidence_basis : "", 80)
    if (!DOMAIN_SET.has(domain) || domain === primaryDomain || !["explicit_source", "reviewed_citation", "deterministic_canonical_match"].includes(basis)) throw new Error("samwise_secondary_review_evidence_required")
    return { domain, evidence_basis: basis, source_reference: clean(candidate.source_reference || sourceReference, 500) }
  }).filter((candidate, index, values) => values.findIndex(item => item.domain === candidate.domain) === index)
  return Object.freeze({
    schema_version: "samwise-secondary-relevance-review-v1",
    canonical_finding_id: clean(findingId, 180),
    primary_domain: primaryDomain,
    assessed_domains: [...new Set(assessedDomains.filter(domain => DOMAIN_SET.has(domain)))],
    secondary_domains: relationships,
    cross_domain_discovery: relationships.length > 0,
    review_complete: true,
    weak_keyword_edges_created: 0,
  })
}

export function createSamwiseResearchMemory({ plan, sourcesChecked = [], documentsSeen = [], findings = [], secondaryReviews = [], stoppingReason = "sources_exhausted", costUsd = 0, now = new Date(), parentResearchRequestId = null } = {}) {
  if (plan?.schema_version !== "samwise-universal-research-plan-v1") throw new Error("samwise_research_plan_required")
  if (!STOP_REASONS.has(stoppingReason)) throw new Error("samwise_research_stopping_reason_invalid")
  const documents = documentsSeen.map(item => ({ source_id: clean(item.source_id, 180), document_id: clean(item.document_id, 180), fingerprint: clean(item.fingerprint, 128), reviewed: item.reviewed === true })).filter(item => item.source_id && item.document_id && item.fingerprint).filter((item, index, values) => values.findIndex(candidate => candidate.fingerprint === item.fingerprint) === index).slice(0, plan.limits.documents)
  return Object.freeze({
    schema_version: "samwise-research-memory-v1",
    capability_id: SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID,
    research_request_id: plan.research_request_id,
    parent_research_request_id: clean(parentResearchRequestId, 180) || null,
    request_fingerprint: plan.request_fingerprint,
    topic: clean(plan.parameters?.topic, 300),
    parameters: plan.parameters,
    source_plan: plan.source_plan,
    sources_checked: [...new Set(sourcesChecked.map(value => clean(value, 180)).filter(Boolean))],
    documents_seen: documents,
    findings_produced: [...new Set(findings.map(value => clean(value.canonical_finding_id || value, 180)).filter(Boolean))],
    secondary_relevance: secondaryReviews.map(review => ({ finding_id: review.canonical_finding_id, domains: review.secondary_domains.map(item => item.domain), complete: review.review_complete === true })),
    stopping_reason: stoppingReason,
    cost_usd: Number(Number(costUsd || 0).toFixed(4)),
    last_run_at: new Date(now).toISOString(),
    continuation: { completed_sources: [...new Set(sourcesChecked)], exclude_document_fingerprints: [...new Set(documents.map(item => item.fingerprint))], pending_milestone: stoppingReason === "milestone_pending" },
    mutation_authority: false,
    publication_authority: false,
  })
}

export function continueSamwiseResearch({ request, memory, sourceCatalog, maxSources = 8 } = {}) {
  if (memory?.schema_version !== "samwise-research-memory-v1" || request?.parameters?.research_request_id !== memory.research_request_id) throw new Error("samwise_research_memory_mismatch")
  const effectiveRequest = { ...request, parameters: { ...memory.parameters, ...request.parameters } }
  const plan = planSamwiseUniversalResearch(effectiveRequest, sourceCatalog, { maxSources })
  const completed = new Set(memory.sources_checked)
  const remaining = plan.source_plan.filter(source => !completed.has(source.source_id))
  const productive = plan.source_plan.filter(source => completed.has(source.source_id) && memory.findings_produced.length).map(source => ({ ...source, selection_reasons: [...source.selection_reasons, "continuation:previously_productive"] }))
  return Object.freeze({
    ...plan,
    source_plan: [...remaining, ...productive].slice(0, plan.limits.sources),
    continuation_of: memory.research_request_id,
    exclude_document_fingerprints: memory.continuation.exclude_document_fingerprints,
    repeated_completed_sources_without_reason: 0,
  })
}

export function branchSamwiseResearch({ parentMemory, findingId, topic, domains = [], sourceCatalog, maxDocuments = 25 } = {}) {
  if (parentMemory?.schema_version !== "samwise-research-memory-v1" || !parentMemory.findings_produced.includes(findingId)) throw new Error("samwise_research_branch_parent_invalid")
  const parentDepth = Number(parentMemory.branch_depth || 0)
  if (parentDepth >= 2) throw new Error("samwise_research_branch_depth_exceeded")
  const parameters = { topic: clean(topic, 300), domains: domains.filter(domain => DOMAIN_SET.has(domain)).slice(0, 6), depth: "bounded", max_documents: String(Math.min(50, Math.max(1, Number(maxDocuments) || 25))), parent_research_request_id: parentMemory.research_request_id }
  const requestFingerprint = hash({ request_type: "research_public_records", target_id: SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID, parameters })
  const request = { schema_version: "farm-owner-request-v1", request_type: "research_public_records", target_id: SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID, parameters, request_fingerprint: requestFingerprint }
  const plan = planSamwiseUniversalResearch(request, sourceCatalog)
  return Object.freeze({ ...plan, research_request_id: `research:${requestFingerprint.slice(0, 24)}`, parent_research_request_id: parentMemory.research_request_id, branch_from_finding_id: findingId, branch_depth: parentDepth + 1 })
}

export function mergeSamwiseResearchMemory(previous, next) {
  if (previous?.research_request_id !== next?.research_request_id) throw new Error("samwise_research_memory_merge_mismatch")
  const documents = [...previous.documents_seen, ...next.documents_seen].filter((item, index, values) => values.findIndex(candidate => candidate.fingerprint === item.fingerprint) === index)
  return Object.freeze({
    ...next,
    sources_checked: [...new Set([...previous.sources_checked, ...next.sources_checked])],
    documents_seen: documents,
    findings_produced: [...new Set([...previous.findings_produced, ...next.findings_produced])],
    secondary_relevance: [...previous.secondary_relevance, ...next.secondary_relevance].filter((item, index, values) => values.findIndex(candidate => candidate.finding_id === item.finding_id) === index),
    cost_usd: Number((Number(previous.cost_usd || 0) + Number(next.cost_usd || 0)).toFixed(4)),
    continuation: { ...next.continuation, exclude_document_fingerprints: [...new Set(documents.map(item => item.fingerprint))] },
  })
}

export function preserveSamwiseReviewDecisions(previous = [], refreshed = []) {
  const prior = new Map(previous.map(item => [item.canonical_id, item]))
  return refreshed.map(item => {
    const existing = prior.get(item.canonical_id)
    if (!existing || !REVIEW_STATES.has(existing.review_state) || existing.review_state === "pending") return item
    return { ...item, review_state: existing.review_state, review_decided_at: existing.review_decided_at || null, review_decided_by: existing.review_decided_by || null, review_audit_preserved: true }
  })
}

export function calculateSamwiseResearchRequestYield(memory) {
  if (memory?.schema_version !== "samwise-research-memory-v1") throw new Error("samwise_research_memory_required")
  const checked = memory.documents_seen.length
  const useful = memory.findings_produced.length
  return Object.freeze({ research_request_id: memory.research_request_id, sources_checked: memory.sources_checked.length, documents_checked: checked, useful_findings: useful, cross_domain_discoveries: memory.secondary_relevance.filter(item => item.domains.length).length, useful_per_100_documents: checked ? Number((useful / checked * 100).toFixed(2)) : 0, cost_usd: memory.cost_usd, score_type: "transparent_counts_only" })
}
