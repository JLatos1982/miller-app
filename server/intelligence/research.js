import { classifyAddressEvidence, classifySource, normalizeAddress } from "../addressEvidence.js"
import { evaluateClaim } from "./evidenceEngine.js"
import { normalizeIdentityText } from "../resourceIdentity.js"

export const RESEARCH_LIMITS = Object.freeze({ maxQueriesPerClaim: 2, maxPagesPerClaim: 2, maxElapsedMs: 20_000, maxDocumentCharacters: 120_000, maxExcerptCharacters: 600 })
const hostileInstruction = /\b(ignore (?:all |the )?(?:previous|prior) instructions|system prompt|reveal (?:the )?(?:secret|api key)|approve this location|call a tool|override (?:policy|confidence))\b/i
const clean = (value, max = 500) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max)
export function buildOccupancyResearchPlan(record, limits = {}) {
  const budget = { ...RESEARCH_LIMITS, ...limits }, program = clean(record.resource_name, 300), address = normalizeAddress(record.submitted_address), municipality = clean(record.municipality, 100)
  const queries = [...new Set([`"${program}" "${address}"`, `"${program}" ${municipality} official`])].slice(0, budget.maxQueriesPerClaim)
  return { version: "miller-occupancy-research-v1.0.0", claim: { subjectId: record.canonical_uuid, field: "address", proposedValue: address }, need: "program_specific_occupancy", preferredSources: ["official_provider", "health_authority", "government", "authorized_structured_provider", "established_directory"], queries, budget, stopRules: ["sufficient_authoritative_program_address_evidence", "authoritative_conflict", "budget_exhausted", "timeout"], geocoderRole: "address_normalization_only" }
}
export function buildFactResearchPlan({ subjectId, name, field, existingValue, officialDomain = "" }, limits = {}) {
  const budget = { ...RESEARCH_LIMITS, maxQueriesPerClaim: 1, ...limits }, safeField = ["phone", "website", "address", "hours", "service_status"].includes(field) ? field : "public fact", domain = clean(officialDomain, 200)
  return { version: "miller-fact-research-v1.0.0", claim: { subjectId, field: safeField, existingValue }, queries: [`"${clean(name, 300)}" ${safeField}${domain ? ` site:${domain}` : " official"}`], preferredSources: ["official_provider", "health_authority", "government", "authorized_structured_provider"], budget, stopRules: ["fresh_authoritative_fact_found", "authoritative_conflict", "budget_exhausted", "timeout"], existingTrustedFactPreservedOnFailure: true }
}
export function sanitizeResearchDocument(input = {}) {
  const title = clean(input.title, 300), url = clean(input.url, 2_000), raw = String(input.text || "").slice(0, RESEARCH_LIMITS.maxDocumentCharacters)
  const injectionSignals = [...raw.matchAll(new RegExp(hostileInstruction.source, "ig"))].map((match) => clean(match[0], 120)).slice(0, 10)
  const text = raw.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, RESEARCH_LIMITS.maxDocumentCharacters)
  return { title, url, text, injectionSignals, contentRole: "untrusted_data", instructionsHonoured: false, truncated: raw.length >= RESEARCH_LIMITS.maxDocumentCharacters }
}
export function evaluateOccupancyDocument(record, document, retrievedAt = new Date().toISOString()) {
  const safe = sanitizeResearchDocument(document), source = classifySource(safe.url, record.resource_name), preliminary = classifyAddressEvidence({ resource: { name: record.resource_name, organization: record.operator || "", address: record.submitted_address }, source, page: { text: safe.text } })
  const normalizedPage = normalizeIdentityText(safe.text), normalizedProgram = normalizeIdentityText(record.resource_name), streetNumber = normalizeAddress(record.submitted_address).match(/\b\d+[A-Za-z]?\b/)?.[0]?.toLowerCase(), exactProgramAddress = Boolean(normalizedProgram && normalizedPage.includes(normalizedProgram) && streetNumber && new RegExp(`\\b${streetNumber}\\b`).test(normalizedPage))
  const classification = exactProgramAddress ? preliminary : { ...preliminary, tier: "E3", recommendation: "insufficient evidence", program_relationship_verified: false, reasons: [...new Set([...(preliminary.reasons || []), "exact_program_address_relationship_not_verified"])] }
  const sourceType = source.type === "first_party" ? "official_provider" : source.type
  const evidence = { sourceType, value: classification.program_relationship_verified ? normalizeAddress(record.submitted_address) : "unverified", url: safe.url, retrievedAt, extractionMethod: "deterministic_exact_program_address_cooccurrence", independentKey: source.domain, excerpt: safe.text.slice(0, RESEARCH_LIMITS.maxExcerptCharacters), injectionSignals: safe.injectionSignals }
  return { source, classification, evidence, security: { promptInjectionIgnored: safe.injectionSignals.length > 0, contentRole: safe.contentRole, instructionsHonoured: false } }
}
export function finishOccupancyResearch(record, inspected = [], { queriesUsed = 0, elapsedMs = 0 } = {}) {
  const verified = inspected.filter((item) => item.classification.program_relationship_verified && item.source.authoritative), conflicts = new Set(verified.map((item) => item.evidence.value)).size > 1
  const geocoderEvidence = Number(record.score) === 100 ? [{ sourceType: "bc_geocoder", value: normalizeAddress(record.submitted_address), retrievedAt: record.retrieved_at, extractionMethod: "licensed_exact_geocode", independentKey: "bc_address_geocoder" }] : []
  const claim = evaluateClaim({ subjectId: record.canonical_uuid, field: "address", proposedValue: normalizeAddress(record.submitted_address), evidence: [...verified.map((item) => item.evidence), ...geocoderEvidence] })
  const stoppedBecause = conflicts ? "authoritative_conflict" : verified.length ? "sufficient_authoritative_program_address_evidence" : elapsedMs >= RESEARCH_LIMITS.maxElapsedMs ? "timeout" : "budget_exhausted"
  return { recordId: record.canonical_uuid, program: record.resource_name, claim, inspectedSources: inspected.length, queriesUsed, elapsedMs, stoppedBecause, occupancySupported: !conflicts && verified.length > 0 && ["auto_accept", "accept_with_monitoring"].includes(claim.decision), publicationChanged: false, trustedRecordChanged: false }
}
export function boundedResearchLoop(plan, operations) {
  const started = operations.now(), seen = new Set(), events = []
  for (const query of plan.queries) {
    if (events.filter((x) => x.type === "query").length >= plan.budget.maxQueriesPerClaim || operations.now() - started >= plan.budget.maxElapsedMs) break
    const key = query.toLowerCase(); if (seen.has(key)) continue; seen.add(key); events.push({ type: "query", value: query })
  }
  return { events, duplicateQueriesSuppressed: plan.queries.length - events.length, elapsedMs: operations.now() - started, withinBudget: true }
}
export function extractBarrierEvidence(document, sourceType = "official_provider", retrievedAt = new Date().toISOString()) {
  const safe = sanitizeResearchDocument(document), patterns = { walk_in: /\bwalk[ -]?ins? (?:are )?(?:welcome|accepted)|\bno appointment (?:is )?required/i, referral_required: /\breferral (?:is )?required/i, identification_required: /\b(?:government|photo) id (?:is )?required/i, cost: /\b(?:free|no cost|no fee)\b/i, wheelchair_accessible: /\bwheelchair accessible\b/i }
  return Object.entries(patterns).flatMap(([field, pattern]) => { const match = safe.text.match(pattern); return match ? [{ field, value: field === "cost" ? "free" : true, sourceType, url: safe.url, retrievedAt, extractionMethod: "deterministic_explicit_phrase", excerpt: clean(match[0], 200), confidence: "bounded", contentRole: "untrusted_data" }] : [] })
}
