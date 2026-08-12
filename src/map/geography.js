export const SERVICE_TYPES = [
  "Detox / withdrawal", "Residential treatment", "Outpatient", "OAT",
  "Harm reduction", "Counselling", "Recovery support", "Housing / shelter",
  "Crisis", "Basic needs", "Other",
]

const TYPE_RULES = [
  ["Detox / withdrawal", /detox|withdrawal/],
  ["Residential treatment", /residential|treatment cent|recovery home|rehab|inpatient/],
  ["OAT", /\boat\b|methadone|suboxone|buprenorphine|addictions medicine/],
  ["Harm reduction", /harm reduction|naloxone|overdose prevention|supervised consumption|drug checking|needle/],
  ["Counselling", /counsell|therap|mental health/],
  ["Recovery support", /peer|recovery|support group|\baa\b|\bna\b|smart recovery/],
  ["Housing / shelter", /housing|shelter|supportive housing/],
  ["Crisis", /crisis|emergency/],
  ["Basic needs", /food|meal|basic needs|clothing/],
  ["Outpatient", /outpatient|community|clinic/],
]

const text = (value) => String(value || "").trim()
const lower = (value) => text(value).toLowerCase()
const truthy = (value) => value === true || /^(yes|true|1)$/i.test(text(value))

export function validCoordinate(value, axis) {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return false
  const number = Number(value)
  return Number.isFinite(number) && (axis === "lat" ? number >= -90 && number <= 90 : number >= -180 && number <= 180)
}

export function normalizeMapResource(resource) {
  const combined = lower([resource.serviceType, resource.service_type, resource.category, resource.description, resource.tags?.join?.(" ")].join(" "))
  const serviceTypes = TYPE_RULES.filter(([, pattern]) => pattern.test(combined)).map(([name]) => name)
  const virtual = truthy(resource.virtual_service) || /virtual|online|telephone/.test(lower(resource.accessType || resource.access_type))
  const mobile = truthy(resource.mobile_service) || /mobile|outreach/.test(combined)
  const precisePublicLocation = !virtual && !mobile && resource.public_map !== false && validCoordinate(resource.latitude, "lat") && validCoordinate(resource.longitude, "lng")
  return {
    ...resource,
    id: resource.id ?? `${resource.name || "resource"}-${resource.city || ""}`,
    name: text(resource.name || resource["Resource Name"]) || "Unnamed resource",
    serviceTypes: serviceTypes.length ? serviceTypes : ["Other"],
    populationText: lower(resource.population),
    accessText: lower(resource.accessType || resource.access_type),
    costText: lower(resource.fundingType || resource.funding_type || resource.cost),
    virtual_service: virtual,
    mobile_service: mobile,
    mappable: precisePublicLocation,
    latitude: precisePublicLocation ? Number(resource.latitude) : null,
    longitude: precisePublicLocation ? Number(resource.longitude) : null,
    verification_status: text(resource.verification_status || resource.geocode_status) || "unverified",
  }
}

export function filterMapResources(resources, filters = {}) {
  const types = new Set(filters.serviceTypes || [])
  const populations = (filters.populations || []).map(lower)
  const access = (filters.access || []).map(lower)
  const costs = (filters.costs || []).map(lower)
  return resources.filter((item) => {
    if (types.size && !item.serviceTypes.some((type) => types.has(type))) return false
    if (filters.city && filters.city !== "All cities" && lower(item.city) !== lower(filters.city)) return false
    if (populations.length && !populations.some((term) => item.populationText.includes(term))) return false
    if (access.length && !access.some((term) => term === "virtual" ? item.virtual_service : term === "mobile/outreach" ? item.mobile_service : item.accessText.includes(term))) return false
    if (costs.length && !costs.some((term) => term === "unknown" ? !item.costText : item.costText.includes(term))) return false
    if (filters.approvedOnly && (item.approved !== true || item.hidden === true || item.public_map === false)) return false
    return true
  })
}

export function distanceKm(a, b) {
  const radians = (degrees) => degrees * Math.PI / 180
  const dLat = radians(b.latitude - a.latitude)
  const dLng = radians(b.longitude - a.longitude)
  const lat1 = radians(a.latitude)
  const lat2 = radians(b.latitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function analyzeServiceAccess(resources, point) {
  const mapped = resources.filter((resource) => resource.mappable)
  const distances = mapped.map((resource) => ({ resource, distance: distanceKm(point, resource) })).sort((a, b) => a.distance - b.distance || String(a.resource.id).localeCompare(String(b.resource.id)))
  const within = Object.fromEntries([1, 5, 10, 25].map((radius) => [radius, distances.filter((item) => item.distance <= radius).length]))
  const nearestByType = Object.fromEntries(SERVICE_TYPES.map((type) => [type, distances.find((item) => item.resource.serviceTypes.includes(type)) || null]))
  return { totalMapped: mapped.length, within, nearestByType }
}

export function groupResourcesByCoordinate(resources, precision = 4) {
  const groups = new Map()
  resources.filter((resource) => resource.mappable).forEach((resource) => {
    const key = coordinateKey(resource, precision)
    groups.set(key, [...(groups.get(key) || []), resource])
  })
  return [...groups.values()].map((items) => [...items].sort((a, b) => a.name.localeCompare(b.name)))
}

export function nearestService(resources, point, predicate = () => true) {
  return resources.filter((resource) => resource.mappable && predicate(resource))
    .map((resource) => ({ resource, distance: distanceKm(point, resource) }))
    .sort((a, b) => a.distance - b.distance || String(a.resource.id).localeCompare(String(b.resource.id)))[0] || null
}

export function resetMapFilters() {
  return { serviceTypes: [], city: "All cities" }
}

export function coordinateKey(resource, precision = 4) {
  if (!resource.mappable) return ""
  return `${resource.latitude.toFixed(precision)},${resource.longitude.toFixed(precision)}`
}
