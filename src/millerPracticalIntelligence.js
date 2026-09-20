import { buildMillerNextStepGuidance, inferMillerNextStepIntent } from "./millerNextStepGuidance.js"
import { millerResourceSearchText } from "./millerPublicSearchResources.js"

const clean = value => String(value ?? "").replace(/\s+/g, " ").trim()
const normalized = value => clean(value).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9]+/g, " ").trim()

const INTENT_RULES = Object.freeze([
  ["detox", /\b(detox|withdrawal|withdrawing|withdrawal management)\b/],
  ["oat", /\b(oat|opioid agonist|methadone|suboxone|sublocade|buprenorphine)\b/],
  ["harm_reduction", /\b(harm reduction|naloxone|safer use|safe use|supplies|needle|overdose prevention)\b/],
  ["reentry", /\b(corrections|re-?entry|reintegration|release planning|leaving (?:custody|jail|prison))\b/],
  ["treatment", /\b(treatment|rehab|residential|recovery program|supportive recovery|outpatient|raac|raam|rapid access addiction medicine|addiction (?:help|support|care))\b/],
  ["housing", /\b(housing|shelter|homeless|homelessness|recovery housing|supportive housing|nowhere to stay|somewhere to stay)\b/],
  ["legal", /\b(legal|lawyer|legal aid|rights|tenant|tenancy|advocacy|complaint)\b/],
  ["recreation_support", /\b(recreation|leisure|sports? fund|aquatic program)\b/],
  ["emergency_support", /\b(emergency support services?|evacuation support|disaster support)\b/],
  ["dental_support", /\b(dental|dentist|oral health)\b/],
  ["vision_support", /\b(vision|optical|glasses|eye exam)\b/],
  ["funding", /\b(funding|financial|pay(?:ing)? for|cost|grant|benefits?|income assistance|disability assistance|subsidy|bursary)\b/],
  ["transportation", /\b(transportation|transport|transit|bus pass|medical travel|handydart|ride|getting there)\b/],
  ["basic_needs", /\b(food|meal|clothing|hygiene|basic needs|identification|birth certificate|showers?|laundry|washrooms?|phone|wi-?fi|internet|mail(?:ing)? address|drop[ -]?in)\b/],
  ["outreach", /\b(street outreach|mobile outreach|outreach team|mobile health|encampment outreach|peer outreach|homelessness outreach)\b/],
  ["gender_support", /\b(women|woman|gender diverse|trans(?:gender)?|non[ -]?binary|2[ -]?spirit)\b/],
  ["primary_care", /\b(primary care|family doctor|nurse practitioner|community health centre)\b/],
  ["employment", /\b(employment|job training|skills training|work readiness|vocational)\b/],
  ["indigenous_supports", /\b(indigenous supports?|first nations supports?|m[eé]tis supports?|inuit supports?)\b/],
  ["family_support", /\b(youth support|family support|caregiver support|parent support)\b/],
  ["disability", /\b(disability support|accessibility support|persons? with disabilities)\b/],
  ["meetings", /\b(aa|na|smart recovery|meeting|meetings|peer support|support group)\b/],
  ["counselling", /\b(counselling|counseling|therapy|therapist|talk to someone)\b/],
  ["safe_beds", /\b(safe beds?|crisis stabilization)\b/],
  ["mental_health", /\b(mental health|anxiety|depression|psychiatr|emotional support)\b/],
])

