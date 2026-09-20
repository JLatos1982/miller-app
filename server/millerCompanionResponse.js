const clean = value => String(value ?? "").replace(/\s+/g, " ").trim()
const normalized = value => clean(value).toLowerCase()

function queryLocation(response = {}) {
  return clean(response?.interpreted?.location || response?.interpreted?.province)
}

function resultPlace(result = {}) {
  return clean(result.location_label || result.city || result.region || result.province)
}

function firstUsefulResult(results = []) {
  return results.find(result => clean(result?.name)) || null
}

function isExternalResult(result = {}) {
  return result?.result_origin === "external" || result?.result_origin === "external_discovery" || result?.verified_status === "external_unverified"
}

function describeNeed(query, primaryIntent) {
  const words = normalized(query)
  if (primaryIntent === "counselling" && /\b(addiction|substance use|substance-use)\b/.test(words)) return "addiction counselling"
  return primaryIntent || "support"
}

// This is deliberately a bounded, deterministic companion voice. It composes
// only from the query plus fields already present in the public search response;
// it never looks up, infers, or retains person-specific information. Both
// public endpoints use this one composition step: web exposes `message`, while
// mobile receives the same content in its established structured guidance.
export function buildMillerCompanionGuidance({ query = "", response = {} } = {}) {
  const guidance = response?.guidance || {}
  const primaryIntent = clean(response?.interpreted?.primary_intent).replaceAll("_", " ")
  const location = queryLocation(response)
  const first = firstUsefulResult(response?.results)
  const focus = describeNeed(query, primaryIntent)

  const opening = location
    ? `I hear you — you’re looking for ${focus} support in ${location}.`
    : `I hear you — you’re looking for ${focus} support.`
  const route = isExternalResult(first)
    ? `I found ${first.name}${resultPlace(first) ? ` (${resultPlace(first)})` : ""} as a broader public lead. It is clearly marked as not yet verified by Miller, so check the source directly before relying on it.`
    : first
      ? `I’ve put ${first.name}${resultPlace(first) ? ` (${resultPlace(first)})` : ""} at the front of the verified options to help you get oriented.`
    : "I’ve kept the closest verified Miller options together below."
  const access = clean(guidance.access_note)
  const nextStep = clean(guidance.next_step)
  const close = access || nextStep || "Take the next step that feels manageable, and confirm current access details with the service."

  const message = [opening, route, close].filter(Boolean).join(" ")
  return Object.freeze({
    title: clean(guidance.title || "Miller’s guide"),
    interpretation: opening,
    context: route,
    next_step: close,
    // The access detail is incorporated into the shared next step above, so
    // mobile does not repeat it as a fourth near-identical paragraph.
    access_note: "",
    navigation_note: clean(guidance.navigation_note),
    related_collections: Array.isArray(guidance.related_collections) ? guidance.related_collections : [],
    safeguards: Array.isArray(guidance.safeguards) ? guidance.safeguards : [],
    message,
  })
}

export function buildMillerCompanionResponse({ query = "", response = {} } = {}) {
  return buildMillerCompanionGuidance({ query, response }).message
}
