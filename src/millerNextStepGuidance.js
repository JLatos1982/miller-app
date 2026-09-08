const text = value => String(value ?? "").replace(/\s+/g, " ").trim()
const normalized = value => text(value).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9]+/g, " ").trim()

export const MILLER_NEXT_STEP_INTENTS = Object.freeze([
  "housing",
  "detox",
  "treatment",
  "oat",
  "counselling",
  "harm_reduction",
  "meetings",
  "legal",
  "funding",
  "mental_health",
  "basic_needs",
  "transportation",
  "reentry",
])

const intentRules = Object.freeze([
  ["detox", /\b(detox|withdrawal|withdrawing|withdrawal management)\b/],
  ["oat", /\b(oat|opioid agonist|methadone|suboxone|sublocade|buprenorphine)\b/],
  ["harm_reduction", /\b(harm reduction|naloxone|safer use|safe use|supplies|needle|overdose prevention)\b/],
  ["reentry", /\b(corrections|re-?entry|reintegration|release planning|leaving (?:custody|jail|prison))\b/],
  ["housing", /\b(housing|shelter|homeless|homelessness|recovery housing|supportive housing)\b/],
  ["legal", /\b(legal|lawyer|legal aid|rights|tenant|tenancy|advocacy|complaint)\b/],
  ["funding", /\b(funding|financial|grant|benefit|income assistance|disability assistance|subsidy|bursary)\b/],
  ["transportation", /\b(transportation|transport|transit|bus pass|medical travel|handydart|ride)\b/],
  ["basic_needs", /\b(food|meal|clothing|hygiene|basic needs|identification|birth certificate)\b/],
  ["meetings", /\b(aa|na|smart recovery|meeting|meetings|peer support|support group)\b/],
  ["counselling", /\b(counselling|counseling|therapy|therapist|talk to someone)\b/],
  ["mental_health", /\b(mental health|anxiety|depression|psychiatr|emotional support)\b/],
  ["treatment", /\b(treatment|rehab|residential|recovery program|outpatient)\b/],
])

const templates = Object.freeze({
  housing: {
    interpretation: "Sounds like you’re looking for housing or shelter support.",
    explanation: "These results may include housing navigation, shelters, outreach, or longer-term supportive housing, depending on the selected area.",
    next_step: "You could start with a housing-navigation service or contact one of the local providers below.",
  },
  detox: {
    interpretation: "Sounds like you’re looking for detox or withdrawal-management support.",
    explanation: "Services can differ in intake, referral requirements, and whether support is residential or outpatient.",
    next_step: "A good next step might be to call a withdrawal-management service and confirm its current intake instructions.",
  },
  treatment: {
    interpretation: "Sounds like you’re looking for an addiction treatment program.",
    explanation: "The options below may differ in setting, intake process, referral requirements, and the type of treatment they provide.",
    next_step: "You could start by contacting a treatment program to ask about its intake process and current requirements.",
  },
  oat: {
    interpretation: "Sounds like you’re looking for opioid agonist treatment or medication support.",
    explanation: "Programs may use different intake pathways and may provide prescribing, pharmacy, counselling, or coordinated support.",
    next_step: "You could start by contacting an OAT or medication-support service and asking how its intake process works.",
  },
  counselling: {
    interpretation: "Sounds like you’re looking for counselling or someone to talk with.",
    explanation: "The results may include individual counselling, community programs, peer support, or services connected to other care.",
    next_step: "You could start with a counselling option below and check whether you can contact it directly or need a referral.",
  },
  harm_reduction: {
    interpretation: "Sounds like you’re looking for harm-reduction support.",
    explanation: "The options below may provide supplies, overdose-prevention support, safer-use information, outreach, or connections to care.",
    next_step: "You could start with a harm-reduction service below and check its current access details before you go.",
  },
  meetings: {
    interpretation: "Sounds like you’re looking for a meeting or peer-support option.",
    explanation: "Groups can differ in approach, schedule, location, and whether they meet in person or online.",
    next_step: "You could start by checking the meeting or peer-support details below for the current time and access information.",
  },
  legal: {
    interpretation: "Sounds like you’re looking for legal information, advocacy, or help navigating a problem.",
    explanation: "Some services provide information or referrals, while others may offer advocacy, advice, or representation within a defined scope.",
    next_step: "You could start with a legal-navigation service to understand what kind of help it provides.",
  },
  funding: {
    interpretation: "Sounds like you’re looking for funding, benefits, or financial assistance.",
    explanation: "Programs can have different purposes, eligibility rules, application processes, and opening or deadline dates.",
    next_step: "You could start by checking the program’s eligibility, deadline, and application details on its official page.",
  },
  mental_health: {
    interpretation: "Sounds like you’re looking for mental-health support.",
    explanation: "The results may include counselling, community mental-health programs, peer support, or services connected to healthcare.",
    next_step: "You could start with a mental-health support below and check whether it accepts direct contact or requires a referral.",
  },
  basic_needs: {
    interpretation: "Sounds like you’re looking for help with everyday essentials.",
    explanation: "These results may include food, clothing, identification, outreach, or other practical supports.",
    next_step: "You could start with one practical support below and check its current access details before visiting.",
  },
  transportation: {
    interpretation: "Sounds like you’re looking for transportation or help getting to a service.",
    explanation: "Transportation programs can differ by service area, trip purpose, booking process, and eligibility.",
    next_step: "You could start by checking the service area and booking or eligibility details for the transportation options below.",
  },
  reentry: {
    interpretation: "Sounds like you’re looking for practical support while leaving custody or returning to the community.",
    explanation: "Re-entry services may help with release planning, identification, housing, income, treatment, employment, or connections to other community supports.",
    next_step: "You could start with a re-entry or community-navigation service and ask which supports it can help you access.",
  },
})

