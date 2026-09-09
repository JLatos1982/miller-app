import crypto from "node:crypto"

export const MILLER_EXTERNAL_SEARCH_TTL_MS = 15 * 60 * 1000
export const MILLER_EXTERNAL_RESULT_LIMIT = 5
export const MILLER_EXTERNAL_SEARCH_VERSION = "miller-external-discovery-v1"

const clean = value => String(value ?? "").replace(/\s+/g, " ").trim()
const normalized = value => clean(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
const sha256 = value => crypto.createHash("sha256").update(String(value)).digest("hex")

const INTENT_LABELS = Object.freeze({
  housing: "housing or shelter",
  detox: "withdrawal management",
  treatment: "addiction treatment",
  oat: "opioid agonist treatment",
  counselling: "counselling",
  harm_reduction: "harm reduction",
  meetings: "recovery support",
  legal: "legal navigation",
  funding: "treatment funding or benefits",
  mental_health: "mental health support",
  basic_needs: "basic needs support",
  transportation: "transportation or travel support",
  reentry: "re-entry support",
})

const PREFERRED_HOSTS = /(?:^|\.)(?:gc\.ca|canada\.ca|gov\.bc\.ca|alberta\.ca|saskatchewan\.ca|ontario\.ca|quebec\.ca|gouv\.qc\.ca|gov\.mb\.ca|gov\.ns\.ca|gnb\.ca|princeedwardisland\.ca|gov\.nl\.ca|gov\.nu\.ca|yukon\.ca|gov\.nt\.ca|healthlinkbc\.ca|fraserhealth\.ca|vch\.ca|interiorhealth\.ca|islandhealth\.ca|northernhealth\.ca|albertahealthservices\.ca|saskhealthauthority\.ca|ontariohealth\.ca|camh\.ca|fnha\.ca|fnha\.ca)$/i
const LOW_QUALITY_HOSTS = /(?:^|\.)(?:facebook\.com|instagram\.com|linkedin\.com|yelp\.ca|yellowpages\.ca|reddit\.com|pinterest\.com|wikipedia\.org)$/i

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""))
    if (!["http:", "https:"].includes(url.protocol)) return null
    url.hash = ""
    return url
  } catch {
    return null
  }
}

function sourceAuthority(url) {
  return safeUrl(url)?.hostname.replace(/^www\./, "") || ""
}

function resultQuality(url) {
  const host = sourceAuthority(url)
  if (!host || LOW_QUALITY_HOSTS.test(host)) return "excluded"
  if (PREFERRED_HOSTS.test(host)) return "preferred_public_source"
  return "official_provider_or_nonprofit_review_needed"
}

function boundedExcerpt(value) {
  return clean(value).slice(0, 420)
}

export function normalizedExternalSearchKey({ location = "", province = "", intents = [] } = {}) {
  return JSON.stringify({
    location: normalized(location),
    province: normalized(province),
    intents: [...new Set(intents.map(normalized).filter(Boolean))].sort(),
  })
}

export function buildMillerExternalDiscoveryQuery({ location = "", province = "", intents = [] } = {}) {
  const place = clean(location || province || "Canada")
  const needs = intents.map(intent => INTENT_LABELS[intent]).filter(Boolean).slice(0, 3)
  const topic = needs.length ? needs.join(" ") : "addiction mental health practical support"
  // The raw frontline narrative is deliberately not part of a third-party request.
  return `${place} ${topic} official service contact`
}

export function createExternalCandidate(result, context, catalog = []) {
  const url = safeUrl(result?.url)?.toString() || ""
  const programName = clean(result?.title) || sourceAuthority(url)
  const urlFingerprint = sha256(url).slice(0, 24)
  const nameKey = normalized(programName)
  const duplicateCanonicalIds = catalog
    .filter(item => normalized(item?.name) === nameKey || safeUrl(item?.website)?.toString() === url)
    .map(item => clean(item.id))
    .filter(Boolean)
    .slice(0, 3)
  return Object.freeze({
    candidate_id: `external:${urlFingerprint}`,
    candidate_fingerprint: `ext:${urlFingerprint}`,
    discovery_source: "tavily",
    program_name: programName,
    source_url: url,
    source_authority: sourceAuthority(url),
    geography: clean(context.location || context.province),
    need_categories: [...new Set((context.intents || []).map(clean).filter(Boolean))],
    relevance_basis: "bounded_external_discovery_after_verified_coverage_gate",
    duplicate_status: duplicateCanonicalIds.length ? "possible_existing_canonical_resource" : "no_exact_canonical_match",
    duplicate_canonical_ids: duplicateCanonicalIds,
    verification_status: "pending_private_review",
    canonical_id: null,
  })
}

