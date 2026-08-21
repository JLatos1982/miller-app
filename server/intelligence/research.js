import { classifyAddressEvidence, classifySource, normalizeAddress } from "../addressEvidence.js"
import { evaluateClaim } from "./evidenceEngine.js"
import { normalizeIdentityText } from "../resourceIdentity.js"

export const RESEARCH_LIMITS = Object.freeze({ maxQueriesPerClaim: 5, maxPagesPerClaim: 4, initialQueries: 2, initialPages: 2, maxElapsedMs: 35_000, maxDocumentCharacters: 120_000, maxExcerptCharacters: 600 })
const hostileInstruction = /\b(ignore (?:all |the )?(?:previous|prior) instructions|system prompt|reveal (?:the )?(?:secret|api key)|approve this location|call a tool|override (?:policy|confidence))\b/i
const clean = (value, max = 500) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max)
export function buildOccupancyResearchPlan(record, limits = {}) {
  const budget = { ...RESEARCH_LIMITS, ...limits }, program = clean(record.resource_name, 300), address = normalizeAddress(record.submitted_address), municipality = clean(record.municipality, 100), operator = clean(record.operator, 300), aliases = (record.aliases || []).map((item) => clean(item, 300)).filter(Boolean)
  const queries = [...new Set([`"${program}"`, `"${program}" ${municipality}`, operator && `"${program}" "${operator}"`, `"${program}" "${address}"`, ...aliases.flatMap((alias) => [`"${alias}" "${address}"`, operator && `"${alias}" "${operator}"`])].filter(Boolean))].slice(0, budget.maxQueriesPerClaim)
  return { version: "miller-occupancy-research-v1.1.0", claim: { subjectId: record.canonical_uuid, field: "address", proposedValue: address }, identity: { program, operator, municipality, aliases }, need: "program_specific_occupancy", preferredSources: ["official_provider", "health_authority", "government", "authorized_structured_provider", "established_directory"], queries, budget, adaptive: { stopAfterInitialWeakResults: true, continueWhenOfficialDomainPromising: true }, stopRules: ["sufficient_authoritative_program_address_evidence", "authoritative_conflict", "weak_sources_only", "budget_exhausted", "timeout"], geocoderRole: "address_normalization_only" }
}

export function programIdentityEvidence(record, pageText) {
  const page = normalizeIdentityText(pageText).replace(/\bcentre\b/g, "center"), canonical = normalizeIdentityText(record.resource_name).replace(/\bcentre\b/g, "center"), aliases = (record.aliases || []).map((item) => normalizeIdentityText(item).replace(/\bcentre\b/g, "center")).filter(Boolean), operator = normalizeIdentityText(record.operator), matched = [canonical, ...aliases].find((name) => name && page.includes(name)) || ""
  const operatorMatched = Boolean(operator && page.includes(operator)), address = normalizeAddress(record.submitted_address), streetNumber = address.match(/\b\d+[A-Za-z]?\b/)?.[0]?.toLowerCase(), addressMatched = Boolean(streetNumber && new RegExp(`\\b${streetNumber}\\b`).test(page))
  return { matched, canonicalMatched: matched === canonical, aliasMatched: Boolean(matched && matched !== canonical), operatorMatched, addressMatched, sufficient: Boolean(matched && addressMatched), reasonCodes: [...(matched ? [matched === canonical ? "canonical_program_name_matched" : "confirmed_alias_matched"] : ["program_identity_not_matched"]), ...(operatorMatched ? ["operator_corroborates_identity"] : []), ...(addressMatched ? ["street_number_matched"] : [])] }
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
  const identity = programIdentityEvidence(record, safe.text), classification = identity.sufficient ? { ...preliminary, tier: source.authoritative && source.priority <= 4 && preliminary.fixed_public_facility ? "E1" : "E2", recommendation: source.authoritative && source.priority <= 4 ? "ready for geocoding" : "needs address review", program_relationship_verified: true, reasons: [...new Set([...(preliminary.reasons || []).filter((reason) => reason !== "program_address_relationship_not_verified"), ...identity.reasonCodes])] } : { ...preliminary, tier: "E3", recommendation: "insufficient evidence", program_relationship_verified: false, reasons: [...new Set([...(preliminary.reasons || []), ...identity.reasonCodes, "exact_program_address_relationship_not_verified"])] }
  const sourceType = source.type === "first_party" ? "official_provider" : source.type
  const authority = { first_party: 95, health_authority: 95, government: 90, municipal: 85, established_directory: 60, existing_miller: 40 }[source.type] || 0
  const evidence = { sourceType, sourceAuthority: authority, value: classification.program_relationship_verified ? normalizeAddress(record.submitted_address) : "unverified", url: safe.url, retrievedAt, extractionMethod: identity.aliasMatched ? "confirmed_alias_and_address_cooccurrence" : "deterministic_exact_program_address_cooccurrence", independentKey: source.domain, excerpt: safe.text.slice(0, RESEARCH_LIMITS.maxExcerptCharacters), injectionSignals: safe.injectionSignals, identity }
  return { source, classification, evidence, identity, security: { promptInjectionIgnored: safe.injectionSignals.length > 0, contentRole: safe.contentRole, instructionsHonoured: false } }
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
