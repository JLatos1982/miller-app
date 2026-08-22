import { randomUUID } from "node:crypto"
import { classifyTrendObservation, trendFingerprint } from "./growthTrendRadar.js"
import { sanitizeResearchDocument } from "./intelligence/research.js"

export const TREND_SENSOR_LIMITS = Object.freeze({ maxSources: 3, maxRequests: 3, maxRuntimeMs: 30_000, maxBytes: 256 * 1024, maxAiCalls: 0 })
// Design note only: the future scheduler, if separately authorized, must keep
// this ordering and stop after recording one bounded cycle.
export const FUTURE_HEARTBEAT_SEQUENCE = Object.freeze(["wake", "system_health", "knowledge_audit", "bounded_maintenance", "authoritative_trend_inspection", "trend_classification", "growth_planning", "curiosity_planning", "future_authorized_growth_investigation", "record", "stop"])
export const TREND_SOURCES = Object.freeze([
  { id: "bc-government-substance-use", source_class: "government", authority: 90, host: "www2.gov.bc.ca", entrypoint: "https://www2.gov.bc.ca/gov/content/health/managing-your-health/mental-health-substance-use" },
  { id: "fraser-health-substance-use", source_class: "health_authority", authority: 95, host: "www.fraserhealth.ca", entrypoint: "https://www.fraserhealth.ca/health-topics-a-to-z/mental-health-and-substance-use" },
  { id: "vch-substance-use", source_class: "health_authority", authority: 95, host: "www.vch.ca", entrypoint: "https://www.vch.ca/en/health-topics/mental-health-substance-use" },
])
const sourceById = new Map(TREND_SOURCES.map((item) => [item.id, item]))
const keywords = [{ category: "service_closure", pattern: /\b(closed|closure|discontinued)\b/i }, { category: "service_relocation", pattern: /\b(relocat(?:e|ed|ion)|new address|moved to)\b/i }, { category: "service_opening", pattern: /\b(new (?:service|program|clinic)|now open|opening)\b/i }, { category: "service_expansion", pattern: /\b(expand(?:ed|ing|sion)|increased capacity)\b/i }, { category: "eligibility_change", pattern: /\b(eligib(?:le|ility)|referral required|criteria changed)\b/i }, { category: "policy_change", pattern: /\b(policy|regulation|provincial initiative)\b/i }]
const clamp = (value, fallback, max) => Math.max(1, Math.min(max, Number(value) || fallback))
export function allowedTrendSource(id) { return sourceById.get(id) || null }
export function isAllowedTrendUrl(source, value) { try { const url = new URL(value); return url.protocol === "https:" && url.hostname === source.host } catch { return false } }
const normalizedIdentity = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

