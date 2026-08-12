const clean = (value) => String(value || "").trim()

export function buildAuthorizedMapResponse({ parsed, authorizedResources }) {
  const byId = new Map(authorizedResources.map((resource) => [String(resource.id), resource]))
  const byName = new Map(authorizedResources.map((resource) => [clean(resource.name).toLowerCase(), resource]))
  const requestedIds = Array.isArray(parsed?.resourceIds) ? parsed.resourceIds.map(String) : []
  const requestedNames = Array.isArray(parsed?.searchHints?.recommendedResourceNames) ? parsed.searchHints.recommendedResourceNames : []
  const chosen = []
  for (const id of requestedIds) if (byId.has(id)) chosen.push(byId.get(id))
  for (const name of requestedNames) if (byName.has(clean(name).toLowerCase())) chosen.push(byName.get(clean(name).toLowerCase()))
  const unique = [...new Map(chosen.map((resource) => [String(resource.id), resource])).values()]
  const fallback = unique.length ? unique : authorizedResources.slice(0, 6)
  return {
    message: clean(parsed?.answer).slice(0, 900) || "I found a few approved Miller resources to look at together.",
    resourceIds: fallback.map((resource) => String(resource.id)).slice(0, 12),
    filterSuggestions: Array.isArray(parsed?.searchHints?.categories) ? parsed.searchHints.categories.map(clean).filter(Boolean).slice(0, 4) : [],
    clarificationQuestion: clean(parsed?.clarificationQuestion).slice(0, 300),
    noResults: authorizedResources.length === 0,
    referencePoint: "current_map_centre",
  }
}

export function boundedMapConversation(messages, maxTurns = 8) {
  if (!Array.isArray(messages)) return []
  return messages.slice(-(maxTurns * 2)).map(({ role, content }) => ({ role, content: clean(content).slice(0, 1200) }))
}
