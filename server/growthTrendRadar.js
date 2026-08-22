import { createHash } from "node:crypto"

const protectedTerms = /safe home|transition house|confidential|undisclosed|domestic violence|trafficking|recovery (?:home|house)/i
const authority = (value) => Number(value) >= 85
const stable = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ")
export function trendFingerprint({ source_url, trend_category, canonical_resource_id = "", publication_date = "" } = {}) { return createHash("sha256").update([stable(source_url), stable(trend_category), stable(canonical_resource_id), stable(publication_date)].join("|"), "utf8").digest("hex") }

export function planGrowthPriorities({ resources = [], candidates = [] } = {}) {
  const byCommunity = new Map()
  for (const resource of resources) if (resource.community) byCommunity.set(stable(resource.community), (byCommunity.get(stable(resource.community)) || 0) + 1)
  return candidates.filter((candidate) => ["pending", "needs_review"].includes(candidate.review_status)).map((candidate) => {
    const protectedCandidate = candidate.location_disclosure_status === "confidential" || protectedTerms.test(candidate.name || "")
    const duplicateRisk = Boolean(candidate.matched_resource_id || candidate.duplicate_risk === true)
    const coverage = Math.max(0, 5 - (byCommunity.get(stable(candidate.community)) || 0))
    const evidence = authority(candidate.source_authority) ? 30 : 10
    const value_score = protectedCandidate || duplicateRisk ? 0 : coverage * 10 + evidence + (candidate.category ? 5 : 0)
    return { opportunity_id: `growth:${candidate.id}`, opportunity_type: "existing_candidate", candidate_id: candidate.id, resource_id: candidate.matched_resource_id || null, geographic_scope: candidate.community || null, service_scope: candidate.category || null, value_score, readiness_score: evidence, safety_risk: protectedCandidate ? "high" : "low", expected_research_difficulty: authority(candidate.source_authority) ? "bounded" : "high", blockers: [...(protectedCandidate ? ["protected_or_sensitive_candidate"] : []), ...(duplicateRisk ? ["canonical_duplicate_or_relationship_review"] : []), ...(!authority(candidate.source_authority) ? ["authoritative_evidence_required"] : [])], reason_codes: [coverage > 0 ? "sparse_community_coverage" : "coverage_not_sparse", authority(candidate.source_authority) ? "authoritative_candidate_source" : "weak_candidate_source"], explanation: protectedCandidate ? "Protected candidate is excluded from automatic growth work." : duplicateRisk ? "Candidate needs identity review before growth investigation." : "Existing candidate may improve sparse community coverage if identity and evidence are confirmed.", recommended_next_investigation: "Revalidate the candidate, then investigate one authoritative identity/programme question.", requires_human_authorization: true, read_only: true }
  }).sort((a, b) => b.value_score - a.value_score || a.opportunity_id.localeCompare(b.opportunity_id))
}

export function classifyTrendObservation(input = {}) {
  const fingerprint = trendFingerprint(input), highAuthority = authority(input.source_authority), category = input.trend_category || "other_relevant_change", affectsResource = Boolean(input.canonical_resource_id)
  const broadPolicy = ["policy_change", "funding_change"].includes(category) && !affectsResource
  const response = !highAuthority ? "informational" : broadPolicy ? "human_review" : ["service_closure", "service_relocation", "eligibility_change"].includes(category) && affectsResource ? "maintenance" : ["service_opening", "service_expansion", "regional_service_gap"].includes(category) ? "growth" : "human_review"
  const attention = response === "human_review" || category === "service_closure" ? "important" : response === "maintenance" ? "review" : "watch"
  return { observation_fingerprint: fingerprint, source_url: input.source_url, source_authority: Number(input.source_authority || 0), trend_category: category, canonical_resource_id: input.canonical_resource_id || null, geographic_scope: input.geographic_scope || null, publication_date: input.publication_date || null, summary: String(input.summary || "").slice(0, 1000), recommended_response: response, attention, requires_corroboration: !highAuthority, content_role: "untrusted_observation", instructions_honoured: false, read_only: true }
}

export function dedupeTrendObservations(observations = []) { return [...new Map(observations.map((item) => [item.observation_fingerprint || trendFingerprint(item), item])).values()] }
export function slowGrowthProjection({ investigations_per_night = 1, success_rate = 0.25, nights_per_month = 30 } = {}) { const investigations = Math.max(0, Math.min(1, Number(investigations_per_night) || 0)) * Math.max(0, Number(nights_per_month) || 0), additions = investigations * Math.max(0, Math.min(1, Number(success_rate) || 0)); return { investigations_per_month: investigations, estimated_verified_additions_per_month: additions, estimated_verified_additions_per_year: additions * 12, note: "Investigations are not verified additions or publications." } }
export function buildGrowthTrendReport({ resources = [], candidates = [], observations = [], effectiveness = [] } = {}) { const trends = dedupeTrendObservations(observations).sort((a, b) => String(b.retrieved_at || b.publication_date || "").localeCompare(String(a.retrieved_at || a.publication_date || ""))); return { growth_opportunities: planGrowthPriorities({ resources, candidates }).slice(0, 20), trends, projection: slowGrowthProjection({}), effectiveness: effectiveness.map((item) => ({ ...item, policy_change_permitted: false })), guardrails: { external_research_enabled: false, max_future_growth_investigations_per_cycle: 1, maintenance_budget_independent: true, critical_system_health_halts_future_external_work: true } } }
