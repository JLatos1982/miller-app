const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

export function stableCuratedResourceId(resource) {
  const input = [resource.name || resource["Resource Name"], resource.city || resource.City, resource.organization || resource.Organization].map(normalize).join("|")
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619)
  return `curated:${(hash >>> 0).toString(36)}`
}

export function buildMapCandidates(resources, query, limit = 30) {
  const terms = normalize(query).split(" ").filter((term) => term.length > 1)
  return resources
    .filter((resource) => resource.approved === true && resource.hidden !== true && resource.public_map !== false)
    .map((resource) => {
      const text = normalize([resource.name, resource.organization, resource.serviceTypes?.join(" "), resource.serviceType, resource.category, resource.city, resource.service_area, resource.description, resource.population, resource.accessType].join(" "))
      const score = terms.reduce((total, term) => total + (text.includes(term) ? 10 : 0) + (normalize(resource.name).includes(term) ? 12 : 0), 0)
      return { resource, score }
    })
    .filter(({ score }) => !terms.length || score > 0)
    .sort((a, b) => b.score - a.score || a.resource.name.localeCompare(b.resource.name))
    .slice(0, limit)
    .map(({ resource }) => resource)
}

export function resolveAuthorizedMapResults(resources, resourceIds) {
  const allowed = new Map(resources.filter((item) => item.approved === true && item.hidden !== true && item.public_map !== false).map((item) => [String(item.id), item]))
  return (Array.isArray(resourceIds) ? resourceIds : []).map(String).filter((id, index, ids) => ids.indexOf(id) === index && allowed.has(id)).map((id) => allowed.get(id))
}

export function toMillerMatch(resource) {
  return Object.fromEntries(Object.entries({
    id: resource.id, name: resource.name, organization: resource.organization,
    serviceType: resource.serviceType || resource.service_type, category: resource.category,
    population: resource.population, eligibility: resource.eligibility, description: resource.description,
    accessType: resource.accessType || resource.access_type, hours: resource.hours, phone: resource.phone,
    website: resource.website, address: resource.address, city: resource.city, region: resource.region,
    source: resource.source, approved: resource.approved === true, hidden: resource.hidden === true,
  }).filter(([, value]) => value !== undefined && value !== null && value !== ""))
}
