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
    resource?.fundingType,
    ...(resource?.tags || []),
    ...(resource?.searchLocations || []),
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

function mergeRecord(base, extra) {
  return {
    ...extra,
    ...base,
    tags: [...new Set([...(base.tags || []), ...(extra.tags || [])])],
    searchLocations: [...new Set([...(base.searchLocations || []), ...(extra.searchLocations || [])])],
    collectionLinks: [...new Map([...(base.collectionLinks || []), ...(extra.collectionLinks || [])].map(link => [link.href, link])).values()],
    provinceWide: Boolean(base.provinceWide || extra.provinceWide),
    virtual_service: Boolean(base.virtual_service || extra.virtual_service),
    mobile_service: Boolean(base.mobile_service || extra.mobile_service),
  }
}

export function mergeMillerSearchResources(canonicalResources = [], specializedResources = []) {
  const merged = [...canonicalResources]
  for (const candidate of specializedResources) {
    const candidateUrl = safeProgramUrl(candidate.website)
    const index = merged.findIndex(existing => {
      if (String(existing.id) === String(candidate.id)) return true
      const existingUrl = safeProgramUrl(existing.website)
      return Boolean(candidateUrl && existingUrl === candidateUrl && namesClearlyMatch(existing.name, candidate.name))
    })
    if (index === -1) merged.push(candidate)
    else merged[index] = mergeRecord(merged[index], candidate)
  }
  return merged
}
