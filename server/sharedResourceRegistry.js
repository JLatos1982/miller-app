import { isOriginalMillerPublicResource } from "./farmPublicationRouting.js"

const PRIVATE_FIELD = /^(?:owner|private|internal|candidate|review_note|patient|complainant|confidence)/i
const ACTIVE_FUNDING = new Set(["open", "recurring", "upcoming", "contact_to_confirm", "intake_unknown", "verify_before_applying", "paused"])
const TOP_LEVEL = new Set(["healthcare", "housing", "legal_rights", "financial_funding", "family_community", "practical_support"])

const clean = value => String(value || "").trim()
const array = value => Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []
const normalized = value => clean(value).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim()
const canonicalUrl = value => {
  try {
    const url = new URL(clean(value))
    url.hash = ""
    ;[...url.searchParams.keys()].filter(key => key.startsWith("utm_")).forEach(key => url.searchParams.delete(key))
    return `${url.origin}${url.pathname.replace(/\/$/, "")}${url.search}`.toLowerCase()
  } catch { return "" }
}

const aliases = new Map([
  ["benefits finder indigenous peoples filter", "benefits finder"],
  ["indigenous skills and employment training program", "indigenous skills and employment training services"],
  ["medical transportation benefit", "fnha medical transportation benefit"],
  ["post secondary student support program", "post secondary student support program"],
  ["community workforce response grant", "community workforce response grant participant supports"],
  ["fraser health indigenous health liaisons", "indigenous health liaison program"],
])

const aliasName = value => aliases.get(normalized(value)) || normalized(value)

function topCategories(categories, kind, purpose = "") {
  const values = [...array(categories), purpose].map(normalized).join(" ")
  const result = new Set()
  if (kind === "funding" || /fund|benefit|grant|bursary|income|financial|tuition/.test(values)) result.add("financial_funding")
  if (/health|mental|substance|primary care|patient|medical|treatment|detox|harm reduction|cultural support/.test(values)) result.add("healthcare")
  if (/housing|shelter|rent|homeless/.test(values)) result.add("housing")
  if (/legal|rights|advocacy|complaint|ombud|tribunal|patient safety/.test(values)) result.add("legal_rights")
  if (/family|youth|elder|community|culture|victim/.test(values)) result.add("family_community")
  if (/transport|food|identification|employment|training|navigation|practical|clothing|phone/.test(values)) result.add("practical_support")
  if (!result.size) result.add(kind === "funding" ? "financial_funding" : "practical_support")
  return [...result]
}

function visibility(value) {
  return [...new Set(array(value))].sort()
}

const compactObject = value => Object.fromEntries(Object.entries(value).filter(([, nested]) => {
  if (Array.isArray(nested)) return nested.length > 0
  return nested !== null && nested !== undefined && nested !== ""
}))

export function normalizeSharedResource(record, { project, sourceKind }) {
  const funding = (record.resource_kind || sourceKind) === "funding"
  const name = clean(record.name)
  const organization = clean(record.organization || record.funder || record.administering_organization)
  const website = clean(record.website || record.application_url || record.source?.url)
  const province = clean(record.province || (record.jurisdiction === "Federal" || /canada-wide/i.test(record.service_area || record.geography) ? "Canada-wide" : record.jurisdiction))
  const categories = funding ? topCategories([], "funding", record.purpose) : topCategories(record.categories || record.category, "service")
  return {
    canonical_resource_id: clean(record.canonical_resource_id || record.public_support_id || record.id),
    record_type: funding ? "funding" : "service",
    organization,
    program_name: name,
    categories,
    subcategories: [...new Set(array(record.categories || record.category || record.purpose).map(normalized).filter(Boolean))],
    description: clean(record.description || record.purpose),
    population_served: clean(record.population_served || record.who_can_apply),
    indigenous_scope: clean(record.scope || record.indigenous_scope || "not_stated"),
    governance_type: clean(record.governance_type || "not_stated"),
    geography: clean(record.geography || record.area_served || record.service_area || record.province || record.jurisdiction),
    province,
    city_community: clean(record.community),
    address: clean(record.address),
    service_area: clean(record.service_area || record.area_served || record.geography),
    delivery_modes: array(record.delivery_modes),
    eligibility: clean(record.eligibility || record.who_can_apply),
    access_requirements: array(record.access_requirements).map(clean),
    required_documents: array(record.required_documents).map(clean),
    cost: clean(record.cost),
    referral_requirement: clean(record.referral_requirements),
    access: clean(record.access_pathway || record.access || record.application_method),
    phone: clean(record.phone),
    email: clean(record.email),
    website,
    funding: funding ? {
      purpose: clean(record.purpose),
      funding_type: clean(record.funding_type),
      amount: clean(record.amount),
      status: clean(record.status),
      opening_date: clean(record.opening_date),
      deadline: clean(record.deadline),
      recurring_cycle: clean(record.recurring_cycle),
      next_check_due: clean(record.next_check_due),
    } : null,
    housing: record.housing ? compactObject({
      housing_type: clean(record.housing.housing_type),
      application_process: clean(record.housing.application_process),
      availability: clean(record.housing.availability),
      restrictions: clean(record.housing.restrictions),
    }) : null,
    legal_support: record.legal_support ? compactObject({
      service_type: clean(record.legal_support.service_type),
      representation: clean(record.legal_support.representation),
    }) : null,
    transportation: record.transportation ? compactObject({
      funding_source: clean(record.transportation.funding_source),
      eligible_trip_types: array(record.transportation.eligible_trip_types).map(clean),
      escort_rules: clean(record.transportation.escort_rules),
      delivery: clean(record.transportation.delivery),
      travel_modes: array(record.transportation.travel_modes).map(clean),
    }) : null,
    source: { title: clean(record.source?.title || name), authority: clean(record.source?.authority || organization), url: clean(record.source?.url || website) },
    last_verified: clean(record.last_verified_date || record.last_verified_at),
    verification_status: funding && !ACTIVE_FUNDING.has(record.status) ? "expired_closed" : "verified_active",
    project_visibility: visibility([project]),
    source_record_ids: [clean(record.public_support_id || record.id || record.canonical_resource_id)].filter(Boolean),
  }
}

