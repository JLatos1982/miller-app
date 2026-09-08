const ALLOWED_CATEGORIES = new Set(["legal_support", "housing", "funding", "treatment", "mental_health", "transportation", "benefits_navigation", "re_entry", "family_youth_support", "addiction_support", "victim_services"])
const clean = (value, limit = 500) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit)

export function normalizePalantirResourceOpportunity(input = {}) {
  const canonicalResourceId = clean(input.canonical_resource_id, 180)
  const sourceUrl = /^https:\/\//.test(String(input.source_url || "")) ? clean(input.source_url, 500) : null
  const category = clean(input.category, 80)
  if (!canonicalResourceId || !sourceUrl || !ALLOWED_CATEGORIES.has(category)) throw new Error("palantir_resource_opportunity_invalid")
  return Object.freeze({
    schema_version: "palantir-resource-opportunity-v1",
    canonical_resource_id: canonicalResourceId,
    discovered_from_finding_id: clean(input.discovered_from_finding_id, 180),
    category,
    source_url: sourceUrl,
    verification_status: input.verification_status === "verified" ? "verified" : "candidate",
    project_visibility: ["miller", "miller_north", "both"].includes(input.project_visibility) ? input.project_visibility : "both",
    research_record_included: false,
    automatic_publication: false,
    mutation_authority: false,
  })
}

export function routePalantirResourceOpportunity(opportunity, resourceRecord = null, { consumerGate = null } = {}) {
  const item = normalizePalantirResourceOpportunity(opportunity)
  const routes = new Set(["shared_resource_candidate"])
  if (item.verification_status === "verified" && resourceRecord && ["miller", "both"].includes(item.project_visibility) && typeof consumerGate === "function" && consumerGate(resourceRecord) === true) routes.add("miller_resource_candidate")
  return Object.freeze({ opportunity: item, routes: [...routes], research_finding_becomes_public_resource: false, consumer_gate_required: true, automatic_publication: false })
}