const INTENT_TERMS = Object.freeze({
  housing: ["housing", "shelter", "supportive housing", "recovery housing", "homelessness"],
  detox: ["detox", "withdrawal management", "withdrawal"],
  treatment: ["treatment", "residential", "outpatient", "recovery program", "supportive recovery", "raac", "raam", "rapid access addiction medicine"],
  oat: ["oat", "opioid agonist", "methadone", "suboxone", "buprenorphine"],
  counselling: ["counselling", "therapy"],
  harm_reduction: ["harm reduction", "naloxone", "overdose prevention"],
  meetings: ["peer support", "meeting", "smart recovery"],
  legal: ["legal", "advocacy", "tenancy", "rights", "navigation"],
  recreation_support: ["recreation", "leisure", "sport", "aquatic"],
  emergency_support: ["emergency support", "evacuation", "disaster support"],
  dental_support: ["dental", "dentist", "oral health"],
  vision_support: ["vision", "optical", "glasses", "eye exam"],
  funding: ["funding", "financial assistance", "benefit", "benefits", "subsidy"],
  mental_health: ["mental health", "counselling", "psychiatric"],
  safe_beds: ["safe bed", "safe beds", "crisis stabilization"],
  basic_needs: ["basic needs", "food", "identification", "income", "showers", "shower", "laundry", "washrooms", "phone", "wi fi", "internet", "mailing address", "drop in"],
  outreach: ["street outreach", "mobile outreach", "outreach", "mobile clinical outreach", "encampment outreach", "peer outreach", "homelessness outreach"],
  gender_support: ["women support", "women", "gender diverse support", "gender diverse", "trans", "non binary", "2 spirit"],
  primary_care: ["primary care", "family doctor", "nurse practitioner", "community health centre"],
  employment: ["employment", "job training", "skills training", "work readiness"],
  indigenous_supports: ["indigenous", "first nations", "métis", "metis", "inuit", "cultural support"],
  family_support: ["family support", "youth support", "caregiver", "parent support"],
  disability: ["disability", "accessibility", "persons with disabilities"],
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
  recreation_support: ["funding", "family_support", "basic_needs"],
  emergency_support: ["basic_needs", "housing", "transportation"],
  dental_support: ["funding", "healthcare"],
  vision_support: ["funding", "healthcare"],
  funding: ["treatment", "housing", "transportation"],
  mental_health: ["counselling", "transportation", "funding"],
  safe_beds: ["mental_health", "transportation", "housing"],
  basic_needs: ["housing", "funding", "transportation"],
  outreach: ["housing", "basic_needs", "harm_reduction", "treatment"],
  gender_support: ["basic_needs", "housing", "harm_reduction", "legal"],
  transportation: ["funding", "treatment", "healthcare"],
  reentry: ["housing", "basic_needs", "treatment", "mental_health", "legal"],
  primary_care: ["mental_health", "oat", "transportation"],
  employment: ["basic_needs", "funding", "transportation"],
  indigenous_supports: ["treatment", "mental_health", "transportation", "funding"],
  family_support: ["counselling", "mental_health", "basic_needs"],
  disability: ["funding", "transportation", "legal"],
})

const COLLECTIONS = Object.freeze({
  housing: { href: "/practical-supports", label: "Housing and practical supports" },
  legal: { href: "/practical-supports", label: "Legal and navigation supports" },
  basic_needs: { href: "/practical-supports", label: "Practical supports" },
  outreach: { href: "/practical-supports", label: "Outreach and practical supports" },
  gender_support: { href: "/practical-supports", label: "Women and gender-diverse supports" },
  funding: { href: "/funding-assistance", label: "Funding & Assistance" },
  transportation: { href: "/practical-supports", label: "Transportation supports" },
  treatment: { href: "/lists", label: "Treatment and service lists" },
  counselling: { action: "private_counselling", label: "Private counselling information" },
  reentry: { href: "/practical-supports", label: "Re-entry and practical supports" },
  primary_care: { href: "/practical-supports", label: "Primary-care navigation" },
  employment: { href: "/practical-supports", label: "Employment and training supports" },
  indigenous_supports: { href: "/practical-supports", label: "Indigenous supports" },
  family_support: { href: "/practical-supports", label: "Youth and family supports" },
  disability: { href: "/practical-supports", label: "Disability supports" },
  recreation_support: { href: "/funding-assistance", label: "Recreation assistance" },
  emergency_support: { href: "/practical-supports", label: "Emergency practical supports" },
  dental_support: { href: "/practical-supports", label: "Dental supports" },
  vision_support: { href: "/practical-supports", label: "Vision supports" },
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
  // Bubble links are an immediate response to what the person actually asked
  // for. Related intents still help broaden the internal resource scan below,
  // but should not turn every counselling or treatment search into generic
  // Funding or Practical Supports buttons.
  const ids = [...new Set(detectedIntents)].filter(id => id !== primaryIntent || detectedIntents.length === 1)
  const seen = new Set()
  return ids.map(id => ({ id, ...COLLECTIONS[id] })).filter(item => {
    const target = item.href || item.action
    if (!target || seen.has(target + item.label)) return false
    seen.add(target + item.label)
    return true
  }).slice(0, 3)
}

function combinedContext(detectedIntents, query = "") {
  const set = new Set(detectedIntents)
  if (/\b(return(?:ing)?|coming back|coming (?:back )?home|after treatment|after detox|discharg(?:e|ed|ing))\b/.test(normalized(query)) && (set.has("treatment") || set.has("detox") || set.has("housing") || set.has("counselling"))) {
    return "I’m checking what can support the return home, including recovery-oriented and general housing supports, counselling, addiction-care continuity, transportation, and benefits navigation where Miller has verified information. Confirm each service’s current access directly."
  }
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
    combined_context: combinedContext(detectedIntents, query),
    related_collections: relatedCollectionLinks(primaryIntent, detectedIntents),
    speech_resources: speechResources,
    source_priority: ["current_results", "canonical_miller_resources", "practical_supports", "funding_assistance", "other_public_miller_collections", "bounded_external_search"],
    internal_resources_considered: internalResources.length,
    external_results: externalResults,
    external_search_policy: "only_when_internal_results_are_insufficient",
    public_scope: "original_miller_practical_resources_only",
  })
}