function mergeRecords(left, right) {
  const merged = {
    ...left,
    categories: [...new Set([...left.categories, ...right.categories])].sort(),
    subcategories: [...new Set([...left.subcategories, ...right.subcategories])].sort(),
    project_visibility: visibility([...left.project_visibility, ...right.project_visibility]),
    source_record_ids: [...new Set([...left.source_record_ids, ...right.source_record_ids])].sort(),
  }
  for (const key of ["organization", "description", "population_served", "indigenous_scope", "governance_type", "geography", "province", "city_community", "address", "service_area", "eligibility", "cost", "referral_requirement", "access", "phone", "email", "housing", "legal_support", "transportation"]) {
    if (!merged[key] && right[key]) merged[key] = right[key]
  }
  merged.access_requirements = [...new Set([...(left.access_requirements || []), ...(right.access_requirements || [])])]
  merged.required_documents = [...new Set([...(left.required_documents || []), ...(right.required_documents || [])])]
  if (left.funding || right.funding) merged.funding = left.funding || right.funding
  if (left.record_type !== right.record_type) merged.record_type = "service_and_funding"
  return merged
}

export function buildSharedResourceRegistry(collections = []) {
  const records = []
  for (const collection of collections) {
    for (const raw of collection.records || []) {
      const candidate = normalizeSharedResource(raw, collection)
      const url = canonicalUrl(candidate.website)
      const name = aliasName(candidate.program_name)
      const existingIndex = records.findIndex(item => {
        if (item.canonical_resource_id === candidate.canonical_resource_id) return true
        return Boolean(url && url === canonicalUrl(item.website) && name === aliasName(item.program_name))
      })
      if (existingIndex === -1) records.push(candidate)
      else records[existingIndex] = mergeRecords(records[existingIndex], candidate)
    }
  }
  return records.sort((a, b) => a.program_name.localeCompare(b.program_name))
}

export function projectSharedResources(registry, project) {
  if (project === "miller") return registry.records.filter(isOriginalMillerPublicResource)
  return registry.records.filter(record => record.project_visibility.includes(project) && record.verification_status !== "needs_review")
}

export function validateSharedResourceRegistry(registry) {
  if (registry?.schema_version !== "miller-shared-resource-registry-v1" || !Array.isArray(registry.records)) throw new Error("invalid_shared_resource_registry")
  const hasPrivateKey = value => value && typeof value === "object" && Object.entries(value).some(([key, nested]) => PRIVATE_FIELD.test(key) || hasPrivateKey(nested))
  if (hasPrivateKey(registry)) throw new Error("private_resource_field_exposed")
  const ids = new Set()
  for (const record of registry.records) {
    if (!record.canonical_resource_id || ids.has(record.canonical_resource_id)) throw new Error("duplicate_shared_resource_id")
    if (!record.program_name || !record.organization || !/^https:\/\//.test(record.website) || !/^https:\/\//.test(record.source?.url)) throw new Error("invalid_shared_resource_source")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.last_verified) || !record.categories.length || record.categories.some(category => !TOP_LEVEL.has(category))) throw new Error("invalid_shared_resource_taxonomy")
    if (!record.project_visibility.every(project => ["miller", "miller_north"].includes(project))) throw new Error("invalid_project_visibility")
    if (record.transportation && !record.categories.some(category => ["healthcare", "financial_funding", "practical_support"].includes(category))) throw new Error("invalid_transportation_taxonomy")
    if (record.housing && !record.categories.includes("housing")) throw new Error("invalid_housing_taxonomy")
    if (record.legal_support && !record.categories.includes("legal_rights")) throw new Error("invalid_legal_taxonomy")
    ids.add(record.canonical_resource_id)
  }
  const counts = {
    total: registry.records.length,
    miller_only: registry.records.filter(record => record.project_visibility.join(",") === "miller").length,
    miller_north_only: registry.records.filter(record => record.project_visibility.join(",") === "miller_north").length,
    both: registry.records.filter(record => record.project_visibility.length === 2).length,
  }
  return { valid: true, ...counts }
}
