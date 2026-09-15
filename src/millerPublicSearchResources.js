const text = value => String(value ?? "").trim()
const normalized = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

const categoryLabels = Object.freeze({
  housing: "Housing / Outreach",
  employment: "Employment",
  training: "Training / Education",
  identification: "Identification / ID",
  income_benefits: "Income / Benefits",
  transportation: "Transportation",
  advocacy_navigation: "Legal / Advocacy",
  basic_needs: "Basic Needs",
})

const fundingPurposeLabels = Object.freeze({
  education: "Training / Education",
  employment_training: "Employment / Training",
  emergency_assistance: "Income / Benefits",
  housing: "Housing / Outreach",
  identification: "Identification / ID",
  income_benefits: "Income / Benefits",
  moving_transportation: "Transportation",
  training: "Training / Education",
  transportation: "Transportation",
  treatment_transportation: "Transportation",
})

const knownPlaces = [
  "Burnaby",
  "New Westminster",
  "Coquitlam",
  "Port Coquitlam",
  "Port Moody",
  "Maple Ridge",
  "Pitt Meadows",
  "Surrey",
  "Vancouver",
  "White Rock",
]

// Explicit cross-collection aliases selected from identical public program/operator records. Do not infer new aliases from display names.
const KNOWN_CROSS_COLLECTION_IDENTITIES = new Map([
  ["curated:1edki99", "fnha-mental-wellness"], ["curated:1i3bwm4", "fnha-mental-wellness"],
  ["curated:1sig1hl", "fnha-virtual-substance-use"], ["curated:245spk", "fnha-virtual-substance-use"],
  ["curated:uync6x", "jordans-principle-navigators"], ["curated:hufn2g", "jordans-principle-navigators"],
  ["curated:nqgim3", "kuus-crisis-response"], ["curated:y76cu", "kuus-crisis-response"],
  ["curated:12xw7a9", "metis-crisis-line"], ["curated:cscq8y", "metis-crisis-line"],
  ["curated:z5uvkp", "irs-survivors-crisis-line"], ["curated:i8mwff", "irs-survivors-crisis-line"],
])

function placesFromArea(area) {
  const haystack = normalized(area)
  const matches = new Set(knownPlaces.filter(place => haystack.includes(normalized(place))))
  if (haystack.includes("tri cities")) ["Coquitlam", "Port Coquitlam", "Port Moody"].forEach(place => matches.add(place))
  if (haystack.includes("fraser north")) ["Burnaby", "New Westminster", "Coquitlam", "Port Coquitlam", "Port Moody", "Maple Ridge", "Pitt Meadows"].forEach(place => matches.add(place))
  if (haystack.includes("lower mainland") || haystack.includes("metro vancouver")) knownPlaces.forEach(place => matches.add(place))
  return [...matches]
}

function collectionLink(href, label) {
  return Object.freeze({ href, label })
}

export function practicalSupportSearchResource(record) {
  const label = categoryLabels[record?.category] || "Practical Supports"
  const area = text(record?.area_served)
  return {
    id: text(record?.id),
    kind: "service",
    name: text(record?.name),
    organization: text(record?.organization),
    serviceType: label,
    category: label,
    population: text(record?.population_served),
    eligibility: text(record?.eligibility),
    description: text(record?.description),
    accessType: text(record?.access),
    phone: text(record?.phone),
    website: text(record?.website),
    city: placesFromArea(area).length === 1 ? placesFromArea(area)[0] : "",
    region: area,
    source: "miller_public_projection",
    approved: true,
    hidden: false,
    verification_status: "publication_safe",
    location_last_verified: text(record?.last_verified_at),
    virtual_service: /online|virtual|phone/.test(normalized(area + " " + record?.access)),
    mobile_service: /mobile|outreach/.test(normalized(record?.description + " " + record?.access)),
    searchLocations: placesFromArea(area),
    provinceWide: /british columbia|\bbc\b/.test(normalized(area)),
    tags: [
      "practical support",
      "practical help",
      label,
      record?.category,
      area,
      record?.source?.authority,
    ].map(text).filter(Boolean),
    collectionLinks: [collectionLink("/practical-supports", "View in Practical Supports")],
  }
}

