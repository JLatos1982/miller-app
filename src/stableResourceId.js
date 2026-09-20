const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

export function stableCuratedResourceId(resource) {
  const input = [resource.name || resource["Resource Name"], resource.city || resource.City, resource.organization || resource.Organization].map(normalize).join("|")
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619)
  return `curated:${(hash >>> 0).toString(36)}`
}