export function normalizeTavilyExternalResults(rawResults, context, catalog = []) {
  const byUrl = new Map()
  for (const raw of Array.isArray(rawResults) ? rawResults : []) {
    const url = safeUrl(raw?.url)?.toString()
    if (!url || byUrl.has(url) || resultQuality(url) === "excluded") continue
    const title = clean(raw?.title) || sourceAuthority(url)
    if (!title) continue
    const candidate = createExternalCandidate({ url, title }, context, catalog)
    byUrl.set(url, Object.freeze({
      canonical_id: candidate.candidate_id,
      name: title,
      organization: "",
      category: context.intents?.[0] ? (INTENT_LABELS[context.intents[0]] || "Practical support") : "Practical support",
      service_type: "External discovery",
      description: boundedExcerpt(raw?.content || raw?.snippet),
      province: clean(context.province),
      city: "",
      region: clean(context.location || context.province),
      address: "",
      physical_location: null,
      local_service_area: [],
      regional_service_area: [],
      province_wide: false,
      canada_wide: false,
      virtual: false,
      navigation_only: false,
      travel_required: false,
      scope_note: "Service area has not yet been verified by Miller.",
      access_pathway: null,
      resource_layer: "external_discovery_unverified",
      workflow_relevance: [],
      languages: [],
      location_relationship: "external_location_unverified",
      location_label: clean(context.location || context.province),
      phone: "",
      email: "",
      website: url,
      access_note: "Check the source directly for current access information.",
      access_type: "",
      referral_note: "",
      eligibility_note: "",
      funding_note: "",
      transportation_note: "",
      verified_status: "external_unverified",
      last_verified: "",
      source_url: url,
      mobile_ready: false,
      tags: ["external discovery", ...(context.intents || [])].slice(0, 8),
      source: {
        authority: candidate.source_authority,
        url,
        verification_status: "external_unverified",
        last_verified: "",
      },
      why_shown: ["Broader search was used because Miller’s verified coverage needs support here."],
      matched_needs: [...new Set(context.intents || [])],
      result_group: "external_discovery",
      result_origin: "external",
      external_label: "External result — not yet verified by Miller",
      verification_candidate: candidate,
      source_quality: resultQuality(url),
    }))
  }
  return [...byUrl.values()].sort((left, right) => left.source_quality.localeCompare(right.source_quality) || left.name.localeCompare(right.name)).slice(0, MILLER_EXTERNAL_RESULT_LIMIT)
}

export function createMillerTavilySearcher({
  apiKey = process.env.TAVILY_API_KEY,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  cache = new Map(),
  ttlMs = MILLER_EXTERNAL_SEARCH_TTL_MS,
  estimatedSearchCostUsd = process.env.TAVILY_ESTIMATED_SEARCH_COST_USD,
} = {}) {
  const aggregate = { searches: 0, cache_hits: 0, failures: 0, result_count: 0, total_latency_ms: 0, external_search_units: 0 }
  const cost = Number(estimatedSearchCostUsd)
  const configuredCost = Number.isFinite(cost) && cost >= 0 ? cost : null

  async function search(context, catalog = []) {
    const key = normalizedExternalSearchKey(context)
    const cached = cache.get(key)
    if (cached && now() - cached.created_at_ms <= ttlMs) {
      aggregate.cache_hits++
      return { ...cached.value, cache_status: "hit", latency_ms: 0 }
    }
    if (!clean(apiKey)) return {
      attempted: false,
      status: "not_configured",
      cache_status: "not_used",
      latency_ms: 0,
      results: [],
      estimated_cost_usd: null,
      cost_status: "not_configured",
    }
    const started = now()
    aggregate.searches++
    aggregate.external_search_units++
    try {
      const response = await fetchImpl("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8_000),
        body: JSON.stringify({
          api_key: apiKey,
          query: buildMillerExternalDiscoveryQuery(context),
          max_results: MILLER_EXTERNAL_RESULT_LIMIT,
          topic: "general",
          search_depth: "basic",
          include_answer: false,
        }),
      })
      const latencyMs = Math.max(0, now() - started)
      aggregate.total_latency_ms += latencyMs
      if (!response?.ok) throw new Error(`provider_http_${response?.status || "unavailable"}`)
      const payload = await response.json()
      const results = normalizeTavilyExternalResults(payload?.results, context, catalog)
      aggregate.result_count += results.length
      const value = Object.freeze({
        attempted: true,
        status: "completed",
        cache_status: "miss",
        latency_ms: latencyMs,
        results,
        estimated_cost_usd: configuredCost,
        cost_status: configuredCost === null ? "plan_rate_not_configured" : "configured_estimate",
      })
      cache.set(key, { created_at_ms: now(), value })
      if (cache.size > 100) cache.delete(cache.keys().next().value)
      return value
    } catch (error) {
      const latencyMs = Math.max(0, now() - started)
      aggregate.total_latency_ms += latencyMs
      aggregate.failures++
      return {
        attempted: true,
        status: "unavailable",
        cache_status: "miss",
        latency_ms: latencyMs,
        results: [],
        estimated_cost_usd: configuredCost,
        cost_status: configuredCost === null ? "plan_rate_not_configured" : "configured_estimate",
        public_message: "I couldn’t complete the broader search, but the verified Miller resources are still available.",
        error_code: clean(error?.message).slice(0, 80) || "external_search_unavailable",
      }
    }
  }

  return Object.freeze({
    search,
    aggregateMetrics: () => Object.freeze({
      ...aggregate,
      average_latency_ms: aggregate.searches ? Math.round(aggregate.total_latency_ms / aggregate.searches) : 0,
      estimated_cost_usd: configuredCost === null ? null : Number((aggregate.external_search_units * configuredCost).toFixed(4)),
      raw_query_retained: false,
      cache_key_contains_raw_query: false,
    }),
  })
}