export function fundingSearchResource(record) {
  const purpose = text(record?.purpose)
  const serviceType = fundingPurposeLabels[purpose] || "Funding & Assistance"
  const geography = text(record?.geography)
  return {
    id: text(record?.id),
    kind: "funding",
    name: text(record?.name),
    organization: text(record?.funder),
    serviceType,
    category: "Funding & Assistance",
    population: (record?.applicant_types || []).join(", "),
    eligibility: text(record?.who_can_apply),
    description: `Funding or assistance related to ${serviceType.toLowerCase()}. See the official program page for current details.`,
    accessType: [text(record?.status).replaceAll("_", " "), text(record?.deadline) ? `Deadline ${text(record.deadline)}` : "", text(record?.application_method)].filter(Boolean).join(" · "),
    website: text(record?.application_url),
    region: geography,
    fundingType: text(record?.funding_type),
    source: "miller_public_projection",
    approved: true,
    hidden: false,
    verification_status: "publication_safe",
    location_last_verified: text(record?.last_verified_at),
    virtual_service: true,
    searchLocations: placesFromArea(geography),
    provinceWide: /british columbia|\bbc\b|federal/.test(normalized(`${geography} ${record?.jurisdiction}`)),
    tags: [
      "funding",
      "financial assistance",
      "grant",
      "benefit",
      "subsidy",
      "bursary",
      "training funding",
      purpose.replaceAll("_", " "),
      serviceType,
      record?.status,
      ...(record?.applicant_types || []),
    ].map(text).filter(Boolean),
    collectionLinks: [collectionLink("/funding-assistance", "View in Funding & Assistance")],
  }
}

export function buildMillerSpecializedSearchResources(practicalRecords = [], fundingRecords = []) {
  return [
    ...practicalRecords.map(practicalSupportSearchResource),
    ...fundingRecords.map(fundingSearchResource),
  ].filter(record => record.id && record.name && record.approved && !record.hidden)
}

function publicationSafeLegacyResource(record = {}) {
  const publicRecord = {}
  for (const [key, value] of Object.entries(record || {})) {
    // Legacy notes and explicitly internal/research fields are never part of
    // the public corpus even when the underlying legacy row is approved.
    if (key === "notes" || /^(private|internal|research|unpublished)_/i.test(key)) continue
    publicRecord[key] = value
  }
  return publicRecord
}

// The shared publication-safe corpus is deliberately assembled before client
// presentation. Search, Master List, and mobile/API callers can all consume
// this projection without copying collection-specific resources into a view.
export function buildMillerPublicationSafeResourceCorpus({ canonicalResources = [], practicalRecords = [], fundingRecords = [], sharedRecords = [], sharedAccessLocations = [] } = {}) {
  const legacy = canonicalResources
    .filter(record => record?.approved === true && record?.hidden !== true)
    .map(publicationSafeLegacyResource)
  const specialized = buildMillerSpecializedSearchResources(practicalRecords, fundingRecords)
  const shared = buildSharedCanonicalMillerResources(sharedRecords, sharedAccessLocations)
  return mergeMillerSearchResources(mergeMillerSearchResources(legacy, specialized), shared)
}

function publicAccessLocation(location = {}) {
  return {
    id: text(location.location_id),
    parentCanonicalId: text(location.parent_canonical_resource_id),
    name: text(location.site_name),
    type: text(location.location_type),
    address: text(location.street_address),
    city: text(location.city),
    province: text(location.province),
    accessRole: text(location.access_role),
    sourceUrl: text(location.source_url),
    lastVerified: text(location.verification_date),
    mapStatus: text(location.map_status),
  }
}

