import { buildMillerNextStepGuidance, inferMillerNextStepIntent } from "./millerNextStepGuidance.js"
import { millerResourceSearchText } from "./millerPublicSearchResources.js"

const clean = value => String(value ?? "").replace(/\s+/g, " ").trim()
const normalized = value => clean(value).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9]+/g, " ").trim()

const INTENT_RULES = Object.freeze([
  ["detox", /\b(detox|withdrawal|withdrawing|withdrawal management)\b/],
  ["oat", /\b(oat|opioid agonist|methadone|suboxone|sublocade|buprenorphine)\b/],
  ["harm_reduction", /\b(harm reduction|naloxone|safer use|safe use|supplies|needle|overdose prevention)\b/],
  ["reentry", /\b(corrections|re-?entry|reintegration|release planning|leaving (?:custody|jail|prison))\b/],
  ["treatment", /\b(treatment|rehab|residential|recovery program|outpatient|addiction (?:help|support|care))\b/],
  ["housing", /\b(housing|shelter|homeless|homelessness|recovery housing|supportive housing|nowhere to stay|somewhere to stay)\b/],
  ["legal", /\b(legal|lawyer|legal aid|rights|tenant|tenancy|advocacy|complaint)\b/],
  ["funding", /\b(funding|financial|pay(?:ing)? for|cost|grant|benefit|income assistance|disability assistance|subsidy|bursary)\b/],
  ["transportation", /\b(transportation|transport|transit|bus pass|medical travel|handydart|ride|getting there)\b/],
  ["basic_needs", /\b(food|meal|clothing|hygiene|basic needs|identification|birth certificate)\b/],
  ["meetings", /\b(aa|na|smart recovery|meeting|meetings|peer support|support group)\b/],
  ["counselling", /\b(counselling|counseling|therapy|therapist|talk to someone)\b/],
  ["mental_health", /\b(mental health|anxiety|depression|psychiatr|emotional support)\b/],
])

const INTENT_TERMS = Object.freeze({
  housing: ["housing", "shelter", "supportive housing", "recovery housing", "homelessness"],
  detox: ["detox", "withdrawal management", "withdrawal"],
  treatment: ["treatment", "residential", "outpatient", "recovery program"],
  oat: ["oat", "opioid agonist", "methadone", "suboxone", "buprenorphine"],
  counselling: ["counselling", "therapy"],
  harm_reduction: ["harm reduction", "naloxone", "overdose prevention"],
  meetings: ["peer support", "meeting", "smart recovery"],
  legal: ["legal", "advocacy", "tenancy", "rights", "navigation"],
  funding: ["funding", "financial assistance", "benefit", "subsidy"],
  mental_health: ["mental health", "counselling", "psychiatric"],
  basic_needs: ["basic needs", "food", "identification", "income"],
  transportation: ["transportation", "medical travel", "transit"],
  reentry: ["corrections reentry", "re entry", "reentry", "reintegration", "release planning"],
})

const RELATED_INTENTS = Object.freeze({
  housing: ["funding", "legal", "basic_needs"],
  detox: ["treatment", "transportation", "funding"],
  treatment: ["funding", "transportation", "housing"],
  oat: ["transportation", "counselling", "harm_reduction"],
  counselling: ["mental_health", "funding"],
  harm_reduction: ["oat", "treatment", "transportation"],
  meetings: ["counselling", "transportation"],
  legal: ["housing", "funding"],
  funding: ["treatment", "housing", "transportation"],
  mental_health: ["counselling", "transportation", "funding"],
  basic_needs: ["housing", "funding", "transportation"],
  transportation: ["funding", "treatment", "healthcare"],
  reentry: ["housing", "basic_needs", "treatment", "mental_health", "legal"],
})

const COLLECTIONS = Object.freeze({
  housing: { href: "/practical-supports", label: "Housing and practical supports" },
  legal: { href: "/practical-supports", label: "Legal and navigation supports" },
  basic_needs: { href: "/practical-supports", label: "Practical supports" },
  funding: { href: "/funding-assistance", label: "Funding & Assistance" },
  transportation: { href: "/practical-supports", label: "Transportation supports" },
  treatment: { href: "/lists", label: "Treatment and service lists" },
  counselling: { action: "private_counselling", label: "Private counselling information" },
  reentry: { href: "/practical-supports", label: "Re-entry and practical supports" },
})

const INVESTIGATIVE_KINDS = new Set([
  "accountability", "complaint", "coroner_record", "court_decision", "evidence", "incident",
  "inquest", "investigation", "legal_decision", "police_oversight", "regulator_finding", "watch_chain",
])

