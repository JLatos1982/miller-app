const clean = value => String(value ?? "").replace(/\s+/g, " ").trim()
const normalized = value => clean(value)
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[’']/g, "'")
  .replace(/[^a-z0-9]+/g, " ")
  .trim()

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

function safetyContext(query, primaryIntent) {
  const words = normalized(query)
  const mentionsOpioids = /\b(opioid|fentanyl|methadone|suboxone|buprenorphine|heroin)\b/.test(words)
  const immediateOverdose = /\b(overdose now|overdosing|unresponsive|cannot wake|cant wake|not breathing|slow breathing|blue lips|gurgling)\b/.test(words)
  const usingAlone = /\b(?:using|use).{0,18}\balone\b|\balone.{0,18}\b(?:using|use)\b/.test(words)
  const alcoholWithdrawal = /\b(alcohol|drinking|drink)\b/.test(words) && /\b(withdrawal|detox|withdrawing)\b/.test(words)
  const severeWithdrawal = /\b(seizures?|hallucinations?|confusion|delirium|very unwell)\b/.test(words)
  const notReadyForAbstinence = /\b(not ready (?:for )?(?:abstinence|to stop|to quit)|not (?:ready|willing) to (?:stop|quit)|still using)\b/.test(words)
  const unsureAboutDetox = /\b(need|needs|do i need|whether i need|not sure (?:if|about)).{0,40}\b(detox|withdrawal)\b|\b(detox|withdrawal)\b.{0,40}\b(not sure|need|needs)\b/.test(words)
  const familyMember = /\b(family member|loved one|my (?:son|daughter|partner|spouse|parent|friend))\b/.test(words)

  // This is concise public-health orientation, not a clinical assessment. Its
  // emergency and naloxone wording follows Health Canada's public overdose
  // guidance; alcohol-withdrawal escalation reflects CAMH public information.
  if (immediateOverdose) {
    return "If someone is hard to wake, has slow or no breathing, or you suspect an opioid overdose, call 911 now. Give naloxone if it is available and follow the kit and dispatcher instructions."
  }
  if (alcoholWithdrawal && severeWithdrawal) {
    return "Alcohol withdrawal can be medically risky. Seizures, hallucinations, severe confusion, or feeling very unwell are reasons to seek urgent medical help."
  }
  if (alcoholWithdrawal) {
    return "Alcohol withdrawal can become medically risky for some people. A withdrawal-management or healthcare service can help work out a safer next step."
  }
  if (usingAlone || (mentionsOpioids && primaryIntent === "harm reduction")) {
    return "If opioids may be involved, try not to use alone, carry naloxone if you can, and make a plan for someone to call for help in an emergency."
  }
  if (notReadyForAbstinence) {
    return "You do not have to be ready for abstinence to ask for harm-reduction, counselling, outreach, or healthcare support."
  }
  if (unsureAboutDetox) {
    return "You do not have to decide on treatment first; a withdrawal-management or healthcare service can help you understand the safest next step."
  }
  if (familyMember) {
    return "If you are supporting someone else, it is still okay to start by asking a service what family, counselling, or navigation support it offers."
  }
  return ""
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
  const explanation = clean(guidance.context || guidance.explanation)
  const safety = safetyContext(query, primaryIntent)
  const close = access || nextStep || "Take the next step that feels manageable, and confirm current access details with the service."

  const contextParts = []
  for (const part of [explanation, route, safety].filter(Boolean)) {
    // A mobile response may be passed back through the shared composer by a
    // client or test. Keep composition idempotent instead of repeating the
    // same verified/external route sentence.
    if (!contextParts.some(existing => existing.includes(part) || part.includes(existing))) contextParts.push(part)
  }
  const context = contextParts.join(" ")
  const message = [opening, context, close].filter(Boolean).join(" ")
  return Object.freeze({
    title: clean(guidance.title || "Miller’s guide"),
    interpretation: opening,
    context,
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