export function sharedCanonicalMillerResource(record = {}, accessLocations = []) {
  const visibility = Array.isArray(record.project_visibility) ? record.project_visibility : []
  if (!visibility.includes("miller") || record.verification_status !== "verified_active") return null
  const categories = Array.isArray(record.categories) ? record.categories : []
  const subcategories = Array.isArray(record.subcategories) ? record.subcategories : []
  const access = [text(record.referral_requirement), text(record.access_requirements), text(record.access)].filter(Boolean).join(" · ")
  const fundingNote = record.funding
    ? [record.funding.funding_type, record.funding.amount, record.funding.deadline ? `Deadline: ${record.funding.deadline}` : ""].map(text).filter(Boolean).join(" · ")
    : ""
  const transportationNote = record.transportation
    ? [record.transportation.delivery, record.transportation.eligible_trip_types, record.transportation.travel_modes].map(text).filter(Boolean).join(" · ")
    : ""
  const scope = record.service_scope && typeof record.service_scope === "object" ? record.service_scope : {}
  return {
    id: text(record.canonical_resource_id),
    kind: text(record.record_type) || "service",
    name: text(record.program_name),
    organization: text(record.organization),
    serviceType: text(subcategories[0]) || text(categories[0]).replaceAll("_", " ") || "Practical support",
    category: text(categories[0]).replaceAll("_", " "),
    population: text(record.population_served),
    eligibility: text(record.eligibility),
    description: text(record.description),
    accessType: access,
    referralNote: text(record.referral_requirement),
    accessRequirements: Array.isArray(record.access_requirements) ? record.access_requirements.map(text).filter(Boolean) : [],
    fundingType: fundingNote,
    transportationNote,
    phone: text(record.phone),
    email: text(record.email),
    website: text(record.website),
    address: text(record.address),
    city: text(record.city_community),
    province: text(record.province),
    region: text(record.service_area || record.geography),
    physicalLocation: scope.physical_location || null,
    localServiceArea: Array.isArray(scope.local_service_area) ? scope.local_service_area.map(text).filter(Boolean) : [],
    regionalServiceArea: Array.isArray(scope.regional_service_area) ? scope.regional_service_area.map(text).filter(Boolean) : [],
    provinceWide: scope.province_wide === true,
    canadaWide: scope.canada_wide === true,
    virtual_service: scope.virtual === true,
    navigationOnly: scope.navigation_only === true,
    travelRequired: scope.travel_required === true,
    scopeNote: text(scope.scope_note),
    accessPathway: record.navigation_pathway && typeof record.navigation_pathway === "object"
      ? {
        origin_geographies: Array.isArray(record.navigation_pathway.origin_geographies) ? record.navigation_pathway.origin_geographies.map(text).filter(Boolean) : [],
        local_access_point: text(record.navigation_pathway.local_access_point),
        regional_intake: text(record.navigation_pathway.regional_intake),
        destination_service: text(record.navigation_pathway.destination_service),
        referral_requirement: text(record.navigation_pathway.referral_requirement),
        transportation_pathway: text(record.navigation_pathway.transportation_pathway),
        funding_pathway: text(record.navigation_pathway.funding_pathway),
        virtual_alternative: text(record.navigation_pathway.virtual_alternative),
        return_home_support: Array.isArray(record.navigation_pathway.return_home_support) ? record.navigation_pathway.return_home_support.map(text).filter(Boolean) : [],
        travel_required: record.navigation_pathway.travel_required === true,
        source_provenance: record.navigation_pathway.source_provenance || null,
      }
      : null,
    resourceLayer: text(record.resource_layer || "core"),
    workflowRelevance: Array.isArray(record.workflow_relevance) ? record.workflow_relevance.map(text).filter(Boolean) : [],
    languages: Array.isArray(record.languages) ? record.languages.map(text).filter(Boolean) : [],
    searchLocations: [...new Set([
      ...(Array.isArray(scope.search_locations) ? scope.search_locations : []),
      ...(Array.isArray(scope.local_service_area) ? scope.local_service_area : []),
      ...(Array.isArray(scope.regional_service_area) ? scope.regional_service_area : []),
    ].map(text).filter(Boolean))],
    accessLocations: accessLocations
      .filter(location => {
        const parentIds = [
          text(location?.parent_canonical_resource_id),
          ...(Array.isArray(location?.related_parent_canonical_resource_ids) ? location.related_parent_canonical_resource_ids.map(text) : []),
        ].filter(Boolean)
        return parentIds.includes(text(record.canonical_resource_id))
      })
      .map(publicAccessLocation),
    source: "shared_canonical_miller_projection",
    sourceAuthority: text(record.source?.authority || record.organization),
    sourceUrl: text(record.source?.url || record.website),
    approved: true,
    hidden: false,
    verification_status: "verified_active",
    location_last_verified: text(record.last_verified),
    tags: [...categories, ...subcategories, text(record.indigenous_scope), text(record.delivery_modes)].filter(Boolean),
    collectionLinks: categories.includes("financial_funding")
      ? [collectionLink("/funding-assistance", "View in Funding & Assistance")]
      : [collectionLink("/practical-supports", "View in Practical Supports")],
  }
}

export function buildSharedCanonicalMillerResources(records = [], accessLocations = []) {
  return records
    .filter(record => Array.isArray(record?.project_visibility) && record.project_visibility.includes("miller"))
    .map(record => sharedCanonicalMillerResource(record, accessLocations))
    .filter(Boolean)
}