export function isMillerPracticalPublicResource(resource = {}) {
  const kind = normalized(resource.kind || resource.record_type || resource.result_type)
  const route = normalized(resource.publication_route || resource.routing_disposition)
  const source = normalized(resource.source)
  if (INVESTIGATIVE_KINDS.has(kind)) return false
  if (route && route !== "miller resource candidate") return false
  if (source === "tavily") return false
  if (/miller north|public records intelligence|accountability watch/.test(source)) return false
  if (resource.hidden === true || resource.closed === true) return false
  if (resource.approved === false) return false
  return Boolean(clean(resource.id) && clean(resource.name))
}

export function detectMillerPracticalIntents(query = "", intent = null) {
  const haystack = `${normalized(query)} ${normalized([
    ...(intent?.explicit?.supportNeeds || []),
    ...(intent?.normalized?.supportConcepts || []),
  ].join(" "))}`
  const found = INTENT_RULES.filter(([, rule]) => rule.test(haystack)).map(([id]) => id)
  const inferredPrimary = inferMillerNextStepIntent({ query, intent })
  const candidates = [...new Set([inferredPrimary, ...found].filter(Boolean))]
  const barrierPrimary = new Set(["funding", "transportation"])
  if (barrierPrimary.has(candidates[0])) {
    const practicalNeed = found.find(id => !barrierPrimary.has(id))
    if (practicalNeed) return [practicalNeed, ...candidates.filter(id => id !== practicalNeed)]
  }
  return candidates
}

function matchesIntent(resource, intentId) {
  const haystack = millerResourceSearchText(resource)
  return (INTENT_TERMS[intentId] || []).some(term => haystack.includes(term))
}

function uniqueResources(resources) {
  const seen = new Set()
  return resources.filter(resource => {
    const key = clean(resource.id) || `${normalized(resource.name)}|${normalized(resource.organization)}`
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function relatedCollectionLinks(primaryIntent, detectedIntents) {
  const ids = [...detectedIntents.slice(1), ...(RELATED_INTENTS[primaryIntent] || [])]
  const seen = new Set()
  return ids.map(id => ({ id, ...COLLECTIONS[id] })).filter(item => {
    const target = item.href || item.action
    if (!target || seen.has(target + item.label)) return false
    seen.add(target + item.label)
    return true
  }).slice(0, 3)
}

function combinedContext(detectedIntents) {
  const set = new Set(detectedIntents)
  if (set.has("housing") && (set.has("treatment") || set.has("detox"))) {
    return "I’m also checking recovery-oriented and general housing supports, because housing after treatment can involve more than one service system."
  }
  if (set.has("funding") && (set.has("treatment") || set.has("detox"))) {
    return "I’m checking treatment options together with verified funding and navigation supports; funding approval and program intake still need to be confirmed separately."
  }
  if (set.has("transportation") && ["treatment", "detox", "oat", "mental_health"].some(id => set.has(id))) {
    return "I’m checking the care options together with transportation supports, since getting there can be a separate part of the plan."
  }
  if (set.has("reentry")) {
    return "I’m checking re-entry support together with practical housing, income, treatment, mental-health, and legal-navigation options where the verified resource data connects them."
  }
  return ""
}

export function buildMillerPracticalIntelligence({ query = "", intent = null, results = [], resources = [] } = {}) {
  const detectedIntents = detectMillerPracticalIntents(query, intent)
  const primaryIntent = detectedIntents[0] || null
  const internalResources = uniqueResources(resources.filter(isMillerPracticalPublicResource))
  const verifiedCurrent = uniqueResources(results.filter(resource => isMillerPracticalPublicResource(resource) && resource.source !== "tavily"))
  const secondaryIds = [...new Set([...detectedIntents.slice(1), ...(RELATED_INTENTS[primaryIntent] || [])])]
  const secondaryMatches = secondaryIds.flatMap(intentId => internalResources.filter(resource => matchesIntent(resource, intentId)).slice(0, 2))
  const speechResources = uniqueResources([...verifiedCurrent.slice(0, 14), ...secondaryMatches]).slice(0, 20)
  const guidance = buildMillerNextStepGuidance({ query, intent, results: verifiedCurrent.length ? verifiedCurrent : speechResources })
  const externalResults = results.filter(resource => resource?.source === "tavily").map(resource => ({
    id: clean(resource.id),
    name: clean(resource.name),
    status: "External result — not yet verified.",
  }))

  return Object.freeze({
    primary_intent: primaryIntent,
    secondary_intents: detectedIntents.slice(1),
    guidance,
    combined_context: combinedContext(detectedIntents),
    related_collections: relatedCollectionLinks(primaryIntent, detectedIntents),
    speech_resources: speechResources,
    source_priority: ["current_results", "canonical_miller_resources", "practical_supports", "funding_assistance", "other_public_miller_collections", "bounded_external_search"],
    internal_resources_considered: internalResources.length,
    external_results: externalResults,
    external_search_policy: "only_when_internal_results_are_insufficient",
    public_scope: "original_miller_practical_resources_only",
  })
}