// A source page is not canonical evidence. This can only add a link when one
// known, stable identity is explicitly present; otherwise the observation stays
// unlinked for a human to review.
export function linkTrendToResource(observation, resources = []) {
  const text = normalizedIdentity(`${observation.summary || ""} ${observation.source_url || ""}`)
  const matches = resources.filter((resource) => {
    const identities = [resource.display_name, ...(resource.aliases || [])].map(normalizedIdentity).filter((value) => value.length > 3)
    return identities.some((identity) => text.includes(identity))
  })
  if (matches.length === 1) return { canonical_resource_id: matches[0].id, link_status: "deterministic" }
  return { canonical_resource_id: null, link_status: matches.length ? "ambiguous" : "unresolved" }
}
export function extractTrendCandidates(source, document, retrievedAt = new Date().toISOString()) {
  const safe = sanitizeResearchDocument(document), match = keywords.find((item) => item.pattern.test(`${safe.title} ${safe.text}`))
  if (!match) return []
  const observation = classifyTrendObservation({ source_url: safe.url, source_authority: source.authority, trend_category: match.category, geographic_scope: "British Columbia", summary: `${safe.title || source.id}: ${safe.text.slice(0, 500)}` })
  return [{ ...observation, source_id: source.id, source_class: source.source_class, retrieved_at: retrievedAt, evidence_excerpt: safe.text.slice(0, 600), hostile_content_detected: safe.injectionSignals.length > 0, observation_fingerprint: trendFingerprint(observation) }]
}
export async function runTrendSensor({ actorId, health, fetchDocument, existingFingerprints = new Set(), resources = [], persist, now = () => Date.now(), makeId = randomUUID, sourceIds = TREND_SOURCES.map((item) => item.id), limits = {} } = {}) {
  if (!actorId || typeof fetchDocument !== "function") throw new Error("trend_sensor_dependencies_required")
  const budget = { maxSources: clamp(limits.maxSources, TREND_SENSOR_LIMITS.maxSources, TREND_SENSOR_LIMITS.maxSources), maxRequests: clamp(limits.maxRequests, TREND_SENSOR_LIMITS.maxRequests, TREND_SENSOR_LIMITS.maxRequests), maxRuntimeMs: clamp(limits.maxRuntimeMs, TREND_SENSOR_LIMITS.maxRuntimeMs, TREND_SENSOR_LIMITS.maxRuntimeMs) }
  const startedAt = now(), id = makeId(), selected = [...new Set(sourceIds)].map(allowedTrendSource).filter(Boolean).slice(0, budget.maxSources), report = { id, actor_id: actorId, requests_used: 0, new_observations: 0, duplicates_ignored: 0, items: [], observations: [], stop_reason: "completed", started_at_ms: startedAt }
  if (health?.findings?.some((item) => item.domain === "system" && item.severity === "critical")) { report.stop_reason = "security_halt"; if (persist) await persist(report); return report }
  for (const source of selected) {
    if (report.requests_used >= budget.maxRequests || now() - startedAt >= budget.maxRuntimeMs) { report.stop_reason = "budget_exhausted"; break }
    try {
      const document = await fetchDocument(source.entrypoint, source)
      report.requests_used += 1
      const textContent = !document?.contentType || /^(?:text\/html|text\/plain)(?:;|$)/i.test(document.contentType)
      if (!document?.ok || !textContent || !isAllowedTrendUrl(source, document.url) || Number(document.bytes || 0) > TREND_SENSOR_LIMITS.maxBytes) { report.items.push({ source_id: source.id, source_url: source.entrypoint, outcome: "blocked", reason_code: "source_response_outside_allowlist_or_budget" }); continue }
      const candidates = extractTrendCandidates(source, document).map((item) => ({ ...item, ...linkTrendToResource(item, resources) })), fresh = candidates.filter((item) => !existingFingerprints.has(item.observation_fingerprint))
      report.duplicates_ignored += candidates.length - fresh.length; report.new_observations += fresh.length; report.observations.push(...fresh)
      report.items.push({ source_id: source.id, source_url: document.url, outcome: fresh.length ? "observed" : "unchanged", reason_code: fresh.length ? "new_deterministic_observation" : "no_new_observation" })
    } catch { report.requests_used += 1; report.items.push({ source_id: source.id, source_url: source.entrypoint, outcome: "failed", reason_code: "bounded_source_failure" }) }
  }
  if (persist) await persist(report)
  return report
}
export function planCuriosityQuestions({ opportunities = [], trends = [] } = {}) { const questions = [...trends.filter((item) => item.recommended_response !== "informational").map((item) => ({ question_id: `trend:${item.observation_fingerprint}`, source: "trend", related_resource_id: item.canonical_resource_id || null, expected_value: item.attention === "important" ? 90 : 60, answerability: item.requires_corroboration ? "needs_corroboration" : "bounded", safety_risk: "low", reason_codes: [item.trend_category], proposed_investigation: item.recommended_response, requires_human_authorization: true })), ...opportunities.slice(0, 5).map((item) => ({ question_id: `growth:${item.opportunity_id}`, source: "growth", related_candidate_id: item.candidate_id, expected_value: item.value_score, answerability: item.blockers.length ? "blocked" : "bounded", safety_risk: item.safety_risk, reason_codes: item.reason_codes, proposed_investigation: "growth", requires_human_authorization: true }))].filter((item) => item.safety_risk !== "high" && item.answerability !== "blocked")
  return questions.sort((a, b) => b.expected_value - a.expected_value || a.question_id.localeCompare(b.question_id))
}