export function millerResourceSearchText(resource) {
  return [
    resource?.name,
    resource?.organization,
    resource?.serviceType,
    resource?.category,
    resource?.population,
    resource?.eligibility,
    resource?.description,
    resource?.accessType,
    resource?.hours,
    resource?.phone,
    resource?.website,
    resource?.address,
    resource?.city,
    resource?.region,
    resource?.scopeNote,
    resource?.fundingType,
    ...(resource?.localServiceArea || []),
    ...(resource?.regionalServiceArea || []),
    ...(resource?.tags || []),
    ...(resource?.workflowRelevance || []),
    ...(resource?.languages || []),
    ...(resource?.searchLocations || []),
    ...(resource?.accessLocations || []).flatMap(location => [location.name, location.address, location.city, location.province, location.accessRole]),
    ...(resource?.collectionLinks || []).map(link => link.label),
  ].map(text).join(" ").toLowerCase().replace(/\s+/g, " ")
}

function safeProgramUrl(value) {
  try {
    const parsed = new URL(text(value))
    parsed.hash = ""
    return ["http:", "https:"].includes(parsed.protocol)
      ? `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`.toLowerCase()
      : ""
  } catch {
    return ""
  }
}

function namesClearlyMatch(left, right) {
  const a = normalized(left), b = normalized(right)
  if (!a || !b) return false
  if (a === b) return true
  const shorter = a.length <= b.length ? a : b
  const longer = a.length <= b.length ? b : a
  const tokens = shorter.split(" ").filter(Boolean)
  return tokens.length >= 3 && tokens.every(token => longer.split(" ").includes(token))
}

function sameConservativeProgram(left, right) {
  const leftKnownIdentity = KNOWN_CROSS_COLLECTION_IDENTITIES.get(text(left.id))
  const rightKnownIdentity = KNOWN_CROSS_COLLECTION_IDENTITIES.get(text(right.id))
  if (leftKnownIdentity && leftKnownIdentity === rightKnownIdentity) return true
  const leftUrl = safeProgramUrl(left.website), rightUrl = safeProgramUrl(right.website)
  if (leftUrl && leftUrl === rightUrl && namesClearlyMatch(left.name, right.name)) return true
  const leftName = normalized(left.name), rightName = normalized(right.name)
  const leftOrganization = normalized(left.organization), rightOrganization = normalized(right.organization)
  const leftCity = normalized(left.city), rightCity = normalized(right.city)
  // A name-only match is never enough: programs with shared operators remain distinct.
  return Boolean(leftName && leftName === rightName && leftOrganization && leftOrganization === rightOrganization && leftCity && leftCity === rightCity)
}

function mergeRecord(base, extra) {
  const merged = {
    ...extra,
    ...base,
    tags: [...new Set([...(base.tags || []), ...(extra.tags || [])])],
    searchLocations: [...new Set([...(base.searchLocations || []), ...(extra.searchLocations || [])])],
    collectionLinks: [...new Map([...(base.collectionLinks || []), ...(extra.collectionLinks || [])].map(link => [link.href, link])).values()],
    provinceWide: Boolean(base.provinceWide || extra.provinceWide),
    virtual_service: Boolean(base.virtual_service || extra.virtual_service),
    mobile_service: Boolean(base.mobile_service || extra.mobile_service),
    navigationOnly: Boolean(base.navigationOnly || extra.navigationOnly),
    localServiceArea: [...new Set([...(base.localServiceArea || []), ...(extra.localServiceArea || [])])],
    regionalServiceArea: [...new Set([...(base.regionalServiceArea || []), ...(extra.regionalServiceArea || [])])],
    workflowRelevance: [...new Set([...(base.workflowRelevance || []), ...(extra.workflowRelevance || [])])],
    languages: [...new Set([...(base.languages || []), ...(extra.languages || [])])],
    canonicalAliases: [...new Set([base.id, ...(base.canonicalAliases || []), extra.id, ...(extra.canonicalAliases || [])].map(text).filter(Boolean))],
  }
  if (extra.verification_status === "verified_active") {
    for (const key of ["sourceAuthority", "sourceUrl", "verification_status", "location_last_verified", "referralNote", "accessRequirements", "fundingType", "transportationNote", "physicalLocation", "scopeNote"]) {
      if (extra[key]) merged[key] = extra[key]
    }
    for (const key of ["address", "city", "province", "region", "phone", "email", "website", "accessType", "eligibility"]) {
      if (extra[key]) merged[key] = extra[key]
    }
  }
  return merged
}

export function mergeMillerSearchResources(canonicalResources = [], specializedResources = []) {
  const merged = []
  for (const candidate of [...canonicalResources, ...specializedResources]) {
    const index = merged.findIndex(existing => {
      if (String(existing.id) === String(candidate.id)) return true
      return sameConservativeProgram(existing, candidate)
    })
    if (index === -1) merged.push(candidate)
    else merged[index] = mergeRecord(merged[index], candidate)
  }
  return merged
}