const structuredConcepts = intent => [
  ...(intent?.explicit?.supportNeeds || []),
  ...(intent?.normalized?.supportConcepts || []),
].map(normalized).join(" ")

export function inferMillerNextStepIntent({ query = "", intent = null } = {}) {
  const haystack = `${normalized(query)} ${structuredConcepts(intent)}`.trim()
  if (!haystack) return null
  return intentRules.find(([, pattern]) => pattern.test(haystack))?.[0] || null
}

function sourceBackedAccessNote(results = []) {
  for (const resource of results.slice(0, 8)) {
    const access = normalized(resource?.accessType)
    if (!access) continue
    if (/\b(self referral|self refer|no referral|contact directly|call directly|walk in)\b/.test(access)) {
      return {
        text: `${text(resource.name)} lists direct or self-referral access; check its Access details before contacting it.`,
        basis: "resource_access_direct",
        resource_id: text(resource.id),
      }
    }
    if (/\b(referral required|requires a referral|physician referral|doctor referral|provider referral)\b/.test(access)) {
      return {
        text: `${text(resource.name)} lists a referral requirement; check its Access details for the current process.`,
        basis: "resource_access_referral",
        resource_id: text(resource.id),
      }
    }
  }
  if (results.slice(0, 8).some(resource => text(resource?.phone))) {
    return { text: "Calling a listed service first can help you confirm its current intake or access instructions.", basis: "published_phone_present", resource_id: null }
  }
  return null
}

function sourceBackedNavigationNote(results = [], intentId = null) {
  if (!new Set(["housing", "funding", "basic_needs", "transportation"]).has(intentId)) return null
  const navigation = results.find(resource => {
    const named = /\b(?:bc\s*)?211\b/i.test(`${text(resource?.name)} ${text(resource?.organization)}`)
    const listed211 = /^2-?1-?1$/.test(text(resource?.phone)) && /\bbc\s*211\b/i.test(text(resource?.accessType))
    return (named || listed211) && (text(resource?.phone) || /^https:\/\//.test(text(resource?.website)))
  })
  if (!navigation) return null
  return {
    text: "BC 211 may also help with live service navigation; use the listed contact details for current information.",
    basis: "verified_navigation_resource_present",
    resource_id: text(navigation.id),
  }
}

export function buildMillerNextStepGuidance({ query = "", intent = null, results = [] } = {}) {
  const intentId = inferMillerNextStepIntent({ query, intent })
  if (!intentId || !templates[intentId] || !Array.isArray(results) || results.length === 0) return null
  return Object.freeze({
    intent: intentId,
    heading: "Miller’s guide",
    interpretation_heading: "Miller’s read of your request",
    interpretation: templates[intentId].interpretation,
    explanation: templates[intentId].explanation,
    next_step_heading: "A good next step",
    next_step: templates[intentId].next_step,
    access_note: sourceBackedAccessNote(results),
    navigation_note: sourceBackedNavigationNote(results, intentId),
    maximum_paragraphs: 3,
    maximum_supplemental_notes: 2,
    source: "deterministic_controlled_template",
  })
}
